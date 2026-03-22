#!/usr/bin/env node
/**
 * load_session.mjs — Load a previously saved CullSession from disk.
 *
 * Reads a .enso-cull-session.json file (or any JSON session file),
 * validates the structure, recomputes live stats, and returns the session
 * ready for the culling UI.
 *
 * stdin JSON:
 *   {
 *     "sessionFile": "/path/to/shoot/.enso-cull-session.json",
 *     "recomputeStats": true,
 *     "validatePaths": false
 *   }
 *
 * Alternatives for sessionFile:
 *   - Absolute path to session JSON file
 *   - Path to a shoot folder (will look for .enso-cull-session.json inside)
 *
 * stdout JSON:
 *   {
 *     "session": { ...CullSession },
 *     "stats": { totalImages, totalGroups, approved, rejected, pending,
 *                blurFlagged, eyesClosedFlagged, completionPercent },
 *     "groupOverview": [{ groupId, imageCount, groupType, approved, rejected, pending, completion }],
 *     "valid": true,
 *     "missingFiles": [...],
 *     "elapsedMs": N,
 *     "message": "..."
 *   }
 *
 * Progress reported to stderr as JSON lines.
 */

import fs from "fs/promises";
import path from "path";
import os from "os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progress(data) {
  process.stderr.write(JSON.stringify(data) + "\n");
}

