#!/usr/bin/env node
/**
 * analyze.mjs — Unified photo analysis pipeline for the Enso photo culling tool.
 *
 * Scans a folder, reads EXIF timestamps, computes perceptual hashes, measures
 * sharpness via Laplacian variance, groups shots into bursts (by timestamp
 * proximity AND perceptual hash distance), detects faces, flags eyes-closed
 * and blurry frames, and outputs a structured CullSession JSON.
 *
 * Usage:
 *   echo '{"folderPath":"/path/to/shoot"}' | node analyze.mjs
 *   node analyze.mjs --folder /path/to/shoot --burst-threshold 2000
 *
 * stdin JSON (all optional except folderPath):
 *   {
 *     "folderPath": "/path/to/shoot",
 *     "recursive": true,
 *     "burstThresholdMs": 2000,
 *     "blurThreshold": 50,
 *     "earThreshold": 0.2,
 *     "skipFaces": false,
 *     "pHashThreshold": 10,
 *     "concurrency": 4,
 *     "outputPath": null
 *   }
 *
 * stdout JSON: Full CullSession object with groups, rankings, pHash data, and stats.
 *
 * Progress reported to stderr as JSON lines:
 *   { "stage": "...", "current": N, "total": N, "percent": N, "message": "..." }
 *
 * Dependencies: sharp (required), exifr (optional), @vladmandic/face-api (optional)
 *
 * @module analyze
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".heic", ".heif",
  ".tiff", ".tif",
  ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"
]);

const RAW_EXTENSIONS = new Set([
  ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"
]);

// Formats sharp can natively process (RAW files may need dcraw/libraw)
const SHARP_NATIVE = new Set([
  ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".heic", ".heif"
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progress(data) {
  process.stderr.write(JSON.stringify(data) + "\n");
}

function fatal(message, details) {
  process.stdout.write(JSON.stringify({
    error: message,
    ...details
  }) + "\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Stage 1: Discover image files
// ---------------------------------------------------------------------------

/**
 * Recursively discover image files in a folder.
 * Skips hidden directories, _rejected, node_modules, .culling-cache.
 *
 * @param {string} dirPath - Root directory to scan
 * @param {boolean} recursive - Whether to recurse into subdirectories
 * @returns {Promise<Array<{path: string, filename: string, ext: string, isRaw: boolean, sizeBytes: number}>>}
 */
async function discoverImages(dirPath, recursive = true) {
  const results = [];
  const SKIP_DIRS = new Set(["_rejected", "node_modules", ".culling-cache", ".git", "__pycache__"]);

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      // Skip unreadable directories
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !SKIP_DIRS.has(entry.name) && recursive) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
          try {
            const stat = await fs.stat(fullPath);
            results.push({
              path: fullPath,
              filename: entry.name,
              ext,
              isRaw: RAW_EXTENSIONS.has(ext),
              sizeBytes: stat.size
            });
          } catch (e) {
            // Skip unreadable files
          }
        }
      }
    }
  }

  await walk(dirPath);
  results.sort((a, b) => a.filename.localeCompare(b.filename));
  return results;
}

// ---------------------------------------------------------------------------
// Stage 2: EXIF extraction
// ---------------------------------------------------------------------------

/**
 * Extract EXIF metadata from images using exifr (graceful fallback).
 *
 * @param {Array<object>} images - Image objects from discoverImages
 * @param {number} concurrency - Concurrent EXIF reads
 * @returns {Promise<Array<object>>} - Images enriched with .exif
 */
