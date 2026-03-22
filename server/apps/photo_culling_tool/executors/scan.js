// scan.js — Primary executor: Scans a folder, analyzes images, groups bursts, creates a CullSession.
// Orchestrates the full pipeline: discover → EXIF → sharpness → group → face detect → rank.

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var folderPath = (params.folderPath || params.path || "").trim();
var skipFaces = params.skipFaces === true;
var burstThresholdMs = typeof params.burstThresholdMs === "number" ? params.burstThresholdMs : 3000;
var blurThreshold = typeof params.blurThreshold === "number" ? params.blurThreshold : 50;
var earThreshold = typeof params.earThreshold === "number" ? params.earThreshold : 0.2;

if (!folderPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_scan",
        error: "folderPath is required. Provide the path to a folder of photos to scan."
      })
    }]
  };
}

// Resolve home directory
if (folderPath.startsWith("~")) {
  folderPath = path.join(require("os").homedir(), folderPath.slice(1));
}

// Verify folder exists
try {
  var stat = fs.statSync(folderPath);
  if (!stat.isDirectory()) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_photo_culling_tool_scan",
          error: "Not a directory: " + folderPath
        })
      }]
    };
  }
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_scan",
        error: "Folder not found: " + folderPath
      })
    }]
  };
}

// Check for existing session to resume
var sessionPath = path.join(folderPath, ".enso-cull-session.json");
var existingSession = null;
try {
  var sessionData = fs.readFileSync(sessionPath, "utf-8");
  existingSession = JSON.parse(sessionData);
} catch (e) {
  // No existing session — will create new
}

if (existingSession && !params.rescan) {
  // Resume existing session
  existingSession.tool = "enso_photo_culling_tool_scan";
  existingSession.resumed = true;
  existingSession.message = "Resumed existing session with " + existingSession.totalImages + " images in " + existingSession.totalGroups + " groups";
  return {
    content: [{
      type: "text",
      text: JSON.stringify(existingSession)
    }]
  };
}

// --- Stage 1: Discover image files ---
var IMAGE_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".heic", ".heif",
  ".tiff", ".tif",
  ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"
];
var RAW_EXTENSIONS = [".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"];

function discoverImagesSync(dirPath) {
  var results = [];
  try {
    var entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "_rejected" && entry.name !== "node_modules") {
        var sub = discoverImagesSync(fullPath);
        results = results.concat(sub);
      } else if (entry.isFile()) {
        var ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.indexOf(ext) !== -1) {
          var fileStat = fs.statSync(fullPath);
          results.push({
            path: fullPath,
            filename: entry.name,
            ext: ext,
            isRaw: RAW_EXTENSIONS.indexOf(ext) !== -1,
            sizeBytes: fileStat.size
          });
        }
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return results;
}

var images = discoverImagesSync(folderPath);
images.sort(function(a, b) { return a.filename.localeCompare(b.filename); });

if (images.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_culling_tool_scan",
        folderPath: folderPath,
        totalImages: 0,
        groups: [],
        message: "No image files found in this folder."
      })
    }]
  };
}

// --- Stage 2: Extract EXIF metadata ---
// Use exifr for lightweight EXIF reading (pure JS, no binary dependency)
var exifr;
try {
  exifr = require("exifr");
} catch (e) {
  // exifr not available — proceed with basic file metadata only
  exifr = null;
}

