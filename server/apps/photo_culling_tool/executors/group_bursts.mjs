#!/usr/bin/env node
/**
 * group_bursts.mjs — Groups images into burst sequences using timestamp proximity
 * and perceptual hash (pHash) similarity.
 *
 * Algorithm:
 *   1. Sort by EXIF timestamp (DateTimeOriginal + SubSecTime)
 *   2. Compute pHash for each image (8×8 grayscale DCT-based via sharp)
 *   3. Union-Find grouping: timestamp gap ≤ burstThresholdMs → same group
 *   4. pHash split: within a timestamp group, split if hamming distance > splitDistance
 *   5. pHash merge: merge non-adjacent groups if hamming distance ≤ mergeDistance AND gap ≤ mergeWindowMs
 *   6. Rank within each group: sharpest first, flag blur/eyes-closed, auto-suggest
 *
 * stdin JSON:
 *   {
 *     "images": [{ "path": "...", "sharpnessScore": N, "exif": { "dateTakenMs": N }, ... }],
 *     "burstThresholdMs": 3000,
 *     "blurThreshold": 50,
 *     "usePHash": true,
 *     "splitDistance": 15,
 *     "mergeDistance": 10,
 *     "mergeWindowMs": 5000,
 *     "concurrency": 4
 *   }
 *
 * stdout JSON:
 *   {
 *     "groups": [{ groupId, captureTime, groupType, imageCount, images: [...] }],
 *     "totalGroups": N,
 *     "totalImages": N,
 *     "stats": { approved, rejected, pending, blurFlagged, eyesClosedFlagged },
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
  process.stderr.write(JSON.stringify(data) + "\n");
}

// ---------------------------------------------------------------------------
// Union-Find
// ---------------------------------------------------------------------------

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // path compression
    }
    return this.parent[x];
  }

  union(x, y) {
    const px = this.find(x);
    const py = this.find(y);
    if (px === py) return;
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
// Perceptual hash (pHash) using sharp
// ---------------------------------------------------------------------------

/**
 * Compute a perceptual hash for an image.
 * Method: resize to 8×8 grayscale → compute mean → each pixel above/below mean = 1/0 bit.
 * Returns a 16-char hex string (64 bits).
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

    // Build 64-bit hash: each bit = pixel >= mean
    const bits = new Uint8Array(8); // 8 bytes = 64 bits
    for (let i = 0; i < 64; i++) {
      if (data[i] >= mean) {
        bits[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
      }
    }

    // Convert to hex string
    let hex = "";
    for (let i = 0; i < 8; i++) {
      hex += bits[i].toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return null;
  }
}

/**
 * Compute hamming distance between two 16-char hex pHash strings.
 * Returns number of differing bits (0 = identical, 64 = max different).
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
// Group building
// ---------------------------------------------------------------------------

function buildGroup(groupImages, groupIndex, blurThreshold) {
  // Sort by sharpness descending
  const sorted = [...groupImages].sort((a, b) => (b.sharpnessScore || 0) - (a.sharpnessScore || 0));

  const scores = sorted.map((img) => img.sharpnessScore || 0);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const scoreRange = maxScore - minScore;

  // Earliest capture time
  const timestamps = sorted
    .filter((img) => img.exif?.dateTaken)
    .map((img) => img.exif.dateTaken);
  const captureTime = timestamps.length > 0 ? timestamps[0] : null;

  // Group type
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
        autoReason = "Single image in group, no issues detected";
      }
    } else if (isSharpest) {
      if (img.eyesClosedFlag) {
        autoSuggestion = null;
        autoReason = `Sharpest in burst of ${sorted.length} but eyes closed — review needed`;
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
      ...img,
      sharpnessNormalized: normalized,
      isSharpest,
      blurFlag,
      autoSuggestion,
      autoReason,
      status: img.status || "pending",
      decidedAt: img.decidedAt || null
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

function computeStats(groups) {
  let approved = 0, rejected = 0, pending = 0;
  let blurFlagged = 0, eyesClosedFlagged = 0, totalImages = 0;

  for (const group of groups) {
    for (const img of group.images) {
      totalImages++;
      if (img.status === "approved") approved++;
      else if (img.status === "rejected") rejected++;
      else pending++;
      if (img.blurFlag) blurFlagged++;
      if (img.eyesClosedFlag) eyesClosedFlagged++;
    }
  }

  return {
    totalImages,
    totalGroups: groups.length,
    approved,
    rejected,
    pending,
    blurFlagged,
    eyesClosedFlagged,
    completionPercent: totalImages > 0
      ? Math.round(((approved + rejected) / totalImages) * 100)
      : 0
  };
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
      usage: '{ "images": [...], "burstThresholdMs": 3000 }'
    }));
    process.exit(1);
  }

  const images = input.images || [];
  const burstThresholdMs = typeof input.burstThresholdMs === "number" ? input.burstThresholdMs : 3000;
  const blurThreshold = typeof input.blurThreshold === "number" ? input.blurThreshold : 50;
  const usePHash = input.usePHash !== false; // default true
  const splitDistance = typeof input.splitDistance === "number" ? input.splitDistance : 15;
  const mergeDistance = typeof input.mergeDistance === "number" ? input.mergeDistance : 10;
  const mergeWindowMs = typeof input.mergeWindowMs === "number" ? input.mergeWindowMs : 5000;
  const concurrency = typeof input.concurrency === "number" ? input.concurrency : 4;

  if (images.length === 0) {
    process.stdout.write(JSON.stringify({
      groups: [],
      totalGroups: 0,
      totalImages: 0,
      stats: computeStats([]),
      elapsedMs: 0,
      message: "No images to group"
    }));
    return;
  }

  // --- Step 1: Compute pHash for each image ---
  let imagesWithHash = images;

  if (usePHash) {
    let sharp;
    try {
      const mod = await import("sharp");
      sharp = mod.default || mod;
    } catch {
      // sharp not available — skip pHash
      progress({
        stage: "phash",
        current: 0,
        total: images.length,
        percent: 0,
        message: "sharp not available — skipping pHash computation, using timestamp-only grouping"
      });
      usePHash && (imagesWithHash = images);
    }

    if (sharp) {
      const total = images.length;
      const results = [];

      for (let i = 0; i < total; i += concurrency) {
        const batch = images.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map(async (img, batchIdx) => {
            const pHash = await computePHash(sharp, img.path);
            const completed = i + batchIdx + 1;
            if (completed % 10 === 0 || completed === total) {
              progress({
                stage: "phash",
                current: completed,
                total,
                percent: Math.round((completed / total) * 30),
                message: `Computing pHash... ${completed}/${total}`
              });
            }
            return { ...img, pHash };
          })
        );
        results.push(...batchResults);
      }

      imagesWithHash = results;
    }
  }

  // --- Step 2: Sort by timestamp ---
  const sorted = [...imagesWithHash].sort((a, b) => {
    const ta = a.exif?.dateTakenMs;
    const tb = b.exif?.dateTakenMs;
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });

  progress({
    stage: "grouping",
    current: 0,
    total: sorted.length,
    percent: 35,
    message: "Grouping by timestamp proximity..."
  });

  // --- Step 3: Union-Find timestamp grouping ---
  const n = sorted.length;
  const uf = new UnionFind(n);

  for (let i = 1; i < n; i++) {
    const tPrev = sorted[i - 1].exif?.dateTakenMs;
    const tCurr = sorted[i].exif?.dateTakenMs;

    if (tPrev != null && tCurr != null) {
      if (Math.abs(tCurr - tPrev) <= burstThresholdMs) {
        uf.union(i - 1, i);
      }
    }
  }

  // --- Step 4: pHash split (within timestamp groups, split different subjects) ---
  if (usePHash) {
    for (let i = 1; i < n; i++) {
      if (uf.connected(i - 1, i)) {
        const h1 = sorted[i - 1].pHash;
        const h2 = sorted[i].pHash;
        if (h1 && h2 && pHashDistance(h1, h2) > splitDistance) {
          sorted[i]._splitBefore = true;
        }
      }
    }
  }

  // --- Step 5: Build groups from Union-Find ---
  const groupMap = new Map();
  let currentGroupKey = 0;

  for (let i = 0; i < n; i++) {
    if (sorted[i]._splitBefore) {
      currentGroupKey = i;
    } else if (i > 0 && !uf.connected(i - 1, i)) {
      currentGroupKey = i;
    } else if (i === 0) {
      currentGroupKey = 0;
    }

    if (!groupMap.has(currentGroupKey)) {
      groupMap.set(currentGroupKey, []);
    }
    groupMap.get(currentGroupKey).push(i);
  }

  // --- Step 6: pHash merge (non-adjacent groups that look similar and are close in time) ---
  if (usePHash) {
    const groupKeys = [...groupMap.keys()];
    for (let gi = 0; gi < groupKeys.length; gi++) {
      for (let gj = gi + 1; gj < groupKeys.length; gj++) {
        const idxA = groupMap.get(groupKeys[gi]);
        const idxB = groupMap.get(groupKeys[gj]);
        if (!idxA || !idxB) continue;

        // Timestamp proximity
        const tA = sorted[idxA[0]].exif?.dateTakenMs;
        const tB = sorted[idxB[0]].exif?.dateTakenMs;
        if (tA == null || tB == null) continue;
        if (Math.abs(tA - tB) > mergeWindowMs) continue;

        // pHash similarity
        const hA = sorted[idxA[0]].pHash;
        const hB = sorted[idxB[0]].pHash;
        if (!hA || !hB) continue;
        if (pHashDistance(hA, hB) <= mergeDistance) {
          idxA.push(...idxB);
          groupMap.delete(groupKeys[gj]);
        }
      }
    }
  }

  // --- Step 7: Build output group objects ---
  const groups = [];
  let groupIndex = 0;

  for (const [, indices] of groupMap) {
    groupIndex++;
    const groupImages = indices.map((i) => sorted[i]);
    const group = buildGroup(groupImages, groupIndex, blurThreshold);
    groups.push(group);
  }

  // Cleanup temp markers
  for (const img of sorted) {
    delete img._splitBefore;
  }

  const stats = computeStats(groups);
  const elapsedMs = Date.now() - startMs;

  progress({
    stage: "complete",
    current: n,
    total: n,
    percent: 100,
    message: `Grouped ${n} images into ${groups.length} groups in ${elapsedMs}ms`
  });

  const result = {
    groups,
    totalGroups: groups.length,
    totalImages: n,
    stats,
    elapsedMs,
    message: `Grouped ${n} images into ${groups.length} groups (${stats.blurFlagged} blur-flagged, ${stats.eyesClosedFlagged} eyes-closed)`
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message }));
  process.exit(1);
});
