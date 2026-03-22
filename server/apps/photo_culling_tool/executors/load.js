// load.js — Load existing _culling-results.json from a folder for review.
// This allows resuming a culling session from a previously analyzed folder
// without re-running the full analysis pipeline.

var fs = require("fs");
var path = require("path");

var folderPath = (params.folderPath || params.path || "").trim();

if (!folderPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_load",
        error: "folderPath is required. Provide the path to a folder with existing analysis results."
      })
    }]
  };
}

// Resolve home directory
if (folderPath.startsWith("~")) {
  folderPath = path.join(require("os").homedir(), folderPath.slice(1));
}

// Try loading _culling-results.json first (from analyze.js script), then .enso-cull-session.json
var candidates = [
  path.join(folderPath, "_culling-results.json"),
  path.join(folderPath, ".enso-cull-session.json")
];

var loaded = null;
var loadedFrom = null;

for (var ci = 0; ci < candidates.length; ci++) {
  try {
    var raw = fs.readFileSync(candidates[ci], "utf-8");
    loaded = JSON.parse(raw);
    loadedFrom = candidates[ci];
    break;
  } catch (e) {
    // Try next candidate
  }
}

if (!loaded) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_load",
        error: "No culling results found in " + folderPath + ". Looked for _culling-results.json and .enso-cull-session.json. Run 'Analyze Folder' first.",
        folderPath: folderPath
      })
    }]
  };
}

// Normalize the loaded data into session format if needed
// The analyze.js script produces a compatible format but may lack some session fields
if (!loaded.undoStack) loaded.undoStack = [];
if (loaded.currentGroupIndex == null) loaded.currentGroupIndex = 0;
if (loaded.currentImageIndex == null) loaded.currentImageIndex = 0;

// Ensure all images have mediaUrl for the template
if (loaded.groups) {
  for (var g = 0; g < loaded.groups.length; g++) {
    var grp = loaded.groups[g];
    if (grp.images) {
      for (var i = 0; i < grp.images.length; i++) {
        var img = grp.images[i];
        if (!img.mediaUrl && img.path) {
          img.mediaUrl = "/media/" + Buffer.from(img.path).toString("base64url");
        }
        // Normalize field names from analyze.js format
        if (img.isBlurry != null && img.blurFlag == null) img.blurFlag = img.isBlurry;
        if (img.eyesClosed != null && img.eyesClosedFlag == null) img.eyesClosedFlag = img.eyesClosed;
        if (img.isBest != null && img.isSharpest == null) img.isSharpest = img.isBest;
        if (img.decision != null && img.status == null) {
          img.status = img.decision === "undecided" ? "pending" : img.decision;
        }
        if (img.status == null) img.status = "pending";
      }
    }
  }
}

// Recompute stats from image statuses
var approved = 0, rejected = 0, pending = 0, blurFlagged = 0, eyesClosedFlagged = 0;
if (loaded.groups) {
  for (var sg = 0; sg < loaded.groups.length; sg++) {
    var sgrp = loaded.groups[sg];
    if (sgrp.images) {
      for (var si = 0; si < sgrp.images.length; si++) {
        var simg = sgrp.images[si];
        if (simg.status === "approved") approved++;
        else if (simg.status === "rejected") rejected++;
        else pending++;
        if (simg.blurFlag) blurFlagged++;
        if (simg.eyesClosedFlag) eyesClosedFlagged++;
      }
    }
  }
}

loaded.stats = {
  approved: approved,
  rejected: rejected,
  pending: pending,
  blurFlagged: blurFlagged,
  eyesClosedFlagged: eyesClosedFlagged
};

// Persist as session file for other executors to use
var sessionPath = path.join(folderPath, ".enso-cull-session.json");
try {
  var tempPath = sessionPath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(loaded, null, 2), "utf-8");
  fs.renameSync(tempPath, sessionPath);
} catch (e) {
  // Non-fatal
}

// Store session path for other executors
await ctx.store.set("currentSessionPath", sessionPath);
await ctx.store.set("currentSessionId", loaded.sessionId || "loaded-" + Date.now());

loaded.tool = "enso_photo_culling_tool_scan"; // Reuse scan view for display
loaded.folderPath = folderPath;
loaded.resumed = true;
loaded.loadedFrom = path.basename(loadedFrom);
loaded.message = "Loaded results from " + path.basename(loadedFrom) + ": " + (loaded.totalImages || 0) + " images in " + (loaded.totalGroups || 0) + " groups";

return {
  content: [{
    type: "text",
    text: JSON.stringify(loaded)
  }]
};
