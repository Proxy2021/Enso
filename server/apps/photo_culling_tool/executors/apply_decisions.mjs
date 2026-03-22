#!/usr/bin/env node
/**
 * apply_decisions.mjs — Applies user culling decisions (approve/reject/skip)
 * and optionally moves rejected images to a _rejected/ subfolder.
 *
 * Supports two output modes:
 *   - "manifest": Write a decisions.json manifest file (non-destructive)
 *   - "move": Move rejected images to _rejected/ subfolder (destructive)
 *
 * stdin JSON:
 *   {
 *     "decisions": {
 *       "/path/to/DSC_0001.jpg": "approve",
 *       "/path/to/DSC_0002.jpg": "reject",
 *       "/path/to/DSC_0003.jpg": "skip"
 *     },
 *     "sessionPath": "/path/to/shoot/.enso-cull-session.json",
 *     "outputMode": "manifest|move|both",
 *     "manifestPath": "/path/to/shoot/decisions.json",
 *     "moveRejected": false,
 *     "dryRun": false
 *   }
 *
 * OR provide a session file + groups to update:
 *   {
 *     "session": { ...CullSession },
 *     "outputMode": "manifest",
 *     "manifestPath": "/path/to/shoot/decisions.json"
 *   }
 *
 * stdout JSON:
 *   {
 *     "applied": N,
 *     "approved": N,
 *     "rejected": N,
 *     "skipped": N,
 *     "moved": N,
 *     "errors": [],
 *     "manifestPath": "...",
 *     "elapsedMs": N
 *   }
 *
 * Progress on stderr as JSON lines.
 */

import fs from "fs/promises";
import fsSyncModule from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progress(data) {
  process.stderr.write(JSON.stringify(data) + "\n");
}

// ---------------------------------------------------------------------------
// Load session
// ---------------------------------------------------------------------------

