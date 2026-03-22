#!/usr/bin/env node
/**
 * analyze.js — Standalone photo analysis pipeline for the Enso Photo Culling Tool.
 *
 * Scans a folder of photos, extracts EXIF, computes sharpness scores, groups bursts,
 * detects faces/eyes-closed, determines best frames, and outputs structured JSON
 * with base64-encoded thumbnails.
 *
 * Usage:
 *   node analyze.js <folder-path> [options]
 *
 * Options:
 *   --burst-threshold <ms>    Burst grouping threshold in ms (default: 3000)
 *   --blur-threshold <score>  Sharpness score below this = blurry (default: 50)
 *   --ear-threshold <ratio>   Eye aspect ratio below this = eyes closed (default: 0.2)
 *   --skip-faces              Skip face/eye detection (faster)
 *   --skip-thumbnails         Skip base64 thumbnail generation
 *   --thumbnail-size <px>     Max thumbnail dimension in px (default: 300)
 *   --concurrency <n>         Parallel image processing (default: 4)
 *   --output <path>           Custom output file path (default: <folder>/_culling-results.json)
 *   --recursive               Scan subdirectories (default: true)
 *   --no-recursive            Don't scan subdirectories
 *   --help                    Show this help message
 *
 * Output: _culling-results.json in the target folder (or custom path via --output)
 *
 * Dependencies: sharp, exifr (required); @vladmandic/face-api (optional for face detection)
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    folderPath: null,
    burstThresholdMs: 3000,
    blurThreshold: 50,
    earThreshold: 0.2,
    skipFaces: false,
    skipThumbnails: false,
    thumbnailSize: 300,
    concurrency: 4,
    outputPath: null,
    recursive: true,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--burst-threshold":
        opts.burstThresholdMs = parseInt(args[++i], 10) || 3000;
        break;
      case "--blur-threshold":
        opts.blurThreshold = parseFloat(args[++i]) || 50;
        break;
      case "--ear-threshold":
        opts.earThreshold = parseFloat(args[++i]) || 0.2;
        break;
      case "--skip-faces":
        opts.skipFaces = true;
        break;
      case "--skip-thumbnails":
        opts.skipThumbnails = true;
        break;
      case "--thumbnail-size":
        opts.thumbnailSize = parseInt(args[++i], 10) || 300;
        break;
      case "--concurrency":
        opts.concurrency = parseInt(args[++i], 10) || 4;
        break;
      case "--output":
        opts.outputPath = args[++i];
        break;
      case "--recursive":
        opts.recursive = true;
        break;
      case "--no-recursive":
        opts.recursive = false;
        break;
      default:
        if (!arg.startsWith("-") && !opts.folderPath) {
          opts.folderPath = arg;
        } else if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }
  }

  return opts;
}

function showHelp() {
  console.log(`
Photo Culling Tool — Image Analysis Pipeline
=============================================

Usage:
  node analyze.js <folder-path> [options]

Arguments:
  <folder-path>               Path to folder containing photos to analyze

Options:
  --burst-threshold <ms>      Burst grouping time threshold in milliseconds (default: 3000)
  --blur-threshold <score>    Sharpness score below this marks image as blurry (default: 50)
  --ear-threshold <ratio>     Eye Aspect Ratio below this = eyes closed (default: 0.2)
  --skip-faces                Skip face/eye detection for faster processing
  --skip-thumbnails           Skip base64 thumbnail generation
  --thumbnail-size <px>       Max thumbnail dimension in pixels (default: 300)
  --concurrency <n>           Number of images to process in parallel (default: 4)
  --output <path>             Custom output file path (default: <folder>/_culling-results.json)
  --recursive / --no-recursive  Scan subdirectories (default: recursive)
  --help, -h                  Show this help message

Output:
  Writes _culling-results.json containing session data, burst groups,
  sharpness scores, face detection results, and base64 thumbnails.

Dependencies:
  Required: sharp, exifr
  Optional: @vladmandic/face-api (for face/eye detection)
`);
}

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

// ---------------------------------------------------------------------------
// Lazy Module Loading (graceful degradation for optional deps)
// ---------------------------------------------------------------------------
async function tryImport(pkg) {
  try {
    const mod = await import(pkg);
    return mod.default || mod;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Progress Logger
// ---------------------------------------------------------------------------
function logProgress(stage, current, total, message) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const filled = Math.floor(pct / 5);
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(20 - filled);
  process.stderr.write(`\r  [${bar}] ${pct}% ${message}    `);
  if (current === total) process.stderr.write("\n");
}

// ---------------------------------------------------------------------------
// Stage 1: Discover Image Files
// ---------------------------------------------------------------------------
function discoverImages(folderPath, recursive) {
  const results = [];

  function walk(dirPath) {
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && recursive) {
        if (!entry.name.startsWith(".") && entry.name !== "_rejected" && entry.name !== "node_modules") {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
          try {
            const stat = fs.statSync(fullPath);
            results.push({
              path: fullPath,
              filename: entry.name,
              ext: ext,
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

  walk(folderPath);
  results.sort((a, b) => a.filename.localeCompare(b.filename));
  return results;
}

// ---------------------------------------------------------------------------
// Stage 2: Extract EXIF Metadata
// ---------------------------------------------------------------------------
async function extractExif(images, onProgress) {
  const exifr = await tryImport("exifr");
  if (!exifr) {
    console.error("  [WARN] exifr not found - EXIF extraction disabled. Install with: npm install exifr");
    return images.map(img => ({ ...img, exif: buildEmptyExif() }));
  }

  const results = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const exifData = await readExifSafe(exifr, img.path);
    results.push({ ...img, exif: exifData });

    if (onProgress) onProgress("exif", i + 1, images.length, `Reading EXIF... ${i + 1}/${images.length}`);
  }

  return results;
}

async function readExifSafe(exifr, filePath) {
  try {
    const raw = await exifr.parse(filePath, {
      pick: [
        "DateTimeOriginal", "SubSecTimeOriginal", "CreateDate", "SubSecTime",
        "Make", "Model", "ISO", "ExposureTime", "FNumber", "FocalLength",
        "ExposureCompensation", "WhiteBalance", "Flash",
        "ImageWidth", "ImageHeight", "ExifImageWidth", "ExifImageHeight",
        "Orientation"
      ]
    });

    if (!raw) return buildEmptyExif();

    const dateRaw = raw.DateTimeOriginal || raw.CreateDate;
    const subSec = raw.SubSecTimeOriginal || raw.SubSecTime || "";
    let dateTaken = null;
    let dateTakenMs = null;

    if (dateRaw instanceof Date) {
      dateTaken = dateRaw.toISOString();
      dateTakenMs = dateRaw.getTime();
      if (subSec) {
        const fraction = parseFloat("0." + subSec);
        if (!isNaN(fraction)) dateTakenMs += fraction * 1000;
      }
    }

    return {
      cameraMake: raw.Make || null,
      cameraModel: raw.Model || null,
      dateTaken,
      dateTakenMs,
      subSecTime: subSec || null,
      iso: raw.ISO || null,
      shutterSpeed: raw.ExposureTime ? formatShutterSpeed(raw.ExposureTime) : null,
      aperture: raw.FNumber ? `f/${raw.FNumber}` : null,
      focalLength: raw.FocalLength ? `${raw.FocalLength}mm` : null,
      exposureComp: raw.ExposureCompensation != null
        ? `${raw.ExposureCompensation > 0 ? "+" : ""}${raw.ExposureCompensation}`
        : null,
      whiteBalance: raw.WhiteBalance || null,
      flash: raw.Flash != null ? !!(raw.Flash & 1) : null,
      width: raw.ExifImageWidth || raw.ImageWidth || null,
      height: raw.ExifImageHeight || raw.ImageHeight || null,
      orientation: raw.Orientation || 1
    };
  } catch (e) {
    return buildEmptyExif();
  }
}

function buildEmptyExif() {
  return {
    cameraMake: null, cameraModel: null, dateTaken: null, dateTakenMs: null,
    subSecTime: null, iso: null, shutterSpeed: null, aperture: null,
    focalLength: null, exposureComp: null, whiteBalance: null, flash: null,
    width: null, height: null, orientation: 1
  };
}

function formatShutterSpeed(exposureTime) {
  if (exposureTime >= 1) return `${exposureTime}s`;
  return `1/${Math.round(1 / exposureTime)}s`;
}

// ---------------------------------------------------------------------------
// Stage 3: Sharpness Analysis (Laplacian Variance)
// ---------------------------------------------------------------------------
async function analyzeSharpness(images, concurrency, onProgress) {
  const sharp = await tryImport("sharp");
  if (!sharp) {
    console.error("  [WARN] sharp not found - sharpness analysis disabled. Install with: npm install sharp");
    return images.map(img => ({ ...img, sharpnessScore: 0 }));
  }

  const results = [];
  let completed = 0;

  for (let i = 0; i < images.length; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async (img) => {
      const score = await computeSharpness(sharp, img.path);
      completed++;
      if (onProgress) onProgress("sharpness", completed, images.length, `Analyzing sharpness... ${completed}/${images.length}`);
      return { ...img, sharpnessScore: score };
    }));
    results.push(...batchResults);
  }

  return results;
}

async function computeSharpness(sharp, imagePath) {
  try {
    const resized = sharp(imagePath, { failOn: "none" })
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .grayscale();

    // Apply Laplacian kernel (second-order edge detector)
    // Kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    const laplacian = resized.convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    });

    const { data, info } = await laplacian.raw().toBuffer({ resolveWithObject: true });
    const pixels = data;
    const n = pixels.length;

    if (n === 0) return 0;

    // Compute mean
    let sum = 0;
    for (let j = 0; j < n; j++) sum += pixels[j];
    const mean = sum / n;

    // Compute variance (higher = sharper image)
    let varianceSum = 0;
    for (let j = 0; j < n; j++) {
      const diff = pixels[j] - mean;
      varianceSum += diff * diff;
    }

    return Math.round((varianceSum / n) * 100) / 100;
  } catch (e) {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Stage 4: Face Detection & Eye-Closed Classification
// ---------------------------------------------------------------------------
async function detectAllFaces(images, concurrency, earThreshold, onProgress) {
  const sharp = await tryImport("sharp");
  if (!sharp) {
    console.error("  [WARN] sharp not found - face detection requires sharp for image preprocessing");
    return images.map(img => ({ ...img, faces: [], eyesClosedFlag: false }));
  }

  const faceapi = await tryImport("@vladmandic/face-api");
  if (!faceapi) {
    console.error("  [WARN] @vladmandic/face-api not found - face detection disabled");
    console.error("         Install with: npm install @vladmandic/face-api");
    return images.map(img => ({ ...img, faces: [], eyesClosedFlag: false }));
  }

  // Load face-api models
  const modelsDir = findFaceApiModels();
  if (!modelsDir) {
    console.error("  [WARN] face-api model files not found - face detection disabled");
    console.error("         Expected in: node_modules/@vladmandic/face-api/model/");
    return images.map(img => ({ ...img, faces: [], eyesClosedFlag: false }));
  }

  try {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsDir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsDir);
  } catch (e) {
    console.error("  [WARN] Failed to load face-api models:", e.message);
    return images.map(img => ({ ...img, faces: [], eyesClosedFlag: false }));
  }

  const tf = faceapi.tf;
  const results = [];
  let completed = 0;

  // Limit face detection concurrency to avoid TensorFlow memory pressure
  const faceConcurrency = Math.min(concurrency, 2);
  for (let i = 0; i < images.length; i += faceConcurrency) {
    const batch = images.slice(i, i + faceConcurrency);
    const batchResults = await Promise.all(batch.map(async (img) => {
      const faces = await detectFacesSingle(sharp, faceapi, tf, img.path, earThreshold);
      completed++;
      if (onProgress) onProgress("faces", completed, images.length, `Detecting faces... ${completed}/${images.length}`);
      const eyesClosedFlag = faces.some(f => f.eyesClosed);
      return { ...img, faces, eyesClosedFlag };
    }));
    results.push(...batchResults);
  }

  return results;
}

function findFaceApiModels() {
  const candidates = [
    path.resolve(process.cwd(), "node_modules", "@vladmandic", "face-api", "model"),
    path.resolve(__dirname, "..", "..", "node_modules", "@vladmandic", "face-api", "model"),
    path.resolve(__dirname, "models"),
  ];

  for (const dir of candidates) {
    try {
      fs.accessSync(dir);
      return dir;
    } catch (e) {
      continue;
    }
  }
  return null;
}

async function detectFacesSingle(sharp, faceapi, tf, imagePath, earThreshold) {
  try {
    const { data, info } = await sharp(imagePath, { failOn: "none" })
      .resize(640, 640, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);

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
 * Compute Eye Aspect Ratio (EAR) from 68-point facial landmarks.
 * EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
 * Left eye: points 36-41, Right eye: points 42-47
 */
