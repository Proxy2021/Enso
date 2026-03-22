// analyze_folder.js — Standalone photo analysis executor.
// Scans a folder, extracts EXIF, computes sharpness (Laplacian variance),
// detects faces/eye status, groups bursts by timestamp clustering,
// and returns structured JSON with bursts[] and unclustered[].
//
// All paths are parameterized — no hardcoded folder paths.
// Gracefully degrades if sharp, exifr, or face-api are unavailable.

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

// ---------------------------------------------------------------------------
// Parameters (all from caller)
// ---------------------------------------------------------------------------
var folderPath = (params.folderPath || "").trim();
var burstThresholdMs = typeof params.burstThresholdMs === "number" ? params.burstThresholdMs : 3000;
var blurThreshold = typeof params.blurThreshold === "number" ? params.blurThreshold : 50;
var earThreshold = typeof params.earThreshold === "number" ? params.earThreshold : 0.2;
var skipFaces = params.skipFaces === true;
var maxSharpnessSize = typeof params.maxSharpnessSize === "number" ? params.maxSharpnessSize : 1024;
var maxFaceSize = typeof params.maxFaceSize === "number" ? params.maxFaceSize : 640;
var TOOL = "enso_photo_culling_tool_analyze_folder";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
if (!folderPath) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: TOOL, error: "folderPath is required. Provide the absolute path to a folder of photos."
  }) }] };
}

// Expand ~ to home directory
if (folderPath.startsWith("~")) {
  folderPath = path.join(require("os").homedir(), folderPath.slice(1));
}

// Normalize to absolute path
folderPath = path.resolve(folderPath);

try {
  var stat = fs.statSync(folderPath);
  if (!stat.isDirectory()) {
    return { content: [{ type: "text", text: JSON.stringify({
      tool: TOOL, error: "Not a directory: " + folderPath
    }) }] };
  }
} catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: TOOL, error: "Folder not found: " + folderPath
  }) }] };
}

var startTime = Date.now();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
var IMAGE_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".heic", ".heif",
  ".tiff", ".tif", ".cr2", ".cr3", ".nef",
  ".arw", ".raf", ".orf", ".dng", ".rw2"
];
var RAW_EXTENSIONS = [".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"];

// Laplacian edge-detection kernel (3x3)
var LAPLACIAN_KERNEL = [-1, -1, -1, -1, 8, -1, -1, -1, -1];

// ---------------------------------------------------------------------------
// Stage 1: Discover images recursively
// ---------------------------------------------------------------------------
function discoverImages(dirPath) {
  var results = [];
  try {
    var entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // Skip hidden dirs, output dirs, node_modules
        if (entry.name.startsWith(".") || entry.name.startsWith("_") ||
            entry.name === "node_modules" || entry.name === "Thumbs.db") {
          continue;
        }
        results = results.concat(discoverImages(fullPath));
      } else if (entry.isFile()) {
        var ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.indexOf(ext) !== -1) {
          try {
            var fileStat = fs.statSync(fullPath);
            results.push({
              path: fullPath,
              filename: entry.name,
              ext: ext,
              isRaw: RAW_EXTENSIONS.indexOf(ext) !== -1,
              sizeBytes: fileStat.size
            });
          } catch (e) { /* skip unreadable files */ }
        }
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return results;
}

var discovered = discoverImages(folderPath);
discovered.sort(function(a, b) { return a.filename.localeCompare(b.filename); });

if (discovered.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: TOOL,
    folderPath: folderPath,
    totalImages: 0,
    processingTime: Date.now() - startTime,
    bursts: [],
    unclustered: [],
    message: "No image files found in this folder."
  }) }] };
}

// ---------------------------------------------------------------------------
// Stage 2: Extract EXIF metadata
// ---------------------------------------------------------------------------
var exifr;
try { exifr = require("exifr"); } catch (e) { exifr = null; }

