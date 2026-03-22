// export_selections.js — Export culling decisions: copy/move approved photos, write sidecars, generate manifest.

var fs = require("fs");
var path = require("path");

var exportMode = (params.exportMode || "copy").trim();
var outputPath = (params.outputPath || "").trim();
var moveRejected = params.moveRejected === true;
var starRating = typeof params.starRating === "number" ? Math.max(1, Math.min(5, Math.round(params.starRating))) : 3;
var TOOL = "enso_photo_culling_tool_export_selections";

var VALID_MODES = ["copy", "move", "list"];
if (VALID_MODES.indexOf(exportMode) === -1) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "Invalid exportMode. Valid: copy, move, list" }) }] };
}

var sessionPath = await ctx.store.get("currentSessionPath");
if (!sessionPath) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "No active session. Run scan_folder first." }) }] };
}

var session;
try { session = JSON.parse(fs.readFileSync(sessionPath, "utf-8")); } catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "Failed to load session: " + e.message }) }] };
}

// Determine output directory
var outDir = outputPath || path.join(session.folderPath, "_approved");
var rejectedDir = path.join(session.folderPath, "_rejected");

// Collect all images with their group info
var allImages = [];
var groupSummary = [];
for (var g = 0; g < session.groups.length; g++) {
  var grp = session.groups[g];
  var kept = 0, rej = 0;
  for (var i = 0; i < grp.images.length; i++) {
    var img = grp.images[i];
    allImages.push({
      path: img.path, filename: img.filename, status: img.status,
      sharpnessScore: img.sharpnessScore, sharpnessNormalized: img.sharpnessNormalized,
      isSharpest: img.isSharpest, blurFlag: img.blurFlag, eyesClosedFlag: img.eyesClosedFlag,
      faces: img.faces, autoSuggestion: img.autoSuggestion, autoReason: img.autoReason,
      exif: img.exif, groupId: grp.groupId, groupType: grp.groupType
    });
    if (img.status === "approved") kept++;
    if (img.status === "rejected") rej++;
  }
  groupSummary.push({ groupId: grp.groupId, groupType: grp.groupType, imageCount: grp.imageCount, kept: kept, rejected: rej });
}

var approvedImages = allImages.filter(function(img) { return img.status === "approved"; });
var rejectedImages = allImages.filter(function(img) { return img.status === "rejected"; });

var exported = 0, skipped = 0, moved = 0;
var errors = [];
var exportedFiles = [];