async function extractExif(images, concurrency = 8) {
  let exifr;
  try {
    exifr = await import("exifr");
    exifr = exifr.default || exifr;
  } catch (e) {
    // exifr not available — assign null EXIF to all images
    progress({ stage: "exif", message: "exifr not available, using file metadata only" });
    return images.map(img => ({
      ...img,
      exif: {
        cameraMake: null, cameraModel: null, dateTaken: null,
        dateTakenMs: null, subSecTime: null, iso: null,
        shutterSpeed: null, aperture: null, focalLength: null,
        width: null, height: null, orientation: 1
      }
    }));
  }

  const total = images.length;
  const results = [];

  for (let i = 0; i < total; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async (img) => {
      const exif = {
        cameraMake: null, cameraModel: null, dateTaken: null,
        dateTakenMs: null, subSecTime: null, iso: null,
        shutterSpeed: null, aperture: null, focalLength: null,
        width: null, height: null, orientation: 1
      };

      try {
        const raw = await exifr.parse(img.path, {
          pick: [
            "DateTimeOriginal", "SubSecTimeOriginal", "CreateDate", "SubSecTime",
            "Make", "Model", "ISO", "ExposureTime", "FNumber", "FocalLength",
            "ImageWidth", "ImageHeight", "ExifImageWidth", "ExifImageHeight",
            "Orientation"
          ]
        });

        if (raw) {
          const dateRaw = raw.DateTimeOriginal || raw.CreateDate;
          const subSec = raw.SubSecTimeOriginal || raw.SubSecTime || "";

          if (dateRaw instanceof Date) {
            exif.dateTaken = dateRaw.toISOString();
            exif.dateTakenMs = dateRaw.getTime();
            if (subSec) {
              const fraction = parseFloat("0." + subSec);
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
      } catch (e) {
        // EXIF read failed — use defaults
      }

      return { ...img, exif };
    }));

    results.push(...batchResults);
    progress({
      stage: "exif",
      stageNumber: 2,
      totalStages: 7,
      current: Math.min(i + concurrency, total),
      total,
      percent: 5 + Math.round(((Math.min(i + concurrency, total)) / total) * 15),
      message: `Reading EXIF... ${Math.min(i + concurrency, total)}/${total}`
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Stage 3: Sharpness analysis (Laplacian variance)
// ---------------------------------------------------------------------------

/**
 * Compute sharpness score using Laplacian variance.
 *
 * Method: grayscale -> resize to maxDimension -> apply 3x3 Laplacian kernel -> variance.
 * Higher variance = sharper image.
 *
 * @param {object} sharp - Pre-loaded sharp module
 * @param {string} imagePath - Path to image
 * @param {number} maxDimension - Downscale longest edge
 * @returns {Promise<{sharpnessScore: number, width: number, height: number}>}
 */
async function computeSharpness(sharp, imagePath, maxDimension = 1024) {
  try {
    const resized = sharp(imagePath, { failOn: "none" })
      .resize(maxDimension, maxDimension, { fit: "inside", withoutEnlargement: true })
      .grayscale();

    // Laplacian kernel: second-order derivative edge detector
    // [-1, -1, -1]
    // [-1,  8, -1]
    // [-1, -1, -1]
    const laplacian = resized.convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    });

    const { data, info } = await laplacian.raw().toBuffer({ resolveWithObject: true });
    const n = data.length;

    if (n === 0) {
      return { sharpnessScore: 0, width: info.width, height: info.height };
    }

    // Compute mean
    let sum = 0;
    for (let i = 0; i < n; i++) sum += data[i];
    const mean = sum / n;

    // Compute variance
    let varianceSum = 0;
    for (let i = 0; i < n; i++) {
      const diff = data[i] - mean;
      varianceSum += diff * diff;
    }

    return {
      sharpnessScore: Math.round((varianceSum / n) * 100) / 100,
      width: info.width,
      height: info.height
    };
  } catch (e) {
    return { sharpnessScore: 0, width: 0, height: 0, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Stage 4: Perceptual hash (average hash via sharp)
// ---------------------------------------------------------------------------

/**
 * Compute perceptual hash (average hash) for an image.
 *
 * Method: resize to 8x8 -> grayscale -> compute mean -> each pixel above mean = 1 bit.
 * Produces a 64-bit hash encoded as a 16-character hex string.
 *
 * @param {object} sharp - Pre-loaded sharp module
 * @param {string} imagePath - Path to image
 * @returns {Promise<string|null>} - 16-character hex string, or null on failure
 */
async function computePHash(sharp, imagePath) {
  try {
    const { data } = await sharp(imagePath, { failOn: "none" })
      .resize(8, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (data.length !== 64) return null;

    // Compute mean pixel value
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += data[i];
    const mean = sum / 64;

    // Generate 64-bit hash: each bit is 1 if pixel >= mean
    let hash = "";
    for (let i = 0; i < 64; i += 4) {
      let nibble = 0;
      for (let b = 0; b < 4 && (i + b) < 64; b++) {
        if (data[i + b] >= mean) nibble |= (1 << (3 - b));
      }
      hash += nibble.toString(16);
    }

    return hash;
  } catch (e) {
    return null;
  }
}

/**
 * Compute Hamming distance between two hex-encoded perceptual hashes.
 *
 * @param {string} hash1 - Hex-encoded pHash
 * @param {string} hash2 - Hex-encoded pHash
 * @returns {number} - Number of differing bits (0 = identical, 64 = max distance)
 */
function pHashDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const a = parseInt(hash1[i], 16);
    const b = parseInt(hash2[i], 16);
    if (isNaN(a) || isNaN(b)) return 64;
    let xor = a ^ b;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

// ---------------------------------------------------------------------------
// Stage 5: Burst grouping (timestamp + pHash)
// ---------------------------------------------------------------------------

/**
 * Group images into bursts using timestamp proximity AND perceptual hash distance.
 *
 * Algorithm:
 * 1. Sort images by EXIF DateTimeOriginal (with subsecond precision)
 * 2. Consecutive images within burstThresholdMs of each other => candidate group
 * 3. Within candidate groups, split if pHash distance > pHashThreshold
 * 4. Images without timestamps form individual groups
 *
 * @param {Array<object>} images - Images with .exif.dateTakenMs and .pHash
 * @param {object} options
 * @param {number} options.burstThresholdMs - Timestamp window (default 2000ms)
 * @param {number} options.pHashThreshold - Max hash distance for same burst (default 10)
 * @returns {Array<Array<object>>} - Array of groups, each an array of images
 */
function groupByBurst(images, { burstThresholdMs = 2000, pHashThreshold = 10 } = {}) {
  if (images.length === 0) return [];

  // Sort by timestamp, nulls at end
  const sorted = [...images].sort((a, b) => {
    const ta = a.exif?.dateTakenMs;
    const tb = b.exif?.dateTakenMs;
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });

  // Phase 1: Group by timestamp proximity
  const timestampGroups = [];
  let currentGroup = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const tPrev = sorted[i - 1].exif?.dateTakenMs;
    const tCurr = sorted[i].exif?.dateTakenMs;
    const gap = (tPrev != null && tCurr != null) ? Math.abs(tCurr - tPrev) : Infinity;

    if (gap <= burstThresholdMs) {
      currentGroup.push(sorted[i]);
    } else {
      timestampGroups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  timestampGroups.push(currentGroup);

  // Phase 2: Split timestamp groups by pHash distance
  const finalGroups = [];
  for (const group of timestampGroups) {
    if (group.length <= 1 || pHashThreshold <= 0) {
      finalGroups.push(group);
      continue;
    }

    // Check pHash distances within the group
    let subGroup = [group[0]];
    for (let i = 1; i < group.length; i++) {
      const h1 = group[i - 1].pHash;
      const h2 = group[i].pHash;

      // If both have pHash and distance exceeds threshold, split
      if (h1 && h2 && pHashDistance(h1, h2) > pHashThreshold) {
        finalGroups.push(subGroup);
        subGroup = [group[i]];
      } else {
        subGroup.push(group[i]);
      }
    }
    finalGroups.push(subGroup);
  }

  return finalGroups;
}

// ---------------------------------------------------------------------------
// Stage 6: Face detection & Eye Aspect Ratio (EAR)
// ---------------------------------------------------------------------------

/**
 * Compute Eye Aspect Ratio from 68-point facial landmarks.
 *
 * EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
 * Left eye: landmarks 36-41, Right eye: landmarks 42-47
 *
 * @param {Array<{x: number, y: number}>} landmarks - 68-point face landmarks
 * @param {number} earThreshold - EAR below this means eyes closed
 * @returns {{leftEAR: number, rightEAR: number, avgEAR: number, eyesClosed: boolean}}
 */
function computeEAR(landmarks, earThreshold = 0.2) {
  if (!landmarks || landmarks.length < 68) {
    return { leftEAR: 0, rightEAR: 0, avgEAR: 0, eyesClosed: false };
  }

  const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  const le = landmarks.slice(36, 42);
  const leftEAR = le.length === 6
    ? (dist(le[1], le[5]) + dist(le[2], le[4])) / (2 * dist(le[0], le[3]))
    : 0;

  const re = landmarks.slice(42, 48);
  const rightEAR = re.length === 6
    ? (dist(re[1], re[5]) + dist(re[2], re[4])) / (2 * dist(re[0], re[3]))
    : 0;

  const avgEAR = (leftEAR + rightEAR) / 2;

  return {
    leftEAR: Math.round(leftEAR * 1000) / 1000,
    rightEAR: Math.round(rightEAR * 1000) / 1000,
    avgEAR: Math.round(avgEAR * 1000) / 1000,
    eyesClosed: avgEAR > 0 && avgEAR < earThreshold
  };
}

/**
 * Detect faces in an image and flag eyes-closed using EAR.
 *
 * Uses @vladmandic/face-api with SSD MobileNet + 68-point landmarks.
 * Gracefully returns empty array if face-api or models are unavailable.
 *
 * @param {object} faceApiState - Pre-initialized face-api state
 * @param {object} sharp - Pre-loaded sharp module
 * @param {string} imagePath - Path to image
 * @param {number} earThreshold - EAR threshold for eyes-closed
 * @returns {Promise<Array<{box: object, confidence: number, leftEAR: number, rightEAR: number, avgEAR: number, eyesClosed: boolean}>>}
 */
async function detectFaces(faceApiState, sharp, imagePath, earThreshold = 0.2) {
  if (!faceApiState || !faceApiState.modelsLoaded) return [];

  const { faceapi } = faceApiState;

  try {
    const { data, info } = await sharp(imagePath, { failOn: "none" })
      .resize(640, 640, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const tf = faceapi.tf || (await import("@tensorflow/tfjs-node")).default;
    const tensor = tf.tensor3d(
      new Uint8Array(data),
      [info.height, info.width, 3]
    );

    const detections = await faceapi
      .detectAllFaces(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks();

    tensor.dispose();

    return detections.map(d => {
      const box = d.detection.box;
      const landmarks = d.landmarks.positions;
      const ear = computeEAR(landmarks, earThreshold);

      return {
        box: {
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height)
        },
        confidence: Math.round(d.detection.score * 1000) / 1000,
        leftEAR: ear.leftEAR,
        rightEAR: ear.rightEAR,
        avgEAR: ear.avgEAR,
        eyesClosed: ear.eyesClosed
      };
    });
  } catch (e) {
    return [];
  }
}

/**
 * Initialize face-api models (singleton).
 */
async function initFaceApi() {
  let faceapi;
  try {
    const mod = await import("@vladmandic/face-api");
    faceapi = mod.default || mod;
  } catch (e) {
    return { faceapi: null, modelsLoaded: false };
  }

  // Search for model files in common locations
  const candidates = [
    path.resolve(process.cwd(), "node_modules", "@vladmandic", "face-api", "model"),
    path.resolve(process.cwd(), "models"),
  ];

  for (const dir of candidates) {
    try {
      await fs.access(dir);
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(dir);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(dir);
      return { faceapi, modelsLoaded: true };
    } catch {
      continue;
    }
  }

  progress({ stage: "faces", message: "Face-api models not found. Face detection skipped." });
  return { faceapi, modelsLoaded: false };
}

// ---------------------------------------------------------------------------
// Stage 7: Ranking & auto-suggestions
// ---------------------------------------------------------------------------

/**
 * Build a ranked group from images, generating auto-suggestions.
 *
 * @param {Array<object>} groupImages - Images in this group
 * @param {number} groupIndex - 1-based index
 * @param {number} blurThreshold - Sharpness below this = blur flag
 * @returns {object} - CullGroup object
 */
function buildGroup(groupImages, groupIndex, blurThreshold) {
  // Sort by sharpness descending
  const sorted = [...groupImages].sort((a, b) => (b.sharpnessScore || 0) - (a.sharpnessScore || 0));

  const scores = sorted.map(img => img.sharpnessScore || 0);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const scoreRange = maxScore - minScore;

  // Determine group type
  let groupType = "single";
  if (sorted.length > 1) {
    const firstTs = sorted[0].exif?.dateTakenMs;
    const lastTs = sorted[sorted.length - 1].exif?.dateTakenMs;
    if (firstTs != null && lastTs != null && Math.abs(lastTs - firstTs) < 2000) {
      groupType = "burst";
    } else {
      groupType = "similar";
    }
  }

  // Earliest capture time
  const timestamps = sorted.filter(img => img.exif?.dateTaken).map(img => img.exif.dateTaken);
  const captureTime = timestamps.length > 0 ? timestamps[0] : null;

  const groupId = `G${String(groupIndex).padStart(3, "0")}`;

  const rankedImages = sorted.map((img, idx) => {
    const score = img.sharpnessScore || 0;
    const isSharpest = idx === 0;
    const blurFlag = score < blurThreshold;
    const normalized = scoreRange > 0
      ? Math.round(((score - minScore) / scoreRange) * 100)
      : (score >= blurThreshold ? 100 : 0);

    let autoSuggestion = null;
    let autoReason = null;

    if (sorted.length === 1) {
      if (blurFlag) {
        autoSuggestion = "reject";
        autoReason = `Blurry (score: ${Math.round(score)})`;
      } else if (img.eyesClosedFlag) {
        autoSuggestion = "reject";
        autoReason = "Eyes closed detected";
      } else {
        autoSuggestion = "approve";
        autoReason = "Single image, no issues detected";
      }
    } else if (isSharpest) {
      if (img.eyesClosedFlag) {
        autoSuggestion = null;
        autoReason = `Sharpest in burst of ${sorted.length} but eyes closed`;
      } else {
        autoSuggestion = "approve";
        autoReason = `Sharpest in burst of ${sorted.length}`;
      }
    } else if (blurFlag) {
      autoSuggestion = "reject";
      autoReason = `Blurry (score: ${Math.round(score)})`;
    } else if (img.eyesClosedFlag) {
      autoSuggestion = "reject";
      autoReason = "Eyes closed detected";
    } else {
      autoSuggestion = "reject";
      autoReason = `Superseded by sharper image (${Math.round(maxScore)} vs ${Math.round(score)})`;
    }

    return {
      path: img.path,
      filename: img.filename,
      ext: img.ext,
      isRaw: img.isRaw,
      sizeBytes: img.sizeBytes,
      sharpnessScore: img.sharpnessScore,
      sharpnessNormalized: normalized,
      isSharpest,
      blurFlag,
      eyesClosedFlag: img.eyesClosedFlag || false,
      faces: img.faces || [],
      pHash: img.pHash || null,
      exif: img.exif,
      status: "pending",
      decidedAt: null,
      autoSuggestion,
      autoReason
    };
  });

  return {
    groupId,
    captureTime,
    groupType,
    imageCount: rankedImages.length,
    images: rankedImages
  };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();

  // Parse options from stdin or CLI args
  let options = {};

  // Check for CLI arguments
  const args = process.argv.slice(2);
  const cliOptions = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--folder":
      case "--folderPath":
      case "-f":
        cliOptions.folderPath = args[++i];
        break;
      case "--burst-threshold":
        cliOptions.burstThresholdMs = parseInt(args[++i], 10);
        break;
      case "--blur-threshold":
        cliOptions.blurThreshold = parseInt(args[++i], 10);
        break;
      case "--ear-threshold":
        cliOptions.earThreshold = parseFloat(args[++i]);
        break;
      case "--phash-threshold":
        cliOptions.pHashThreshold = parseInt(args[++i], 10);
        break;
      case "--skip-faces":
        cliOptions.skipFaces = true;
        break;
      case "--concurrency":
        cliOptions.concurrency = parseInt(args[++i], 10);
        break;
      case "--output":
      case "-o":
        cliOptions.outputPath = args[++i];
        break;
      case "--no-recursive":
        cliOptions.recursive = false;
        break;
      case "--rescan":
        cliOptions.rescan = true;
        break;
    }
  }

  // Try reading stdin if not a TTY
  if (!process.stdin.isTTY) {
    try {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      const input = Buffer.concat(chunks).toString("utf-8").trim();
      if (input) options = JSON.parse(input);
    } catch (e) {
      // No valid stdin — use CLI args only
    }
  }

  // Merge CLI args over stdin (CLI takes precedence)
  options = { ...options, ...cliOptions };

  const folderPath = options.folderPath;
  const recursive = options.recursive !== false;
  const burstThresholdMs = options.burstThresholdMs || 2000;
  const blurThreshold = options.blurThreshold || 50;
  const earThreshold = options.earThreshold || 0.2;
  const skipFaces = options.skipFaces === true;
  const pHashThreshold = options.pHashThreshold || 10;
  const concurrency = options.concurrency || 4;
  const outputPath = options.outputPath || null;
  const rescan = options.rescan === true;

  if (!folderPath) {
    fatal("folderPath is required. Provide via stdin JSON or --folder CLI arg.");
  }

  // Resolve home directory
  const resolvedPath = folderPath.startsWith("~")
    ? path.join(process.env.HOME || process.env.USERPROFILE || "", folderPath.slice(1))
    : folderPath;

  // Verify folder exists
  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isDirectory()) {
      fatal(`Not a directory: ${resolvedPath}`);
    }
  } catch (e) {
    fatal(`Folder not found: ${resolvedPath}`, { originalError: e.message });
  }

  // Check for existing session
  const sessionFilePath = path.join(resolvedPath, ".enso-cull-session.json");
  if (!rescan) {
    try {
      const existing = JSON.parse(await fs.readFile(sessionFilePath, "utf-8"));
      progress({ stage: "resume", message: `Existing session found with ${existing.totalImages} images` });
      existing.resumed = true;
      process.stdout.write(JSON.stringify(existing, null, 2) + "\n");
      return;
    } catch (e) {
      // No existing session — proceed with scan
    }
  }

  // Load sharp (required)
  let sharp;
  try {
    const mod = await import("sharp");
    sharp = mod.default || mod;
  } catch (e) {
    fatal("sharp package is required but not found. Install with: npm install sharp");
  }

  // ==================== Stage 1: Discover images ====================
  progress({ stage: "discover", stageNumber: 1, totalStages: 7, percent: 0, message: "Scanning folder..." });
  const images = await discoverImages(resolvedPath, recursive);

  if (images.length === 0) {
    const empty = {
      sessionId: crypto.randomUUID(),
      folderPath: resolvedPath,
      createdAt: Date.now(),
      totalImages: 0,
      totalGroups: 0,
      groups: [],
      stats: { approved: 0, rejected: 0, pending: 0, blurFlagged: 0, eyesClosedFlagged: 0 },
      message: "No image files found in this folder.",
      elapsedMs: Date.now() - startTime
    };
    process.stdout.write(JSON.stringify(empty, null, 2) + "\n");
    return;
  }

  progress({
    stage: "discover", stageNumber: 1, totalStages: 7,
    current: images.length, total: images.length, percent: 5,
    message: `Found ${images.length} images`
  });

  // ==================== Stage 2: EXIF extraction ====================
  progress({ stage: "exif", stageNumber: 2, totalStages: 7, percent: 5, message: "Reading EXIF data..." });
  const withExif = await extractExif(images, concurrency);

  // ==================== Stage 3: Sharpness analysis ====================
  progress({ stage: "sharpness", stageNumber: 3, totalStages: 7, percent: 20, message: "Analyzing sharpness..." });
  const withSharpness = [];

  for (let i = 0; i < withExif.length; i += concurrency) {
    const batch = withExif.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async (img) => {
      // Only process sharp-native formats for sharpness
      const result = SHARP_NATIVE.has(img.ext)
        ? await computeSharpness(sharp, img.path)
        : { sharpnessScore: 0, width: 0, height: 0, error: "RAW format — sharpness not computed" };

      return { ...img, sharpnessScore: result.sharpnessScore };
    }));

    withSharpness.push(...results);
    progress({
      stage: "sharpness", stageNumber: 3, totalStages: 7,
      current: Math.min(i + concurrency, withExif.length),
      total: withExif.length,
      percent: 20 + Math.round((Math.min(i + concurrency, withExif.length) / withExif.length) * 20),
      message: `Analyzing sharpness... ${Math.min(i + concurrency, withExif.length)}/${withExif.length}`
    });
  }

  // ==================== Stage 4: Perceptual hashing ====================
  progress({ stage: "phash", stageNumber: 4, totalStages: 7, percent: 40, message: "Computing perceptual hashes..." });
  const withHash = [];

  for (let i = 0; i < withSharpness.length; i += concurrency) {
    const batch = withSharpness.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async (img) => {
      const pHash = SHARP_NATIVE.has(img.ext)
        ? await computePHash(sharp, img.path)
        : null;
      return { ...img, pHash };
    }));

    withHash.push(...results);
    progress({
      stage: "phash", stageNumber: 4, totalStages: 7,
      current: Math.min(i + concurrency, withSharpness.length),
      total: withSharpness.length,
      percent: 40 + Math.round((Math.min(i + concurrency, withSharpness.length) / withSharpness.length) * 10),
      message: `Hashing... ${Math.min(i + concurrency, withSharpness.length)}/${withSharpness.length}`
    });
  }

  // ==================== Stage 5: Burst grouping ====================
  progress({ stage: "grouping", stageNumber: 5, totalStages: 7, percent: 50, message: "Grouping bursts..." });
  const rawGroups = groupByBurst(withHash, { burstThresholdMs, pHashThreshold });
  progress({
    stage: "grouping", stageNumber: 5, totalStages: 7,
    current: rawGroups.length, total: rawGroups.length, percent: 55,
    message: `Formed ${rawGroups.length} groups`
  });

  // ==================== Stage 6: Face detection ====================
  let enrichedImages = withHash;

  if (!skipFaces) {
    progress({ stage: "faces", stageNumber: 6, totalStages: 7, percent: 55, message: "Initializing face detection..." });
    const faceApiState = await initFaceApi();

    if (faceApiState.modelsLoaded) {
      const faceConcurrency = Math.max(1, Math.floor(concurrency / 2));
      const faceResults = [];

      for (let i = 0; i < withHash.length; i += faceConcurrency) {
        const batch = withHash.slice(i, i + faceConcurrency);
        const results = await Promise.all(batch.map(async (img) => {
          if (!SHARP_NATIVE.has(img.ext)) {
            return { ...img, faces: [], eyesClosedFlag: false };
          }
          const faces = await detectFaces(faceApiState, sharp, img.path, earThreshold);
          const eyesClosedFlag = faces.some(f => f.eyesClosed);
          return { ...img, faces, eyesClosedFlag };
        }));

        faceResults.push(...results);
        progress({
          stage: "faces", stageNumber: 6, totalStages: 7,
          current: Math.min(i + faceConcurrency, withHash.length),
          total: withHash.length,
          percent: 55 + Math.round((Math.min(i + faceConcurrency, withHash.length) / withHash.length) * 35),
          message: `Detecting faces... ${Math.min(i + faceConcurrency, withHash.length)}/${withHash.length}`
        });
      }

      enrichedImages = faceResults;
    } else {
      progress({ stage: "faces", stageNumber: 6, totalStages: 7, percent: 90, message: "Face detection unavailable — skipped" });
      enrichedImages = withHash.map(img => ({ ...img, faces: [], eyesClosedFlag: false }));
    }
  } else {
    progress({ stage: "faces", stageNumber: 6, totalStages: 7, percent: 90, message: "Face detection skipped (--skip-faces)" });
    enrichedImages = withHash.map(img => ({ ...img, faces: [], eyesClosedFlag: false }));
  }

  // Build lookup for enriched data
  const enrichedMap = new Map();
  for (const img of enrichedImages) {
    enrichedMap.set(img.path, img);
  }

  // ==================== Stage 7: Rank & build session ====================
  progress({ stage: "ranking", stageNumber: 7, totalStages: 7, percent: 92, message: "Ranking images..." });

  const sessionGroups = [];
  for (let gi = 0; gi < rawGroups.length; gi++) {
    const groupImages = rawGroups[gi].map(img => enrichedMap.get(img.path) || img);
    sessionGroups.push(buildGroup(groupImages, gi + 1, blurThreshold));
  }

  // Compute stats
  let blurFlagged = 0;
  let eyesClosedFlagged = 0;
  let totalImages = 0;

  for (const group of sessionGroups) {
    for (const img of group.images) {
      totalImages++;
      if (img.blurFlag) blurFlagged++;
      if (img.eyesClosedFlag) eyesClosedFlagged++;
    }
  }

  const session = {
    sessionId: crypto.randomUUID(),
    folderPath: resolvedPath,
    createdAt: Date.now(),
    settings: {
      burstThresholdMs,
      blurThreshold,
      earThreshold,
      pHashThreshold,
      skipFaces
    },
    totalImages,
    totalGroups: sessionGroups.length,
    stats: {
      approved: 0,
      rejected: 0,
      pending: totalImages,
      blurFlagged,
      eyesClosedFlagged
    },
    groups: sessionGroups,
    undoStack: [],
    currentGroupIndex: 0,
    currentImageIndex: 0,
    elapsedMs: Date.now() - startTime,
    message: `Scanned ${totalImages} images into ${sessionGroups.length} groups (${blurFlagged} blur-flagged, ${eyesClosedFlagged} eyes-closed)`
  };

  // Persist to disk
  const persistPath = outputPath || sessionFilePath;
  try {
    const tempPath = persistPath + ".tmp";
    await fs.writeFile(tempPath, JSON.stringify(session, null, 2), "utf-8");
    await fs.rename(tempPath, persistPath);
    progress({
      stage: "done", stageNumber: 7, totalStages: 7, percent: 100,
      message: `Session saved to ${persistPath}`
    });
  } catch (e) {
    progress({ stage: "done", message: `Warning: Could not save session file: ${e.message}` });
  }

  // Output session JSON to stdout
  process.stdout.write(JSON.stringify(session, null, 2) + "\n");
}

main().catch(e => {
  fatal("Unhandled error: " + e.message, { stack: e.stack });
});