var imageData = [];
for (var idx = 0; idx < images.length; idx++) {
  var img = images[idx];
  var exif = {
    cameraMake: null, cameraModel: null, dateTaken: null, dateTakenMs: null,
    subSecTime: null, iso: null, shutterSpeed: null, aperture: null,
    focalLength: null, width: null, height: null, orientation: 1
  };

  if (exifr) {
    try {
      var raw = await exifr.parse(img.path, {
        pick: ["DateTimeOriginal", "SubSecTimeOriginal", "CreateDate", "SubSecTime",
               "Make", "Model", "ISO", "ExposureTime", "FNumber", "FocalLength",
               "ImageWidth", "ImageHeight", "ExifImageWidth", "ExifImageHeight", "Orientation"]
      });
      if (raw) {
        var dateRaw = raw.DateTimeOriginal || raw.CreateDate;
        var subSec = raw.SubSecTimeOriginal || raw.SubSecTime || "";
        if (dateRaw instanceof Date) {
          exif.dateTaken = dateRaw.toISOString();
          exif.dateTakenMs = dateRaw.getTime();
          if (subSec) {
            var fraction = parseFloat("0." + subSec);
            if (!isNaN(fraction)) exif.dateTakenMs += fraction * 1000;
          }
        }
        exif.cameraMake = raw.Make || null;
        exif.cameraModel = raw.Model || null;
        exif.subSecTime = subSec || null;
        exif.iso = raw.ISO || null;
        exif.shutterSpeed = raw.ExposureTime ? (raw.ExposureTime >= 1 ? raw.ExposureTime + "s" : "1/" + Math.round(1 / raw.ExposureTime) + "s") : null;
        exif.aperture = raw.FNumber ? "f/" + raw.FNumber : null;
        exif.focalLength = raw.FocalLength ? raw.FocalLength + "mm" : null;
        exif.width = raw.ExifImageWidth || raw.ImageWidth || null;
        exif.height = raw.ExifImageHeight || raw.ImageHeight || null;
        exif.orientation = raw.Orientation || 1;
      }
    } catch (e) { /* EXIF read failed — use defaults */ }
  }

  imageData.push({
    path: img.path,
    filename: img.filename,
    ext: img.ext,
    isRaw: img.isRaw,
    sizeBytes: img.sizeBytes,
    exif: exif,
    sharpnessScore: 0,
    faces: [],
    eyesClosedFlag: false,
    status: "pending",
    decidedAt: null
  });
}

// --- Stage 3: Sharpness analysis (via sharp if available) ---
var sharp;
try {
  sharp = require("sharp");
} catch (e) {
  sharp = null;
}

if (sharp) {
  for (var si = 0; si < imageData.length; si++) {
    try {
      var resized = sharp(imageData[si].path, { failOn: "none" })
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .grayscale();
      var laplacian = resized.convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
      });
      var bufResult = await laplacian.raw().toBuffer({ resolveWithObject: true });
      var pixels = bufResult.data;
      var n = pixels.length;
      if (n > 0) {
        var sum = 0;
        for (var pi = 0; pi < n; pi++) sum += pixels[pi];
        var mean = sum / n;
        var vSum = 0;
        for (var vi = 0; vi < n; vi++) {
          var diff = pixels[vi] - mean;
          vSum += diff * diff;
        }
        imageData[si].sharpnessScore = Math.round((vSum / n) * 100) / 100;
      }
    } catch (e) { /* sharpness analysis failed — keep score at 0 */ }
  }
}

