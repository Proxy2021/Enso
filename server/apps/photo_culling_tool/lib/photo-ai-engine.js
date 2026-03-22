/**
 * photo-ai-engine.js — Core AI backend for photo culling.
 *
 * Provides: EXIF parsing (from sharp raw buffer), perceptual hashing,
 * Laplacian sharpness analysis, face detection (multi-backend),
 * batch processing with memory management.
 *
 * Dependencies: sharp (required), @vladmandic/face-api (optional)
 * All other processing uses Node.js built-ins.
 *
 * CommonJS module — designed to be require()'d from Enso app executors.
 */

"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

// ── Sharp loader (lazy, cached) ──

var _sharp = null;
function getSharp() {
  if (_sharp) return _sharp;
  try { _sharp = require("sharp"); } catch (e) { _sharp = null; }
  return _sharp;
}

// ────────────────────────────────────────────────────────
// 1. EXIF PARSER — Extracts EXIF from sharp's raw buffer
// ────────────────────────────────────────────────────────

/**
 * Parse EXIF metadata from a sharp metadata.exif Buffer.
 * Falls back to sharp .metadata() dimensions if EXIF buffer is absent.
 *
 * @param {string} imagePath - Absolute path to image file
 * @returns {Promise<object>} Normalized EXIF object
 */
async function extractExif(imagePath) {
  var sharp = getSharp();
  if (!sharp) return buildEmptyExif();

  try {
    var meta = await sharp(imagePath, { failOn: "none" }).metadata();
    var exif = buildEmptyExif();

    // Always capture dimensions and orientation from sharp metadata
    exif.width = meta.width || null;
    exif.height = meta.height || null;
    exif.orientation = meta.orientation || 1;

    // Parse the raw EXIF buffer if present
    if (meta.exif && meta.exif.length > 0) {
      var parsed = parseExifBuffer(meta.exif);
      if (parsed) {
        exif.cameraMake = parsed.make || null;
        exif.cameraModel = parsed.model || null;
        exif.dateTaken = parsed.dateTimeOriginal || parsed.createDate || null;
        exif.dateTakenMs = parseDateToMs(exif.dateTaken, parsed.subSecTimeOriginal);
        exif.subSecTime = parsed.subSecTimeOriginal || null;
        exif.iso = parsed.iso || null;
        exif.shutterSpeed = parsed.exposureTime ? formatShutterSpeed(parsed.exposureTime) : null;
        exif.aperture = parsed.fNumber ? ("f/" + parsed.fNumber) : null;
        exif.focalLength = parsed.focalLength ? (parsed.focalLength + "mm") : null;
        if (parsed.orientation) exif.orientation = parsed.orientation;
        if (parsed.imageWidth) exif.width = parsed.imageWidth;
        if (parsed.imageHeight) exif.height = parsed.imageHeight;
      }
    }

    return exif;
  } catch (e) {
    return buildEmptyExif();
  }
}

function buildEmptyExif() {
  return {
    cameraMake: null, cameraModel: null, dateTaken: null, dateTakenMs: null,
    subSecTime: null, iso: null, shutterSpeed: null, aperture: null,
    focalLength: null, width: null, height: null, orientation: 1
  };
}

function formatShutterSpeed(exposureTime) {
  if (exposureTime >= 1) return exposureTime + "s";
  return "1/" + Math.round(1 / exposureTime) + "s";
}

function parseDateToMs(dateStr, subSec) {
  if (!dateStr) return null;
  // EXIF date format: "YYYY:MM:DD HH:MM:SS" or ISO
  var normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
  var ms = Date.parse(normalized);
  if (isNaN(ms)) return null;
  if (subSec) {
    var fraction = parseFloat("0." + subSec);
    if (!isNaN(fraction)) ms += fraction * 1000;
  }
  return ms;
}

// ── Minimal EXIF/TIFF parser ──

