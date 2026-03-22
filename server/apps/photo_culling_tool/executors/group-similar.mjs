#!/usr/bin/env node
/**
 * group-similar.mjs — Groups similar images using perceptual hashing (dHash).
 *
 * Computes a 64-bit difference hash (dHash) for each image using sharp,
 * then groups images with Hamming distance < threshold into burst groups.
 * Uses Union-Find for efficient O(n^2 alpha(n)) grouping.
 * Sorts each group by sharpnessScore descending; marks highest scorer as 'best'.
 *
 * stdin JSON:
 *   {
 *     "images": [{ "id": "...", "path": "...", "filename": "...", "exif": { "dateTakenMs": ... } }],
 *     "scores": [{ "id": "...", "sharpnessScore": N }],
 *     "hashThreshold": 10,
 *     "burstThresholdMs": 3000,
 *     "useTimestamp": true,
 *     "concurrency": 4
 *   }
 *
 * stdout JSON:
 *   {
 *     "groups": [{
 *       "groupId": "G001",
 *       "images": [{ id, rank, sharpnessScore, isBest }]
 *     }],
 *     "totalGroups": N,
 *     "stats": { singletons, bursts, avgGroupSize },
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
// Union-Find data structure
// ---------------------------------------------------------------------------

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // Path compression
    }
    return this.parent[x];
  }

  union(x, y) {
    const px = this.find(x);
    const py = this.find(y);
    if (px === py) return;
    // Union by rank
    if (this.rank[px] < this.rank[py]) {
      this.parent[px] = py;
    } else if (this.rank[px] > this.rank[py]) {
      this.parent[py] = px;
    } else {
      this.parent[py] = px;
      this.rank[px]++;
    }
  }

  connected(x, y) {
    return this.find(x) === this.find(y);
  }
}

// ---------------------------------------------------------------------------
// dHash (difference hash) — 64-bit perceptual hash via sharp
// ---------------------------------------------------------------------------

/**
 * Compute dHash for a single image.
 * Algorithm:
 *   1. Resize to 9x8 grayscale (9 wide to get 8 horizontal gradients)
 *   2. For each row, compare adjacent pixels: hash bit = 1 if left > right
 *   3. Result: 64-bit hash encoded as 16-char hex string
 */
