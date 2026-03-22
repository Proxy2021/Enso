// export.js — Export culling decisions as JSON sidecar files and optional CSV manifest.
// Optionally moves rejected images to a _rejected subfolder.

var fs = require("fs");
var path = require("path");

var exportMode = (params.exportMode || "all_decided").trim();
var starRating = typeof params.starRating === "number" ? Math.max(1, Math.min(5, params.starRating)) : 1;
var moveRejected = params.moveRejected === true;
var writeCsv = params.writeCsv !== false; // Default to true

// CSV escape helper (RFC 4180)
function csvEsc(val) {
  if (val == null) return "";
  var s = String(val);
  if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

var VALID_MODES = ["approved_only", "all_decided", "all"];
if (VALID_MODES.indexOf(exportMode) === -1) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_export",
        error: "Invalid exportMode. Valid: " + VALID_MODES.join(", ")
      })
    }]
  };
}

// Load session
var sessionPath = await ctx.store.get("currentSessionPath");
if (!sessionPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_export",
        error: "No active session. Run scan first."
      })
    }]
  };
}

var session;
try {
  session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_export",
        error: "Failed to load session: " + e.message
      })
    }]
  };
}

// Collect images to export
var allImages = [];
for (var g = 0; g < session.groups.length; g++) {
  for (var i = 0; i < session.groups[g].images.length; i++) {
    var img = session.groups[g].images[i];
    allImages.push({
      path: img.path,
      filename: img.filename,
      status: img.status,
      sharpnessScore: img.sharpnessScore,
      sharpnessNormalized: img.sharpnessNormalized,
      isSharpest: img.isSharpest,
      blurFlag: img.blurFlag,
      eyesClosedFlag: img.eyesClosedFlag,
      faces: img.faces,
      autoSuggestion: img.autoSuggestion,
      autoReason: img.autoReason,
      exif: img.exif,
      groupId: session.groups[g].groupId,
      groupType: session.groups[g].groupType
    });
  }
}

var toExport = allImages.filter(function(img) {
  if (exportMode === "approved_only") return img.status === "approved";
  if (exportMode === "all_decided") return img.status === "approved" || img.status === "rejected";
  return true;
});

var exported = 0;
var skipped = 0;
var moved = 0;
var errors = [];
var exportedFiles = [];

for (var ei = 0; ei < toExport.length; ei++) {
  var eimg = toExport[ei];
  try {
    // Write JSON sidecar
    var sidecarDir = path.dirname(eimg.path);
    var sidecarName = path.basename(eimg.path) + ".cull.json";
    var sidecarPath = path.join(sidecarDir, sidecarName);

    var sidecar = {
      version: "1.0",
      tool: "enso_photo_culling_tool",
      sessionId: session.sessionId,
      exportedAt: new Date().toISOString(),
      originalFile: eimg.filename,
      originalPath: eimg.path,
      status: eimg.status,
      rating: eimg.status === "approved" ? starRating : (eimg.status === "rejected" ? -1 : 0),
      label: eimg.status === "approved" ? "Green" : (eimg.status === "rejected" ? "Red" : ""),
      sharpness: {
        score: eimg.sharpnessScore || 0,
        normalized: eimg.sharpnessNormalized || 0,
        isSharpest: eimg.isSharpest || false,
        blurFlag: eimg.blurFlag || false
      },
      faces: (eimg.faces || []).map(function(f) {
        return { box: f.box, confidence: f.confidence, avgEAR: f.avgEAR, eyesClosed: f.eyesClosed };
      }),
      eyesClosedFlag: eimg.eyesClosedFlag || false,
      autoSuggestion: eimg.autoSuggestion,
      autoReason: eimg.autoReason,
      group: { groupId: eimg.groupId, groupType: eimg.groupType },
      exif: eimg.exif ? {
        cameraMake: eimg.exif.cameraMake,
        cameraModel: eimg.exif.cameraModel,
        dateTaken: eimg.exif.dateTaken,
        iso: eimg.exif.iso,
        shutterSpeed: eimg.exif.shutterSpeed,
        aperture: eimg.exif.aperture,
        focalLength: eimg.exif.focalLength
      } : null
    };

    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), "utf-8");
    exportedFiles.push(sidecarPath);

    // Move rejected images if requested
    if (moveRejected && eimg.status === "rejected") {
      var rejectedDir = path.join(path.dirname(eimg.path), "_rejected");
      try { fs.mkdirSync(rejectedDir, { recursive: true }); } catch(e) { /* exists */ }
      var destPath = path.join(rejectedDir, eimg.filename);
      // Handle name collision
      if (fs.existsSync(destPath)) {
        var ext = path.extname(eimg.filename);
        var base = path.basename(eimg.filename, ext);
        destPath = path.join(rejectedDir, base + "_" + Date.now() + ext);
      }
      try { fs.renameSync(eimg.path, destPath); } catch (e) { fs.copyFileSync(eimg.path, destPath); fs.unlinkSync(eimg.path); }
      moved++;
    }

    exported++;
  } catch (e) {
    errors.push({ path: eimg.path, error: e.message });
    skipped++;
  }
}