// EXIF tag IDs we care about
var EXIF_TAGS = {
  0x010F: "make",
  0x0110: "model",
  0x0112: "orientation",
  0x8769: "exifIFDPointer",    // Pointer to Exif sub-IFD
  0x9003: "dateTimeOriginal",
  0x9004: "createDate",
  0x9291: "subSecTimeOriginal",
  0x8827: "iso",
  0x829A: "exposureTime",
  0x829D: "fNumber",
  0x920A: "focalLength",
  0xA002: "imageWidth",
  0xA003: "imageHeight"
};

// EXIF data types and their byte sizes
var TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 12: 8 };

function parseExifBuffer(buf) {
  if (!buf || buf.length < 14) return null;

  try {
    var offset = 0;

    // Skip "Exif\0\0" header if present
    if (buf[0] === 0x45 && buf[1] === 0x78 && buf[2] === 0x69 && buf[3] === 0x66) {
      offset = 6;
    }

    // Read byte order
    var tiffStart = offset;
    var bo = buf.readUInt16BE(offset);
    var littleEndian = (bo === 0x4949); // "II"
    if (bo !== 0x4949 && bo !== 0x4D4D) return null; // "II" or "MM"

    // Verify TIFF magic
    var magic = readU16(buf, offset + 2, littleEndian);
    if (magic !== 42) return null;

    // Read IFD0 offset
    var ifd0Offset = readU32(buf, offset + 4, littleEndian);

    var result = {};

    // Parse IFD0
    parseIFD(buf, tiffStart, tiffStart + ifd0Offset, littleEndian, result);

    // Parse Exif sub-IFD if pointer found
    if (result.exifIFDPointer) {
      parseIFD(buf, tiffStart, tiffStart + result.exifIFDPointer, littleEndian, result);
      delete result.exifIFDPointer;
    }

    return result;
  } catch (e) {
    return null;
  }
}

function parseIFD(buf, tiffStart, ifdOffset, littleEndian, result) {
  if (ifdOffset + 2 > buf.length) return;

  var entryCount = readU16(buf, ifdOffset, littleEndian);
  if (entryCount > 200) return; // sanity check

  for (var i = 0; i < entryCount; i++) {
    var entryOffset = ifdOffset + 2 + (i * 12);
    if (entryOffset + 12 > buf.length) break;

    var tag = readU16(buf, entryOffset, littleEndian);
    var type = readU16(buf, entryOffset + 2, littleEndian);
    var count = readU32(buf, entryOffset + 4, littleEndian);
    var valueOffset = entryOffset + 8;

    var tagName = EXIF_TAGS[tag];
    if (!tagName) continue;

    var typeSize = TYPE_SIZES[type] || 0;
    var totalBytes = typeSize * count;

    // If data > 4 bytes, valueOffset is a pointer
    var dataOffset = valueOffset;
    if (totalBytes > 4) {
      dataOffset = tiffStart + readU32(buf, valueOffset, littleEndian);
    }

    if (dataOffset + totalBytes > buf.length) continue;

    // Read value based on type
    var value = readTagValue(buf, dataOffset, type, count, littleEndian);
    if (value !== null && value !== undefined) {
      result[tagName] = value;
    }
  }
}

function readTagValue(buf, offset, type, count, littleEndian) {
  switch (type) {
    case 1: // BYTE
    case 7: // UNDEFINED
      return count === 1 ? buf[offset] : buf.slice(offset, offset + count);
    case 2: // ASCII
      var str = buf.slice(offset, offset + count).toString("ascii");
      return str.replace(/\0+$/, "").trim();
    case 3: // SHORT
      return count === 1 ? readU16(buf, offset, littleEndian) : readU16(buf, offset, littleEndian);
    case 4: // LONG
      return readU32(buf, offset, littleEndian);
    case 5: // RATIONAL (two LONGs: numerator/denominator)
      var num = readU32(buf, offset, littleEndian);
      var den = readU32(buf, offset + 4, littleEndian);
      return den !== 0 ? num / den : 0;
    case 9: // SLONG
      return readS32(buf, offset, littleEndian);
    case 10: // SRATIONAL
      var snum = readS32(buf, offset, littleEndian);
      var sden = readS32(buf, offset + 4, littleEndian);
      return sden !== 0 ? snum / sden : 0;
    default:
      return null;
  }
}

