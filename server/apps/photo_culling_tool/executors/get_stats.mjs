#!/usr/bin/env node
/**
 * get_stats.mjs — Returns counts of approved/rejected/flagged/pending per group.
 *
 * Reads the CullSession and computes aggregate and per-group statistics
 * without modifying any state.
 *
 * stdin JSON:
 *   {
 *     "sessionPath": "/path/to/shoot/.enso-cull-session.json",
 *     "includeImageDetails": false
 *   }
 *
 * stdout JSON:
 *   {
 *     "sessionId": "...",
 *     "folderPath": "...",
 *     "settings": { ... },
 *     "totals": {
 *       "images": N,
 *       "groups": N,
 *       "approved": N,
 *       "rejected": N,
 *       "flagged": N,
 *       "pending": N,
 *       "blurFlagged": N,
 *       "eyesClosedFlagged": N,
 *       "completionPercent": N
 *     },
 *     "groups": [
 *       {
 *         "groupId": "G001",
 *         "groupType": "burst|single|similar",
 *         "imageCount": N,
 *         "captureTime": "...",
 *         "approved": N,
 *         "rejected": N,
 *         "flagged": N,
 *         "pending": N,
 *         "completion": "done|partial|pending",
 *         "sharpestFile": "DSC_0001.jpg",
 *         "blurCount": N,
 *         "eyesClosedCount": N
 *       }
 *     ],
 *     "message": "..."
 *   }
 */

import fs from "fs/promises";

async function main() {
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
      usage: '{ "sessionPath": "/path/to/.enso-cull-session.json" }'
    }));
    process.exit(1);
  }

  const sessionPath = (input.sessionPath || "").trim();
  const includeImageDetails = input.includeImageDetails === true;

  if (!sessionPath) {
    process.stdout.write(JSON.stringify({ error: "sessionPath is required" }));
    process.exit(1);
  }

  // Load session
  let session;
  try {
    const data = await fs.readFile(sessionPath, "utf-8");
    session = JSON.parse(data);
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: `Failed to load session: ${e.message}` }));
    process.exit(1);
  }

  // Compute totals
  let totalApproved = 0;
  let totalRejected = 0;
  let totalFlagged = 0;
  let totalPending = 0;
  let totalBlurFlagged = 0;
  let totalEyesClosed = 0;
  let totalImages = 0;

  const groupStats = [];

  for (const group of session.groups) {
    let gApproved = 0;
    let gRejected = 0;
    let gFlagged = 0;
    let gPending = 0;
    let gBlurCount = 0;
    let gEyesClosedCount = 0;
    let sharpestFile = null;
    const imageDetails = [];

    for (const img of group.images) {
      totalImages++;

      if (img.status === "approved") { gApproved++; totalApproved++; }
      else if (img.status === "rejected") { gRejected++; totalRejected++; }
      else if (img.status === "flagged") { gFlagged++; totalFlagged++; }
      else { gPending++; totalPending++; }

      if (img.blurFlag) { gBlurCount++; totalBlurFlagged++; }
      if (img.eyesClosedFlag) { gEyesClosedCount++; totalEyesClosed++; }

      if (img.isSharpest) {
        sharpestFile = img.filename;
      }

      if (includeImageDetails) {
        imageDetails.push({
          filename: img.filename,
          status: img.status,
          sharpnessScore: img.sharpnessScore || 0,
          sharpnessNormalized: img.sharpnessNormalized || 0,
          isSharpest: img.isSharpest || false,
          blurFlag: img.blurFlag || false,
          eyesClosedFlag: img.eyesClosedFlag || false,
          autoSuggestion: img.autoSuggestion || null,
          decidedAt: img.decidedAt || null
        });
      }
    }

    const decided = gApproved + gRejected + gFlagged;
    const completion = gPending === 0
      ? "done"
      : (decided > 0 ? "partial" : "pending");

    const groupEntry = {
      groupId: group.groupId,
      groupType: group.groupType,
      imageCount: group.imageCount,
      captureTime: group.captureTime,
      approved: gApproved,
      rejected: gRejected,
      flagged: gFlagged,
      pending: gPending,
      completion,
      sharpestFile,
      blurCount: gBlurCount,
      eyesClosedCount: gEyesClosedCount
    };

    if (includeImageDetails) {
      groupEntry.images = imageDetails;
    }

    groupStats.push(groupEntry);
  }

  const totalDecided = totalApproved + totalRejected + totalFlagged;
  const completionPercent = totalImages > 0
    ? Math.round((totalDecided / totalImages) * 100) : 0;

  // Summary counts for quick display
  const completedGroups = groupStats.filter((g) => g.completion === "done").length;
  const partialGroups = groupStats.filter((g) => g.completion === "partial").length;
  const pendingGroups = groupStats.filter((g) => g.completion === "pending").length;

  let message;
  if (completionPercent === 100) {
    message = `All ${totalImages} images decided. Ready to export!`;
  } else if (completionPercent === 0) {
    message = `${totalImages} images in ${session.totalGroups} groups — no decisions yet`;
  } else {
    message = `${completionPercent}% complete — ${totalPending} images pending review`;
  }

  process.stdout.write(JSON.stringify({
    sessionId: session.sessionId,
    folderPath: session.folderPath,
    createdAt: session.createdAt,
    settings: session.settings,
    totals: {
      images: totalImages,
      groups: session.groups.length,
      approved: totalApproved,
      rejected: totalRejected,
      flagged: totalFlagged,
      pending: totalPending,
      blurFlagged: totalBlurFlagged,
      eyesClosedFlagged: totalEyesClosed,
      completionPercent,
      completedGroups,
      partialGroups,
      pendingGroups
    },
    groups: groupStats,
    message
  }));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message }));
  process.exit(1);
});
