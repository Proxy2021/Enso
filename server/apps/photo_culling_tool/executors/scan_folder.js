// scan_folder.js — Scan a folder for photos, extract EXIF, group bursts, create session.
// Primary entry point for the photo culling workflow.
// Uses photo-ai-engine.js for all AI processing.

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var folderPath = (params.folderPath || params.path || "").trim();
var skipFaces = params.skipFaces === true;
var burstThresholdMs = typeof params.burstThresholdMs === "number" ? params.burstThresholdMs : 3000;
var blurThreshold = typeof params.blurThreshold === "number" ? params.blurThreshold : 50;
var earThreshold = typeof params.earThreshold === "number" ? params.earThreshold : 0.2;
var TOOL = "enso_photo_culling_tool_scan_folder";

if (!folderPath) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "folderPath is required. Provide the path to a folder of photos to scan." }) }] };
}

if (folderPath.startsWith("~")) {
  folderPath = path.join(require("os").homedir(), folderPath.slice(1));
}

try {
  var stat = fs.statSync(folderPath);
  if (!stat.isDirectory()) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "Not a directory: " + folderPath }) }] };
  }
} catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "Folder not found: " + folderPath }) }] };
}

// Check for existing session
var sessionPath = path.join(folderPath, ".enso-cull-session.json");
var existingSession = null;
try {
  existingSession = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
} catch (e) { /* no existing session */ }

if (existingSession && !params.rescan) {
  existingSession.tool = TOOL;
  existingSession.resumed = true;
  existingSession.message = "Resumed session: " + existingSession.totalImages + " images in " + existingSession.totalGroups + " groups";
  return { content: [{ type: "text", text: JSON.stringify(existingSession) }] };
}

// ── Load AI engine (search multiple locations) ──
var engine = null;
var enginePaths = [
  path.join(process.cwd(), "server", "apps", "photo_culling_tool", "lib", "photo-ai-engine.js"),
  path.join(require("os").homedir(), ".openclaw", "enso-apps", "photo_culling_tool", "lib", "photo-ai-engine.js"),
  path.join(require("os").homedir(), ".enso", "apps", "photo_culling_tool", "lib", "photo-ai-engine.js")
];
for (var ep = 0; ep < enginePaths.length; ep++) {
  try { engine = require(enginePaths[ep]); break; } catch (e) { /* try next */ }
}

// ── With engine: use centralized AI pipeline ──
if (engine) {
  // Stage 1: Discover images
  var images = engine.discoverImages(folderPath);
  images.sort(function(a, b) { return a.filename.localeCompare(b.filename); });

  if (images.length === 0) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, folderPath: folderPath, totalImages: 0, totalGroups: 0, groups: [], message: "No image files found in this folder." }) }] };
  }

  // Stage 2: Batch analyze (EXIF + sharpness + pHash + optional faces)
  var analyzed = await engine.batchAnalyze(images, {
    batchSize: 50,
    skipFaces: skipFaces,
    computeHashes: true,
    blurThreshold: blurThreshold,
    earThreshold: earThreshold,
    maxSharpnessDim: 1024
  });

  // Stage 3: Group by timestamp + pHash
  var groups = engine.groupImages(analyzed, {
    burstThresholdMs: burstThresholdMs,
    blurThreshold: blurThreshold,
    pHashMergeDistance: 10
  });

  // Stage 4: Build session
  var settings = { burstThresholdMs: burstThresholdMs, blurThreshold: blurThreshold, earThreshold: earThreshold, skipFaces: skipFaces };
  var session = engine.buildSession(folderPath, groups, settings);

  // Persist session
  try { engine.saveSession(sessionPath, session); } catch (e) { /* non-fatal */ }

  await ctx.store.set("currentSessionPath", sessionPath);
  await ctx.store.set("currentSessionId", session.sessionId);

  session.tool = TOOL;
  session.message = "Scanned " + session.totalImages + " images into " + session.totalGroups + " groups (" + session.stats.blurFlagged + " blur-flagged" + (skipFaces ? ", face detection skipped" : (session.stats.eyesClosedFlagged > 0 ? ", " + session.stats.eyesClosedFlagged + " eyes-closed" : "")) + ")";
  return { content: [{ type: "text", text: JSON.stringify(session) }] };
}

