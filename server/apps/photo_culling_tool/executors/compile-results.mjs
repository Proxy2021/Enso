#!/usr/bin/env node
/**
 * compile-results.mjs — Merges all prior executor outputs into a single culling session.
 *
 * Accepts outputs from scan-folder, analyze-sharpness, group-similar, and detect-problems,
 * then produces a unified CullSession object ready for the culling UI.
 *
 * stdin JSON:
 *   {
 *     "folderPath": "/path/to/shoot",
 *     "scanResult": { images: [...] },
 *     "sharpnessResult": { scores: [...] },
 *     "groupResult": { groups: [...] },
 *     "flagResult": { flags: [...] },
 *     "settings": { blurThreshold, burstThresholdMs, earThreshold }
 *   }
 *
 * stdout JSON:
 *   {
 *     "sessionId": "...",
 *     "folderPath": "...",
 *     "groups": [...],
 *     "imageMap": { [id]: { path, thumbnail, sharpnessScore, isBest, isBlurry, eyesClosed, exif, decision } },
 *     "stats": { ... },
 *     "elapsedMs": N
 *   }
 *
 * Progress on stderr as JSON lines.
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progress(data) {
  try {
    process.stderr.write(JSON.stringify(data) + "\n");
  } catch {
    // non-fatal
  }
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
      error: "Invalid JSON input on stdin: " + e.message,
      usage: '{ "folderPath": "...", "scanResult": {...}, "sharpnessResult": {...}, "groupResult": {...}, "flagResult": {...} }'
    }));
    process.exit(1);
  }

  const folderPath = (input.folderPath || "").trim();
  const scanResult = input.scanResult || { images: [] };
  const sharpnessResult = input.sharpnessResult || { scores: [] };
  const groupResult = input.groupResult || { groups: [] };
  const flagResult = input.flagResult || { flags: [] };
  const settings = input.settings || {};

  const blurThreshold = typeof settings.blurThreshold === "number" ? settings.blurThreshold : 50;
  const burstThresholdMs = typeof settings.burstThresholdMs === "number" ? settings.burstThresholdMs : 3000;
  const earThreshold = typeof settings.earThreshold === "number" ? settings.earThreshold : 0.2;
  const skipFaces = settings.skipFaces === true;

  progress({
    stage: "compile",
    current: 0,
    total: 4,
    percent: 0,
    message: "Compiling culling session..."
  });

  // --- Step 1: Build lookup maps from each executor's output ---

  // Scan result: id → image metadata (path, filename, exif, etc.)
  const imageMetaMap = new Map();
  for (const img of scanResult.images || []) {
    imageMetaMap.set(img.id, img);
  }

  progress({
    stage: "compile",
    current: 1,
    total: 4,
    percent: 25,
    message: `Indexed ${imageMetaMap.size} image metadata records`
  });

  // Sharpness result: id → { sharpnessScore, thumbnail }
  const sharpnessMap = new Map();
  for (const score of sharpnessResult.scores || []) {
    sharpnessMap.set(score.id, score);
  }

  progress({
    stage: "compile",
    current: 2,
    total: 4,
    percent: 50,
    message: `Indexed ${sharpnessMap.size} sharpness scores`
  });

  // Flag result: id → { isBlurry, eyesClosed, hasFace }
  const flagMap = new Map();
  for (const flag of flagResult.flags || []) {
    flagMap.set(flag.id, flag);
  }

  progress({
    stage: "compile",
    current: 3,
    total: 4,
    percent: 75,
    message: `Indexed ${flagMap.size} problem flags`
  });

  // --- Step 2: Build the imageMap (flat lookup by id) ---
  const imageMap = {};
  for (const [id, meta] of imageMetaMap) {
    const sharpness = sharpnessMap.get(id) || {};
    const flags = flagMap.get(id) || {};

    imageMap[id] = {
      id,
      path: meta.path,
      filename: meta.filename,
      ext: meta.ext,
      isRaw: meta.isRaw || false,
      sizeBytes: meta.sizeBytes || 0,
      thumbnail: sharpness.thumbnail || null,
      sharpnessScore: sharpness.sharpnessScore || 0,
      isBest: false, // Will be set per-group below
      isBlurry: flags.isBlurry || false,
      eyesClosed: flags.eyesClosed || false,
      hasFace: flags.hasFace || false,
      faceCount: flags.faceCount || 0,
      exif: meta.exif || {},
      decision: "undecided",
      decidedAt: null,
      autoSuggestion: null,
      autoReason: null
    };
  }

  // --- Step 3: Process groups and generate auto-suggestions ---
  const sessionGroups = [];

  for (const group of groupResult.groups || []) {
    const groupImages = [];

    for (const gImg of group.images || []) {
      const imgData = imageMap[gImg.id];
      if (!imgData) continue;

      // Mark isBest from grouping result
      if (gImg.isBest) {
        imgData.isBest = true;
      }

      groupImages.push(imgData);
    }

    // Sort group images by sharpness descending
    groupImages.sort((a, b) => (b.sharpnessScore || 0) - (a.sharpnessScore || 0));

    // Compute sharpness range for normalization
    const scores = groupImages.map((img) => img.sharpnessScore || 0);
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    const minScore = scores.length > 0 ? Math.min(...scores) : 0;
    const scoreRange = maxScore - minScore;

    // Generate auto-suggestions for each image in the group
    const rankedImages = groupImages.map((img, idx) => {
      const isSharpest = idx === 0;
      const normalized = scoreRange > 0
        ? Math.round(((img.sharpnessScore - minScore) / scoreRange) * 100)
        : (img.sharpnessScore >= blurThreshold ? 100 : 0);

      // Auto-suggestion logic
      let autoSuggestion = null;
      let autoReason = null;

      if (groupImages.length === 1) {
        // Single image — no comparison
        if (img.isBlurry) {
          autoSuggestion = "reject";
          autoReason = `Blurry (score: ${Math.round(img.sharpnessScore)})`;
        } else if (img.eyesClosed) {
          autoSuggestion = "reject";
          autoReason = "Eyes closed detected";
        } else {
          autoSuggestion = "approve";
          autoReason = "Single image, no issues detected";
        }
      } else if (isSharpest) {
        if (img.eyesClosed) {
          autoSuggestion = null; // Ambiguous
          autoReason = `Sharpest in burst of ${groupImages.length} but eyes closed`;
        } else {
          autoSuggestion = "approve";
          autoReason = `Sharpest in group of ${groupImages.length}`;
        }
      } else if (img.isBlurry) {
        autoSuggestion = "reject";
        autoReason = `Blurry (score: ${Math.round(img.sharpnessScore)})`;
      } else if (img.eyesClosed) {
        autoSuggestion = "reject";
        autoReason = "Eyes closed detected";
      } else {
        autoSuggestion = "reject";
        autoReason = `Superseded by sharper image (${Math.round(maxScore)} vs ${Math.round(img.sharpnessScore)})`;
      }

      // Update imageMap with computed values
      img.isBest = isSharpest;
      img.autoSuggestion = autoSuggestion;
      img.autoReason = autoReason;

      return {
        id: img.id,
        path: img.path,
        filename: img.filename,
        sharpnessScore: img.sharpnessScore,
        sharpnessNormalized: normalized,
        isSharpest,
        blurFlag: img.isBlurry,
        eyesClosedFlag: img.eyesClosed,
        hasFace: img.hasFace,
        exif: img.exif,
        status: "pending",
        decidedAt: null,
        autoSuggestion,
        autoReason,
        thumbnail: img.thumbnail
      };
    });

    sessionGroups.push({
      groupId: group.groupId,
      groupType: group.groupType || "single",
      captureTime: group.captureTime || null,
      imageCount: rankedImages.length,
      images: rankedImages
    });
  }

  // --- Step 4: Handle ungrouped images (images not in any group) ---
  const groupedIds = new Set();
  for (const g of groupResult.groups || []) {
    for (const img of g.images || []) {
      groupedIds.add(img.id);
    }
  }

  const ungrouped = [];
  for (const [id, meta] of imageMetaMap) {
    if (!groupedIds.has(id)) {
      ungrouped.push(meta);
    }
  }

  // Create singleton groups for ungrouped images
  if (ungrouped.length > 0) {
    let extraGroupIndex = sessionGroups.length;
    for (const meta of ungrouped) {
      extraGroupIndex++;
      const img = imageMap[meta.id];
      if (!img) continue;

      const autoSuggestion = img.isBlurry ? "reject" : (img.eyesClosed ? "reject" : "approve");
      const autoReason = img.isBlurry
        ? `Blurry (score: ${Math.round(img.sharpnessScore)})`
        : (img.eyesClosed ? "Eyes closed detected" : "Single image, no issues detected");

      img.isBest = true;
      img.autoSuggestion = autoSuggestion;
      img.autoReason = autoReason;

      sessionGroups.push({
        groupId: `G${String(extraGroupIndex).padStart(3, "0")}`,
        groupType: "single",
        captureTime: meta.exif?.dateTaken || null,
        imageCount: 1,
        images: [{
          id: img.id,
          path: img.path,
          filename: img.filename,
          sharpnessScore: img.sharpnessScore,
          sharpnessNormalized: 100,
          isSharpest: true,
          blurFlag: img.isBlurry,
          eyesClosedFlag: img.eyesClosed,
          hasFace: img.hasFace,
          exif: img.exif,
          status: "pending",
          decidedAt: null,
          autoSuggestion,
          autoReason,
          thumbnail: img.thumbnail
        }]
      });
    }
  }

  // --- Step 5: Compute session-level statistics ---
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  let blurFlagged = 0;
  let eyesClosedFlagged = 0;
  let totalImages = 0;

  for (const group of sessionGroups) {
    for (const img of group.images) {
      totalImages++;
      if (img.status === "approved") approved++;
      else if (img.status === "rejected") rejected++;
      else pending++;
      if (img.blurFlag) blurFlagged++;
      if (img.eyesClosedFlag) eyesClosedFlagged++;
    }
  }

  // --- Step 6: Build final session ---
  const sessionId = crypto.randomUUID();

  const session = {
    sessionId,
    folderPath: folderPath || scanResult.folderPath || "",
    createdAt: Date.now(),
    settings: {
      burstThresholdMs,
      blurThreshold,
      earThreshold,
      skipFaces
    },
    totalImages,
    totalGroups: sessionGroups.length,
    stats: {
      approved,
      rejected,
      pending,
      blurFlagged,
      eyesClosedFlagged,
      completionPercent: 0
    },
    groups: sessionGroups,
    imageMap,
    undoStack: [],
    currentGroupIndex: 0,
    currentImageIndex: 0
  };

  // --- Step 7: Persist session to disk ---
  if (session.folderPath) {
    const sessionPath = path.join(session.folderPath, ".enso-cull-session.json");
    try {
      // Atomic write: write to temp file, then rename
      const tempPath = sessionPath + ".tmp";
      await fs.writeFile(tempPath, JSON.stringify(session, null, 2), "utf-8");
      await fs.rename(tempPath, sessionPath);
      session.sessionPath = sessionPath;
    } catch (e) {
      // Non-fatal — session still returned in stdout
      session.persistError = e.message;
    }
  }

  const elapsedMs = Date.now() - startMs;

  progress({
    stage: "complete",
    current: 4,
    total: 4,
    percent: 100,
    message: `Session compiled: ${totalImages} images in ${sessionGroups.length} groups (${blurFlagged} blurry, ${eyesClosedFlagged} eyes-closed) in ${elapsedMs}ms`
  });

  session.elapsedMs = elapsedMs;
  session.message = `Compiled ${totalImages} images into ${sessionGroups.length} groups (${blurFlagged} blur-flagged, ${eyesClosedFlagged} eyes-closed)`;

  process.stdout.write(JSON.stringify(session));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message }));
  process.exit(1);
});
