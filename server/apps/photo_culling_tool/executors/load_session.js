// load_session.js — Resume a previously saved culling session from disk.

var fs = require("fs");
var path = require("path");

var folderPath = (params.folderPath || params.path || "").trim();
var TOOL = "enso_photo_culling_tool_scan_folder"; // Return as scan_folder tool for unified scan/load view

if (!folderPath) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "folderPath is required. Provide the path to a folder with a saved culling session." }) }] };
}

if (folderPath.startsWith("~")) {
  folderPath = path.join(require("os").homedir(), folderPath.slice(1));
}

// Try loading session files
var candidates = [
  path.join(folderPath, ".enso-cull-session.json"),
  path.join(folderPath, "_culling-results.json")
];

var loaded = null;
var loadedFrom = null;
for (var ci = 0; ci < candidates.length; ci++) {
  try { loaded = JSON.parse(fs.readFileSync(candidates[ci], "utf-8")); loadedFrom = candidates[ci]; break; } catch (e) { /* try next */ }
}

if (!loaded) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "No culling session found in " + folderPath + ". Run scan_folder first.", folderPath: folderPath }) }] };
}

// Normalize session data
if (!loaded.undoStack) loaded.undoStack = [];
if (loaded.currentGroupIndex == null) loaded.currentGroupIndex = 0;
if (loaded.currentImageIndex == null) loaded.currentImageIndex = 0;

// Ensure mediaUrl and normalize field names
if (loaded.groups) {
  for (var g = 0; g < loaded.groups.length; g++) {
    var grp = loaded.groups[g];
    if (grp.images) {
      for (var i = 0; i < grp.images.length; i++) {
        var img = grp.images[i];
        if (!img.mediaUrl && img.path) img.mediaUrl = "/media/" + Buffer.from(img.path).toString("base64url");
        if (img.isBlurry != null && img.blurFlag == null) img.blurFlag = img.isBlurry;
        if (img.eyesClosed != null && img.eyesClosedFlag == null) img.eyesClosedFlag = img.eyesClosed;
        if (img.isBest != null && img.isSharpest == null) img.isSharpest = img.isBest;
        if (img.decision != null && img.status == null) img.status = img.decision === "undecided" ? "pending" : img.decision;
        if (img.status == null) img.status = "pending";
      }
    }
  }
}

// Recompute stats
var approved = 0, rejected = 0, pending = 0, blurFlagged = 0, eyesClosedFlagged = 0;
if (loaded.groups) {
  for (var sg = 0; sg < loaded.groups.length; sg++) {
    if (loaded.groups[sg].images) {
      for (var si = 0; si < loaded.groups[sg].images.length; si++) {
        var simg = loaded.groups[sg].images[si];
        if (simg.status === "approved") approved++;
        else if (simg.status === "rejected") rejected++;
        else pending++;
        if (simg.blurFlag) blurFlagged++;
        if (simg.eyesClosedFlag) eyesClosedFlagged++;
      }
    }
  }
}

loaded.stats = { approved: approved, rejected: rejected, pending: pending, blurFlagged: blurFlagged, eyesClosedFlagged: eyesClosedFlagged };

// Persist as session
var sessionPath = path.join(folderPath, ".enso-cull-session.json");
try { var tempPath = sessionPath + ".tmp"; fs.writeFileSync(tempPath, JSON.stringify(loaded, null, 2), "utf-8"); fs.renameSync(tempPath, sessionPath); } catch (e) { /* non-fatal */ }

await ctx.store.set("currentSessionPath", sessionPath);
await ctx.store.set("currentSessionId", loaded.sessionId || "loaded-" + Date.now());

loaded.tool = TOOL;
loaded.folderPath = folderPath;
loaded.resumed = true;
loaded.loadedFrom = path.basename(loadedFrom);
loaded.message = "Resumed session from " + path.basename(loadedFrom) + ": " + (loaded.totalImages || 0) + " images in " + (loaded.totalGroups || 0) + " groups (" + approved + " approved, " + rejected + " rejected, " + pending + " pending)";

return { content: [{ type: "text", text: JSON.stringify(loaded) }] };