// Write CSV manifest if requested
var csvPath = null;
if (writeCsv) {
  var csvHeaders = ["Filename","Path","Status","GroupId","GroupType","SharpnessScore","SharpnessNormalized","IsSharpest","BlurFlag","EyesClosedFlag","FaceCount","AutoSuggestion","AutoReason","CameraMake","CameraModel","DateTaken","ISO","ShutterSpeed","Aperture","FocalLength","SizeBytes"];
  var csvRows = [csvHeaders.join(",")];
  for (var ci = 0; ci < toExport.length; ci++) {
    var cimg = toExport[ci];
    csvRows.push([
      csvEsc(cimg.filename), csvEsc(cimg.path), csvEsc(cimg.status),
      csvEsc(cimg.groupId), csvEsc(cimg.groupType),
      csvEsc(cimg.sharpnessScore), csvEsc(cimg.sharpnessNormalized),
      csvEsc(cimg.isSharpest), csvEsc(cimg.blurFlag), csvEsc(cimg.eyesClosedFlag),
      csvEsc(cimg.faces ? cimg.faces.length : 0),
      csvEsc(cimg.autoSuggestion), csvEsc(cimg.autoReason),
      csvEsc(cimg.exif ? cimg.exif.cameraMake : ""), csvEsc(cimg.exif ? cimg.exif.cameraModel : ""),
      csvEsc(cimg.exif ? cimg.exif.dateTaken : ""), csvEsc(cimg.exif ? cimg.exif.iso : ""),
      csvEsc(cimg.exif ? cimg.exif.shutterSpeed : ""), csvEsc(cimg.exif ? cimg.exif.aperture : ""),
      csvEsc(cimg.exif ? cimg.exif.focalLength : ""), csvEsc(cimg.sizeBytes || "")
    ].join(","));
  }
  csvPath = path.join(session.folderPath, ".enso-cull-manifest.csv");
  try {
    fs.writeFileSync(csvPath, csvRows.join("\n") + "\n", "utf-8");
  } catch (e) {
    errors.push({ path: csvPath, error: "CSV write failed: " + e.message });
    csvPath = null;
  }
}

// Write export summary
var summaryData = {
  version: "1.0",
  tool: "enso_photo_culling_tool",
  sessionId: session.sessionId,
  exportedAt: new Date().toISOString(),
  folderPath: session.folderPath,
  exportMode: exportMode,
  starRating: starRating,
  stats: {
    totalImages: allImages.length,
    exported: exported,
    skipped: allImages.length - toExport.length + skipped,
    moved: moved,
    errors: errors.length
  }
};

var summaryPath = path.join(session.folderPath, ".enso-cull-export-summary.json");
try {
  fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2), "utf-8");
} catch (e) { /* non-fatal */ }

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_culling_tool_export",
      exported: exported,
      skipped: allImages.length - toExport.length + skipped,
      moved: moved,
      errors: errors,
      exportMode: exportMode,
      starRating: starRating,
      files: exportedFiles,
      summaryPath: summaryPath,
      csvPath: csvPath,
      message: "Exported " + exported + " sidecar files" + (moved > 0 ? ", moved " + moved + " rejected images" : "") + (csvPath ? ", CSV manifest written" : "")
    })
  }]
};
