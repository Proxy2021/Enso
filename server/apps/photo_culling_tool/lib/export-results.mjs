/**
 * export-results.mjs — Exports culling decisions to JSON sidecar files
 * and optionally moves rejected images to a _rejected subfolder.
 *
 * Supports three export modes:
 *   - "approved_only": Export only approved images
 *   - "all_decided": Export all images with approve/reject decisions
 *   - "all": Export all images including pending
 *
 * Sidecar format: JSON file (<filename>.cull.json) alongside each original.
 * Also supports optional physical move of rejected images to _rejected/.
 *
 * Usage:
 *   import { exportResults } from './export-results.mjs';
 *   const result = await exportResults(session, { exportMode: 'all_decided', moveRejected: true });
 *
 * @module export-results
 */

import fs from "fs/promises";
import path from "path";

/**
 * Export culling decisions for a session.
 *
 * @param {object} session - CullSession object with groups[]
 * @param {object} [options]
 * @param {string} [options.exportMode="all_decided"] - "approved_only" | "all_decided" | "all"
 * @param {boolean} [options.moveRejected=false] - Move rejected images to _rejected/ subfolder
 * @param {number} [options.starRating=1] - Star rating for approved images (1-5)
 * @param {boolean} [options.writeSidecar=true] - Write JSON sidecar files
 * @param {string} [options.outputPath] - Custom output directory for sidecars (default: alongside originals)
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<{exported: number, skipped: number, moved: number, errors: Array, files: string[], summaryPath: string}>}
 */
export async function exportResults(session, options = {}) {
  const {
    exportMode = "all_decided",
    moveRejected = false,
    starRating = 1,
    writeSidecar = true,
    outputPath = null,
    onProgress
  } = options;

  if (!session || !session.groups) {
    throw new Error("Invalid session: must have a groups array");
  }

  // Collect all images that match the export filter
  const allImages = [];
  for (const group of session.groups) {
    for (const img of group.images) {
      allImages.push({ ...img, groupId: group.groupId, groupType: group.groupType });
    }
  }

  const toExport = allImages.filter((img) => {
    if (exportMode === "approved_only") return img.status === "approved";
    if (exportMode === "all_decided") return img.status === "approved" || img.status === "rejected";
    return true; // "all"
  });

  const total = toExport.length;
  let exported = 0;
  let skipped = 0;
  let moved = 0;
  const errors = [];
  const exportedFiles = [];

  for (let i = 0; i < toExport.length; i++) {
    const img = toExport[i];

    try {
      // Write JSON sidecar
      if (writeSidecar) {
        const sidecarPath = await writeSidecarFile(img, {
          starRating,
          outputPath,
          sessionId: session.sessionId
        });
        if (sidecarPath) {
          exportedFiles.push(sidecarPath);
        }
      }

      // Move rejected images
      if (moveRejected && img.status === "rejected") {
        const didMove = await moveToRejected(img.path);
        if (didMove) moved++;
      }

      exported++;
    } catch (e) {
      errors.push({ path: img.path, error: e.message });
      skipped++;
    }

    if (onProgress) {
      onProgress({
        stage: "export",
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
        message: `Exporting... ${i + 1}/${total}`
      });
    }
  }

  // Write session summary JSON
  const summaryPath = await writeSessionSummary(session, {
    outputPath: outputPath || session.folderPath,
    exportMode,
    exported,
    skipped,
    moved,
    starRating
  });

  return {
    exported,
    skipped: allImages.length - toExport.length + skipped,
    moved,
    errors,
    files: exportedFiles,
    summaryPath
  };
}

/**
 * Write a JSON sidecar file for a single image.
 *
 * Sidecar filename: <original_filename>.cull.json
 * Contains: status, sharpness score, face data, auto-suggestion, group info.
 *
 * @param {object} img - Image object with culling data
 * @param {object} options
 * @returns {Promise<string>} - Path to written sidecar file
 */
async function writeSidecarFile(img, options = {}) {
  const { starRating = 1, outputPath = null, sessionId = null } = options;

  const originalDir = path.dirname(img.path);
  const originalName = path.basename(img.path);
  const sidecarDir = outputPath || originalDir;
  const sidecarName = `${originalName}.cull.json`;
  const sidecarPath = path.join(sidecarDir, sidecarName);

  const sidecar = {
    version: "1.0",
    tool: "enso_photo_culling_tool",
    sessionId,
    exportedAt: new Date().toISOString(),
    originalFile: originalName,
    originalPath: img.path,
    status: img.status || "pending",
    rating: img.status === "approved" ? starRating : (img.status === "rejected" ? -1 : 0),
    label: img.status === "approved" ? "Green" : (img.status === "rejected" ? "Red" : ""),
    sharpness: {
      score: img.sharpnessScore || 0,
      normalized: img.sharpnessNormalized || 0,
      isSharpest: img.isSharpest || false,
      blurFlag: img.blurFlag || false
    },
    faces: (img.faces || []).map((f) => ({
      box: f.box,
      confidence: f.confidence,
      avgEAR: f.avgEAR,
      eyesClosed: f.eyesClosed
    })),
    eyesClosedFlag: img.eyesClosedFlag || false,
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

  // Ensure output directory exists
  try {
    await fs.mkdir(sidecarDir, { recursive: true });
  } catch {
    // Directory already exists
  }

  await fs.writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), "utf-8");
  return sidecarPath;
}