// ── Fallback: inline processing (engine not found) ──

// Stage 1: Discover images
var IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".heic", ".heif", ".tiff", ".tif", ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"];
var RAW_EXTENSIONS = [".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"];

function discoverImagesSync(dirPath) {
  var results = [];
  try {
    var entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "_rejected" && entry.name !== "_approved" && entry.name !== "node_modules") {
        results = results.concat(discoverImagesSync(fullPath));
      } else if (entry.isFile()) {
        var ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.indexOf(ext) !== -1) {
          var fileStat = fs.statSync(fullPath);
          results.push({ path: fullPath, filename: entry.name, ext: ext, isRaw: RAW_EXTENSIONS.indexOf(ext) !== -1, sizeBytes: fileStat.size });
        }
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return results;
}

var images = discoverImagesSync(folderPath);
images.sort(function(a, b) { return a.filename.localeCompare(b.filename); });

if (images.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, folderPath: folderPath, totalImages: 0, totalGroups: 0, groups: [], message: "No image files found in this folder." }) }] };
}

// Stage 2: Extract EXIF (try exifr, then sharp metadata, then skip)
var exifr;
try { exifr = require("exifr"); } catch (e) { exifr = null; }
var sharp;
try { sharp = require("sharp"); } catch (e) { sharp = null; }

var imageData = [];
for (var idx = 0; idx < images.length; idx++) {
  var img = images[idx];
  var exif = { cameraMake: null, cameraModel: null, dateTaken: null, dateTakenMs: null, subSecTime: null, iso: null, shutterSpeed: null, aperture: null, focalLength: null, width: null, height: null, orientation: 1 };

  if (exifr) {
    try {
      var raw = await exifr.parse(img.path, {
        pick: ["DateTimeOriginal", "SubSecTimeOriginal", "CreateDate", "SubSecTime", "Make", "Model", "ISO", "ExposureTime", "FNumber", "FocalLength", "ImageWidth", "ImageHeight", "ExifImageWidth", "ExifImageHeight", "Orientation"]
      });
      if (raw) {
        var dateRaw = raw.DateTimeOriginal || raw.CreateDate;
        var subSec = raw.SubSecTimeOriginal || raw.SubSecTime || "";
        if (dateRaw instanceof Date) {
          exif.dateTaken = dateRaw.toISOString();
          exif.dateTakenMs = dateRaw.getTime();
          if (subSec) { var fraction = parseFloat("0." + subSec); if (!isNaN(fraction)) exif.dateTakenMs += fraction * 1000; }
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
    } catch (e) { /* EXIF read failed */ }
  } else if (sharp) {
    // Fallback: extract EXIF from sharp metadata buffer
    try {
      var meta = await sharp(img.path, { failOn: "none" }).metadata();
      exif.width = meta.width || null;
      exif.height = meta.height || null;
      exif.orientation = meta.orientation || 1;
      if (meta.exif && meta.exif.length > 0) {
        var parsed = parseExifBufferInline(meta.exif);
        if (parsed) {
          exif.cameraMake = parsed.make || null;
          exif.cameraModel = parsed.model || null;
          if (parsed.dateTimeOriginal || parsed.createDate) {
            var dateStr = parsed.dateTimeOriginal || parsed.createDate;
            var normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
            var ms = Date.parse(normalized);
            if (!isNaN(ms)) {
              exif.dateTaken = new Date(ms).toISOString();
              exif.dateTakenMs = ms;
              if (parsed.subSecTimeOriginal) {
                var frac = parseFloat("0." + parsed.subSecTimeOriginal);
                if (!isNaN(frac)) exif.dateTakenMs += frac * 1000;
              }
              exif.subSecTime = parsed.subSecTimeOriginal || null;
            }
          }
          exif.iso = parsed.iso || null;
          exif.shutterSpeed = parsed.exposureTime ? (parsed.exposureTime >= 1 ? parsed.exposureTime + "s" : "1/" + Math.round(1 / parsed.exposureTime) + "s") : null;
          exif.aperture = parsed.fNumber ? "f/" + parsed.fNumber : null;
          exif.focalLength = parsed.focalLength ? parsed.focalLength + "mm" : null;
          if (parsed.orientation) exif.orientation = parsed.orientation;
        }
      }
    } catch (e) { /* metadata read failed */ }
  }

  imageData.push({
    path: img.path, filename: img.filename, ext: img.ext, isRaw: img.isRaw, sizeBytes: img.sizeBytes,
    mediaUrl: "/media/" + Buffer.from(img.path).toString("base64url"),
    exif: exif, sharpnessScore: 0, sharpnessNormalized: 0, isSharpest: false,
    blurFlag: false, faces: [], eyesClosedFlag: false,
    status: "pending", decidedAt: null, autoSuggestion: null, autoReason: null
  });
}

// Stage 3: Sharpness analysis
if (sharp) {
  for (var si = 0; si < imageData.length; si++) {
    try {
      var resized = sharp(imageData[si].path, { failOn: "none" }).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).grayscale();
      var laplacian = resized.convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] });
      var bufResult = await laplacian.raw().toBuffer({ resolveWithObject: true });
      var pixels = bufResult.data;
      var n = pixels.length;
      if (n > 0) {
        var sum = 0; for (var pi = 0; pi < n; pi++) sum += pixels[pi];
        var mean = sum / n;
        var vSum = 0; for (var vi = 0; vi < n; vi++) { var diff = pixels[vi] - mean; vSum += diff * diff; }
        imageData[si].sharpnessScore = Math.round((vSum / n) * 100) / 100;
      }
    } catch (e) { /* sharpness failed */ }
  }
}

