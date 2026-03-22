#!/usr/bin/env node
/**
 * detect-problems.mjs — Flags blurry and eyes-closed images.
 *
 * Accepts images + sharpness scores. Flags images as:
 *   - blurry: if sharpnessScore < configurable threshold (default 50)
 *   - eyesClosed: using @vladmandic/face-api (gracefully degrades if not installed)
 *
 * Face detection uses SSD MobileNet + 68-point landmarks for Eye Aspect Ratio (EAR).
 *
 * stdin JSON:
 *   {
 *     "images": [{ "id": "...", "path": "..." }],
 *     "scores": [{ "id": "...", "sharpnessScore": N }],
 *     "blurThreshold": 50,
 *     "earThreshold": 0.2,
 *     "skipFaces": false,
 *     "faceMaxDimension": 640,
 *     "concurrency": 2
 *   }
 *
 * stdout JSON:
 *   {
 *     "flags": [{ id, isBlurry, eyesClosed, hasFace }],
 *     "stats": { totalFlagged, blurryCount, eyesClosedCount, facesDetected, faceDetectionAvailable },
 *     "elapsedMs": N
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
  try {
    process.stderr.write(JSON.stringify(data) + "\n");
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Eye Aspect Ratio (EAR) from 68-point landmarks
// ---------------------------------------------------------------------------

/**
 * Compute EAR from facial landmarks.
 * EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
 * Left eye: points 36-41, Right eye: points 42-47
 * EAR < threshold → eyes likely closed
 */
function computeEAR(landmarks, earThreshold) {
  if (!landmarks || landmarks.length < 68) {
    return { leftEAR: 0, rightEAR: 0, avgEAR: 0, eyesClosed: false };
  }

  const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  // Left eye: points 36-41
  const le = landmarks.slice(36, 42);
  const leftEAR = le.length === 6
    ? (dist(le[1], le[5]) + dist(le[2], le[4])) / (2 * dist(le[0], le[3]))
    : 0;

  // Right eye: points 42-47
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
// Face-API initialization (lazy singleton)
// ---------------------------------------------------------------------------

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

  // Try to locate model files
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

// ---------------------------------------------------------------------------
// Face detection for a single image
// ---------------------------------------------------------------------------

async function detectFaces(sharp, faceapi, imagePath, faceMaxDim, earThreshold) {
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
  } catch {
    return []; // Face detection failed for this image — non-fatal
  }
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
      usage: '{ "images": [...], "scores": [...] }'
    }));
    process.exit(1);
  }

  const images = input.images || [];
  const scores = input.scores || [];
  const blurThreshold = typeof input.blurThreshold === "number" ? input.blurThreshold : 50;
  const earThreshold = typeof input.earThreshold === "number" ? input.earThreshold : 0.2;
  const skipFaces = input.skipFaces === true;
  const faceMaxDimension = typeof input.faceMaxDimension === "number" ? input.faceMaxDimension : 640;
  const concurrency = typeof input.concurrency === "number" ? input.concurrency : 2;

  if (images.length === 0) {
    process.stdout.write(JSON.stringify({
      flags: [],
      stats: { totalFlagged: 0, blurryCount: 0, eyesClosedCount: 0, facesDetected: 0, faceDetectionAvailable: false },
      elapsedMs: 0,
      message: "No images to analyze"
    }));
    return;
  }

  // Build score lookup: id → sharpnessScore
  const scoreMap = new Map();
  for (const s of scores) {
    scoreMap.set(s.id, s.sharpnessScore || 0);
  }

  // Load sharp (needed for face detection image preprocessing)
  let sharp = null;
  try {
    const mod = await import("sharp");
    sharp = mod.default || mod;
  } catch {
    // sharp not available — face detection will be skipped
  }

  // Check face detection availability
  let faceDetectionAvailable = false;
  let faceapi = null;

  if (!skipFaces && sharp) {
    const state = await initFaceApi();
    faceDetectionAvailable = state.modelsLoaded;
    faceapi = state.faceapi;

    if (!faceDetectionAvailable) {
      progress({
        stage: "faces_init",
        current: 0,
        total: images.length,
        percent: 0,
        message: `Face detection unavailable: ${state.reason || "unknown"}. Blur detection only.`
      });
    }
  } else if (skipFaces) {
    progress({
      stage: "faces_init",
      current: 0,
      total: images.length,
      percent: 0,
      message: "Face detection skipped by request"
    });
  }

  const total = images.length;
  const flags = [];
  let blurryCount = 0;
  let eyesClosedCount = 0;
  let facesDetected = 0;

  progress({
    stage: "detect",
    current: 0,
    total,
    percent: 0,
    message: `Detecting problems in ${total} images...`
  });

  // Process in batches
  for (let i = 0; i < total; i += concurrency) {
    const batch = images.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (img, batchIdx) => {
        const globalIdx = i + batchIdx;
        const sharpnessScore = scoreMap.get(img.id) || 0;
        const isBlurry = sharpnessScore < blurThreshold;

        let eyesClosed = false;
        let hasFace = false;
        let faceDetails = [];

        // Run face detection if available
        if (faceDetectionAvailable && faceapi && sharp) {
          faceDetails = await detectFaces(sharp, faceapi, img.path, faceMaxDimension, earThreshold);
          hasFace = faceDetails.length > 0;
          eyesClosed = faceDetails.some((f) => f.eyesClosed);
          facesDetected += faceDetails.length;
        }

        if (isBlurry) blurryCount++;
        if (eyesClosed) eyesClosedCount++;

        // Report progress
        const completed = globalIdx + 1;
        if (completed % 5 === 0 || completed === total) {
          progress({
            stage: "detect",
            current: completed,
            total,
            percent: Math.round((completed / total) * 100),
            message: `Detecting... ${completed}/${total}${isBlurry ? " (blurry)" : ""}${eyesClosed ? " (eyes closed)" : ""}`
          });
        }

        return {
          id: img.id,
          isBlurry,
          eyesClosed,
          hasFace,
          sharpnessScore,
          faceCount: faceDetails.length,
          faces: faceDetails.length > 0 ? faceDetails : undefined
        };
      })
    );

    flags.push(...batchResults);
  }

  const totalFlagged = flags.filter((f) => f.isBlurry || f.eyesClosed).length;
  const elapsedMs = Date.now() - startMs;

  progress({
    stage: "complete",
    current: total,
    total,
    percent: 100,
    message: `Problem detection complete: ${blurryCount} blurry, ${eyesClosedCount} eyes-closed, ${facesDetected} faces in ${elapsedMs}ms`
  });

  const result = {
    flags,
    stats: {
      totalFlagged,
      blurryCount,
      eyesClosedCount,
      facesDetected,
      faceDetectionAvailable,
      blurThreshold,
      earThreshold
    },
    elapsedMs,
    message: `Detected problems: ${blurryCount} blurry, ${eyesClosedCount} eyes-closed out of ${total} images`
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message, flags: [] }));
  process.exit(1);
});