function readU16(buf, offset, le) {
  return le ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
}

function readU32(buf, offset, le) {
  return le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
}

function readS32(buf, offset, le) {
  return le ? buf.readInt32LE(offset) : buf.readInt32BE(offset);
}


// ────────────────────────────────────────────────────────
// 2. PERCEPTUAL HASH — Visual similarity using sharp
// ────────────────────────────────────────────────────────

/**
 * Compute a perceptual hash (pHash) for an image.
 * Resizes to 8x8 grayscale, computes average threshold → 64-bit hash as hex.
 *
 * @param {string} imagePath - Absolute path to image
 * @returns {Promise<string|null>} 16-char hex string (64 bits) or null on failure
 */
async function computePHash(imagePath) {
  var sharp = getSharp();
  if (!sharp) return null;

  try {
    var result = await sharp(imagePath, { failOn: "none" })
      .resize(8, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    var pixels = result.data;
    if (pixels.length < 64) return null;

    // Compute average brightness
    var sum = 0;
    for (var i = 0; i < 64; i++) sum += pixels[i];
    var avg = sum / 64;

    // Build 64-bit hash: each bit = pixel above or below average
    var hashBits = new Uint8Array(8); // 8 bytes = 64 bits
    for (var b = 0; b < 64; b++) {
      if (pixels[b] > avg) {
        hashBits[Math.floor(b / 8)] |= (1 << (7 - (b % 8)));
      }
    }

    return Buffer.from(hashBits).toString("hex");
  } catch (e) {
    return null;
  }
}

/**
 * Compute Hamming distance between two hex-encoded perceptual hashes.
 *
 * @param {string} hash1 - 16-char hex string
 * @param {string} hash2 - 16-char hex string
 * @returns {number} Number of differing bits (0-64, lower = more similar)
 */
function pHashDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;

  var distance = 0;
  for (var i = 0; i < hash1.length; i++) {
    var a = parseInt(hash1[i], 16);
    var b = parseInt(hash2[i], 16);
    if (isNaN(a) || isNaN(b)) return 64;
    var xor = a ^ b;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}


// ────────────────────────────────────────────────────────
// 3. SHARPNESS ANALYSIS — Laplacian variance via sharp
// ────────────────────────────────────────────────────────

/**
 * Compute sharpness score using Laplacian variance.
 * Higher variance = sharper image.
 *
 * @param {string} imagePath - Absolute path to image
 * @param {object} [opts]
 * @param {number} [opts.maxDimension=1024] - Downscale longest edge
 * @returns {Promise<{score: number, width: number, height: number}>}
 */
async function computeSharpness(imagePath, opts) {
  var maxDim = (opts && opts.maxDimension) || 1024;
  var sharp = getSharp();
  if (!sharp) return { score: 0, width: 0, height: 0 };

  try {
    var resized = sharp(imagePath, { failOn: "none" })
      .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
      .grayscale();

    // Laplacian kernel: second-order derivative edge detector
    var laplacian = resized.convolve({
      width: 3, height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    });

    var bufResult = await laplacian.raw().toBuffer({ resolveWithObject: true });
    var pixels = bufResult.data;
    var n = pixels.length;

    if (n === 0) return { score: 0, width: bufResult.info.width, height: bufResult.info.height };

    // Compute variance in a single pass using Welford's algorithm for numerical stability
    var mean = 0;
    var m2 = 0;
    for (var i = 0; i < n; i++) {
      var delta = pixels[i] - mean;
      mean += delta / (i + 1);
      m2 += delta * (pixels[i] - mean);
    }
    var variance = m2 / n;

    return {
      score: Math.round(variance * 100) / 100,
      width: bufResult.info.width,
      height: bufResult.info.height
    };
  } catch (e) {
    return { score: 0, width: 0, height: 0 };
  }
}


// ────────────────────────────────────────────────────────
// 4. FACE DETECTION — Multi-backend with graceful degradation
// ────────────────────────────────────────────────────────

var _faceApiState = null; // { faceapi, tf, modelsLoaded }

/**
 * Initialize face detection backend (lazy singleton).
 * Tries @vladmandic/face-api, falls back gracefully.
 */
async function initFaceDetection() {
  if (_faceApiState !== null) return _faceApiState;

  var faceapi = null;
  try { faceapi = require("@vladmandic/face-api"); } catch (e) { /* not available */ }

  if (!faceapi) {
    _faceApiState = { available: false, reason: "face-api not installed" };
    return _faceApiState;
  }

  // Find model directory
  var modelsDir = null;
  var candidates = [
    path.resolve(process.cwd(), "node_modules", "@vladmandic", "face-api", "model"),
    path.resolve(process.cwd(), "models")
  ];
  for (var i = 0; i < candidates.length; i++) {
    try { fs.statSync(candidates[i]); modelsDir = candidates[i]; break; } catch (e) { /* try next */ }
  }

  if (!modelsDir) {
    _faceApiState = { available: false, reason: "face-api models not found" };
    return _faceApiState;
  }

  try {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsDir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsDir);
    var tf = faceapi.tf;
    if (!tf) { try { tf = require("@tensorflow/tfjs-node"); } catch (e) { tf = null; } }
    if (!tf) {
      _faceApiState = { available: false, reason: "TensorFlow backend not available" };
      return _faceApiState;
    }
    _faceApiState = { available: true, faceapi: faceapi, tf: tf };
    return _faceApiState;
  } catch (e) {
    _faceApiState = { available: false, reason: "model loading failed: " + e.message };
    return _faceApiState;
  }
}