// Stage 4: Face detection (try face-api if available)
if (!skipFaces && sharp) {
  var faceapi = null;
  try { faceapi = require("@vladmandic/face-api"); } catch (e) { faceapi = null; }
  if (faceapi) {
    var modelsDir = null;
    var modelCandidates = [path.resolve(process.cwd(), "node_modules", "@vladmandic", "face-api", "model"), path.resolve(process.cwd(), "models")];
    for (var mc = 0; mc < modelCandidates.length; mc++) { try { fs.statSync(modelCandidates[mc]); modelsDir = modelCandidates[mc]; break; } catch (e) { /* not found */ } }
    if (modelsDir) {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsDir);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsDir);
        var tf = faceapi.tf; if (!tf) { try { tf = require("@tensorflow/tfjs-node"); } catch (e) { tf = null; } }
        if (tf) {
          for (var fi = 0; fi < imageData.length; fi++) {
            try {
              var faceResult = await sharp(imageData[fi].path, { failOn: "none" }).resize(640, 640, { fit: "inside", withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
              var faceTensor = tf.tensor3d(new Uint8Array(faceResult.data), [faceResult.info.height, faceResult.info.width, 3]);
              var detections = await faceapi.detectAllFaces(faceTensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceLandmarks();
              faceTensor.dispose();
              var faces = [];
              for (var di = 0; di < detections.length; di++) {
                var det = detections[di]; var box = det.detection.box; var landmarks = det.landmarks.positions;
                var leftEAR = 0, rightEAR = 0, avgEAR = 0, eyesClosed = false;
                if (landmarks && landmarks.length >= 68) {
                  var dist = function(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)); };
                  var le = landmarks.slice(36, 42); if (le.length === 6) leftEAR = (dist(le[1], le[5]) + dist(le[2], le[4])) / (2 * dist(le[0], le[3]));
                  var re = landmarks.slice(42, 48); if (re.length === 6) rightEAR = (dist(re[1], re[5]) + dist(re[2], re[4])) / (2 * dist(re[0], re[3]));
                  avgEAR = (leftEAR + rightEAR) / 2; eyesClosed = avgEAR > 0 && avgEAR < earThreshold;
                }
                faces.push({ box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }, confidence: Math.round(det.detection.score * 1000) / 1000, leftEAR: Math.round(leftEAR * 1000) / 1000, rightEAR: Math.round(rightEAR * 1000) / 1000, avgEAR: Math.round(avgEAR * 1000) / 1000, eyesClosed: eyesClosed });
              }
              imageData[fi].faces = faces;
              imageData[fi].eyesClosedFlag = faces.some(function(f) { return f.eyesClosed; });
            } catch (e) { /* face detection failed */ }
          }
        }
      } catch (e) { /* model loading failed */ }
    }
  }
}

