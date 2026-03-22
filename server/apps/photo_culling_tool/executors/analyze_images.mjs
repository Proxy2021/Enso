#!/usr/bin/env node
/**
 * analyze_images.mjs — Image analysis pipeline: sharpness, thumbnails, face detection.
 *
 * Stage 2 of the photo culling pipeline. Accepts image array from scan_folder.mjs output,
 * enriches each image with sharpness scores, 400px thumbnails, face detection results,
 * blur flags, and marks the sharpest image per burst group.
 *
 * stdin JSON:
 *   {
 *     "images": [{ "path": "...", "filename": "...", "groupId": "G001", ... }],
 *     "folderPath": "/path/to/shoot",
 *     "blurThreshold": 50,
 *     "earThreshold": 0.2,
 *     "skipFaces": false,
 *     "thumbnailSize": 400,
 *     "concurrency": 4,
 *     "maxDimension": 1024
 *   }
 *
 * stdout JSON:
 *   {
 *     "images": [{
 *       ...original,
 *       "sharpness_score": 0-100,
 *       "sharpness_raw": N,
 *       "is_sharpest_in_group": bool,
 *       "has_faces": bool,
 *       "eyes_status": "open"|"closed"|"no_face",
 *       "blur_flag": bool,
 *       "thumbnail_path": "...",
 *       "faces": [{ box, confidence, leftEAR, rightEAR, avgEAR, eyesClosed }]
 *     }],
 *     "stats": { totalAnalyzed, blurFlagged, eyesClosedFlagged, thumbnailsGenerated,
 *                faceDetectionAvailable, sharpestPerGroup },
 *     "cacheDir": "...",
 *     "elapsedMs": N,
 *     "message": "..."
 *   }
 *
 * Progress on stderr as JSON lines.
 */

import fs from "fs/promises";
import path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progress(data) {
  process.stderr.write(JSON.stringify(data) + "\n");
}

// ---------------------------------------------------------------------------
// Sharpness: Laplacian variance
// ---------------------------------------------------------------------------