/**
 * Detect faces in an image and compute Eye Aspect Ratio (EAR).
 *
 * @param {string} imagePath - Absolute path to image
 * @param {object} [opts]
 * @param {number} [opts.earThreshold=0.2] - EAR below this = eyes closed
 * @param {number} [opts.maxDimension=640] - Downscale for detection
 * @returns {Promise<{faces: Array, eyesClosedFlag: boolean, detectionMethod: string}>}
 */
async function detectFaces(imagePath, opts) {
  var earThreshold = (opts && opts.earThreshold) || 0.2;
  var maxDim = (opts && opts.maxDimension) || 640;
  var sharp = getSharp();

  if (!sharp) return { faces: [], eyesClosedFlag: false, detectionMethod: "none" };

  var state = await initFaceDetection();
  if (!state.available) {
    return { faces: [], eyesClosedFlag: false, detectionMethod: "unavailable", reason: state.reason };
  }

  try {
    var bufResult = await sharp(imagePath, { failOn: "none" })
      .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    var tensor = state.tf.tensor3d(
      new Uint8Array(bufResult.data),
      [bufResult.info.height, bufResult.info.width, 3]
    );

    var detections = await state.faceapi
      .detectAllFaces(tensor, new state.faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks();

    tensor.dispose();

    var faces = [];
    for (var di = 0; di < detections.length; di++) {
      var det = detections[di];
      var box = det.detection.box;
      var landmarks = det.landmarks.positions;
      var ear = computeEAR(landmarks, earThreshold);

      faces.push({
        box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
        confidence: Math.round(det.detection.score * 1000) / 1000,
        leftEAR: ear.leftEAR,
        rightEAR: ear.rightEAR,
        avgEAR: ear.avgEAR,
        eyesClosed: ear.eyesClosed
      });
    }

    return {
      faces: faces,
      eyesClosedFlag: faces.some(function(f) { return f.eyesClosed; }),
      detectionMethod: "face-api"
    };
  } catch (e) {
    return { faces: [], eyesClosedFlag: false, detectionMethod: "error", reason: e.message };
  }
}

/**
 * Compute Eye Aspect Ratio from 68-point facial landmarks.
 * EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
 */
function computeEAR(landmarks, earThreshold) {
  if (!landmarks || landmarks.length < 68) {
    return { leftEAR: 0, rightEAR: 0, avgEAR: 0, eyesClosed: false };
  }

  var dist = function(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)); };

  // Left eye: landmarks 36-41
  var le = landmarks.slice(36, 42);
  var leftEAR = le.length === 6 ? (dist(le[1], le[5]) + dist(le[2], le[4])) / (2 * dist(le[0], le[3])) : 0;

  // Right eye: landmarks 42-47
  var re = landmarks.slice(42, 48);
  var rightEAR = re.length === 6 ? (dist(re[1], re[5]) + dist(re[2], re[4])) / (2 * dist(re[0], re[3])) : 0;

  var avgEAR = (leftEAR + rightEAR) / 2;

  return {
    leftEAR: Math.round(leftEAR * 1000) / 1000,
    rightEAR: Math.round(rightEAR * 1000) / 1000,
    avgEAR: Math.round(avgEAR * 1000) / 1000,
    eyesClosed: avgEAR > 0 && avgEAR < earThreshold
  };
}


