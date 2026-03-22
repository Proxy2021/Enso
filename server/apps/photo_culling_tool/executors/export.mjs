#!/usr/bin/env node
/**
 * export.mjs — Exports review decisions from a CullSession.
 *
 * Reads a CullSession JSON file, then based on export mode:
 *   - Copies approved images to an output folder
 *   - Optionally moves rejected images to a _rejected subfolder
 *   - Writes per-image JSON sidecar files (.cull.json)
 *   - Writes a manifest CSV with all decisions and metadata
 *   - Writes a session summary JSON
 *
 * Usage:
 *   echo '{"sessionPath":"/path/.enso-cull-session.json"}' | node export.mjs
 *   node export.mjs --session /path/.enso-cull-session.json --mode approved_only --csv
 *
 * stdin JSON:
 *   {
 *     "sessionPath": "/path/to/.enso-cull-session.json",
 *     "exportMode": "approved_only" | "all_decided" | "all",
 *     "outputDir": "_approved",
 *     "moveRejected": false,
 *     "starRating": 3,
 *     "writeSidecars": true,
 *     "writeCsv": true,
 *     "csvPath": null,
 *     "preserveStructure": false
 *   }
 *
 * stdout JSON:
 *   {
 *     "exported": N,
 *     "copied": N,
 *     "moved": N,
 *     "skipped": N,
 *     "errors": [...],
 *     "outputDir": "...",
 *     "csvPath": "...",
 *     "summaryPath": "...",
 *     "message": "..."
 *   }
 *
 * Progress reported to stderr as JSON lines.
 *
 * Dependencies: none (uses only Node.js built-ins)
 *
 * @module export
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progress(data) {
  process.stderr.write(JSON.stringify(data) + "\n");
}

function fatal(message, details) {
  process.stdout.write(JSON.stringify({
    error: message,
    ...details
  }) + "\n");
  process.exit(1);
}

/**
 * Copy a file, creating destination directory if needed.
 * Handles name collisions by appending a timestamp suffix.
 *
 * @param {string} src - Source file path
 * @param {string} destDir - Destination directory
 * @param {string} filename - Destination filename
 * @returns {Promise<string>} - Final destination path
 */
async function safeCopy(src, destDir, filename) {
  await fs.mkdir(destDir, { recursive: true });
  let destPath = path.join(destDir, filename);

  // Handle name collision
  try {
    await fs.access(destPath);
    // File exists — add timestamp suffix
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    destPath = path.join(destDir, `${base}_${Date.now()}${ext}`);
  } catch {
    // File doesn't exist — use original name
  }

  await fs.copyFile(src, destPath);
  return destPath;
}

/**
 * Move a file, creating destination directory if needed.
 * Handles name collisions by appending a timestamp suffix.
 *
 * @param {string} src - Source file path
 * @param {string} destDir - Destination directory
 * @param {string} filename - Destination filename
 * @returns {Promise<string>} - Final destination path
 */
async function safeMove(src, destDir, filename) {
  await fs.mkdir(destDir, { recursive: true });
  let destPath = path.join(destDir, filename);

  // Handle name collision
  try {
    await fs.access(destPath);
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    destPath = path.join(destDir, `${base}_${Date.now()}${ext}`);
  } catch {
    // File doesn't exist — use original name
  }

  await fs.rename(src, destPath);
  return destPath;
}

// ---------------------------------------------------------------------------
// CSV generation
// ---------------------------------------------------------------------------

/**
 * Escape a value for CSV output (RFC 4180 compliant).
 *
 * @param {*} value - Value to escape
 * @returns {string} - CSV-safe string
 */