// --- Stage 4: Face detection (via @vladmandic/face-api if available) ---
if (!skipFaces && sharp) {
  var faceapi = null;
  try {
    faceapi = require("@vladmandic/face-api");
  } catch (e) {
    faceapi = null;
  }

  if (faceapi) {
    // Find face-api model files
    var modelsDir = null;
    var modelCandidates = [
      path.resolve(process.cwd(), "node_modules", "@vladmandic", "face-api", "model"),
      path.resolve(process.cwd(), "models")
    ];
    for (var mc = 0; mc < modelCandidates.length; mc++) {
      try {
        fs.statSync(modelCandidates[mc]);
        modelsDir = modelCandidates[mc];
        break;
      } catch (e) { /* not found */ }
    }

    if (modelsDir) {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsDir);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsDir);

        var tf = faceapi.tf;
        if (!tf) {
          try { tf = require("@tensorflow/tfjs-node"); } catch (e) { tf = null; }
        }

        if (tf) {
          for (var fi = 0; fi < imageData.length; fi++) {
            try {
              var faceResult = await sharp(imageData[fi].path, { failOn: "none" })
                .resize(640, 640, { fit: "inside", withoutEnlargement: true })
                .removeAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

              var faceTensor = tf.tensor3d(
                new Uint8Array(faceResult.data),
                [faceResult.info.height, faceResult.info.width, 3]
              );

              var detections = await faceapi
                .detectAllFaces(faceTensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                .withFaceLandmarks();

              faceTensor.dispose();

              var faces = [];
              for (var di = 0; di < detections.length; di++) {
                var det = detections[di];
                var box = det.detection.box;
                var landmarks = det.landmarks.positions;
                // Compute Eye Aspect Ratio (EAR) from 68-point landmarks
                var leftEAR = 0, rightEAR = 0, avgEAR = 0, eyesClosed = false;
                if (landmarks && landmarks.length >= 68) {
                  var dist = function(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)); };
                  var le = landmarks.slice(36, 42);
                  if (le.length === 6) leftEAR = (dist(le[1], le[5]) + dist(le[2], le[4])) / (2 * dist(le[0], le[3]));
                  var re = landmarks.slice(42, 48);
                  if (re.length === 6) rightEAR = (dist(re[1], re[5]) + dist(re[2], re[4])) / (2 * dist(re[0], re[3]));
                  avgEAR = (leftEAR + rightEAR) / 2;
                  eyesClosed = avgEAR > 0 && avgEAR < earThreshold;
                }
                faces.push({
                  box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
                  confidence: Math.round(det.detection.score * 1000) / 1000,
                  leftEAR: Math.round(leftEAR * 1000) / 1000,
                  rightEAR: Math.round(rightEAR * 1000) / 1000,
                  avgEAR: Math.round(avgEAR * 1000) / 1000,
                  eyesClosed: eyesClosed
                });
              }

              imageData[fi].faces = faces;
              imageData[fi].eyesClosedFlag = faces.some(function(f) { return f.eyesClosed; });
            } catch (e) { /* face detection failed for this image — keep defaults */ }
          }
        }
      } catch (e) { /* face-api model loading failed — skip face detection */ }
    }
  }
}

// --- Stage 5: Group by timestamp proximity ---
imageData.sort(function(a, b) {
  var ta = a.exif.dateTakenMs;
  var tb = b.exif.dateTakenMs;
  if (ta == null && tb == null) return 0;
  if (ta == null) return 1;
  if (tb == null) return -1;
  return ta - tb;
});

var groups = [];
var currentGroup = [imageData[0]];

for (var gi = 1; gi < imageData.length; gi++) {
  var tPrev = imageData[gi - 1].exif.dateTakenMs;
  var tCurr = imageData[gi].exif.dateTakenMs;
  var gap = (tPrev != null && tCurr != null) ? Math.abs(tCurr - tPrev) : Infinity;

  if (gap <= burstThresholdMs) {
    currentGroup.push(imageData[gi]);
  } else {
    groups.push(currentGroup);
    currentGroup = [imageData[gi]];
  }
}
groups.push(currentGroup);