// ────────────────────────────────────────────────────────
// 5. BATCH PROCESSOR — Memory-managed image analysis
// ────────────────────────────────────────────────────────

/**
 * Process a batch of images through the full analysis pipeline.
 * Handles: EXIF extraction, sharpness scoring, optional pHash, optional face detection.
 *
 * Processes in configurable batch sizes with explicit buffer cleanup
 * to prevent OOM on large shoots.
 *
 * @param {Array<{path: string, filename: string, ext: string, isRaw: boolean, sizeBytes: number}>} images
 * @param {object} [opts]
 * @param {number} [opts.batchSize=50] - Images per batch
 * @param {boolean} [opts.skipFaces=false] - Skip face detection
 * @param {boolean} [opts.computeHashes=true] - Compute pHash for visual grouping
 * @param {number} [opts.blurThreshold=50] - Sharpness below this = blurry
 * @param {number} [opts.earThreshold=0.2] - EAR below this = eyes closed
 * @param {number} [opts.maxSharpnessDim=1024] - Downscale for sharpness
 * @param {function} [opts.onProgress] - Progress callback({stage, current, total, message})
 * @returns {Promise<Array<object>>} Analyzed image objects
 */
async function batchAnalyze(images, opts) {
  opts = opts || {};
  var batchSize = opts.batchSize || 50;
  var skipFaces = opts.skipFaces || false;
  var computeHashes = opts.computeHashes !== false;
  var blurThreshold = opts.blurThreshold || 50;
  var earThreshold = opts.earThreshold || 0.2;
  var maxSharpnessDim = opts.maxSharpnessDim || 1024;
  var onProgress = opts.onProgress || null;

  var total = images.length;
  var results = [];
  var hasSharp = !!getSharp();

  for (var bStart = 0; bStart < total; bStart += batchSize) {
    var bEnd = Math.min(bStart + batchSize, total);
    var batch = images.slice(bStart, bEnd);

    for (var bi = 0; bi < batch.length; bi++) {
      var img = batch[bi];
      var idx = bStart + bi;

      // Stage 1: EXIF
      var exif = await extractExif(img.path);

      // Stage 2: Sharpness
      var sharpResult = hasSharp ? await computeSharpness(img.path, { maxDimension: maxSharpnessDim }) : { score: 0, width: 0, height: 0 };

      // Stage 3: pHash (optional)
      var pHash = (computeHashes && hasSharp) ? await computePHash(img.path) : null;

      // Stage 4: Face detection (optional)
      var faceResult = { faces: [], eyesClosedFlag: false, detectionMethod: "skipped" };
      if (!skipFaces) {
        faceResult = await detectFaces(img.path, { earThreshold: earThreshold, maxDimension: 640 });
      }

      // Fill in dimensions from sharpness analysis if EXIF didn't have them
      if (!exif.width && sharpResult.width) exif.width = sharpResult.width;
      if (!exif.height && sharpResult.height) exif.height = sharpResult.height;

      results.push({
        path: img.path,
        filename: img.filename,
        ext: img.ext,
        isRaw: img.isRaw,
        sizeBytes: img.sizeBytes,
        mediaUrl: "/media/" + Buffer.from(img.path).toString("base64url"),
        exif: exif,
        sharpnessScore: sharpResult.score,
        sharpnessNormalized: 0, // Normalized later in grouping phase
        isSharpest: false,       // Set later in grouping phase
        blurFlag: false,         // Set later in grouping phase
        pHash: pHash,
        faces: faceResult.faces,
        eyesClosedFlag: faceResult.eyesClosedFlag,
        faceDetectionMethod: faceResult.detectionMethod,
        status: "pending",
        decidedAt: null,
        autoSuggestion: null,
        autoReason: null
      });

      if (onProgress) {
        onProgress({
          stage: "analyzing",
          current: idx + 1,
          total: total,
          message: "Analyzing " + (idx + 1) + "/" + total + " — " + img.filename
        });
      }
    }

    // Explicit GC hint between batches (helps on large shoots)
    if (global.gc) {
      try { global.gc(); } catch (e) { /* gc not exposed */ }
    }
  }

  return results;
}