function resolvePath(inputPath) {
  if (inputPath.startsWith("~")) {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return path.resolve(inputPath);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate the session structure has required fields.
 * Returns { valid: boolean, errors: string[] }
 */
function validateSession(session) {
  const errors = [];

  if (!session || typeof session !== "object") {
    return { valid: false, errors: ["Session is not a valid object"] };
  }

  if (!session.sessionId) errors.push("Missing sessionId");
  if (!session.folderPath) errors.push("Missing folderPath");
  if (!Array.isArray(session.groups)) errors.push("Missing or invalid groups array");
  if (typeof session.totalImages !== "number") errors.push("Missing totalImages");
  if (typeof session.totalGroups !== "number") errors.push("Missing totalGroups");

  // Validate groups have expected structure
  if (Array.isArray(session.groups)) {
    for (let gi = 0; gi < session.groups.length; gi++) {
      const grp = session.groups[gi];
      if (!grp.groupId) errors.push(`Group ${gi}: missing groupId`);
      if (!Array.isArray(grp.images)) errors.push(`Group ${gi}: missing images array`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Recompute session stats from image statuses.
 */
function recomputeStats(session) {
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  let blurFlagged = 0;
  let eyesClosedFlagged = 0;
  let totalImages = 0;

  for (const grp of session.groups) {
    for (const img of grp.images) {
      totalImages++;
      if (img.status === "approved") approved++;
      else if (img.status === "rejected") rejected++;
      else pending++;
      if (img.blurFlag || img.blur_flag) blurFlagged++;
      if (img.eyesClosedFlag || img.eyes_status === "closed") eyesClosedFlagged++;
    }
  }

  const decided = approved + rejected;
  const completionPercent = totalImages > 0 ? Math.round((decided / totalImages) * 100) : 0;

  return {
    totalImages,
    totalGroups: session.groups.length,
    approved,
    rejected,
    pending,
    blurFlagged,
    eyesClosedFlagged,
    completionPercent
  };
}

/**
 * Build group overview with per-group stats.
 */
function buildGroupOverview(session, activeGroupIndex) {
  return session.groups.map((grp, idx) => {
    let gApproved = 0, gRejected = 0, gPending = 0, gBlurCount = 0;
    let sharpestFile = null;

    for (const img of grp.images) {
      if (img.status === "approved") gApproved++;
      else if (img.status === "rejected") gRejected++;
      else gPending++;
      if (img.blurFlag || img.blur_flag) gBlurCount++;
      if (img.isSharpest || img.is_sharpest_in_group) sharpestFile = img.filename;
    }

    const decided = gApproved + gRejected;
    const completion = gPending === 0 ? "done" : (decided > 0 ? "partial" : "pending");

    return {
      groupId: grp.groupId,
      imageCount: grp.imageCount || grp.images.length,
      groupType: grp.groupType || "single",
      captureTime: grp.captureTime || null,
      approved: gApproved,
      rejected: gRejected,
      pending: gPending,
      blurCount: gBlurCount,
      sharpestFile,
      completion,
      isActive: idx === activeGroupIndex
    };
  });
}

/**
 * Verify that image files still exist on disk.
 * Returns array of missing file paths.
 */
async function validateFilePaths(session) {
  const missing = [];

  for (const grp of session.groups) {
    for (const img of grp.images) {
      if (img.path) {
        try {
          await fs.access(img.path);
        } catch {
          missing.push(img.path);
        }
      }
    }
  }

  return missing;
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
      usage: '{ "sessionFile": "/path/to/.enso-cull-session.json" }'
    }));
    process.exit(1);
  }

  const sessionFileRaw = (input.sessionFile || input.sessionPath || "").trim();
  const recomputeStatsFlag = input.recomputeStats !== false;
  const validatePathsFlag = input.validatePaths === true;

  if (!sessionFileRaw) {
    process.stdout.write(JSON.stringify({
      error: "sessionFile is required. Provide an absolute path to a .enso-cull-session.json file or a shoot folder.",
      usage: '{ "sessionFile": "/path/to/shoot/.enso-cull-session.json" }'
    }));
    process.exit(1);
  }

  // Resolve the session file path
  let sessionFile = resolvePath(sessionFileRaw);

  // If it's a directory, look for the session file inside
  try {
    const stat = await fs.stat(sessionFile);
    if (stat.isDirectory()) {
      sessionFile = path.join(sessionFile, ".enso-cull-session.json");
    }
  } catch {
    // Might not exist yet — try as-is
  }

  progress({
    stage: "loading", current: 0, total: 1, percent: 10,
    message: `Loading session from ${path.basename(sessionFile)}...`
  });

  // Read session file
  let sessionData;
  try {
    sessionData = await fs.readFile(sessionFile, "utf-8");
  } catch (e) {
    process.stdout.write(JSON.stringify({
      error: `Failed to read session file: ${e.message}`,
      path: sessionFile,
      valid: false
    }));
    process.exit(1);
  }

  // Parse JSON
  let session;
  try {
    session = JSON.parse(sessionData);
  } catch (e) {
    process.stdout.write(JSON.stringify({
      error: `Invalid JSON in session file: ${e.message}`,
      path: sessionFile,
      valid: false
    }));
    process.exit(1);
  }

  progress({
    stage: "validating", current: 1, total: 1, percent: 30,
    message: "Validating session structure..."
  });

  // Validate session structure
  const validation = validateSession(session);
  if (!validation.valid) {
    process.stdout.write(JSON.stringify({
      error: "Invalid session structure",
      validationErrors: validation.errors,
      path: sessionFile,
      valid: false
    }));
    process.exit(1);
  }

  // Recompute stats from current image statuses
  let stats;
  if (recomputeStatsFlag) {
    progress({
      stage: "stats", current: 0, total: 1, percent: 50,
      message: "Recomputing session stats..."
    });
    stats = recomputeStats(session);
    session.stats = stats;
    session.totalImages = stats.totalImages;
    session.totalGroups = stats.totalGroups;
  } else {
    stats = session.stats || recomputeStats(session);
  }

  // Build group overview
  const activeGroupIndex = session.currentGroupIndex || 0;
  const groupOverview = buildGroupOverview(session, activeGroupIndex);

  // Optionally validate file paths
  let missingFiles = [];
  if (validatePathsFlag) {
    progress({
      stage: "paths", current: 0, total: stats.totalImages, percent: 60,
      message: "Checking file paths..."
    });
    missingFiles = await validateFilePaths(session);
    if (missingFiles.length > 0) {
      progress({
        stage: "paths", current: stats.totalImages, total: stats.totalImages, percent: 80,
        message: `Warning: ${missingFiles.length} files missing from disk`
      });
    }
  }

  const elapsedMs = Date.now() - startMs;
  const message = `Loaded session: ${stats.totalImages} images in ${stats.totalGroups} groups, ` +
    `${stats.completionPercent}% complete` +
    (missingFiles.length > 0 ? ` (${missingFiles.length} files missing)` : "");

  progress({
    stage: "complete", current: 1, total: 1, percent: 100, message
  });

  process.stdout.write(JSON.stringify({
    session,
    stats,
    groupOverview,
    valid: true,
    sessionFile,
    missingFiles,
    elapsedMs,
    message
  }));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message, valid: false }));
  process.exit(1);
});