// Stage 5: Group by timestamp
imageData.sort(function(a, b) { var ta = a.exif.dateTakenMs; var tb = b.exif.dateTakenMs; if (ta == null && tb == null) return 0; if (ta == null) return 1; if (tb == null) return -1; return ta - tb; });

var groups = [];
var currentGroup = [imageData[0]];
for (var gi = 1; gi < imageData.length; gi++) {
  var tPrev = imageData[gi - 1].exif.dateTakenMs;
  var tCurr = imageData[gi].exif.dateTakenMs;
  var gap = (tPrev != null && tCurr != null) ? Math.abs(tCurr - tPrev) : Infinity;
  if (gap <= burstThresholdMs) { currentGroup.push(imageData[gi]); } else { groups.push(currentGroup); currentGroup = [imageData[gi]]; }
}
groups.push(currentGroup);

// Stage 6: Rank within groups
var sessionGroups = [];
for (var gri = 0; gri < groups.length; gri++) {
  var grp = groups[gri];
  grp.sort(function(a, b) { return (b.sharpnessScore || 0) - (a.sharpnessScore || 0); });
  var maxScore = grp[0].sharpnessScore || 0;
  var minScore = grp[grp.length - 1].sharpnessScore || 0;
  var scoreRange = maxScore - minScore;
  var groupType = grp.length === 1 ? "single" : "burst";
  var captureTime = null;
  for (var ct = 0; ct < grp.length; ct++) { if (grp[ct].exif.dateTaken) { captureTime = grp[ct].exif.dateTaken; break; } }
  var groupId = "G" + String(gri + 1).padStart(3, "0");

  for (var ri = 0; ri < grp.length; ri++) {
    var rimg = grp[ri];
    rimg.isSharpest = ri === 0;
    rimg.blurFlag = (rimg.sharpnessScore || 0) < blurThreshold;
    rimg.sharpnessNormalized = scoreRange > 0 ? Math.round(((rimg.sharpnessScore - minScore) / scoreRange) * 100) : (rimg.sharpnessScore >= blurThreshold ? 100 : 0);
    if (grp.length === 1) {
      if (rimg.blurFlag) { rimg.autoSuggestion = "reject"; rimg.autoReason = "Blurry (score: " + Math.round(rimg.sharpnessScore) + ")"; }
      else if (rimg.eyesClosedFlag) { rimg.autoSuggestion = "reject"; rimg.autoReason = "Eyes closed detected"; }
      else { rimg.autoSuggestion = "approve"; rimg.autoReason = "Single image, no issues"; }
    } else if (rimg.isSharpest) {
      if (rimg.eyesClosedFlag) { rimg.autoSuggestion = null; rimg.autoReason = "Sharpest but eyes closed"; }
      else { rimg.autoSuggestion = "approve"; rimg.autoReason = "Sharpest in burst of " + grp.length; }
    } else if (rimg.blurFlag) { rimg.autoSuggestion = "reject"; rimg.autoReason = "Blurry (score: " + Math.round(rimg.sharpnessScore) + ")"; }
    else if (rimg.eyesClosedFlag) { rimg.autoSuggestion = "reject"; rimg.autoReason = "Eyes closed"; }
    else { rimg.autoSuggestion = "reject"; rimg.autoReason = "Superseded by sharper image"; }
  }

  sessionGroups.push({ groupId: groupId, captureTime: captureTime, groupType: groupType, imageCount: grp.length, images: grp });
}

// Build session
var blurFlagged = 0, eyesClosedFlagged = 0;
for (var sti = 0; sti < sessionGroups.length; sti++) {
  for (var stj = 0; stj < sessionGroups[sti].images.length; stj++) {
    if (sessionGroups[sti].images[stj].blurFlag) blurFlagged++;
    if (sessionGroups[sti].images[stj].eyesClosedFlag) eyesClosedFlagged++;
  }
}

var session = {
  sessionId: crypto.randomUUID(), folderPath: folderPath, createdAt: Date.now(),
  settings: { burstThresholdMs: burstThresholdMs, blurThreshold: blurThreshold, earThreshold: earThreshold, skipFaces: skipFaces },
  totalImages: imageData.length, totalGroups: sessionGroups.length,
  stats: { approved: 0, rejected: 0, pending: imageData.length, blurFlagged: blurFlagged, eyesClosedFlagged: eyesClosedFlagged },
  groups: sessionGroups, undoStack: [], currentGroupIndex: 0, currentImageIndex: 0
};