// ────────────────────────────────────────────────────────
// 6. GROUPING — Timestamp + pHash hybrid grouping
// ────────────────────────────────────────────────────────

/**
 * Group analyzed images by timestamp proximity with optional pHash verification.
 *
 * Algorithm:
 * 1. Sort by EXIF dateTakenMs (fallback: file mtime via filename order)
 * 2. Consecutive images within burstThresholdMs → same group
 * 3. Images without timestamps: group by pHash similarity (Hamming ≤ 10)
 * 4. Remaining singletons: each in their own group
 *
 * @param {Array<object>} analyzedImages - Output from batchAnalyze()
 * @param {object} [opts]
 * @param {number} [opts.burstThresholdMs=3000] - Max gap for timestamp grouping
 * @param {number} [opts.blurThreshold=50] - Sharpness below this = blur flag
 * @param {number} [opts.pHashMergeDistance=10] - Hamming distance for visual merge
 * @returns {Array<object>} Array of group objects
 */
function groupImages(analyzedImages, opts) {
  opts = opts || {};
  var burstThresholdMs = opts.burstThresholdMs || 3000;
  var blurThreshold = opts.blurThreshold || 50;
  var pHashMergeDistance = opts.pHashMergeDistance || 10;

  if (!analyzedImages || analyzedImages.length === 0) return [];

  // Separate images with and without timestamps
  var withTime = [];
  var noTime = [];
  for (var i = 0; i < analyzedImages.length; i++) {
    if (analyzedImages[i].exif && analyzedImages[i].exif.dateTakenMs != null) {
      withTime.push(analyzedImages[i]);
    } else {
      noTime.push(analyzedImages[i]);
    }
  }

  // Sort timestamped images
  withTime.sort(function(a, b) { return a.exif.dateTakenMs - b.exif.dateTakenMs; });

  // Group timestamped images by proximity
  var timeGroups = [];
  if (withTime.length > 0) {
    var currentGroup = [withTime[0]];
    for (var ti = 1; ti < withTime.length; ti++) {
      var gap = Math.abs(withTime[ti].exif.dateTakenMs - withTime[ti - 1].exif.dateTakenMs);
      if (gap <= burstThresholdMs) {
        currentGroup.push(withTime[ti]);
      } else {
        timeGroups.push(currentGroup);
        currentGroup = [withTime[ti]];
      }
    }
    timeGroups.push(currentGroup);
  }

  // Group non-timestamped images by pHash similarity
  var hashGroups = [];
  if (noTime.length > 0) {
    var assigned = new Array(noTime.length).fill(false);
    for (var hi = 0; hi < noTime.length; hi++) {
      if (assigned[hi]) continue;
      var group = [noTime[hi]];
      assigned[hi] = true;
      if (noTime[hi].pHash) {
        for (var hj = hi + 1; hj < noTime.length; hj++) {
          if (assigned[hj]) continue;
          if (noTime[hj].pHash && pHashDistance(noTime[hi].pHash, noTime[hj].pHash) <= pHashMergeDistance) {
            group.push(noTime[hj]);
            assigned[hj] = true;
          }
        }
      }
      hashGroups.push(group);
    }
  }

  // Merge all groups and build output
  var allRawGroups = timeGroups.concat(hashGroups);
  var groups = [];

  for (var gi = 0; gi < allRawGroups.length; gi++) {
    groups.push(buildGroupObject(allRawGroups[gi], gi + 1, blurThreshold));
  }

  return groups;
}