// CSV helper
function csvEsc(val) { if (val == null) return ""; var s = String(val); if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) return '"' + s.replace(/"/g, '""') + '"'; return s; }

if (exportMode === "list") {
  // Text manifest only
  var lines = ["# Photo Culling Export Manifest", "# Generated: " + new Date().toISOString(), "# Session: " + session.sessionId, ""];
  lines.push("## Approved (" + approvedImages.length + ")");
  for (var ai = 0; ai < approvedImages.length; ai++) lines.push(approvedImages[ai].path);
  lines.push(""); lines.push("## Rejected (" + rejectedImages.length + ")");
  for (var ri = 0; ri < rejectedImages.length; ri++) lines.push(rejectedImages[ri].path);

  var manifestPath = path.join(session.folderPath, ".enso-cull-manifest.txt");
  try { fs.writeFileSync(manifestPath, lines.join("\n"), "utf-8"); exported = approvedImages.length + rejectedImages.length; exportedFiles.push(manifestPath); } catch (e) { errors.push({ path: manifestPath, error: e.message }); }
} else {
  // Copy or move approved images
  if (approvedImages.length > 0) {
    try { fs.mkdirSync(outDir, { recursive: true }); } catch (e) { /* exists */ }
    for (var ei = 0; ei < approvedImages.length; ei++) {
      var eimg = approvedImages[ei];
      try {
        var destPath = path.join(outDir, eimg.filename);
        // Handle collision
        if (fs.existsSync(destPath)) {
          var ext = path.extname(eimg.filename);
          var base = path.basename(eimg.filename, ext);
          destPath = path.join(outDir, base + "_" + Date.now() + ext);
        }
        if (exportMode === "move") {
          try { fs.renameSync(eimg.path, destPath); } catch (e) { fs.copyFileSync(eimg.path, destPath); fs.unlinkSync(eimg.path); }
        } else {
          fs.copyFileSync(eimg.path, destPath);
        }
        exported++;
        exportedFiles.push(destPath);

        // Write sidecar
        var sidecar = {
          version: "1.0", tool: "enso_photo_culling_tool", sessionId: session.sessionId,
          exportedAt: new Date().toISOString(), originalFile: eimg.filename, originalPath: eimg.path,
          status: "approved", rating: starRating, label: "Green",
          sharpness: { score: eimg.sharpnessScore || 0, normalized: eimg.sharpnessNormalized || 0, isSharpest: eimg.isSharpest || false, blurFlag: eimg.blurFlag || false },
          group: { groupId: eimg.groupId, groupType: eimg.groupType },
          exif: eimg.exif || null
        };
        fs.writeFileSync(destPath + ".cull.json", JSON.stringify(sidecar, null, 2), "utf-8");
      } catch (e) { errors.push({ path: eimg.path, error: e.message }); skipped++; }
    }
  }

  // Move rejected images if requested
  if (moveRejected && rejectedImages.length > 0) {
    try { fs.mkdirSync(rejectedDir, { recursive: true }); } catch (e) { /* exists */ }
    for (var mi = 0; mi < rejectedImages.length; mi++) {
      var mimg = rejectedImages[mi];
      try {
        var mDest = path.join(rejectedDir, mimg.filename);
        if (fs.existsSync(mDest)) {
          var mExt = path.extname(mimg.filename);
          var mBase = path.basename(mimg.filename, mExt);
          mDest = path.join(rejectedDir, mBase + "_" + Date.now() + mExt);
        }
        try { fs.renameSync(mimg.path, mDest); } catch (e) { fs.copyFileSync(mimg.path, mDest); fs.unlinkSync(mimg.path); }
        moved++;
      } catch (e) { errors.push({ path: mimg.path, error: e.message }); }
    }
  }
}

// Write CSV manifest
var csvPath = path.join(session.folderPath, ".enso-cull-manifest.csv");
try {
  var csvHeaders = ["Filename","Status","GroupId","GroupType","SharpnessScore","IsSharpest","BlurFlag","EyesClosedFlag","AutoSuggestion","Camera","DateTaken"];
  var csvRows = [csvHeaders.join(",")];
  for (var ci = 0; ci < allImages.length; ci++) {
    var cimg = allImages[ci];
    csvRows.push([csvEsc(cimg.filename), csvEsc(cimg.status), csvEsc(cimg.groupId), csvEsc(cimg.groupType), csvEsc(cimg.sharpnessScore), csvEsc(cimg.isSharpest), csvEsc(cimg.blurFlag), csvEsc(cimg.eyesClosedFlag), csvEsc(cimg.autoSuggestion), csvEsc(cimg.exif ? cimg.exif.cameraModel : ""), csvEsc(cimg.exif ? cimg.exif.dateTaken : "")].join(","));
  }
  fs.writeFileSync(csvPath, csvRows.join("\n") + "\n", "utf-8");
} catch (e) { csvPath = null; }

// Write export summary
var summaryPath = path.join(session.folderPath, ".enso-cull-export-summary.json");
try {
  fs.writeFileSync(summaryPath, JSON.stringify({
    version: "1.0", tool: "enso_photo_culling_tool", sessionId: session.sessionId,
    exportedAt: new Date().toISOString(), exportMode: exportMode, outputPath: outDir,
    stats: { total: allImages.length, exported: exported, moved: moved, skipped: skipped, errors: errors.length }
  }, null, 2), "utf-8");
} catch (e) { /* non-fatal */ }

// Compute stats for display
var statApproved = 0, statRejected = 0, statPending = 0;
for (var tg = 0; tg < session.groups.length; tg++) {
  for (var ti = 0; ti < session.groups[tg].images.length; ti++) {
    var ts = session.groups[tg].images[ti].status;
    if (ts === "approved") statApproved++; else if (ts === "rejected") statRejected++; else statPending++;
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: TOOL, exported: exported, skipped: skipped, moved: moved, errors: errors,
      exportMode: exportMode, outputPath: outDir,
      stats: { approved: statApproved, rejected: statRejected, pending: statPending },
      groupSummary: groupSummary, summaryPath: summaryPath, csvPath: csvPath,
      message: exportMode === "list"
        ? "Generated manifest with " + exported + " entries"
        : "Exported " + exported + " approved photos" + (moved > 0 ? ", moved " + moved + " rejected" : "")
    })
  }]
};
