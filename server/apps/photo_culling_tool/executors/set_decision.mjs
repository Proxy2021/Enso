#!/usr/bin/env node
/**
 * set_decision.mjs — Persists approve/reject/flag/none decisions for photos.
 *
 * Accepts a photoId (file path or filename within the session) and a decision,
 * then updates the CullSession on disk and writes a JSON sidecar alongside
 * the original image file.
 *
 * stdin JSON:
 *   {
 *     "sessionPath": "/path/to/shoot/.enso-cull-session.json",
 *     "photoId": "/path/to/image.jpg" | "DSC_0001.jpg",
 *     "decision": "approve" | "reject" | "flag" | "none",
 *     "batchDecisions": [
 *       { "photoId": "...", "decision": "approve" },
 *       { "photoId": "...", "decision": "reject" }
 *     ]
 *   }
 *
 * stdout JSON:
 *   {
 *     "updated": N,
 *     "decisions": [ { "photoId": "...", "decision": "...", "previousStatus": "..." } ],
 *     "stats": { "approved": N, "rejected": N, "flagged": N, "pending": N },
 *     "sidecarPaths": [ "..." ],
 *     "message": "..."
 *   }
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

const VALID_DECISIONS = ["approve", "reject", "flag", "none"];

// Map decision → internal status
function decisionToStatus(decision) {
  if (decision === "approve") return "approved";
  if (decision === "reject") return "rejected";
  if (decision === "flag") return "flagged";
  return "pending"; // "none" resets to pending
}

async function main() {
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
      usage: '{ "sessionPath": "...", "photoId": "...", "decision": "approve|reject|flag|none" }'
    }));
    process.exit(1);
  }

  const sessionPath = (input.sessionPath || "").trim();

  if (!sessionPath) {
    process.stdout.write(JSON.stringify({ error: "sessionPath is required" }));
    process.exit(1);
  }

  // Build list of decisions to apply
  let decisions = [];

  if (input.batchDecisions && Array.isArray(input.batchDecisions)) {
    // Batch mode — multiple decisions at once
    for (const d of input.batchDecisions) {
      const pid = (d.photoId || "").trim();
      const dec = (d.decision || "").trim().toLowerCase();
      if (!pid || !VALID_DECISIONS.includes(dec)) {
        process.stdout.write(JSON.stringify({
          error: `Invalid batch entry: photoId="${pid}", decision="${dec}". Valid decisions: ${VALID_DECISIONS.join(", ")}`
        }));
        process.exit(1);
      }
      decisions.push({ photoId: pid, decision: dec });
    }
  } else {
    // Single decision mode
    const photoId = (input.photoId || "").trim();
    const decision = (input.decision || "").trim().toLowerCase();

    if (!photoId) {
      process.stdout.write(JSON.stringify({ error: "photoId is required" }));
      process.exit(1);
    }
    if (!VALID_DECISIONS.includes(decision)) {
      process.stdout.write(JSON.stringify({
        error: `Invalid decision "${decision}". Valid: ${VALID_DECISIONS.join(", ")}`
      }));
      process.exit(1);
    }
    decisions.push({ photoId, decision });
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

  // Apply decisions
  const results = [];
  const sidecarPaths = [];
  const now = Date.now();

  for (const { photoId, decision } of decisions) {
    let found = false;

    for (const group of session.groups) {
      for (const img of group.images) {
        // Match by full path or filename
        if (img.path === photoId || img.filename === photoId) {
          const previousStatus = img.status;
          const newStatus = decisionToStatus(decision);

          img.status = newStatus;
          img.decidedAt = now;

          results.push({
            photoId: img.path,
            filename: img.filename,
            decision,
            previousStatus,
            newStatus,
            groupId: group.groupId
          });

          // Write JSON sidecar file alongside the image
          try {
            const sidecar = {
              version: "1.0",
              tool: "enso_photo_culling_tool",
              sessionId: session.sessionId,
              decidedAt: new Date(now).toISOString(),
              originalFile: img.filename,
              originalPath: img.path,
              decision,
              status: newStatus,
              sharpness: {
                score: img.sharpnessScore || 0,
                normalized: img.sharpnessNormalized || 0,
                isSharpest: img.isSharpest || false,
                blurFlag: img.blurFlag || false
              },
              autoSuggestion: img.autoSuggestion || null,
              autoReason: img.autoReason || null,
              groupId: group.groupId,
              groupType: group.groupType
            };

            const sidecarPath = img.path + ".cull.json";
            await fs.writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), "utf-8");
            sidecarPaths.push(sidecarPath);
          } catch { /* sidecar write is non-fatal */ }

          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      results.push({
        photoId,
        decision,
        error: "Photo not found in session"
      });
    }
  }

  // Recompute stats
  let approved = 0, rejected = 0, flagged = 0, pending = 0;
  for (const group of session.groups) {
    for (const img of group.images) {
      if (img.status === "approved") approved++;
      else if (img.status === "rejected") rejected++;
      else if (img.status === "flagged") flagged++;
      else pending++;
    }
  }

  session.stats = { approved, rejected, flagged, pending };

  // Save session atomically
  try {
    const tempPath = sessionPath + ".tmp";
    await fs.writeFile(tempPath, JSON.stringify(session, null, 2), "utf-8");
    await fs.rename(tempPath, sessionPath);
  } catch (e) {
    process.stdout.write(JSON.stringify({
      error: `Failed to save session: ${e.message}`,
      updated: results.length
    }));
    process.exit(1);
  }

  const successCount = results.filter((r) => !r.error).length;

  process.stdout.write(JSON.stringify({
    updated: successCount,
    decisions: results,
    stats: { approved, rejected, flagged, pending },
    sidecarPaths,
    totalImages: session.totalImages,
    completionPercent: session.totalImages > 0
      ? Math.round(((approved + rejected + flagged) / session.totalImages) * 100) : 0,
    message: `Updated ${successCount} decision(s): ${approved} approved, ${rejected} rejected, ${flagged} flagged, ${pending} pending`
  }));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message }));
  process.exit(1);
});
