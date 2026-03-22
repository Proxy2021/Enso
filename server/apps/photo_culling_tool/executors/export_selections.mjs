#!/usr/bin/env node
/**
 * export_selections.mjs — Export approved/rejected photo selections.
 *
 * Accepts an enriched image array with status decisions and exports results
 * by copying, moving, or generating a text list of kept/rejected paths.
 *
 * stdin JSON:
 *   {
 *     "images": [{
 *       "path": "/path/to/image.jpg",
 *       "filename": "image.jpg",
 *       "status": "approved"|"rejected"|"pending",
 *       "sharpness_score": 85,
 *       "is_sharpest_in_group": true,
 *       "groupId": "G001",
 *       "groupType": "burst",
 *       "exif": { ... },
 *       ...
 *     }],
 *     "outputMode": "copy"|"move"|"list",
 *     "outputPath": "/path/to/output",
 *     "starRating": 3,
 *     "writeSidecars": true,
 *     "moveRejected": false,
 *     "preserveStructure": false,
 *     "sessionId": "optional-session-id"
 *   }
 *
 * outputMode behavior:
 *   "copy"  — Copies approved images to outputPath (default: _approved subfolder)
 *   "move"  — Moves approved images to outputPath; optionally moves rejected to _rejected
 *   "list"  — Returns a text list of kept/rejected paths (no file operations)
 *
 * stdout JSON:
 *   {
 *     "exported": N,
 *     "copied": N,
 *     "moved": N,
 *     "skipped": N,
 *     "errors": [...],
 *     "outputPath": "...",
 *     "outputMode": "...",
 *     "kept": ["..."],
 *     "rejected": ["..."],
 *     "listText": "...",
 *     "summaryPath": "...",
 *     "message": "..."
 *   }
 *
 * Progress reported to stderr as JSON lines.
 */

import fs from "fs/promises";
import path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progress(data) {
  process.stderr.write(JSON.stringify(data) + "\n");
}

async function safeCopy(src, dest) {
  const dir = path.dirname(dest);
  await fs.mkdir(dir, { recursive: true });

  // Handle filename collision
  let finalDest = dest;
  try {
    await fs.access(finalDest);
    const ext = path.extname(dest);
    const base = path.basename(dest, ext);
    finalDest = path.join(dir, `${base}_${Date.now()}${ext}`);
  } catch {
    // Doesn't exist — use as-is
  }

  await fs.copyFile(src, finalDest);
  return finalDest;
}

async function safeMove(src, dest) {
  const dir = path.dirname(dest);
  await fs.mkdir(dir, { recursive: true });

  let finalDest = dest;
  try {
    await fs.access(finalDest);
    const ext = path.extname(dest);
    const base = path.basename(dest, ext);
    finalDest = path.join(dir, `${base}_${Date.now()}${ext}`);
  } catch { /* doesn't exist */ }

  try {
    await fs.rename(src, finalDest);
  } catch {
    // rename fails across drives — fallback to copy+delete
    await fs.copyFile(src, finalDest);
    await fs.unlink(src);
  }

  return finalDest;
}