function computeEAR(landmarks, earThreshold) {
  if (!landmarks || landmarks.length < 68) {
    return { leftEAR: 0, rightEAR: 0, avgEAR: 0, eyesClosed: false };
  }

  const dist = (a, b) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));

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

// ---------------------------------------------------------------------------
// Stage 5: Generate Base64 Thumbnails
// ---------------------------------------------------------------------------
async function generateThumbnails(images, thumbnailSize, concurrency, onProgress) {
  const sharp = await tryImport("sharp");
  if (!sharp) {
    console.error("  [WARN] sharp not found - thumbnail generation disabled");
    return images.map(img => ({ ...img, thumbnail: null }));
  }

  const results = [];
  let completed = 0;

  for (let i = 0; i < images.length; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(async (img) => {
      const thumbnail = await generateThumbnail(sharp, img.path, thumbnailSize);
      completed++;
      if (onProgress) onProgress("thumbnails", completed, images.length, `Generating thumbnails... ${completed}/${images.length}`);
      return { ...img, thumbnail };
    }));
    results.push(...batchResults);
  }

  return results;
}

async function generateThumbnail(sharp, imagePath, maxSize) {
  try {
    const buffer = await sharp(imagePath, { failOn: "none" })
      .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();

    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stage 6: Burst Grouping (Timestamp Proximity)
// ---------------------------------------------------------------------------
function groupBursts(images, burstThresholdMs, blurThreshold) {
  if (!images || images.length === 0) return [];

  // Sort by timestamp (null timestamps go to the end)
  const sorted = [...images].sort((a, b) => {
    const ta = a.exif ? a.exif.dateTakenMs : null;
    const tb = b.exif ? b.exif.dateTakenMs : null;
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });

  // Sliding window grouping
  const rawGroups = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const tPrev = sorted[i - 1].exif ? sorted[i - 1].exif.dateTakenMs : null;
    const tCurr = sorted[i].exif ? sorted[i].exif.dateTakenMs : null;
    const gap = (tPrev != null && tCurr != null) ? Math.abs(tCurr - tPrev) : Infinity;

    if (gap <= burstThresholdMs) {
      rawGroups[rawGroups.length - 1].push(sorted[i]);
    } else {
      rawGroups.push([sorted[i]]);
    }
  }

  // Build structured group objects with rankings
  return rawGroups.map((groupImages, idx) => buildGroup(groupImages, idx + 1, blurThreshold));
}

function buildGroup(groupImages, groupIndex, blurThreshold) {
  // Sort by sharpness descending
  const sorted = [...groupImages].sort((a, b) => (b.sharpnessScore || 0) - (a.sharpnessScore || 0));

  const scores = sorted.map(img => img.sharpnessScore || 0);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const scoreRange = maxScore - minScore;

  // Earliest capture time
  let captureTime = null;
  for (const img of sorted) {
    if (img.exif && img.exif.dateTaken) {
      captureTime = img.exif.dateTaken;
      break;
    }
  }

  // Determine group type
  let groupType = "single";
  if (sorted.length > 1) {
    const ts = sorted.filter(img => img.exif && img.exif.dateTakenMs != null).map(img => img.exif.dateTakenMs);
    if (ts.length >= 2 && Math.abs(ts[ts.length - 1] - ts[0]) < 2000) {
      groupType = "burst";
    } else {
      groupType = "similar";
    }
  }

  const groupId = `G${String(groupIndex).padStart(3, "0")}`;

  const rankedImages = sorted.map((img, idx) => {
    const score = img.sharpnessScore || 0;
    const isSharpest = idx === 0;
    const blurFlag = score < blurThreshold;
    const normalized = scoreRange > 0
      ? Math.round(((score - minScore) / scoreRange) * 100)
      : (score >= blurThreshold ? 100 : 0);

    // Auto-suggestion logic
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
        autoReason = `Sharpest in burst of ${sorted.length} but eyes closed - review needed`;
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
      autoReason = `Superseded by sharper image (score: ${Math.round(maxScore)} vs ${Math.round(score)})`;
    }

    return {
      path: img.path,
      filename: img.filename,
      ext: img.ext,
      sizeBytes: img.sizeBytes,
      isRaw: img.isRaw,
      sharpnessScore: score,
      sharpnessNormalized: normalized,
      isSharpest,
      blurFlag,
      faces: img.faces || [],
      eyesClosedFlag: img.eyesClosedFlag || false,
      exif: img.exif,
      thumbnail: img.thumbnail || null,
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
    bestFrameFilename: rankedImages.length > 0 ? rankedImages[0].filename : null,
    images: rankedImages
  };
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    showHelp();
    process.exit(0);
  }

  if (!opts.folderPath) {
    console.error("Error: folder path is required.\n");
    console.error("Usage: node analyze.js <folder-path> [options]");
    console.error("       node analyze.js --help for full usage info");
    process.exit(1);
  }

  // Resolve folder path (support ~ home dir)
  let folderPath = opts.folderPath;
  if (folderPath.startsWith("~")) {
    folderPath = path.join(os.homedir(), folderPath.slice(1));
  }
  folderPath = path.resolve(folderPath);

  // Validate folder exists
  try {
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      console.error(`Error: not a directory: ${folderPath}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error: folder not found: ${folderPath}`);
    process.exit(1);
  }

  const outputPath = opts.outputPath || path.join(folderPath, "_culling-results.json");
  const startTime = Date.now();

  console.log("Photo Culling Tool - Analysis Pipeline");
  console.log("======================================");
  console.log(`Folder:           ${folderPath}`);
  console.log(`Burst threshold:  ${opts.burstThresholdMs}ms`);
  console.log(`Blur threshold:   ${opts.blurThreshold}`);
  console.log(`EAR threshold:    ${opts.earThreshold}`);
  console.log(`Face detection:   ${opts.skipFaces ? "SKIPPED" : "enabled"}`);
  console.log(`Thumbnails:       ${opts.skipThumbnails ? "SKIPPED" : opts.thumbnailSize + "px"}`);
  console.log(`Concurrency:      ${opts.concurrency}`);
  console.log(`Recursive:        ${opts.recursive}`);
  console.log(`Output:           ${outputPath}`);
  console.log("");

  // --- Stage 1: Discover images ---
  console.log("[1/7] Discovering image files...");
  const images = discoverImages(folderPath, opts.recursive);
  console.log(`  Found ${images.length} image files`);

  if (images.length === 0) {
    console.log("\nNo image files found. Exiting.");
    const emptyResult = {
      sessionId: crypto.randomUUID(),
      folderPath,
      createdAt: new Date().toISOString(),
      analyzedAt: Date.now(),
      settings: {
        burstThresholdMs: opts.burstThresholdMs,
        blurThreshold: opts.blurThreshold,
        earThreshold: opts.earThreshold,
        skipFaces: opts.skipFaces
      },
      totalImages: 0,
      totalGroups: 0,
      groups: [],
      stats: { approved: 0, rejected: 0, pending: 0, blurFlagged: 0, eyesClosedFlagged: 0 },
      durationMs: Date.now() - startTime
    };
    writeJsonAtomic(outputPath, emptyResult);
    console.log(`\nResults written to: ${outputPath}`);
    process.exit(0);
  }

  const rawCount = images.filter(i => i.isRaw).length;
  if (rawCount > 0) {
    console.log(`  (${rawCount} RAW files - will attempt embedded JPEG preview extraction)`);
  }

  // --- Stage 2: Extract EXIF ---
  console.log("\n[2/7] Extracting EXIF metadata...");
  const withExif = await extractExif(images, logProgress);
  const withTimestamps = withExif.filter(img => img.exif && img.exif.dateTakenMs != null).length;
  console.log(`  ${withTimestamps}/${images.length} images have timestamp data`);

  // --- Stage 3: Sharpness analysis ---
  console.log("\n[3/7] Analyzing sharpness (Laplacian variance)...");
  const withSharpness = await analyzeSharpness(withExif, opts.concurrency, logProgress);

  // --- Stage 4: Face detection ---
  let withFaces;
  if (opts.skipFaces) {
    console.log("\n[4/7] Face detection - SKIPPED");
    withFaces = withSharpness.map(img => ({ ...img, faces: [], eyesClosedFlag: false }));
  } else {
    console.log("\n[4/7] Detecting faces & eye state...");
    withFaces = await detectAllFaces(withSharpness, opts.concurrency, opts.earThreshold, logProgress);
    const totalFaces = withFaces.reduce((acc, img) => acc + (img.faces ? img.faces.length : 0), 0);
    const eyesClosed = withFaces.filter(img => img.eyesClosedFlag).length;
    console.log(`  Detected ${totalFaces} faces, ${eyesClosed} images with eyes closed`);
  }

  // --- Stage 5: Thumbnails ---
  let withThumbnails;
  if (opts.skipThumbnails) {
    console.log("\n[5/7] Thumbnail generation - SKIPPED");
    withThumbnails = withFaces.map(img => ({ ...img, thumbnail: null }));
  } else {
    console.log("\n[5/7] Generating base64 thumbnails...");
    withThumbnails = await generateThumbnails(withFaces, opts.thumbnailSize, opts.concurrency, logProgress);
  }

  // --- Stage 6: Burst grouping ---
  console.log("\n[6/7] Grouping bursts (threshold: " + opts.burstThresholdMs + "ms)...");
  const groups = groupBursts(withThumbnails, opts.burstThresholdMs, opts.blurThreshold);
  const burstGroups = groups.filter(g => g.groupType !== "single").length;
  const singleGroups = groups.filter(g => g.groupType === "single").length;
  console.log(`  ${groups.length} groups total (${burstGroups} bursts, ${singleGroups} singles)`);

  // --- Stage 7: Build result ---
  console.log("\n[7/7] Building results...");

  // Compute stats
  let blurFlagged = 0;
  let eyesClosedFlagged = 0;
  let totalProcessed = 0;

  for (const group of groups) {
    for (const img of group.images) {
      totalProcessed++;
      if (img.blurFlag) blurFlagged++;
      if (img.eyesClosedFlag) eyesClosedFlagged++;
    }
  }

  const result = {
    sessionId: crypto.randomUUID(),
    folderPath,
    createdAt: new Date().toISOString(),
    analyzedAt: Date.now(),
    settings: {
      burstThresholdMs: opts.burstThresholdMs,
      blurThreshold: opts.blurThreshold,
      earThreshold: opts.earThreshold,
      skipFaces: opts.skipFaces,
      skipThumbnails: opts.skipThumbnails,
      thumbnailSize: opts.thumbnailSize,
      recursive: opts.recursive
    },
    totalImages: totalProcessed,
    totalGroups: groups.length,
    stats: {
      approved: 0,
      rejected: 0,
      pending: totalProcessed,
      blurFlagged,
      eyesClosedFlagged,
      burstGroups,
      singleGroups
    },
    groups,
    durationMs: Date.now() - startTime
  };

  // Write output
  writeJsonAtomic(outputPath, result);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("");
  console.log("======================================");
  console.log("Analysis Complete");
  console.log("======================================");
  console.log(`Total images:      ${totalProcessed}`);
  console.log(`Total groups:      ${groups.length} (${burstGroups} bursts, ${singleGroups} singles)`);
  console.log(`Blur flagged:      ${blurFlagged}`);
  console.log(`Eyes closed:       ${eyesClosedFlagged}`);
  console.log(`Duration:          ${elapsed}s`);
  console.log(`Output:            ${outputPath}`);
  console.log(`Output size:       ${formatBytes(fs.statSync(outputPath).size)}`);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function writeJsonAtomic(outputPath, data) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = outputPath + ".tmp";
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tempPath, outputPath);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
main().catch(err => {
  console.error("\nFatal error:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