try { var tempPath = sessionPath + ".tmp"; fs.writeFileSync(tempPath, JSON.stringify(session, null, 2), "utf-8"); fs.renameSync(tempPath, sessionPath); } catch (e) { /* non-fatal */ }

await ctx.store.set("currentSessionPath", sessionPath);
await ctx.store.set("currentSessionId", session.sessionId);

session.tool = TOOL;
session.message = "Scanned " + imageData.length + " images into " + sessionGroups.length + " groups (" + blurFlagged + " blur-flagged" + (skipFaces ? ", face detection skipped" : "") + ")";
return { content: [{ type: "text", text: JSON.stringify(session) }] };

// ── Inline EXIF parser (used when engine not available) ──
function parseExifBufferInline(buf) {
  if (!buf || buf.length < 14) return null;
  try {
    var offset = 0;
    if (buf[0] === 0x45 && buf[1] === 0x78 && buf[2] === 0x69 && buf[3] === 0x66) offset = 6;
    var tiffStart = offset;
    var bo = buf.readUInt16BE(offset);
    var littleEndian = (bo === 0x4949);
    if (bo !== 0x4949 && bo !== 0x4D4D) return null;
    var magic = littleEndian ? buf.readUInt16LE(offset + 2) : buf.readUInt16BE(offset + 2);
    if (magic !== 42) return null;
    var ifd0Offset = littleEndian ? buf.readUInt32LE(offset + 4) : buf.readUInt32BE(offset + 4);
    var result = {};
    var TAGS = { 0x010F: "make", 0x0110: "model", 0x0112: "orientation", 0x8769: "exifIFDPointer", 0x9003: "dateTimeOriginal", 0x9004: "createDate", 0x9291: "subSecTimeOriginal", 0x8827: "iso", 0x829A: "exposureTime", 0x829D: "fNumber", 0x920A: "focalLength", 0xA002: "imageWidth", 0xA003: "imageHeight" };
    var TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 12: 8 };
    function readU16(b, o) { return littleEndian ? b.readUInt16LE(o) : b.readUInt16BE(o); }
    function readU32(b, o) { return littleEndian ? b.readUInt32LE(o) : b.readUInt32BE(o); }
    function readS32(b, o) { return littleEndian ? b.readInt32LE(o) : b.readInt32BE(o); }
    function parseIFD(ifdOff) {
      if (ifdOff + 2 > buf.length) return;
      var count = readU16(buf, ifdOff);
      if (count > 200) return;
      for (var i = 0; i < count; i++) {
        var eOff = ifdOff + 2 + (i * 12);
        if (eOff + 12 > buf.length) break;
        var tag = readU16(buf, eOff);
        var type = readU16(buf, eOff + 2);
        var cnt = readU32(buf, eOff + 4);
        var tagName = TAGS[tag]; if (!tagName) continue;
        var typeSize = TYPE_SIZES[type] || 0;
        var totalBytes = typeSize * cnt;
        var dOff = eOff + 8;
        if (totalBytes > 4) dOff = tiffStart + readU32(buf, eOff + 8);
        if (dOff + totalBytes > buf.length) continue;
        var val = null;
        if (type === 2) { val = buf.slice(dOff, dOff + cnt).toString("ascii").replace(/\0+$/, "").trim(); }
        else if (type === 3) { val = readU16(buf, dOff); }
        else if (type === 4) { val = readU32(buf, dOff); }
        else if (type === 5) { var num = readU32(buf, dOff), den = readU32(buf, dOff + 4); val = den !== 0 ? num / den : 0; }
        else if (type === 9) { val = readS32(buf, dOff); }
        else if (type === 10) { var sn = readS32(buf, dOff), sd = readS32(buf, dOff + 4); val = sd !== 0 ? sn / sd : 0; }
        else if (type === 1 || type === 7) { val = cnt === 1 ? buf[dOff] : null; }
        if (val !== null) result[tagName] = val;
      }
    }
    parseIFD(tiffStart + ifd0Offset);
    if (result.exifIFDPointer) { parseIFD(tiffStart + result.exifIFDPointer); delete result.exifIFDPointer; }
    return result;
  } catch (e) { return null; }
}