async function loadSession(sessionPath) {
  try {
    const raw = await fs.readFile(sessionPath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to load session from ${sessionPath}: ${e.message}`);
  }
}

async function saveSession(session, sessionPath) {
  const tempPath = sessionPath + ".tmp";
  await fs.writeFile(tempPath, JSON.stringify(session, null, 2), "utf-8");
  await fs.rename(tempPath, sessionPath);
}

// ---------------------------------------------------------------------------
// Apply decisions to session
// ---------------------------------------------------------------------------

function applyDecisionsToSession(session, decisions) {
  const now = Date.now();
  let applied = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let skippedCount = 0;

  for (const group of session.groups) {
    for (const img of group.images) {
      const decision = decisions[img.path];
      if (!decision) continue;

      const normalizedDecision = decision.toLowerCase().trim();

      if (normalizedDecision === "approve" || normalizedDecision === "approved") {
        img.status = "approved";
        img.decidedAt = now;
        approvedCount++;
        applied++;
      } else if (normalizedDecision === "reject" || normalizedDecision === "rejected") {
        img.status = "rejected";
        img.decidedAt = now;
        rejectedCount++;
        applied++;
      } else if (normalizedDecision === "skip" || normalizedDecision === "pending") {
        img.status = "pending";
        img.decidedAt = null;
        skippedCount++;
        applied++;
      }
    }
  }

  // Recompute stats
  let totalApproved = 0, totalRejected = 0, totalPending = 0;
  let blurFlagged = 0, eyesClosedFlagged = 0;

  for (const group of session.groups) {
    for (const img of group.images) {
      if (img.status === "approved") totalApproved++;
      else if (img.status === "rejected") totalRejected++;
      else totalPending++;
      if (img.blurFlag) blurFlagged++;
      if (img.eyesClosedFlag) eyesClosedFlagged++;
    }
  }

  session.stats = {
    approved: totalApproved,
    rejected: totalRejected,
    pending: totalPending,
    blurFlagged,
    eyesClosedFlagged
  };

  return { applied, approved: approvedCount, rejected: rejectedCount, skipped: skippedCount };
}

// ---------------------------------------------------------------------------
// Write decisions manifest
// ---------------------------------------------------------------------------

async function writeManifest(session, decisions, manifestPath) {
  const allImages = [];
  for (const group of session.groups) {
    for (const img of group.images) {
      allImages.push({
        path: img.path,
        filename: img.filename,
        status: img.status,
        decidedAt: img.decidedAt,
        sharpnessScore: img.sharpnessScore,
        isSharpest: img.isSharpest,
        blurFlag: img.blurFlag,
        eyesClosedFlag: img.eyesClosedFlag,
        autoSuggestion: img.autoSuggestion,
        groupId: null // filled below
      });
    }
  }

  // Add groupId
  for (const group of session.groups) {
    for (const img of group.images) {
      const found = allImages.find((a) => a.path === img.path);
      if (found) found.groupId = group.groupId;
    }
  }

  const manifest = {
    version: "1.0",
    tool: "enso_photo_culling_tool",
    sessionId: session.sessionId || null,
    folderPath: session.folderPath,
    createdAt: new Date().toISOString(),
    stats: session.stats,
    decisions: allImages.map((img) => ({
      path: img.path,
      filename: img.filename,
      status: img.status,
      decidedAt: img.decidedAt,
      groupId: img.groupId,
      sharpnessScore: img.sharpnessScore,
      isSharpest: img.isSharpest,
      blurFlag: img.blurFlag,
      eyesClosedFlag: img.eyesClosedFlag
    }))
  };

  const dir = path.dirname(manifestPath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // dir exists
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  return manifestPath;
}

// ---------------------------------------------------------------------------
// Move rejected images
// ---------------------------------------------------------------------------

async function moveRejectedImages(session, dryRun) {
  let moved = 0;
  const errors = [];

  const rejectedImages = [];
  for (const group of session.groups) {
    for (const img of group.images) {
      if (img.status === "rejected") {
        rejectedImages.push(img);
      }
    }
  }

  const total = rejectedImages.length;

  for (let i = 0; i < total; i++) {
    const img = rejectedImages[i];
    const dir = path.dirname(img.path);
    const filename = path.basename(img.path);
    const rejectedDir = path.join(dir, "_rejected");

    // Don't move if already in _rejected
    if (dir.endsWith("_rejected")) continue;

    try {
      if (!dryRun) {
        await fs.mkdir(rejectedDir, { recursive: true });

        let destPath = path.join(rejectedDir, filename);

        // Handle name collision
        try {
          await fs.access(destPath);
          // File exists — add timestamp suffix
          const ext = path.extname(filename);
          const base = path.basename(filename, ext);
          destPath = path.join(rejectedDir, `${base}_${Date.now()}${ext}`);
        } catch {
          // Doesn't exist — use as-is
        }

        await fs.rename(img.path, destPath);
        img.path = destPath; // Update path in session
      }

      moved++;
    } catch (e) {
      errors.push({ path: img.path, error: e.message });
    }

    if ((i + 1) % 10 === 0 || i + 1 === total) {
      progress({
        stage: "move",
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
        message: dryRun
          ? `Dry run: would move ${i + 1}/${total} rejected images`
          : `Moving rejected... ${i + 1}/${total}`
      });
    }
  }

  return { moved, errors };
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
      usage: '{ "decisions": { "/path/to/img.jpg": "approve|reject|skip" }, "sessionPath": "..." }'
    }));
    process.exit(1);
  }

  const decisions = input.decisions || {};
  const sessionPath = (input.sessionPath || "").trim();
  const outputMode = (input.outputMode || "manifest").trim();
  const moveRejected = input.moveRejected === true || outputMode === "move" || outputMode === "both";
  const dryRun = input.dryRun === true;
  let manifestPath = (input.manifestPath || "").trim();

  // Load session (from inline or from file)
  let session = input.session || null;

  if (!session && sessionPath) {
    session = await loadSession(sessionPath);
  }

  if (!session) {
    process.stdout.write(JSON.stringify({
      error: "No session provided. Supply either 'session' object or 'sessionPath' pointing to .enso-cull-session.json"
    }));
    process.exit(1);
  }

  // Default manifest path
  if (!manifestPath && session.folderPath) {
    manifestPath = path.join(session.folderPath, "decisions.json");
  }

  // Apply decisions
  progress({
    stage: "apply",
    current: 0,
    total: Object.keys(decisions).length,
    percent: 10,
    message: `Applying ${Object.keys(decisions).length} decisions...`
  });

  const applyResult = applyDecisionsToSession(session, decisions);

  progress({
    stage: "apply",
    current: applyResult.applied,
    total: Object.keys(decisions).length,
    percent: 40,
    message: `Applied ${applyResult.applied} decisions: ${applyResult.approved} approved, ${applyResult.rejected} rejected, ${applyResult.skipped} reset`
  });

  // Save updated session back to disk
  if (sessionPath) {
    try {
      await saveSession(session, sessionPath);
      progress({
        stage: "save_session",
        current: 1,
        total: 1,
        percent: 50,
        message: "Session saved"
      });
    } catch (e) {
      progress({
        stage: "save_session",
        current: 0,
        total: 1,
        percent: 50,
        message: `Warning: Failed to save session: ${e.message}`
      });
    }
  }

  // Write manifest
  let finalManifestPath = null;
  if (outputMode === "manifest" || outputMode === "both") {
    try {
      finalManifestPath = await writeManifest(session, decisions, manifestPath);
      progress({
        stage: "manifest",
        current: 1,
        total: 1,
        percent: 70,
        message: `Manifest written to ${finalManifestPath}`
      });
    } catch (e) {
      progress({
        stage: "manifest",
        current: 0,
        total: 1,
        percent: 70,
        message: `Warning: Failed to write manifest: ${e.message}`
      });
    }
  }

  // Move rejected images
  let moveResult = { moved: 0, errors: [] };
  if (moveRejected) {
    moveResult = await moveRejectedImages(session, dryRun);

    // Save session again after moves (paths updated)
    if (sessionPath && moveResult.moved > 0 && !dryRun) {
      try {
        await saveSession(session, sessionPath);
      } catch {
        // non-fatal
      }
    }
  }

  const elapsedMs = Date.now() - startMs;

  progress({
    stage: "complete",
    current: applyResult.applied,
    total: Object.keys(decisions).length,
    percent: 100,
    message: `Complete: ${applyResult.applied} decisions applied in ${elapsedMs}ms`
  });

  const result = {
    applied: applyResult.applied,
    approved: applyResult.approved,
    rejected: applyResult.rejected,
    skipped: applyResult.skipped,
    moved: moveResult.moved,
    errors: moveResult.errors,
    stats: session.stats,
    manifestPath: finalManifestPath,
    dryRun,
    elapsedMs,
    message: dryRun
      ? `Dry run: ${applyResult.applied} decisions applied, ${moveResult.moved} would be moved`
      : `Applied ${applyResult.applied} decisions, moved ${moveResult.moved} rejected images`
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message }));
  process.exit(1);
});