/**
 * Build a structured group object from a list of images.
 * Sorts by sharpness, normalizes scores, sets flags, generates auto-suggestions.
 */
function buildGroupObject(images, groupIndex, blurThreshold) {
  // Sort by sharpness descending
  images.sort(function(a, b) { return (b.sharpnessScore || 0) - (a.sharpnessScore || 0); });

  var maxScore = images[0].sharpnessScore || 0;
  var minScore = images[images.length - 1].sharpnessScore || 0;
  var scoreRange = maxScore - minScore;

  // Find capture time
  var captureTime = null;
  for (var ct = 0; ct < images.length; ct++) {
    if (images[ct].exif && images[ct].exif.dateTaken) {
      captureTime = images[ct].exif.dateTaken;
      break;
    }
  }

  // Determine group type
  var groupType = images.length === 1 ? "single" : "burst";

  // Apply ranking and flags
  for (var ri = 0; ri < images.length; ri++) {
    var img = images[ri];
    img.isSharpest = ri === 0;
    img.blurFlag = (img.sharpnessScore || 0) < blurThreshold;
    img.sharpnessNormalized = scoreRange > 0
      ? Math.round(((img.sharpnessScore - minScore) / scoreRange) * 100)
      : (img.sharpnessScore >= blurThreshold ? 100 : 0);

    // Auto-suggestion logic
    if (images.length === 1) {
      if (img.blurFlag) {
        img.autoSuggestion = "reject";
        img.autoReason = "Blurry (score: " + Math.round(img.sharpnessScore) + ")";
      } else if (img.eyesClosedFlag) {
        img.autoSuggestion = "reject";
        img.autoReason = "Eyes closed detected";
      } else {
        img.autoSuggestion = "approve";
        img.autoReason = "Single image, no issues";
      }
    } else if (img.isSharpest) {
      if (img.eyesClosedFlag) {
        img.autoSuggestion = null;
        img.autoReason = "Sharpest but eyes closed — review needed";
      } else {
        img.autoSuggestion = "approve";
        img.autoReason = "Sharpest in burst of " + images.length;
      }
    } else if (img.blurFlag) {
      img.autoSuggestion = "reject";
      img.autoReason = "Blurry (score: " + Math.round(img.sharpnessScore) + ")";
    } else if (img.eyesClosedFlag) {
      img.autoSuggestion = "reject";
      img.autoReason = "Eyes closed detected";
    } else {
      img.autoSuggestion = "reject";
      img.autoReason = "Superseded by sharper image";
    }
  }

  return {
    groupId: "G" + String(groupIndex).padStart(3, "0"),
    captureTime: captureTime,
    groupType: groupType,
    imageCount: images.length,
    images: images
  };
}


// ────────────────────────────────────────────────────────
// 7. SESSION BUILDER — Creates full session from analysis
// ────────────────────────────────────────────────────────

/**
 * Build a complete CullingSession from analyzed and grouped images.
 *
 * @param {string} folderPath - Shoot folder path
 * @param {Array<object>} groups - Output from groupImages()
 * @param {object} settings - User settings
 * @returns {object} CullingSession object ready for persistence
 */
