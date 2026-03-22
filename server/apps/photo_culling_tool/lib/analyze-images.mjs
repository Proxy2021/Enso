/**
 * analyze-images.mjs — Computes sharpness scores and runs face/eye detection on images.
 *
 * Sharpness: Laplacian variance via sharp (grayscale → 3x3 Laplacian convolve → variance of output).
 * Face detection: @vladmandic/face-api with SSD MobileNet + 68-point landmarks.
 * Eye Aspect Ratio (EAR) computed from landmarks to detect closed eyes.
 *
 * Usage:
 *   import { analyzeImages, computeSharpness, detectFaces } from './analyze-images.mjs';
 *   const results = await analyzeImages(images, { onProgress });
 *
 * @module analyze-images
 */

/**
 * Compute sharpness score for a single image using Laplacian variance.
 *
 * Method: Convert to grayscale → apply 3×3 Laplacian kernel → compute
 * variance of the resulting pixel values. Higher variance = sharper image.
 *
 * The Laplacian kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
 *
 * @param {string} imagePath - Absolute path to image file
 * @param {object} [options]
 * @param {number} [options.maxDimension=1024] - Downscale longest edge before analysis
 * @param {object} [options.sharp] - Pre-loaded sharp module (avoids re-import)
 * @returns {Promise<{sharpnessScore: number, width: number, height: number}>}
 */
export async function computeSharpness(imagePath, options = {}) {
  const { maxDimension = 1024 } = options;
  let sharp = options.sharp;

  if (!sharp) {
    try {
      const mod = await import("sharp");
      sharp = mod.default || mod;
    } catch (e) {
      throw new Error("sharp package not found. Install with: npm install sharp");
    }
  }

  try {
    // Load image, resize to maxDimension, convert to grayscale
    const resized = sharp(imagePath, { failOn: "none" })
      .resize(maxDimension, maxDimension, { fit: "inside", withoutEnlargement: true })
      .grayscale();

    // Apply Laplacian kernel: second-order derivative edge detector
    // Kernel: [-1, -1, -1]
    //         [-1,  8, -1]
    //         [-1, -1, -1]
    const laplacian = resized.convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    });

    // Get raw pixel buffer to compute variance
    const { data, info } = await laplacian
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = data;
    const n = pixels.length;

    if (n === 0) {
      return { sharpnessScore: 0, width: info.width, height: info.height };
    }

    // Compute mean
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += pixels[i];
    }
    const mean = sum / n;

    // Compute variance
    let varianceSum = 0;
    for (let i = 0; i < n; i++) {
      const diff = pixels[i] - mean;
      varianceSum += diff * diff;
    }
    const variance = varianceSum / n;

    // Return variance as the sharpness score (higher = sharper)
    return {
      sharpnessScore: Math.round(variance * 100) / 100,
      width: info.width,
      height: info.height
    };
  } catch (e) {
    // Return 0 for files that can't be processed (corrupted, unsupported)
    return { sharpnessScore: 0, width: 0, height: 0, error: e.message };
  }
}

/**
 * Compute Eye Aspect Ratio (EAR) from 68-point facial landmarks.
 *
 * EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
 * where p1..p6 are the 6 landmark points around each eye.
 *
 * Left eye landmarks (0-indexed from 68-point model): 36-41
 * Right eye landmarks: 42-47
 *
 * @param {Array} landmarks - Array of {x, y} points (68-point model)
 * @returns {{leftEAR: number, rightEAR: number, avgEAR: number, eyesClosed: boolean}}
 */
function computeEAR(landmarks, earThreshold = 0.2) {
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

// Singleton face-api state — loaded once, reused across calls
let faceApiState = null;

/**
 * Initialize face-api models (lazy, singleton).
 *
 * @returns {Promise<{faceapi: object, tf: object}>}
 */
async function initFaceApi() {
  if (faceApiState) return faceApiState;

  let faceapi;
  try {
    faceapi = await import("@vladmandic/face-api");
    faceapi = faceapi.default || faceapi;
  } catch (e) {
    throw new Error(
      "@vladmandic/face-api not found. Install with: npm install @vladmandic/face-api"
    );
  }

  // face-api needs a TensorFlow backend
  // @vladmandic/face-api bundles its own tf reference
  // Try to load models from common locations
  const modelsDir = await findModelsDir();

  if (modelsDir) {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsDir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsDir);
  } else {
    // Models not found — face detection will be skipped with a warning
    console.warn("[analyze-images] Face-api models not found. Face detection will be unavailable.");
    console.warn("  Expected model files in: node_modules/@vladmandic/face-api/model/");
    faceApiState = { faceapi, modelsLoaded: false };
    return faceApiState;
  }

  faceApiState = { faceapi, modelsLoaded: true };
  return faceApiState;
}

/**
 * Attempt to locate face-api model files.
 */