function csvEscape(value) {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Generate CSV manifest content from session data.
 *
 * Columns: Filename, Path, Status, GroupId, GroupType, SharpnessScore, SharpnessNormalized,
 *          IsSharpest, BlurFlag, EyesClosedFlag, FaceCount, AutoSuggestion, AutoReason,
 *          CameraMake, CameraModel, DateTaken, ISO, ShutterSpeed, Aperture, FocalLength,
 *          PHash, SizeBytes
 *
 * @param {object} session - CullSession object
 * @param {string} exportMode - Which images to include
 * @returns {string} - CSV content
 */
function generateCsv(session, exportMode) {
  const headers = [
    "Filename", "Path", "Status", "GroupId", "GroupType",
    "SharpnessScore", "SharpnessNormalized", "IsSharpest",
    "BlurFlag", "EyesClosedFlag", "FaceCount",
    "AutoSuggestion", "AutoReason",
    "CameraMake", "CameraModel", "DateTaken",
    "ISO", "ShutterSpeed", "Aperture", "FocalLength",
    "PHash", "SizeBytes"
  ];

  const rows = [headers.join(",")];

  for (const group of session.groups) {
    for (const img of group.images) {
      // Filter by export mode
      if (exportMode === "approved_only" && img.status !== "approved") continue;
      if (exportMode === "all_decided" && img.status === "pending") continue;

      const row = [
        csvEscape(img.filename),
        csvEscape(img.path),
        csvEscape(img.status),
        csvEscape(group.groupId),
        csvEscape(group.groupType),
        csvEscape(img.sharpnessScore),
        csvEscape(img.sharpnessNormalized),
        csvEscape(img.isSharpest),
        csvEscape(img.blurFlag),
        csvEscape(img.eyesClosedFlag),
        csvEscape(img.faces ? img.faces.length : 0),
        csvEscape(img.autoSuggestion),
        csvEscape(img.autoReason),
        csvEscape(img.exif?.cameraMake),
        csvEscape(img.exif?.cameraModel),
        csvEscape(img.exif?.dateTaken),
        csvEscape(img.exif?.iso),
        csvEscape(img.exif?.shutterSpeed),
        csvEscape(img.exif?.aperture),
        csvEscape(img.exif?.focalLength),
        csvEscape(img.pHash),
        csvEscape(img.sizeBytes)
      ];
      rows.push(row.join(","));
    }
  }

  return rows.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Sidecar generation
// ---------------------------------------------------------------------------

/**
 * Write a JSON sidecar file for an image.
 *
 * @param {object} img - Image object from CullSession
 * @param {string} sessionId - Session identifier
 * @param {string} groupId - Group identifier
 * @param {string} groupType - Group type (burst/single/similar)
 * @param {number} starRating - Star rating for approved images (1-5)
 * @returns {Promise<string>} - Path to written sidecar file
 */
async function writeSidecar(img, sessionId, groupId, groupType, starRating) {
  const sidecarDir = path.dirname(img.path);
  const sidecarName = img.filename + ".cull.json";
  const sidecarPath = path.join(sidecarDir, sidecarName);

  const sidecar = {
    version: "1.0",
    tool: "enso_photo_culling_tool",
    sessionId,
    exportedAt: new Date().toISOString(),
    originalFile: img.filename,
    originalPath: img.path,
    status: img.status,
    rating: img.status === "approved" ? starRating : (img.status === "rejected" ? -1 : 0),
    label: img.status === "approved" ? "Green" : (img.status === "rejected" ? "Red" : ""),
    sharpness: {
      score: img.sharpnessScore || 0,
      normalized: img.sharpnessNormalized || 0,
      isSharpest: img.isSharpest || false,
      blurFlag: img.blurFlag || false
    },
    faces: (img.faces || []).map(f => ({
      box: f.box,
      confidence: f.confidence,
      avgEAR: f.avgEAR,
      eyesClosed: f.eyesClosed
    })),
    eyesClosedFlag: img.eyesClosedFlag || false,
    pHash: img.pHash || null,
    autoSuggestion: img.autoSuggestion,
    autoReason: img.autoReason,
    group: { groupId, groupType },
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

  await fs.writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), "utf-8");
  return sidecarPath;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();

  // Parse options from stdin or CLI args
  let options = {};

  // Parse CLI arguments
  const args = process.argv.slice(2);
  const cliOptions = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--session":
      case "--sessionPath":
      case "-s":
        cliOptions.sessionPath = args[++i];
        break;
      case "--mode":
      case "--exportMode":
        cliOptions.exportMode = args[++i];
        break;
      case "--output":
      case "--outputDir":
      case "-o":
        cliOptions.outputDir = args[++i];
        break;
      case "--move-rejected":
        cliOptions.moveRejected = true;
        break;
      case "--star-rating":
        cliOptions.starRating = parseInt(args[++i], 10);
        break;
      case "--csv":
        cliOptions.writeCsv = true;
        break;
      case "--csv-path":
        cliOptions.csvPath = args[++i];
        cliOptions.writeCsv = true;
        break;
      case "--no-sidecars":
        cliOptions.writeSidecars = false;
        break;
      case "--preserve-structure":
        cliOptions.preserveStructure = true;
        break;
    }
  }

  // Try reading stdin if not a TTY
  if (!process.stdin.isTTY) {
    try {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      const input = Buffer.concat(chunks).toString("utf-8").trim();
      if (input) options = JSON.parse(input);
    } catch (e) {
      // No valid stdin — use CLI args only
    }
  }

  // Merge CLI args over stdin
  options = { ...options, ...cliOptions };

  const sessionPath = options.sessionPath;
  const exportMode = options.exportMode || "all_decided";
  const outputDir = options.outputDir || "_approved";
  const moveRejected = options.moveRejected === true;
  const starRating = Math.max(1, Math.min(5, options.starRating || 1));
  const doWriteSidecars = options.writeSidecars !== false;
  const doWriteCsv = options.writeCsv === true;
  const csvPath = options.csvPath || null;
  const preserveStructure = options.preserveStructure === true;

  const VALID_MODES = ["approved_only", "all_decided", "all"];
  if (!VALID_MODES.includes(exportMode)) {
    fatal(`Invalid exportMode: "${exportMode}". Valid: ${VALID_MODES.join(", ")}`);
  }

  if (!sessionPath) {
    fatal("sessionPath is required. Provide via stdin JSON or --session CLI arg.");
  }

  // Load session
  let session;
  try {
    const data = await fs.readFile(sessionPath, "utf-8");
    session = JSON.parse(data);
  } catch (e) {
    fatal(`Failed to load session: ${e.message}`, { sessionPath });
  }

  if (!session.groups || session.groups.length === 0) {
    fatal("Session has no groups to export.", { sessionPath });
  }

  progress({
    stage: "init", percent: 5,
    message: `Loaded session: ${session.totalImages} images, ${session.totalGroups} groups`
  });

  // Resolve output directory relative to shoot folder
  const shootFolder = session.folderPath || path.dirname(sessionPath);
  const resolvedOutputDir = path.isAbsolute(outputDir)
    ? outputDir
    : path.join(shootFolder, outputDir);

  // Collect images to export
  const allImages = [];
  for (const group of session.groups) {
    for (const img of group.images) {
      allImages.push({
        ...img,
        groupId: group.groupId,
        groupType: group.groupType
      });
    }
  }

  const toExport = allImages.filter(img => {
    if (exportMode === "approved_only") return img.status === "approved";
    if (exportMode === "all_decided") return img.status !== "pending";
    return true;
  });

  progress({
    stage: "export", percent: 10,
    message: `Exporting ${toExport.length} of ${allImages.length} images (mode: ${exportMode})`
  });

  // Process exports
  let exported = 0;
  let copied = 0;
  let moved = 0;
  let skipped = allImages.length - toExport.length;
  const errors = [];
  const exportedFiles = [];
  const copiedFiles = [];

  for (let i = 0; i < toExport.length; i++) {
    const img = toExport[i];

    try {
      // Write JSON sidecar
      if (doWriteSidecars) {
        const sidecarPath = await writeSidecar(
          img, session.sessionId, img.groupId, img.groupType, starRating
        );
        exportedFiles.push(sidecarPath);
      }

      // Copy approved images to output folder
      if (img.status === "approved") {
        let destDir = resolvedOutputDir;
        if (preserveStructure) {
          // Preserve relative path structure from shoot folder
          const relDir = path.relative(shootFolder, path.dirname(img.path));
          destDir = path.join(resolvedOutputDir, relDir);
        }

        const destPath = await safeCopy(img.path, destDir, img.filename);
        copiedFiles.push(destPath);
        copied++;
      }

      // Move rejected images
      if (moveRejected && img.status === "rejected") {
        const rejectedDir = path.join(path.dirname(img.path), "_rejected");
        await safeMove(img.path, rejectedDir, img.filename);
        moved++;
      }

      exported++;
    } catch (e) {
      errors.push({ path: img.path, error: e.message });
    }

    // Report progress every 10 images or at the end
    if ((i + 1) % 10 === 0 || i === toExport.length - 1) {
      progress({
        stage: "export",
        current: i + 1,
        total: toExport.length,
        percent: 10 + Math.round(((i + 1) / toExport.length) * 70),
        message: `Exporting... ${i + 1}/${toExport.length}`
      });
    }
  }

  // Write CSV manifest
  let finalCsvPath = null;
  if (doWriteCsv) {
    progress({ stage: "csv", percent: 85, message: "Writing CSV manifest..." });

    finalCsvPath = csvPath || path.join(shootFolder, ".enso-cull-manifest.csv");
    try {
      const csvContent = generateCsv(session, exportMode);
      await fs.writeFile(finalCsvPath, csvContent, "utf-8");
      progress({ stage: "csv", percent: 90, message: `CSV written: ${finalCsvPath}` });
    } catch (e) {
      errors.push({ path: finalCsvPath, error: `CSV write failed: ${e.message}` });
      finalCsvPath = null;
    }
  }

  // Write export summary
  progress({ stage: "summary", percent: 92, message: "Writing export summary..." });

  const summaryData = {
    version: "1.0",
    tool: "enso_photo_culling_tool",
    sessionId: session.sessionId,
    exportedAt: new Date().toISOString(),
    folderPath: shootFolder,
    outputDir: resolvedOutputDir,
    exportMode,
    starRating,
    stats: {
      totalImages: allImages.length,
      exported,
      copied,
      moved,
      skipped,
      errors: errors.length
    },
    groups: session.groups.map(g => {
      let gApproved = 0, gRejected = 0, gPending = 0;
      for (const img of g.images) {
        if (img.status === "approved") gApproved++;
        else if (img.status === "rejected") gRejected++;
        else gPending++;
      }
      return {
        groupId: g.groupId,
        groupType: g.groupType,
        imageCount: g.imageCount,
        approved: gApproved,
        rejected: gRejected,
        pending: gPending
      };
    }),
    elapsedMs: Date.now() - startTime
  };

  const summaryPath = path.join(shootFolder, ".enso-cull-export-summary.json");
  try {
    await fs.writeFile(summaryPath, JSON.stringify(summaryData, null, 2), "utf-8");
  } catch (e) {
    errors.push({ path: summaryPath, error: `Summary write failed: ${e.message}` });
  }

  progress({ stage: "done", percent: 100, message: "Export complete" });

  // Output result
  const result = {
    exported,
    copied,
    moved,
    skipped,
    errors,
    exportMode,
    starRating,
    outputDir: resolvedOutputDir,
    files: exportedFiles,
    copiedFiles,
    csvPath: finalCsvPath,
    summaryPath,
    elapsedMs: Date.now() - startTime,
    message: [
      `Exported ${exported} images`,
      copied > 0 ? `copied ${copied} approved to ${outputDir}` : null,
      moved > 0 ? `moved ${moved} rejected` : null,
      finalCsvPath ? `CSV manifest: ${finalCsvPath}` : null,
      errors.length > 0 ? `${errors.length} errors` : null
    ].filter(Boolean).join(", ")
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch(e => {
  fatal("Unhandled error: " + e.message, { stack: e.stack });
});