var photos = [];
for (var idx = 0; idx < discovered.length; idx++) {
  var img = discovered[idx];
  var exif = {
    cameraMake: null, cameraModel: null,
    dateTaken: null, dateTakenMs: null, subSecTime: null,
    iso: null, shutterSpeed: null, aperture: null, focalLength: null,
    width: null, height: null, orientation: 1
  };

  if (exifr) {
    try {
      var raw = await exifr.parse(img.path, {
        pick: [
          "DateTimeOriginal", "SubSecTimeOriginal", "CreateDate", "SubSecTime",
          "Make", "Model", "ISO", "ExposureTime", "FNumber", "FocalLength",
          "ImageWidth", "ImageHeight", "ExifImageWidth", "ExifImageHeight",
          "Orientation"
        ]
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
        exif.shutterSpeed = raw.ExposureTime
          ? (raw.ExposureTime >= 1 ? raw.ExposureTime + "s" : "1/" + Math.round(1 / raw.ExposureTime) + "s")
          : null;
        exif.aperture = raw.FNumber ? "f/" + raw.FNumber : null;
        exif.focalLength = raw.FocalLength ? raw.FocalLength + "mm" : null;
        exif.width = raw.ExifImageWidth || raw.ImageWidth || null;
        exif.height = raw.ExifImageHeight || raw.ImageHeight || null;
        exif.orientation = raw.Orientation || 1;
      }
    } catch (e) { /* EXIF read failed — continue with defaults */ }
  }

  photos.push({
    path: img.path,
    filename: img.filename,
    ext: img.ext,
    isRaw: img.isRaw,
    sizeBytes: img.sizeBytes,
    mediaUrl: "/media/" + Buffer.from(img.path).toString("base64url"),
    exif: exif,
    sharpnessScore: 0,
    faceCount: 0,
    eyesOpen: true,
    faces: [],
    eyesClosedFlag: false,
    blurFlag: false,
    timestamp: exif.dateTaken,
    status: "pending"
  });
}

// ---------------------------------------------------------------------------
// Stage 3: Sharpness analysis (Laplacian variance)
// ---------------------------------------------------------------------------
var sharp;
try { sharp = require("sharp"); } catch (e) { sharp = null; }

if (sharp) {
  for (var si = 0; si < photos.length; si++) {
    try {
      var resized = sharp(photos[si].path, { failOn: "none" })
        .resize(maxSharpnessSize, maxSharpnessSize, { fit: "inside", withoutEnlargement: true })
        .grayscale();
      var laplacian = resized.convolve({ width: 3, height: 3, kernel: LAPLACIAN_KERNEL });
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
        photos[si].sharpnessScore = Math.round((vSum / n) * 100) / 100;
      }
    } catch (e) { /* sharpness failed — score stays 0 */ }
  }
}