function buildSession(folderPath, groups, settings) {
  var totalImages = 0;
  var blurFlagged = 0;
  var eyesClosedFlagged = 0;

  for (var gi = 0; gi < groups.length; gi++) {
    for (var ii = 0; ii < groups[gi].images.length; ii++) {
      totalImages++;
      if (groups[gi].images[ii].blurFlag) blurFlagged++;
      if (groups[gi].images[ii].eyesClosedFlag) eyesClosedFlagged++;
    }
  }

  return {
    sessionId: crypto.randomUUID(),
    folderPath: folderPath,
    createdAt: Date.now(),
    settings: settings,
    totalImages: totalImages,
    totalGroups: groups.length,
    stats: {
      approved: 0,
      rejected: 0,
      pending: totalImages,
      blurFlagged: blurFlagged,
      eyesClosedFlagged: eyesClosedFlagged
    },
    groups: groups,
    undoStack: [],
    currentGroupIndex: 0,
    currentImageIndex: 0
  };
}

/**
 * Recompute session statistics from groups.
 */
function recomputeStats(groups) {
  var approved = 0, rejected = 0, pending = 0, blurFlagged = 0, eyesClosedFlagged = 0;
  for (var gi = 0; gi < groups.length; gi++) {
    for (var ii = 0; ii < groups[gi].images.length; ii++) {
      var img = groups[gi].images[ii];
      if (img.status === "approved") approved++;
      else if (img.status === "rejected") rejected++;
      else pending++;
      if (img.blurFlag) blurFlagged++;
      if (img.eyesClosedFlag) eyesClosedFlagged++;
    }
  }
  return { approved: approved, rejected: rejected, pending: pending, blurFlagged: blurFlagged, eyesClosedFlagged: eyesClosedFlagged };
}

/**
 * Re-rank groups with new thresholds (no re-analysis, just re-score).
 */
function reRankGroups(groups, blurThreshold) {
  var result = [];
  for (var gi = 0; gi < groups.length; gi++) {
    var rawImages = groups[gi].images.map(function(img) {
      // Keep raw scores, reset computed flags
      return Object.assign({}, img, {
        isSharpest: false,
        blurFlag: false,
        sharpnessNormalized: 0,
        autoSuggestion: null,
        autoReason: null
      });
    });
    result.push(buildGroupObject(rawImages, gi + 1, blurThreshold));
  }
  return result;
}

/**
 * Persist session to disk using atomic write (temp file + rename).
 */
function saveSession(sessionPath, session) {
  var tempPath = sessionPath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(session, null, 2), "utf-8");
  fs.renameSync(tempPath, sessionPath);
}


// ────────────────────────────────────────────────────────
// 8. FILE DISCOVERY — Recursive image scan
// ────────────────────────────────────────────────────────

var IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".heic", ".heif", ".tiff", ".tif", ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"];
var RAW_EXTENSIONS = [".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"];
var SKIP_DIRS = [".git", "node_modules", "_approved", "_rejected", ".enso", ".openclaw"];

/**
 * Recursively discover image files in a directory.
 *
 * @param {string} dirPath - Directory to scan
 * @returns {Array<{path: string, filename: string, ext: string, isRaw: boolean, sizeBytes: number}>}
 */
function discoverImages(dirPath) {
  var results = [];
  try {
    var entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && SKIP_DIRS.indexOf(entry.name) === -1) {
          results = results.concat(discoverImages(fullPath));
        }
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


// ────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────

module.exports = {
  // EXIF
  extractExif: extractExif,
  parseExifBuffer: parseExifBuffer,
  buildEmptyExif: buildEmptyExif,

  // Perceptual hash
  computePHash: computePHash,
  pHashDistance: pHashDistance,

  // Sharpness
  computeSharpness: computeSharpness,

  // Face detection
  detectFaces: detectFaces,
  computeEAR: computeEAR,

  // Batch processing
  batchAnalyze: batchAnalyze,

  // Grouping
  groupImages: groupImages,
  buildGroupObject: buildGroupObject,

  // Session
  buildSession: buildSession,
  recomputeStats: recomputeStats,
  reRankGroups: reRankGroups,
  saveSession: saveSession,

  // File discovery
  discoverImages: discoverImages,
  IMAGE_EXTENSIONS: IMAGE_EXTENSIONS,
  RAW_EXTENSIONS: RAW_EXTENSIONS
};
