#!/usr/bin/env node
/**
 * analyze-sharpness.mjs — Computes per-image sharpness scores and generates thumbnails.
 *
 * Method: Laplacian variance via sharp library.
 *   1. Load image, resize to maxDimension, convert to grayscale
 *   2. Apply 3x3 Laplacian convolution kernel [-1,-1,-1,-1,8,-1,-1,-1,-1]
 *   3. Compute pixel variance of the result (higher = sharper)
 *   4. Generate 300px JPEG thumbnail as base64 data URI
 *
 * stdin JSON:
 *   {
 *     "images": [{ "id": "...", "path": "...", "filename": "..." }],
 *     "maxDimension": 1024,
 *     "thumbnailWidth": 300,
 *     "concurrency": 4
 *   }
 *
 * stdout JSON:
 *   {
 *     "scores": [{ id, sharpnessScore, thumbnail }],
 *     "stats": { totalAnalyzed, minScore, maxScore, avgScore },
 *     "elapsedMs": N
 *   }
 *
 * Progress on stderr as JSON lines.
 */

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
// Sharpness: Laplacian variance
// ---------------------------------------------------------------------------

async function computeSharpness(sharp, imagePath, maxDimension) {
  try {
    // Resize to manageable size, convert to single-channel grayscale
    const resized = sharp(imagePath, { failOn: "none" })
      .resize(maxDimension, maxDimension, { fit: "inside", withoutEnlargement: true })
      .grayscale();

    // Apply Laplacian kernel — second-order edge detector
    // Kernel:
    //   [-1, -1, -1]
    //   [-1,  8, -1]
    //   [-1, -1, -1]
    const laplacian = resized.convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
    });

    // Get raw pixel buffer to compute variance
    const { data, info } = await laplacian.raw().toBuffer({ resolveWithObject: true });
    const pixels = data;
    const n = pixels.length;

    if (n === 0) {
      return { sharpnessScore: 0, width: info.width, height: info.height };
    }

    // Compute mean
    let sum = 0;
    for (let i = 0; i < n; i++) sum += pixels[i];
    const mean = sum / n;

    // Compute variance (higher variance = more edges = sharper image)
    let varianceSum = 0;
    for (let i = 0; i < n; i++) {
      const diff = pixels[i] - mean;
      varianceSum += diff * diff;
    }
    const variance = varianceSum / n;

    return {
      sharpnessScore: Math.round(variance * 100) / 100,
      width: info.width,
      height: info.height
    };
  } catch (e) {
    return { sharpnessScore: 0, width: 0, height: 0, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Thumbnail generation (base64 data URI)
// ---------------------------------------------------------------------------

async function generateThumbnail(sharp, imagePath, thumbnailWidth) {
  try {
    const buffer = await sharp(imagePath, { failOn: "none" })
      .resize(thumbnailWidth, null, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75, progressive: true })
      .toBuffer();

    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return null; // Thumbnail generation failed — non-fatal
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
      usage: '{ "images": [{ "id": "...", "path": "..." }] }'
    }));
    process.exit(1);
  }

  const images = input.images || [];
  const maxDimension = typeof input.maxDimension === "number" ? input.maxDimension : 1024;
  const thumbnailWidth = typeof input.thumbnailWidth === "number" ? input.thumbnailWidth : 300;
  const concurrency = typeof input.concurrency === "number" ? input.concurrency : 4;

  if (images.length === 0) {
    process.stdout.write(JSON.stringify({
      scores: [],
      stats: { totalAnalyzed: 0, minScore: 0, maxScore: 0, avgScore: 0 },
      elapsedMs: 0,
      message: "No images to analyze"
    }));
    return;
  }

  // Load sharp (required for this executor)
  let sharp;
  try {
    const mod = await import("sharp");
    sharp = mod.default || mod;
  } catch {
    process.stdout.write(JSON.stringify({
      error: "sharp package not found. Required for sharpness analysis.",
      scores: [],
      stats: { totalAnalyzed: 0, minScore: 0, maxScore: 0, avgScore: 0 }
    }));
    process.exit(1);
  }

  const total = images.length;
  const scores = [];

  progress({
    stage: "sharpness",
    current: 0,
    total,
    percent: 0,
    message: `Analyzing sharpness for ${total} images...`
  });

  // Process in batches for controlled concurrency
  for (let i = 0; i < total; i += concurrency) {
    const batch = images.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (img, batchIdx) => {
        const globalIdx = i + batchIdx;

        // Compute sharpness
        const sharpResult = await computeSharpness(sharp, img.path, maxDimension);

        // Generate thumbnail as base64 data URI
        const thumbnail = await generateThumbnail(sharp, img.path, thumbnailWidth);

        // Report progress
        const completed = globalIdx + 1;
        if (completed % 5 === 0 || completed === total) {
          progress({
            stage: "sharpness",
            current: completed,
            total,
            percent: Math.round((completed / total) * 100),
            message: `Sharpness... ${completed}/${total} — ${img.filename || path.basename(img.path)}`
          });
        }

        return {
          id: img.id,
          sharpnessScore: sharpResult.sharpnessScore,
          thumbnail,
          analysisWidth: sharpResult.width,
          analysisHeight: sharpResult.height,
          error: sharpResult.error || null
        };
      })
    );

    scores.push(...batchResults);
  }

  // Compute aggregate stats
  const validScores = scores.filter((s) => s.sharpnessScore > 0).map((s) => s.sharpnessScore);
  const minScore = validScores.length > 0 ? Math.min(...validScores) : 0;
  const maxScore = validScores.length > 0 ? Math.max(...validScores) : 0;
  const avgScore = validScores.length > 0
    ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100
    : 0;

  const elapsedMs = Date.now() - startMs;

  progress({
    stage: "complete",
    current: total,
    total,
    percent: 100,
    message: `Sharpness analysis complete: ${total} images in ${elapsedMs}ms (avg score: ${avgScore})`
  });

  const result = {
    scores,
    stats: {
      totalAnalyzed: scores.length,
      minScore,
      maxScore,
      avgScore,
      failedCount: scores.filter((s) => s.error).length
    },
    elapsedMs,
    message: `Analyzed ${total} images — scores range ${minScore} to ${maxScore} (avg: ${avgScore})`
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message, scores: [] }));
  process.exit(1);
});