// ---------------------------------------------------------------------------
// Stage 4: Face detection & eye-open/closed (EAR)
// ---------------------------------------------------------------------------
if (!skipFaces && sharp) {
  var faceapi = null;
  try { faceapi = require("@vladmandic/face-api"); } catch (e) { faceapi = null; }

  if (faceapi) {
    // Locate model files
    var modelsDir = null;
    var modelCandidates = [
      path.resolve(process.cwd(), "node_modules", "@vladmandic", "face-api", "model"),
      path.resolve(process.cwd(), "models"),
      path.resolve(__dirname, "..", "models")
    ];
    for (var mc = 0; mc < modelCandidates.length; mc++) {
      try { fs.statSync(modelCandidates[mc]); modelsDir = modelCandidates[mc]; break; } catch (e) { /* */ }
    }

    if (modelsDir) {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsDir);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsDir);
        var tf = faceapi.tf;
        if (!tf) { try { tf = require("@tensorflow/tfjs-node"); } catch (e) { tf = null; } }

        if (tf) {
          for (var fi = 0; fi < photos.length; fi++) {
            try {
              var faceResult = await sharp(photos[fi].path, { failOn: "none" })
                .resize(maxFaceSize, maxFaceSize, { fit: "inside", withoutEnlargement: true })
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
                var leftEAR = 0, rightEAR = 0, avgEAR = 0, eyesClosed = false;

                if (landmarks && landmarks.length >= 68) {
                  var dist = function(a, b) {
                    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
                  };
                  // Left eye landmarks: 36-41
                  var le = landmarks.slice(36, 42);
                  if (le.length === 6) {
                    leftEAR = (dist(le[1], le[5]) + dist(le[2], le[4])) / (2 * dist(le[0], le[3]));
                  }
                  // Right eye landmarks: 42-47
                  var re = landmarks.slice(42, 48);
                  if (re.length === 6) {
                    rightEAR = (dist(re[1], re[5]) + dist(re[2], re[4])) / (2 * dist(re[0], re[3]));
                  }
                  avgEAR = (leftEAR + rightEAR) / 2;
                  eyesClosed = avgEAR > 0 && avgEAR < earThreshold;
                }

                faces.push({
                  box: {
                    x: Math.round(box.x), y: Math.round(box.y),
                    width: Math.round(box.width), height: Math.round(box.height)
                  },
                  confidence: Math.round(det.detection.score * 1000) / 1000,
                  leftEAR: Math.round(leftEAR * 1000) / 1000,
                  rightEAR: Math.round(rightEAR * 1000) / 1000,
                  avgEAR: Math.round(avgEAR * 1000) / 1000,
                  eyesClosed: eyesClosed
                });
              }

              photos[fi].faces = faces;
              photos[fi].faceCount = faces.length;
              photos[fi].eyesClosedFlag = faces.some(function(f) { return f.eyesClosed; });
              photos[fi].eyesOpen = !photos[fi].eyesClosedFlag;
            } catch (e) { /* face detection failed for this image */ }
          }
        }
      } catch (e) { /* model loading failed */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 5: Burst grouping by timestamp clustering
// ---------------------------------------------------------------------------
// Sort photos by capture timestamp (null timestamps go to end)
var timestampedPhotos = [];
var noTimestampPhotos = [];
for (var tp = 0; tp < photos.length; tp++) {
  if (photos[tp].exif.dateTakenMs != null) {
    timestampedPhotos.push(photos[tp]);
  } else {
    noTimestampPhotos.push(photos[tp]);
  }
}
timestampedPhotos.sort(function(a, b) { return a.exif.dateTakenMs - b.exif.dateTakenMs; });

// Cluster timestamped photos into bursts (shots within burstThresholdMs)
var rawGroups = [];
if (timestampedPhotos.length > 0) {
  var currentGroup = [timestampedPhotos[0]];
  for (var gi = 1; gi < timestampedPhotos.length; gi++) {
    var tPrev = timestampedPhotos[gi - 1].exif.dateTakenMs;
    var tCurr = timestampedPhotos[gi].exif.dateTakenMs;
    var gap = Math.abs(tCurr - tPrev);
    if (gap <= burstThresholdMs) {
      currentGroup.push(timestampedPhotos[gi]);
    } else {
      rawGroups.push(currentGroup);
      currentGroup = [timestampedPhotos[gi]];
    }
  }
  rawGroups.push(currentGroup);
}

// Fallback: group no-timestamp photos by filename sequence (e.g., IMG_001, IMG_002)
function extractSequenceNumber(filename) {
  var match = filename.match(/(\d{3,})(?:\.\w+)?$/);
  return match ? parseInt(match[1], 10) : null;
}

if (noTimestampPhotos.length > 0) {
  noTimestampPhotos.sort(function(a, b) {
    var seqA = extractSequenceNumber(a.filename);
    var seqB = extractSequenceNumber(b.filename);
    if (seqA != null && seqB != null) return seqA - seqB;
    return a.filename.localeCompare(b.filename);
  });

  // Group consecutive sequence numbers
  var seqGroup = [noTimestampPhotos[0]];
  for (var ni = 1; ni < noTimestampPhotos.length; ni++) {
    var prevSeq = extractSequenceNumber(noTimestampPhotos[ni - 1].filename);
    var currSeq = extractSequenceNumber(noTimestampPhotos[ni].filename);
    if (prevSeq != null && currSeq != null && currSeq - prevSeq <= 2) {
      // Consecutive or near-consecutive (allow gap of 1 for deleted frames)
      seqGroup.push(noTimestampPhotos[ni]);
    } else {
      rawGroups.push(seqGroup);
      seqGroup = [noTimestampPhotos[ni]];
    }
  }
  rawGroups.push(seqGroup);
}

// ---------------------------------------------------------------------------
// Stage 6: Rank within groups, assign best shot, build output
// ---------------------------------------------------------------------------
var bursts = [];
var unclustered = [];
var burstCounter = 0;
var blurFlaggedCount = 0;
var eyesClosedCount = 0;

for (var gri = 0; gri < rawGroups.length; gri++) {
  var grp = rawGroups[gri];

  // Sort by sharpness descending (best shot first)
  grp.sort(function(a, b) { return (b.sharpnessScore || 0) - (a.sharpnessScore || 0); });

  var maxScore = grp[0].sharpnessScore || 0;
  var minScore = grp[grp.length - 1].sharpnessScore || 0;
  var scoreRange = maxScore - minScore;

  // Compute normalized sharpness and flags per image
  for (var ri = 0; ri < grp.length; ri++) {
    var rimg = grp[ri];
    rimg.blurFlag = (rimg.sharpnessScore || 0) < blurThreshold;
    rimg.sharpnessNormalized = scoreRange > 0
      ? Math.round(((rimg.sharpnessScore - minScore) / scoreRange) * 100)
      : (rimg.sharpnessScore >= blurThreshold ? 100 : 0);
    if (rimg.blurFlag) blurFlaggedCount++;
    if (rimg.eyesClosedFlag) eyesClosedCount++;
  }

  // Single images → unclustered
  if (grp.length === 1) {
    var singlePhoto = buildPhotoRecord(grp[0]);
    unclustered.push(singlePhoto);
    continue;
  }

  // Multi-shot → burst group
  burstCounter++;
  var burstId = "B" + String(burstCounter).padStart(3, "0");
  var bestShotIndex = 0; // Already sorted by sharpness — index 0 is sharpest
  var captureTime = null;
  for (var ct = 0; ct < grp.length; ct++) {
    if (grp[ct].exif.dateTaken) { captureTime = grp[ct].exif.dateTaken; break; }
  }

  var burstPhotos = [];
  for (var bp = 0; bp < grp.length; bp++) {
    var photoRec = buildPhotoRecord(grp[bp]);
    photoRec.isSharpest = bp === 0;
    burstPhotos.push(photoRec);
  }

  bursts.push({
    burstId: burstId,
    captureTime: captureTime,
    shotCount: grp.length,
    bestShotIndex: bestShotIndex,
    photos: burstPhotos
  });
}

// ---------------------------------------------------------------------------
// Build photo record for output
// ---------------------------------------------------------------------------
function buildPhotoRecord(photo) {
  return {
    path: photo.path,
    filename: photo.filename,
    sharpnessScore: photo.sharpnessScore,
    sharpnessNormalized: photo.sharpnessNormalized || 0,
    blurFlag: photo.blurFlag || false,
    faceCount: photo.faceCount || 0,
    eyesOpen: photo.eyesOpen !== false,
    eyesClosedFlag: photo.eyesClosedFlag || false,
    timestamp: photo.exif.dateTaken || null,
    status: "pending",
    isRaw: photo.isRaw || false,
    sizeBytes: photo.sizeBytes || 0,
    mediaUrl: photo.mediaUrl || null,
    exif: photo.exif,
    faces: photo.faces || [],
    isSharpest: false,
    autoSuggestion: null,
    autoReason: null
  };
}

// ---------------------------------------------------------------------------
// Stage 7: Auto-suggestion rules
// ---------------------------------------------------------------------------
// Bursts: approve sharpest, reject blurry/eyes-closed/superseded
for (var bi = 0; bi < bursts.length; bi++) {
  var burst = bursts[bi];
  for (var bpi = 0; bpi < burst.photos.length; bpi++) {
    var bphoto = burst.photos[bpi];
    if (bphoto.isSharpest) {
      if (bphoto.eyesClosedFlag) {
        bphoto.autoSuggestion = null;
        bphoto.autoReason = "Sharpest but eyes closed";
      } else {
        bphoto.autoSuggestion = "pick";
        bphoto.autoReason = "Sharpest in burst of " + burst.shotCount;
      }
    } else if (bphoto.blurFlag) {
      bphoto.autoSuggestion = "reject";
      bphoto.autoReason = "Blurry (score: " + Math.round(bphoto.sharpnessScore) + ")";
    } else if (bphoto.eyesClosedFlag) {
      bphoto.autoSuggestion = "reject";
      bphoto.autoReason = "Eyes closed";
    } else {
      bphoto.autoSuggestion = "reject";
      bphoto.autoReason = "Superseded by sharper image";
    }
  }
}

// Unclustered: approve unless blurry/eyes-closed
for (var ui = 0; ui < unclustered.length; ui++) {
  var uphoto = unclustered[ui];
  if (uphoto.blurFlag) {
    uphoto.autoSuggestion = "flag";
    uphoto.autoReason = "Blurry (score: " + Math.round(uphoto.sharpnessScore) + ")";
  } else if (uphoto.eyesClosedFlag) {
    uphoto.autoSuggestion = "flag";
    uphoto.autoReason = "Eyes closed detected";
  } else {
    uphoto.autoSuggestion = "pick";
    uphoto.autoReason = "Single image, no issues";
  }
}

// ---------------------------------------------------------------------------
// Stage 8: Persist session for downstream tools
// ---------------------------------------------------------------------------
var processingTime = Date.now() - startTime;

var sessionData = {
  sessionId: crypto.randomUUID(),
  folderPath: folderPath,
  createdAt: Date.now(),
  settings: {
    burstThresholdMs: burstThresholdMs,
    blurThreshold: blurThreshold,
    earThreshold: earThreshold,
    skipFaces: skipFaces
  },
  totalImages: photos.length,
  processingTime: processingTime,
  bursts: bursts,
  unclustered: unclustered
};

var sessionPath = path.join(folderPath, ".enso-cull-session.json");
try {
  var tempPath = sessionPath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(sessionData, null, 2), "utf-8");
  fs.renameSync(tempPath, sessionPath);
} catch (e) { /* non-fatal: session save failed */ }