// --- Stage 7: Rank within each group ---
var sessionGroups = [];
for (var gri = 0; gri < groups.length; gri++) {
  var grp = groups[gri];
  // Sort by sharpness descending
  grp.sort(function(a, b) { return (b.sharpnessScore || 0) - (a.sharpnessScore || 0); });

  var maxScore = grp[0].sharpnessScore || 0;
  var minScore = grp[grp.length - 1].sharpnessScore || 0;
  var scoreRange = maxScore - minScore;

  var groupType = grp.length === 1 ? "single" : "burst";
  var captureTime = null;
  for (var ct = 0; ct < grp.length; ct++) {
    if (grp[ct].exif.dateTaken) { captureTime = grp[ct].exif.dateTaken; break; }
  }

  var groupId = "G" + String(gri + 1).padStart(3, "0");
  var rankedImages = [];

  for (var ri = 0; ri < grp.length; ri++) {
    var rimg = grp[ri];
    var isSharpest = ri === 0;
    var blurFlag = (rimg.sharpnessScore || 0) < blurThreshold;
    var normalized = scoreRange > 0
      ? Math.round(((rimg.sharpnessScore - minScore) / scoreRange) * 100)
      : (rimg.sharpnessScore >= blurThreshold ? 100 : 0);

    var autoSuggestion = null;
    var autoReason = null;

    if (grp.length === 1) {
      if (blurFlag) { autoSuggestion = "reject"; autoReason = "Blurry (score: " + Math.round(rimg.sharpnessScore) + ")"; }
      else if (rimg.eyesClosedFlag) { autoSuggestion = "reject"; autoReason = "Eyes closed detected"; }
      else { autoSuggestion = "approve"; autoReason = "Single image, no issues detected"; }
    } else if (isSharpest) {
      if (rimg.eyesClosedFlag) { autoSuggestion = null; autoReason = "Sharpest in burst of " + grp.length + " but eyes closed"; }
      else { autoSuggestion = "approve"; autoReason = "Sharpest in burst of " + grp.length; }
    } else if (blurFlag) {
      autoSuggestion = "reject"; autoReason = "Blurry (score: " + Math.round(rimg.sharpnessScore) + ")";
    } else if (rimg.eyesClosedFlag) {
      autoSuggestion = "reject"; autoReason = "Eyes closed detected";
    } else {
      autoSuggestion = "reject"; autoReason = "Superseded by sharper image (score: " + Math.round(maxScore) + " vs " + Math.round(rimg.sharpnessScore) + ")";
    }

    rankedImages.push({
      path: rimg.path,
      filename: rimg.filename,
      ext: rimg.ext,
      sizeBytes: rimg.sizeBytes,
      mediaUrl: "/media/" + Buffer.from(rimg.path).toString("base64url"),
      sharpnessScore: rimg.sharpnessScore,
      sharpnessNormalized: normalized,
      isSharpest: isSharpest,
      blurFlag: blurFlag,
      eyesClosedFlag: rimg.eyesClosedFlag,
      faces: rimg.faces,
      exif: rimg.exif,
      status: "pending",
      decidedAt: null,
      autoSuggestion: autoSuggestion,
      autoReason: autoReason
    });
  }

  sessionGroups.push({
    groupId: groupId,
    captureTime: captureTime,
    groupType: groupType,
    imageCount: rankedImages.length,
    images: rankedImages
  });
}

// Build session
var totalImages = imageData.length;
var blurFlagged = 0;
var eyesClosedFlagged = 0;
for (var sti = 0; sti < sessionGroups.length; sti++) {
  for (var stj = 0; stj < sessionGroups[sti].images.length; stj++) {
    if (sessionGroups[sti].images[stj].blurFlag) blurFlagged++;
    if (sessionGroups[sti].images[stj].eyesClosedFlag) eyesClosedFlagged++;
  }
}

var session = {
  sessionId: crypto.randomUUID(),
  folderPath: folderPath,
  createdAt: Date.now(),
  settings: {
    burstThresholdMs: burstThresholdMs,
    blurThreshold: blurThreshold,
    earThreshold: earThreshold,
    skipFaces: skipFaces
  },
  totalImages: totalImages,
  totalGroups: sessionGroups.length,
  stats: {
    approved: 0,
    rejected: 0,
    pending: totalImages,
    blurFlagged: blurFlagged,
    eyesClosedFlagged: eyesClosedFlagged
  },
  groups: sessionGroups,
  undoStack: [],
  currentGroupIndex: 0,
  currentImageIndex: 0
};

// Persist session to disk
try {
  var tempPath = sessionPath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(session, null, 2), "utf-8");
  fs.renameSync(tempPath, sessionPath);
} catch (e) {
  // Non-fatal — session still works in memory
}

// Store session ID for other executors
await ctx.store.set("currentSessionPath", sessionPath);
await ctx.store.set("currentSessionId", session.sessionId);

session.tool = "enso_photo_culling_tool_scan";
session.message = "Scanned " + totalImages + " images into " + sessionGroups.length + " groups (" + blurFlagged + " blur-flagged" + (skipFaces ? ", face detection skipped" : "") + ")";

return {
  content: [{
    type: "text",
    text: JSON.stringify(session)
  }]
};