function buildSidecar(img, sessionId, starRating) {
  return {
    version: "1.0",
    tool: "enso_photo_culling_tool",
    sessionId: sessionId || null,
    exportedAt: new Date().toISOString(),
    originalFile: img.filename,
    originalPath: img.path,
    status: img.status,
    rating: img.status === "approved" ? starRating
      : (img.status === "rejected" ? -1 : 0),
    label: img.status === "approved" ? "Green"
      : (img.status === "rejected" ? "Red" : ""),
    sharpness: {
      score: img.sharpness_score ?? img.sharpnessScore ?? 0,
      normalized: img.sharpness_score ?? img.sharpnessNormalized ?? 0,
      isSharpest: img.is_sharpest_in_group ?? img.isSharpest ?? false,
      blurFlag: img.blur_flag ?? img.blurFlag ?? false
    },
    faces: (img.faces || []).map((f) => ({
      box: f.box,
      confidence: f.confidence,
      avgEAR: f.avgEAR,
      eyesClosed: f.eyesClosed
    })),
    eyesClosedFlag: img.eyes_status === "closed" || img.eyesClosedFlag || false,
    autoSuggestion: img.autoSuggestion || null,
    autoReason: img.autoReason || null,
    group: {
      groupId: img.groupId || null,
      groupType: img.groupType || null
    },
    exif: img.exif ? {
      cameraMake: img.exif.cameraMake,
      cameraModel: img.exif.cameraModel,
      dateTaken: img.exif.dateTaken,
      iso: img.exif.iso,
      shutterSpeed: img.exif.shutterSpeed,
      aperture: img.exif.aperture,
      focalLength: img.exif.focalLength
    } : null
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startMs = Date.now();

  // Read input from stdin
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf-8").trim();
    input = raw ? JSON.parse(raw) : {};
  } catch (e) {
    process.stdout.write(JSON.stringify({
      error: "Invalid JSON input: " + e.message,
      usage: '{ "images": [...], "outputMode": "copy"|"move"|"list", "outputPath": "..." }'
    }));
    process.exit(1);
  }

  const images = input.images || [];
  const outputMode = (input.outputMode || "copy").trim().toLowerCase();
  const outputPathRaw = (input.outputPath || "").trim();
  const starRating = typeof input.starRating === "number"
    ? Math.max(1, Math.min(5, input.starRating)) : 1;
  const writeSidecars = input.writeSidecars !== false;
  const moveRejected = input.moveRejected === true;
  const preserveStructure = input.preserveStructure === true;
  const sessionId = input.sessionId || null;

  const VALID_MODES = ["copy", "move", "list"];
  if (!VALID_MODES.includes(outputMode)) {
    process.stdout.write(JSON.stringify({
      error: `Invalid outputMode "${outputMode}". Valid: ${VALID_MODES.join(", ")}`
    }));
    process.exit(1);
  }

  if (images.length === 0) {
    process.stdout.write(JSON.stringify({
      exported: 0, copied: 0, moved: 0, skipped: 0, errors: [],
      outputPath: "", outputMode,
      kept: [], rejected: [],
      message: "No images provided"
    }));
    return;
  }

  // Classify images by status
  const keptImages = images.filter((img) => img.status === "approved");
  const rejectedImages = images.filter((img) => img.status === "rejected");
  const pendingImages = images.filter((img) => img.status !== "approved" && img.status !== "rejected");

  // Derive base folder from images if not given
  const baseFolder = images[0] ? path.dirname(images[0].path) : "";

  // =========================================================================
  // MODE: list — just return paths, no file operations
  // =========================================================================
  if (outputMode === "list") {
    const keptPaths = keptImages.map((img) => img.path);
    const rejectedPaths = rejectedImages.map((img) => img.path);
    const pendingPaths = pendingImages.map((img) => img.path);

    const lines = [
      `# Photo Culling Export — ${new Date().toISOString()}`,
      `# Total: ${images.length} images`,
      "",
      `## Approved (${keptPaths.length})`,
      ...keptPaths.map((p) => `+ ${p}`),
      "",
      `## Rejected (${rejectedPaths.length})`,
      ...rejectedPaths.map((p) => `- ${p}`),
      "",
      `## Pending (${pendingPaths.length})`,
      ...pendingPaths.map((p) => `? ${p}`)
    ];
    const listText = lines.join("\n");

    // Write list to file if outputPath provided
    let listPath = null;
    if (outputPathRaw) {
      listPath = path.isAbsolute(outputPathRaw)
        ? outputPathRaw
        : path.join(baseFolder, outputPathRaw);
      try {
        await fs.mkdir(path.dirname(listPath), { recursive: true });
        await fs.writeFile(listPath, listText, "utf-8");
      } catch (e) {
        progress({ stage: "warning", message: `Could not write list file: ${e.message}` });
      }
    }

    process.stdout.write(JSON.stringify({
      exported: 0,
      copied: 0,
      moved: 0,
      skipped: images.length,
      errors: [],
      outputPath: listPath || "",
      outputMode: "list",
      kept: keptPaths,
      rejected: rejectedPaths,
      pending: pendingPaths,
      listText,
      message: `List generated: ${keptPaths.length} approved, ${rejectedPaths.length} rejected, ${pendingPaths.length} pending`
    }));
    return;
  }

  // =========================================================================
  // MODE: copy or move
  // =========================================================================

  // Resolve output directory
  const outputPath = outputPathRaw
    ? (path.isAbsolute(outputPathRaw) ? outputPathRaw : path.join(baseFolder, outputPathRaw))
    : path.join(baseFolder, "_approved");

  const rejectedDir = path.join(baseFolder, "_rejected");

  let copied = 0;
  let moved = 0;
  let skipped = 0;
  const errors = [];
  const keptPaths = [];
  const rejectedPaths = [];

  const total = keptImages.length + (moveRejected ? rejectedImages.length : 0);
  let processed = 0;

  progress({
    stage: "export", current: 0, total,
    percent: 0, message: `Exporting ${total} images (mode: ${outputMode})...`
  });

  // --- Process approved images ---
  for (const img of keptImages) {
    try {
      let destPath;
      if (preserveStructure && baseFolder) {
        const relative = path.relative(baseFolder, img.path);
        destPath = path.join(outputPath, relative);
      } else {
        destPath = path.join(outputPath, img.filename);
      }

      let finalPath;
      if (outputMode === "move") {
        finalPath = await safeMove(img.path, destPath);
        moved++;
      } else {
        finalPath = await safeCopy(img.path, destPath);
        copied++;
      }
      keptPaths.push(finalPath);

      // Write sidecar alongside the original location
      if (writeSidecars) {
        const sidecarPath = path.join(path.dirname(img.path), `${img.filename}.cull.json`);
        try {
          await fs.writeFile(sidecarPath, JSON.stringify(buildSidecar(img, sessionId, starRating), null, 2), "utf-8");
        } catch { /* non-fatal */ }
      }
    } catch (e) {
      errors.push({ path: img.path, error: e.message });
    }

    processed++;
    if (processed % 10 === 0 || processed === total) {
      progress({
        stage: "export", current: processed, total,
        percent: Math.round((processed / total) * 100),
        message: `Exporting... ${processed}/${total}`
      });
    }
  }

  // --- Process rejected images (move to _rejected if requested) ---
  if (moveRejected) {
    for (const img of rejectedImages) {
      try {
        const destPath = path.join(rejectedDir, img.filename);
        const finalPath = await safeMove(img.path, destPath);
        rejectedPaths.push(finalPath);
        moved++;

        if (writeSidecars) {
          const sidecarPath = path.join(path.dirname(img.path), `${img.filename}.cull.json`);
          try {
            await fs.writeFile(sidecarPath, JSON.stringify(buildSidecar(img, sessionId, -1), null, 2), "utf-8");
          } catch { /* non-fatal */ }
        }
      } catch (e) {
        errors.push({ path: img.path, error: e.message });
      }

      processed++;
      if (processed % 10 === 0 || processed === total) {
        progress({
          stage: "export", current: processed, total,
          percent: Math.round((processed / total) * 100),
          message: `Moving rejected... ${processed}/${total}`
        });
      }
    }
  } else {
    // Write sidecars for rejected images even if not moving them
    if (writeSidecars) {
      for (const img of rejectedImages) {
        rejectedPaths.push(img.path);
        const sidecarPath = path.join(path.dirname(img.path), `${img.filename}.cull.json`);
        try {
          await fs.writeFile(sidecarPath, JSON.stringify(buildSidecar(img, sessionId, starRating), null, 2), "utf-8");
        } catch { /* non-fatal */ }
      }
    }
  }

  skipped = pendingImages.length;

  // Write export summary
  const summaryData = {
    version: "1.0",
    tool: "enso_photo_culling_tool",
    sessionId,
    exportedAt: new Date().toISOString(),
    outputPath,
    outputMode,
    starRating,
    stats: {
      totalImages: images.length,
      exported: copied + moved,
      copied,
      moved,
      skipped,
      errors: errors.length,
      approved: keptImages.length,
      rejected: rejectedImages.length,
      pending: pendingImages.length
    }
  };

  const summaryPath = path.join(baseFolder, ".enso-cull-export-summary.json");
  try {
    await fs.writeFile(summaryPath, JSON.stringify(summaryData, null, 2), "utf-8");
  } catch { /* non-fatal */ }

  const elapsedMs = Date.now() - startMs;

  progress({
    stage: "complete", current: total, total, percent: 100,
    message: `Export complete in ${elapsedMs}ms`
  });

  const message = outputMode === "move"
    ? `Moved ${moved} images to ${path.basename(outputPath)}` +
      (errors.length > 0 ? ` (${errors.length} errors)` : "")
    : `Copied ${copied} approved images to ${path.basename(outputPath)}` +
      (moved > 0 ? `, moved ${moved} rejected` : "") +
      (errors.length > 0 ? ` (${errors.length} errors)` : "");

  process.stdout.write(JSON.stringify({
    exported: copied + moved,
    copied,
    moved,
    skipped,
    errors,
    outputPath,
    outputMode,
    starRating,
    kept: keptPaths,
    rejected: rejectedPaths,
    summaryPath,
    elapsedMs,
    message
  }));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message }));
  process.exit(1);
});