async function findModelsDir() {
  const fs = await import("fs/promises");
  const path = await import("path");

  // Check common locations for face-api models
  const candidates = [
    // Relative to this file
    path.default.resolve(import.meta.url.replace("file:///", "").replace(/\/[^/]+$/, ""), "models"),
    // In node_modules
    path.default.resolve(process.cwd(), "node_modules", "@vladmandic", "face-api", "model"),
    // Alongside the app
    path.default.resolve(import.meta.url.replace("file:///", "").replace(/\/[^/]+$/, ""), "..", "models"),
  ];

  for (const dir of candidates) {
    try {
      const normalizedDir = dir.replace(/\\/g, "/").replace(/^\/([A-Z]):/, "$1:");
      await fs.access(normalizedDir);
      return normalizedDir;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Detect faces in a single image and compute EAR for eye-closed detection.
 *
 * @param {string} imagePath - Absolute path to image
 * @param {object} [options]
 * @param {number} [options.maxDimension=640] - Downscale for face detection
 * @param {number} [options.earThreshold=0.2] - EAR below this = eyes closed
 * @param {object} [options.sharp] - Pre-loaded sharp module
 * @returns {Promise<Array<{box: object, confidence: number, leftEAR: number, rightEAR: number, avgEAR: number, eyesClosed: boolean}>>}
 */
export async function detectFaces(imagePath, options = {}) {
  const { maxDimension = 640, earThreshold = 0.2 } = options;
  let sharp = options.sharp;

  if (!sharp) {
    try {
      const mod = await import("sharp");
      sharp = mod.default || mod;
    } catch (e) {
      return []; // Can't process without sharp
    }
  }

  let state;
  try {
    state = await initFaceApi();
  } catch (e) {
    // face-api not available — return empty (graceful degradation)
    return [];
  }

  if (!state.modelsLoaded) {
    return []; // Models not found — skip face detection
  }

  const { faceapi } = state;

  try {
    // Load and resize image to a canvas-compatible buffer
    const { data, info } = await sharp(imagePath, { failOn: "none" })
      .resize(maxDimension, maxDimension, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Create an image tensor for face-api
    // face-api expects a tensor-like input or an HTMLImageElement
    // For Node.js, we create a tf tensor from raw pixel data
    const tf = faceapi.tf || (await import("@tensorflow/tfjs-node")).default;
    const tensor = tf.tensor3d(
      new Uint8Array(data),
      [info.height, info.width, 3]
    );

    // Detect faces with landmarks
    const detections = await faceapi
      .detectAllFaces(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks();

    tensor.dispose();

    // Process detections
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
  } catch (e) {
    // Face detection failed for this image — return empty
    return [];
  }
}

/**
 * Analyze a batch of images: compute sharpness + optional face detection.
 *
 * @param {Array<object>} images - Image objects from scanFolder (must have .path)
 * @param {object} [options]
 * @param {number} [options.sharpnessConcurrency=4] - CPU-bound concurrency for sharpness
 * @param {number} [options.faceConcurrency=2] - Concurrency for face detection
 * @param {boolean} [options.skipFaces=false] - Skip face/eye detection entirely
 * @param {number} [options.maxDimension=1024] - Max dimension for sharpness analysis
 * @param {number} [options.faceMaxDimension=640] - Max dimension for face detection
 * @param {number} [options.earThreshold=0.2] - Eye aspect ratio threshold
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<Array<object>>} - Images enriched with .sharpnessScore, .faces, etc.
 */
export async function analyzeImages(images, options = {}) {
  const {
    sharpnessConcurrency = 4,
    faceConcurrency = 2,
    skipFaces = false,
    maxDimension = 1024,
    faceMaxDimension = 640,
    earThreshold = 0.2,
    onProgress
  } = options;

  if (!images || images.length === 0) return [];

  // Pre-load sharp once for reuse
  let sharp;
  try {
    const mod = await import("sharp");
    sharp = mod.default || mod;
  } catch (e) {
    throw new Error("sharp package not found. Install with: npm install sharp");
  }

  const total = images.length;
  let sharpnessCompleted = 0;
  let faceCompleted = 0;

  // --- Stage 3: Sharpness scoring ---
  const withSharpness = [];
  for (let i = 0; i < total; i += sharpnessConcurrency) {
    const batch = images.slice(i, i + sharpnessConcurrency);
    const results = await Promise.all(
      batch.map(async (img) => {
        const result = await computeSharpness(img.path, { maxDimension, sharp });
        sharpnessCompleted++;

        if (onProgress) {
          const percent = 20 + Math.round((sharpnessCompleted / total) * 25);
          onProgress({
            stage: "sharpness",
            stageNumber: 3,
            totalStages: 7,
            current: sharpnessCompleted,
            total,
            percent,
            message: `Analyzing sharpness... ${sharpnessCompleted}/${total}`
          });
        }

        return {
          ...img,
          sharpnessScore: result.sharpnessScore,
          analysisWidth: result.width,
          analysisHeight: result.height,
          sharpnessError: result.error || null
        };
      })
    );
    withSharpness.push(...results);
  }

  // --- Stage 6: Face detection (optional) ---
  if (skipFaces) {
    if (onProgress) {
      onProgress({
        stage: "faces",
        stageNumber: 6,
        totalStages: 7,
        current: total,
        total,
        percent: 95,
        message: "Face detection skipped"
      });
    }
    return withSharpness.map((img) => ({
      ...img,
      faces: [],
      eyesClosedFlag: false
    }));
  }

  const analyzed = [];
  for (let i = 0; i < total; i += faceConcurrency) {
    const batch = withSharpness.slice(i, i + faceConcurrency);
    const results = await Promise.all(
      batch.map(async (img) => {
        const faces = await detectFaces(img.path, {
          maxDimension: faceMaxDimension,
          earThreshold,
          sharp
        });
        faceCompleted++;

        if (onProgress) {
          const percent = 65 + Math.round((faceCompleted / total) * 30);
          onProgress({
            stage: "faces",
            stageNumber: 6,
            totalStages: 7,
            current: faceCompleted,
            total,
            percent,
            message: `Detecting faces... ${faceCompleted}/${total}`
          });
        }

        const hasClosedEyes = faces.some((f) => f.eyesClosed);

        return {
          ...img,
          faces,
          eyesClosedFlag: hasClosedEyes
        };
      })
    );
    analyzed.push(...results);
  }

  return analyzed;
}

export default analyzeImages;