async function computeDHash(sharp, imagePath) {
  try {
    // Resize to 9x8 grayscale
    const { data } = await sharp(imagePath, { failOn: "none" })
      .resize(9, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Compute difference hash: compare adjacent horizontal pixels
    let hash = "";
    for (let row = 0; row < 8; row++) {
      let byte = 0;
      for (let col = 0; col < 8; col++) {
        const leftPixel = data[row * 9 + col];
        const rightPixel = data[row * 9 + col + 1];
        if (leftPixel > rightPixel) {
          byte |= (1 << (7 - col));
        }
      }
      hash += byte.toString(16).padStart(2, "0");
    }

    return hash;
  } catch {
    return null; // Hash computation failed — will be excluded from grouping
  }
}

/**
 * Compute Hamming distance between two hex-encoded hashes.
 * Returns number of differing bits (0 = identical, 64 = completely different).
 */
function hammingDistance(hash1, hash2) {
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
  const hashThreshold = typeof input.hashThreshold === "number" ? input.hashThreshold : 10;
  const burstThresholdMs = typeof input.burstThresholdMs === "number" ? input.burstThresholdMs : 3000;
  const useTimestamp = input.useTimestamp !== false; // default: true
  const concurrency = typeof input.concurrency === "number" ? input.concurrency : 4;

  if (images.length === 0) {
    process.stdout.write(JSON.stringify({
      groups: [],
      totalGroups: 0,
      stats: { singletons: 0, bursts: 0, avgGroupSize: 0 },
      elapsedMs: 0,
      message: "No images to group"
    }));
    return;
  }

  // Build score lookup map: id → sharpnessScore
  const scoreMap = new Map();
  for (const s of scores) {
    scoreMap.set(s.id, s.sharpnessScore || 0);
  }

  // Load sharp for dHash computation
  let sharp;
  try {
    const mod = await import("sharp");
    sharp = mod.default || mod;
  } catch {
    // sharp not available — fall back to timestamp-only grouping
    sharp = null;
    progress({
      stage: "hash",
      current: 0,
      total: images.length,
      percent: 0,
      message: "sharp not available — using timestamp-only grouping"
    });
  }

  // --- Phase 1: Compute perceptual hashes ---
  const total = images.length;
  const imageHashes = new Array(total).fill(null);

  if (sharp) {
    progress({
      stage: "hash",
      current: 0,
      total,
      percent: 0,
      message: `Computing dHash for ${total} images...`
    });

    for (let i = 0; i < total; i += concurrency) {
      const batch = images.slice(i, i + concurrency);
      const batchHashes = await Promise.all(
        batch.map(async (img, batchIdx) => {
          const hash = await computeDHash(sharp, img.path);
          const completed = i + batchIdx + 1;
          if (completed % 10 === 0 || completed === total) {
            progress({
              stage: "hash",
              current: completed,
              total,
              percent: Math.round((completed / total) * 50),
              message: `Hashing... ${completed}/${total}`
            });
          }
          return hash;
        })
      );
      for (let j = 0; j < batchHashes.length; j++) {
        imageHashes[i + j] = batchHashes[j];
      }
    }
  }

  // --- Phase 2: Sort by timestamp for initial grouping ---
  const indexed = images.map((img, i) => ({
    ...img,
    originalIndex: i,
    hash: imageHashes[i],
    sharpnessScore: scoreMap.get(img.id) || 0
  }));

  indexed.sort((a, b) => {
    const ta = a.exif?.dateTakenMs;
    const tb = b.exif?.dateTakenMs;
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });

  // --- Phase 3: Union-Find grouping ---
  const n = indexed.length;
  const uf = new UnionFind(n);

  progress({
    stage: "grouping",
    current: 0,
    total: n,
    percent: 50,
    message: "Grouping images..."
  });

  // Pass 1: Timestamp proximity grouping
  if (useTimestamp) {
    for (let i = 1; i < n; i++) {
      const tPrev = indexed[i - 1].exif?.dateTakenMs;
      const tCurr = indexed[i].exif?.dateTakenMs;
      if (tPrev != null && tCurr != null) {
        if (Math.abs(tCurr - tPrev) <= burstThresholdMs) {
          uf.union(i - 1, i);
        }
      }
    }
  }

  // Pass 2: pHash similarity grouping (merge images with similar visual content)
  if (sharp) {
    for (let i = 0; i < n; i++) {
      if (!indexed[i].hash) continue;
      // Compare with nearby images (window of 20 to limit O(n^2))
      const windowEnd = Math.min(i + 20, n);
      for (let j = i + 1; j < windowEnd; j++) {
        if (!indexed[j].hash) continue;
        if (uf.connected(i, j)) continue; // Already in same group

        const dist = hammingDistance(indexed[i].hash, indexed[j].hash);
        if (dist <= hashThreshold) {
          // Optionally check timestamp proximity too
          const ti = indexed[i].exif?.dateTakenMs;
          const tj = indexed[j].exif?.dateTakenMs;
          if (ti != null && tj != null) {
            // Only merge if within 10x burst threshold (to avoid merging unrelated similar-looking shots)
            if (Math.abs(tj - ti) <= burstThresholdMs * 10) {
              uf.union(i, j);
            }
          } else {
            // No timestamps — merge purely on visual similarity
            uf.union(i, j);
          }
        }
      }
    }
  }

  // --- Phase 4: Extract groups from Union-Find ---
  const groupMap = new Map(); // root → [indices]
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root).push(i);
  }

  // --- Phase 5: Build output groups, sorted by sharpness ---
  const groups = [];
  let groupIndex = 0;
  let singletons = 0;
  let bursts = 0;

  for (const [, indices] of groupMap) {
    groupIndex++;
    const groupId = `G${String(groupIndex).padStart(3, "0")}`;

    // Get images in this group with their scores
    const groupImages = indices.map((i) => indexed[i]);

    // Sort by sharpness descending
    groupImages.sort((a, b) => (b.sharpnessScore || 0) - (a.sharpnessScore || 0));

    // Build ranked output
    const rankedImages = groupImages.map((img, rank) => ({
      id: img.id,
      rank: rank + 1,
      sharpnessScore: img.sharpnessScore,
      isBest: rank === 0,
      filename: img.filename,
      path: img.path,
      hash: img.hash
    }));

    if (rankedImages.length === 1) singletons++;
    else bursts++;

    // Determine group type
    let groupType = "single";
    if (groupImages.length > 1) {
      const firstTs = groupImages[0].exif?.dateTakenMs;
      const lastTs = groupImages[groupImages.length - 1].exif?.dateTakenMs;
      if (firstTs != null && lastTs != null && Math.abs(lastTs - firstTs) < 2000) {
        groupType = "burst";
      } else {
        groupType = "similar";
      }
    }

    // Capture time: earliest in group
    const timestamps = groupImages
      .filter((img) => img.exif?.dateTaken)
      .map((img) => img.exif.dateTaken);
    const captureTime = timestamps.length > 0 ? timestamps[0] : null;

    groups.push({
      groupId,
      groupType,
      captureTime,
      imageCount: rankedImages.length,
      images: rankedImages
    });
  }

  const elapsedMs = Date.now() - startMs;
  const avgGroupSize = groups.length > 0
    ? Math.round((total / groups.length) * 100) / 100
    : 0;

  progress({
    stage: "complete",
    current: total,
    total,
    percent: 100,
    message: `Grouped ${total} images into ${groups.length} groups (${bursts} bursts, ${singletons} singletons) in ${elapsedMs}ms`
  });

  const result = {
    groups,
    totalGroups: groups.length,
    stats: {
      singletons,
      bursts,
      avgGroupSize,
      hashesComputed: imageHashes.filter(Boolean).length,
      hashThreshold,
      burstThresholdMs
    },
    elapsedMs,
    message: `Grouped ${total} images into ${groups.length} groups (${bursts} bursts, ${singletons} singles)`
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message, groups: [] }));
  process.exit(1);
});