// Store session path for other executors
try {
  await ctx.store.set("currentSessionPath", sessionPath);
  await ctx.store.set("currentSessionId", sessionData.sessionId);
} catch (e) { /* ctx.store may not be available */ }

// ---------------------------------------------------------------------------
// Build output
// ---------------------------------------------------------------------------
var burstImageCount = 0;
for (var bic = 0; bic < bursts.length; bic++) burstImageCount += bursts[bic].shotCount;

var result = {
  tool: TOOL,
  folderPath: folderPath,
  totalImages: photos.length,
  processingTime: processingTime,
  summary: {
    totalBursts: bursts.length,
    totalUnclustered: unclustered.length,
    imagesInBursts: burstImageCount,
    blurFlagged: blurFlaggedCount,
    eyesClosedFlagged: eyesClosedCount,
    sharpAvailable: sharp != null,
    exifAvailable: exifr != null,
    faceDetectionAvailable: !skipFaces && sharp != null
  },
  bursts: bursts,
  unclustered: unclustered,
  message: "Analyzed " + photos.length + " images: " + bursts.length + " bursts (" +
    burstImageCount + " images), " + unclustered.length + " singles. " +
    blurFlaggedCount + " blur-flagged, " + eyesClosedCount + " eyes-closed. " +
    "Processing time: " + (processingTime / 1000).toFixed(1) + "s"
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
