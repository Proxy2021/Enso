// update_status.js — Update culling status for a single photo.
// Writes a sidecar .cull.json file next to the photo with status + metadata.
// Also updates the in-memory session if one is loaded.
//
// Parameters:
//   photoPath  (string, required) — Absolute path to the photo file
//   status     (string, required) — One of: pick, reject, flag, pending
//
// Returns: { success, photoPath, status, sidecarPath }

var fs = require("fs");
var path = require("path");

var TOOL = "enso_photo_culling_tool_update_status";
var VALID_STATUSES = ["pick", "reject", "flag", "pending"];

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------
var photoPath = (params.photoPath || "").trim();
var newStatus = (params.status || "").trim().toLowerCase();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
if (!photoPath) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: TOOL, success: false, error: "photoPath is required."
  }) }] };
}

if (!newStatus || VALID_STATUSES.indexOf(newStatus) === -1) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: TOOL, success: false,
    error: "status must be one of: " + VALID_STATUSES.join(", ") + ". Got: " + (newStatus || "(empty)")
  }) }] };
}

// Expand ~ to home directory
if (photoPath.startsWith("~")) {
  photoPath = path.join(require("os").homedir(), photoPath.slice(1));
}
photoPath = path.resolve(photoPath);

// Verify photo file exists
try {
  var photoStat = fs.statSync(photoPath);
  if (!photoStat.isFile()) {
    return { content: [{ type: "text", text: JSON.stringify({
      tool: TOOL, success: false, error: "Not a file: " + photoPath
    }) }] };
  }
} catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: TOOL, success: false, error: "Photo file not found: " + photoPath
  }) }] };
}

// ---------------------------------------------------------------------------
// Build sidecar data
// ---------------------------------------------------------------------------
var sidecarPath = photoPath + ".cull.json";
var now = Date.now();

// Load existing sidecar if present (preserve history)
var sidecarData = null;
try {
  sidecarData = JSON.parse(fs.readFileSync(sidecarPath, "utf-8"));
} catch (e) {
  sidecarData = null;
}

if (!sidecarData) {
  sidecarData = {
    photoPath: photoPath,
    filename: path.basename(photoPath),
    status: newStatus,
    createdAt: now,
    updatedAt: now,
    history: []
  };
} else {
  // Record previous status in history
  if (sidecarData.status && sidecarData.status !== newStatus) {
    if (!Array.isArray(sidecarData.history)) sidecarData.history = [];
    sidecarData.history.push({
      status: sidecarData.status,
      changedAt: sidecarData.updatedAt || now
    });
    // Cap history at 50 entries
    if (sidecarData.history.length > 50) {
      sidecarData.history = sidecarData.history.slice(-50);
    }
  }
  sidecarData.status = newStatus;
  sidecarData.updatedAt = now;
}

// ---------------------------------------------------------------------------
// Write sidecar file (atomic: temp + rename)
// ---------------------------------------------------------------------------
try {
  var tempPath = sidecarPath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(sidecarData, null, 2), "utf-8");
  fs.renameSync(tempPath, sidecarPath);
} catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: TOOL, success: false, photoPath: photoPath, status: newStatus,
    error: "Failed to write sidecar file: " + e.message
  }) }] };
}

// ---------------------------------------------------------------------------
// Update in-memory session if available
// ---------------------------------------------------------------------------
var sessionUpdated = false;
try {
  var sessionPath = await ctx.store.get("currentSessionPath");
  if (sessionPath) {
    var session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));

    // Map statuses: pick→approved, reject→rejected, flag→pending, pending→pending
    var sessionStatus = newStatus === "pick" ? "approved" : newStatus === "reject" ? "rejected" : "pending";

    // Search for this photo in session groups
    var found = false;
    var allGroups = session.groups || [];
    // Also check bursts/unclustered format
    if (!allGroups.length && session.bursts) {
      allGroups = session.bursts.map(function(b) {
        return { images: b.photos || [] };
      });
      if (session.unclustered) {
        allGroups.push({ images: session.unclustered });
      }
    }

    for (var g = 0; g < allGroups.length && !found; g++) {
      var images = allGroups[g].images || allGroups[g].photos || [];
      for (var i = 0; i < images.length; i++) {
        if (images[i].path === photoPath) {
          var oldStatus = images[i].status;
          images[i].status = sessionStatus;
          images[i].decidedAt = now;

          // Update session stats
          if (session.stats && oldStatus !== sessionStatus) {
            if (oldStatus === "approved") session.stats.approved = Math.max(0, (session.stats.approved || 0) - 1);
            else if (oldStatus === "rejected") session.stats.rejected = Math.max(0, (session.stats.rejected || 0) - 1);
            else session.stats.pending = Math.max(0, (session.stats.pending || 0) - 1);

            if (sessionStatus === "approved") session.stats.approved = (session.stats.approved || 0) + 1;
            else if (sessionStatus === "rejected") session.stats.rejected = (session.stats.rejected || 0) + 1;
            else session.stats.pending = (session.stats.pending || 0) + 1;
          }

          found = true;
          break;
        }
      }
    }

    if (found) {
      // Save updated session (atomic write)
      var tmpSession = sessionPath + ".tmp";
      fs.writeFileSync(tmpSession, JSON.stringify(session, null, 2), "utf-8");
      fs.renameSync(tmpSession, sessionPath);
      sessionUpdated = true;
    }
  }
} catch (e) {
  // Session update is non-fatal — sidecar is the authoritative source
}

// ---------------------------------------------------------------------------
// Return result
// ---------------------------------------------------------------------------
return { content: [{ type: "text", text: JSON.stringify({
  tool: TOOL,
  success: true,
  photoPath: photoPath,
  filename: path.basename(photoPath),
  status: newStatus,
  sidecarPath: sidecarPath,
  sessionUpdated: sessionUpdated,
  message: path.basename(photoPath) + " → " + newStatus
}) }] };