/**
 * Move a rejected image to a _rejected/ subfolder alongside its original location.
 *
 * @param {string} imagePath - Absolute path to image
 * @returns {Promise<boolean>} - true if moved successfully
 */
async function moveToRejected(imagePath) {
  const dir = path.dirname(imagePath);
  const filename = path.basename(imagePath);
  const rejectedDir = path.join(dir, "_rejected");
  const destPath = path.join(rejectedDir, filename);

  // Don't move if already in _rejected
  if (dir.endsWith("_rejected")) return false;

  // Ensure _rejected directory exists
  try {
    await fs.mkdir(rejectedDir, { recursive: true });
  } catch {
    // Already exists
  }

  // Handle name collision
  let finalDest = destPath;
  try {
    await fs.access(finalDest);
    // File exists — add timestamp suffix
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    finalDest = path.join(rejectedDir, `${base}_${Date.now()}${ext}`);
  } catch {
    // Dest doesn't exist — use as-is
  }

  await fs.rename(imagePath, finalDest);
  return true;
}

/**
 * Write a session summary JSON file.
 *
 * @param {object} session - CullSession
 * @param {object} options
 * @returns {Promise<string>} - Path to summary file
 */
async function writeSessionSummary(session, options = {}) {
  const {
    outputPath,
    exportMode,
    exported,
    skipped,
    moved,
    starRating
  } = options;

  // Compute stats
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  let totalImages = 0;

  for (const group of session.groups) {
    for (const img of group.images) {
      totalImages++;
      if (img.status === "approved") approved++;
      else if (img.status === "rejected") rejected++;
      else pending++;
    }
  }

  const summary = {
    version: "1.0",
    tool: "enso_photo_culling_tool",
    sessionId: session.sessionId || null,
    exportedAt: new Date().toISOString(),
    folderPath: session.folderPath,
    exportMode,
    starRating,
    stats: {
      totalImages,
      totalGroups: session.groups.length,
      approved,
      rejected,
      pending,
      exported,
      skipped,
      moved,
      completionPercent: totalImages > 0
        ? Math.round(((approved + rejected) / totalImages) * 100)
        : 0
    },
    groups: session.groups.map((g) => ({
      groupId: g.groupId,
      groupType: g.groupType,
      imageCount: g.imageCount,
      images: g.images.map((img) => ({
        filename: img.filename,
        status: img.status,
        sharpnessScore: img.sharpnessScore,
        isSharpest: img.isSharpest,
        blurFlag: img.blurFlag,
        eyesClosedFlag: img.eyesClosedFlag,
        autoSuggestion: img.autoSuggestion
      }))
    }))
  };

  const summaryPath = path.join(outputPath, ".enso-cull-export-summary.json");

  try {
    await fs.mkdir(outputPath, { recursive: true });
  } catch {
    // Already exists
  }

  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  return summaryPath;
}

/**
 * Load a previously exported sidecar for an image.
 *
 * @param {string} imagePath - Absolute path to the original image
 * @returns {Promise<object|null>} - Parsed sidecar data or null if not found
 */
export async function loadSidecar(imagePath) {
  const sidecarPath = imagePath + ".cull.json";
  try {
    const data = await fs.readFile(sidecarPath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Remove all sidecar files for a session (cleanup utility).
 *
 * @param {object} session - CullSession
 * @returns {Promise<{removed: number, errors: number}>}
 */
export async function cleanSidecars(session) {
  let removed = 0;
  let errorCount = 0;

  for (const group of session.groups) {
    for (const img of group.images) {
      const sidecarPath = img.path + ".cull.json";
      try {
        await fs.unlink(sidecarPath);
        removed++;
      } catch {
        // Sidecar doesn't exist or can't be removed
        errorCount++;
      }
    }
  }

  // Remove summary file
  const summaryPath = path.join(session.folderPath, ".enso-cull-export-summary.json");
  try {
    await fs.unlink(summaryPath);
    removed++;
  } catch {
    errorCount++;
  }

  return { removed, errors: errorCount };
}

export default exportResults;