async function computeSharpness(sharp, imagePath, maxDimension) {
  try {
    const resized = sharp(imagePath, { failOn: "none" })
      .resize(maxDimension, maxDimension, { fit: "inside", withoutEnlargement: true })
      .grayscale();

    // 3×3 Laplacian kernel — second-order edge detector
    const laplacian = resized.convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    });

    const { data, info } = await laplacian.raw().toBuffer({ resolveWithObject: true });
    const pixels = data;
    const n = pixels.length;

    if (n === 0) return { raw: 0, width: info.width, height: info.height };

    // Compute mean
    let sum = 0;
    for (let i = 0; i < n; i++) sum += pixels[i];
    const mean = sum / n;

    // Compute variance (= sharpness metric)
    let varianceSum = 0;
    for (let i = 0; i < n; i++) {
      const diff = pixels[i] - mean;
      varianceSum += diff * diff;
    }
    const variance = varianceSum / n;

    return {
      raw: Math.round(variance * 100) / 100,
      width: info.width,
      height: info.height
    };
  } catch (e) {
    return { raw: 0, width: 0, height: 0, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Thumbnail generation
// ---------------------------------------------------------------------------

async function generateThumbnail(sharp, imagePath, cacheDir, thumbnailSize) {
  try {
    const filename = path.basename(imagePath);
    const ext = path.extname(filename).toLowerCase();
    const baseName = path.basename(filename, ext);
    const thumbName = `${baseName}_thumb.jpg`;
    const thumbPath = path.join(cacheDir, thumbName);

    // Cache hit: skip if thumbnail is fresh
    try {
      const thumbStat = await fs.stat(thumbPath);
      const origStat = await fs.stat(imagePath);
      if (thumbStat.mtime >= origStat.mtime) {
        return thumbPath;
      }
    } catch {
      // Doesn't exist — generate it
    }

    await sharp(imagePath, { failOn: "none" })
      .resize(thumbnailSize, thumbnailSize, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toFile(thumbPath);

    return thumbPath;
  } catch {
    return null; // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Face detection with Eye Aspect Ratio (EAR)
// ---------------------------------------------------------------------------

/**
 * Compute EAR from 68-point facial landmarks.
 * Left eye: points 36-41, Right eye: points 42-47
 * EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
 */
function computeEAR(landmarks, earThreshold) {
  if (!landmarks || landmarks.length < 68) {
    return { leftEAR: 0, rightEAR: 0, avgEAR: 0, eyesClosed: false };
  }

  const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  const le = landmarks.slice(36, 42);
  const leftEAR = le.length === 6
    ? (dist(le[1], le[5]) + dist(le[2], le[4])) / (2 * dist(le[0], le[3])) : 0;

  const re = landmarks.slice(42, 48);
  const rightEAR = re.length === 6
    ? (dist(re[1], re[5]) + dist(re[2], re[4])) / (2 * dist(re[0], re[3])) : 0;

  const avgEAR = (leftEAR + rightEAR) / 2;

  return {
    leftEAR: Math.round(leftEAR * 1000) / 1000,
    rightEAR: Math.round(rightEAR * 1000) / 1000,
    avgEAR: Math.round(avgEAR * 1000) / 1000,
    eyesClosed: avgEAR > 0 && avgEAR < earThreshold
  };
}

let faceApiState = null;

async function initFaceApi() {
  if (faceApiState) return faceApiState;

  let faceapi;
  try {
    const mod = await import("@vladmandic/face-api");
    faceapi = mod.default || mod;
  } catch {
    faceApiState = { faceapi: null, modelsLoaded: false, reason: "package not installed" };
    return faceApiState;
  }

  // Try standard model locations
  const modelDirs = [
    path.resolve(process.cwd(), "node_modules", "@vladmandic", "face-api", "model"),
    path.resolve(import.meta.dirname || ".", "..", "models"),
    path.resolve(import.meta.dirname || ".", "models")
  ];

  let modelsDir = null;
  for (const dir of modelDirs) {
    try {
      await fs.access(dir);
      modelsDir = dir;
      break;
    } catch {
      continue;
    }
  }

  if (!modelsDir) {
    faceApiState = { faceapi, modelsLoaded: false, reason: "model files not found" };
    return faceApiState;
  }

  try {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsDir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsDir);
    faceApiState = { faceapi, modelsLoaded: true };
  } catch (e) {
    faceApiState = { faceapi, modelsLoaded: false, reason: "model load failed: " + e.message };
  }

  return faceApiState;
}

async function detectFaces(sharp, imagePath, faceMaxDim, earThreshold) {
  const state = await initFaceApi();
  if (!state.modelsLoaded || !state.faceapi) return [];

  const { faceapi } = state;

  try {
    const { data, info } = await sharp(imagePath, { failOn: "none" })
      .resize(faceMaxDim, faceMaxDim, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const tf = faceapi.tf || (await import("@tensorflow/tfjs-node")).default;
    const tensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);

    const detections = await faceapi
      .detectAllFaces(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks();

    tensor.dispose();

    return detections.map((d) => {
      const box = d.detection.box;
      const landmarks = d.landmarks.positions;
      const ear = computeEAR(landmarks, earThreshold);

      return {
        box: {
          x: Math.round(box.x), y: Math.round(box.y),
          width: Math.round(box.width), height: Math.round(box.height)
        },
        confidence: Math.round(d.detection.score * 1000) / 1000,
        leftEAR: ear.leftEAR,
        rightEAR: ear.rightEAR,
        avgEAR: ear.avgEAR,
        eyesClosed: ear.eyesClosed
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Post-processing: normalize scores and mark sharpest per group
// ---------------------------------------------------------------------------

function enrichWithGroupRankings(images, blurThreshold) {
  // Group images by groupId
  const groupMap = new Map();
  for (let i = 0; i < images.length; i++) {
    const gid = images[i].groupId || "ungrouped";
    if (!groupMap.has(gid)) groupMap.set(gid, []);
    groupMap.get(gid).push(i);
  }

  let sharpestCount = 0;

  for (const [, indices] of groupMap) {
    // Find min/max sharpness in this group
    let maxRaw = -Infinity;
    let minRaw = Infinity;
    let sharpestIdx = indices[0];

    for (const idx of indices) {
      const raw = images[idx].sharpness_raw || 0;
      if (raw > maxRaw) {
        maxRaw = raw;
        sharpestIdx = idx;
      }
      if (raw < minRaw) minRaw = raw;
    }

    const range = maxRaw - minRaw;

    // Normalize scores 0-100 within the group and mark sharpest
    for (const idx of indices) {
      const raw = images[idx].sharpness_raw || 0;

      // Normalize: 0-100 within group (100 = sharpest in group)
      images[idx].sharpness_score = range > 0
        ? Math.round(((raw - minRaw) / range) * 100)
        : (raw >= blurThreshold ? 100 : 0);

      images[idx].is_sharpest_in_group = (idx === sharpestIdx);
      if (idx === sharpestIdx) sharpestCount++;
    }
  }

  return sharpestCount;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startMs = Date.now();

  // Read input from stdin
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf-8").trim();
    input = raw ? JSON.parse(raw) : {};
  } catch (e) {
    process.stdout.write(JSON.stringify({
      error: "Invalid JSON input on stdin: " + e.message,
      usage: '{ "images": [...], "folderPath": "/path/to/shoot" }'
    }));
    process.exit(1);
  }

  const images = input.images || [];
  const folderPath = (input.folderPath || "").trim();
  const blurThreshold = typeof input.blurThreshold === "number" ? input.blurThreshold : 50;
  const earThreshold = typeof input.earThreshold === "number" ? input.earThreshold : 0.2;
  const skipFaces = input.skipFaces === true;
  const thumbnailSize = typeof input.thumbnailSize === "number" ? input.thumbnailSize : 400;
  const concurrency = typeof input.concurrency === "number" ? Math.max(1, input.concurrency) : 4;
  const maxDimension = typeof input.maxDimension === "number" ? input.maxDimension : 1024;
  const faceMaxDimension = typeof input.faceMaxDimension === "number" ? input.faceMaxDimension : 640;

  if (images.length === 0) {
    process.stdout.write(JSON.stringify({
      images: [],
      stats: {
        totalAnalyzed: 0, blurFlagged: 0, eyesClosedFlagged: 0,
        thumbnailsGenerated: 0, faceDetectionAvailable: false, sharpestPerGroup: 0
      },
      elapsedMs: 0,
      message: "No images to analyze"
    }));
    return;
  }

  // Load sharp (required for sharpness + thumbnails)
  let sharp;
  try {
    const mod = await import("sharp");
    sharp = mod.default || mod;
  } catch {
    // Without sharp, we can still return images with zeroed-out analysis
    progress({
      stage: "init", current: 0, total: images.length, percent: 0,
      message: "sharp package not found — sharpness analysis and thumbnails disabled"
    });
    sharp = null;
  }

  // Prepare thumbnail cache directory
  const cacheDir = folderPath
    ? path.join(folderPath, ".culling-cache")
    : (images[0] && images[0].path ? path.join(path.dirname(images[0].path), ".culling-cache") : null);

  if (cacheDir) {
    try { await fs.mkdir(cacheDir, { recursive: true }); } catch { /* non-fatal */ }
  }

  // Check face detection availability
  let faceDetectionAvailable = false;
  if (!skipFaces) {
    const state = await initFaceApi();
    faceDetectionAvailable = state.modelsLoaded;
    if (!faceDetectionAvailable) {
      progress({
        stage: "faces_init", current: 0, total: images.length, percent: 0,
        message: `Face detection unavailable: ${state.reason || "unknown"}`
      });
    }
  }

  const total = images.length;
  let blurFlagged = 0;
  let eyesClosedFlagged = 0;
  let thumbnailsGenerated = 0;
  const analyzed = [];

  // Process in batches for controlled concurrency
  for (let i = 0; i < total; i += concurrency) {
    const batch = images.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (img, batchIdx) => {
        const globalIdx = i + batchIdx;

        // --- Sharpness (Laplacian variance) ---
        let sharpResult = { raw: 0, width: 0, height: 0 };
        if (sharp) {
          sharpResult = await computeSharpness(sharp, img.path, maxDimension);
        }

        // --- Thumbnail generation (400px JPEG) ---
        let thumbnail_path = null;
        if (sharp && cacheDir) {
          try {
            thumbnail_path = await generateThumbnail(sharp, img.path, cacheDir, thumbnailSize);
            if (thumbnail_path) thumbnailsGenerated++;
          } catch { /* non-fatal */ }
        }

        // --- Face detection + EAR ---
        let faces = [];
        let eyesClosedFlag = false;
        let has_faces = false;
        let eyes_status = "no_face";

        if (!skipFaces && faceDetectionAvailable && sharp) {
          faces = await detectFaces(sharp, img.path, faceMaxDimension, earThreshold);
          has_faces = faces.length > 0;

          if (has_faces) {
            eyesClosedFlag = faces.some((f) => f.eyesClosed);
            eyes_status = eyesClosedFlag ? "closed" : "open";
          }
        }

        // --- Blur flag ---
        const blur_flag = sharpResult.raw < blurThreshold;
        if (blur_flag) blurFlagged++;
        if (eyesClosedFlag) eyesClosedFlagged++;

        // Report progress
        const completed = globalIdx + 1;
        if (completed % 5 === 0 || completed === total) {
          progress({
            stage: "analyze", current: completed, total,
            percent: Math.round((completed / total) * 90),
            message: `Analyzing... ${completed}/${total} — ${img.filename}`
          });
        }

        return {
          ...img,
          sharpness_raw: sharpResult.raw,
          sharpness_score: 0, // Will be normalized per-group below
          is_sharpest_in_group: false, // Will be set below
          has_faces,
          eyes_status,
          blur_flag,
          thumbnail_path,
          faces,
          analysisWidth: sharpResult.width,
          analysisHeight: sharpResult.height
        };
      })
    );

    analyzed.push(...batchResults);
  }

  // Post-process: normalize sharpness 0-100 within each group, mark sharpest
  progress({
    stage: "ranking", current: 0, total: analyzed.length,
    percent: 92, message: "Ranking images within groups..."
  });

  const sharpestCount = enrichWithGroupRankings(analyzed, blurThreshold);

  const elapsedMs = Date.now() - startMs;

  progress({
    stage: "complete", current: total, total, percent: 100,
    message: `Analysis complete: ${total} images, ${blurFlagged} blurry, ${eyesClosedFlagged} eyes-closed in ${elapsedMs}ms`
  });

  process.stdout.write(JSON.stringify({
    images: analyzed,
    stats: {
      totalAnalyzed: analyzed.length,
      blurFlagged,
      eyesClosedFlagged,
      thumbnailsGenerated,
      faceDetectionAvailable,
      sharpestPerGroup: sharpestCount
    },
    cacheDir,
    elapsedMs,
    message: `Analyzed ${total} images: ${blurFlagged} blurry, ${eyesClosedFlagged} eyes-closed, ` +
      `${sharpestCount} sharpest-in-group, ${thumbnailsGenerated} thumbnails in ${elapsedMs}ms`
  }));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message }));
  process.exit(1);
});
