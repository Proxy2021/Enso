/**
 * group-bursts.mjs — Groups images by timestamp proximity and ranks them.
 *
 * Groups images into bursts based on configurable timestamp threshold (default 3s).
 * Within each group: sorts by sharpness descending, marks the sharpest image,
 * flags blurry shots and eyes-closed shots, generates auto-suggestions.
 *
 * Usage:
 *   import { groupBursts } from './group-bursts.mjs';
 *   const groups = groupBursts(analyzedImages, { burstThresholdMs: 3000 });
 *
 * @module group-bursts
 */

/**
 * Union-Find data structure for efficient grouping with merge/split operations.
 */
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

/**
 * Compute Hamming distance between two hex-encoded perceptual hashes.
 *
 * @param {string} hash1 - Hex-encoded pHash
 * @param {string} hash2 - Hex-encoded pHash
 * @returns {number} - Number of differing bits (0 = identical, 64 = completely different)
 */
export function pHashDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const a = parseInt(hash1[i], 16);
    const b = parseInt(hash2[i], 16);
    if (isNaN(a) || isNaN(b)) return 64;
    // Count differing bits in each hex digit (4 bits)
    let xor = a ^ b;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Group images into bursts/similar groups based on timestamp proximity and optional pHash similarity.
 *
 * Algorithm:
 * 1. Sort images by dateTakenMs (EXIF timestamp with subsecond precision)
 * 2. Sliding window: if gap between consecutive images ≤ burstThresholdMs → same group
 * 3. (Optional) pHash verification: within a timestamp group, split if pHash distance > splitThreshold
 * 4. (Optional) pHash merge: merge non-adjacent groups if pHash distance ≤ mergeThreshold AND gap ≤ 5s
 *
 * @param {Array<object>} images - Analyzed images (must have .exif.dateTakenMs, .sharpnessScore)
 * @param {object} [options]
 * @param {number} [options.burstThresholdMs=3000] - Max gap between consecutive shots to group
 * @param {number} [options.blurThreshold=50] - Sharpness below this = blurFlag
 * @param {number} [options.eyesClosedThreshold] - Not used here (eyesClosedFlag set in analyze-images)
 * @param {number} [options.similarityMaxDistance=10] - pHash distance for merge/split
 * @param {number} [options.splitDistance=15] - pHash distance above which to split within a timestamp group
 * @param {number} [options.mergeWindowMs=5000] - Max timestamp gap for pHash-based merge
 * @param {boolean} [options.usePHash=false] - Enable pHash-based merge/split (requires .pHash on images)
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Array<object>} - Array of group objects
 */
export function groupBursts(images, options = {}) {
  const {
    burstThresholdMs = 3000,
    blurThreshold = 50,
    similarityMaxDistance = 10,
    splitDistance = 15,
    mergeWindowMs = 5000,
    usePHash = false,
    onProgress
  } = options;

  if (!images || images.length === 0) return [];

  // Step 1: Sort by timestamp (images without timestamps go to the end)
  const sorted = [...images].sort((a, b) => {
    const ta = a.exif?.dateTakenMs;
    const tb = b.exif?.dateTakenMs;
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });

  // Step 2: Initial timestamp-based grouping using Union-Find
  const n = sorted.length;
  const uf = new UnionFind(n);

  for (let i = 1; i < n; i++) {
    const tPrev = sorted[i - 1].exif?.dateTakenMs;
    const tCurr = sorted[i].exif?.dateTakenMs;

    if (tPrev != null && tCurr != null) {
      const gap = Math.abs(tCurr - tPrev);
      if (gap <= burstThresholdMs) {
        uf.union(i - 1, i);
      }
    }
  }

  // Step 3: pHash-based split (within timestamp groups, split different subjects)
  if (usePHash) {
    // For each pair in the same group, check pHash distance
    for (let i = 1; i < n; i++) {
      if (uf.connected(i - 1, i)) {
        const h1 = sorted[i - 1].pHash;
        const h2 = sorted[i].pHash;
        if (h1 && h2 && pHashDistance(h1, h2) > splitDistance) {
          // Can't "un-union" in standard Union-Find, so we rebuild groups below
          // Mark this edge as a split point
          sorted[i]._splitBefore = true;
        }
      }
    }
  }

  // Step 4: Build groups from Union-Find, respecting split markers
  const groupMap = new Map(); // rootIndex → [imageIndices]
  let currentGroupKey = 0;

  for (let i = 0; i < n; i++) {
    if (sorted[i]._splitBefore) {
      // Start a new group even if Union-Find says same component
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

  // Step 5: pHash-based merge (merge non-adjacent groups if similar and close in time)
  if (usePHash) {
    const groupKeys = [...groupMap.keys()];
    for (let gi = 0; gi < groupKeys.length; gi++) {
      for (let gj = gi + 1; gj < groupKeys.length; gj++) {
        const idxA = groupMap.get(groupKeys[gi]);
        const idxB = groupMap.get(groupKeys[gj]);
        if (!idxA || !idxB) continue;

        // Check timestamp proximity between groups
        const tA = sorted[idxA[0]].exif?.dateTakenMs;
        const tB = sorted[idxB[0]].exif?.dateTakenMs;
        if (tA == null || tB == null) continue;
        if (Math.abs(tA - tB) > mergeWindowMs) continue;

        // Check pHash similarity (compare first images of each group)
        const hA = sorted[idxA[0]].pHash;
        const hB = sorted[idxB[0]].pHash;
        if (!hA || !hB) continue;
        if (pHashDistance(hA, hB) <= similarityMaxDistance) {
          // Merge group B into group A
          idxA.push(...idxB);
          groupMap.delete(groupKeys[gj]);
        }
      }
    }
  }

  // Step 6: Build output group objects
  const groups = [];
  let groupIndex = 0;

  for (const [, indices] of groupMap) {
    const groupImages = indices.map((i) => sorted[i]);
    groupIndex++;

    const group = buildGroup(groupImages, groupIndex, blurThreshold);

    if (onProgress) {
      onProgress({
        stage: "grouping",
        stageNumber: 5,
        totalStages: 7,
        current: groupIndex,
        total: groupMap.size,
        percent: 45 + Math.round((groupIndex / groupMap.size) * 5),
        message: `Grouping... ${groupIndex}/${groupMap.size} groups`
      });
    }

    groups.push(group);
  }

  // Clean up temp markers
  for (const img of sorted) {
    delete img._splitBefore;
  }

  return groups;
}

/**
 * Build a single group object from a set of images.
 * Ranks images by sharpness, marks best/worst, generates auto-suggestions.
 *
 * @param {Array<object>} groupImages - Images in this group
 * @param {number} groupIndex - 1-based group index
 * @param {number} blurThreshold - Sharpness score below this = blur flag
 * @returns {object} - Group object matching CullSession schema
 */
function buildGroup(groupImages, groupIndex, blurThreshold) {
  // Sort by sharpness descending
  const sorted = [...groupImages].sort((a, b) => (b.sharpnessScore || 0) - (a.sharpnessScore || 0));

  // Find sharpness range for normalization within group
  const scores = sorted.map((img) => img.sharpnessScore || 0);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const scoreRange = maxScore - minScore;

  // Earliest capture time for group
  const timestamps = sorted
    .filter((img) => img.exif?.dateTaken)
    .map((img) => img.exif.dateTaken);
  const captureTime = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

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

  // Mark images within the group
  const rankedImages = sorted.map((img, idx) => {
    const score = img.sharpnessScore || 0;
    const isSharpest = idx === 0;
    const blurFlag = score < blurThreshold;
    const normalized = scoreRange > 0
      ? Math.round(((score - minScore) / scoreRange) * 100)
      : (score >= blurThreshold ? 100 : 0);

    // Generate auto-suggestion and reason
    let autoSuggestion = null;
    let autoReason = null;

    if (sorted.length === 1) {
      // Single image — no comparison needed
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
        autoSuggestion = null; // Ambiguous — sharpest but eyes closed
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
      // Not sharpest, not blurry, no eye issues — suggest reject (superseded by sharper image)
      autoSuggestion = "reject";
      autoReason = `Superseded by sharper image (score: ${Math.round(maxScore)} vs ${Math.round(score)})`;
    }

    return {
      ...img,
      sharpnessNormalized: normalized,
      isSharpest,
      blurFlag,
      autoSuggestion,
      autoReason,
      status: "pending",
      decidedAt: null
    };
  });

  const groupId = `G${String(groupIndex).padStart(3, "0")}`;

  return {
    groupId,
    captureTime,
    groupType,
    imageCount: rankedImages.length,
    images: rankedImages
  };
}

/**
 * Recompute flags and rankings for existing groups when thresholds change.
 * Does NOT re-scan — uses existing raw sharpness scores.
 *
 * @param {Array<object>} groups - Existing groups from a CullSession
 * @param {object} settings - New threshold settings
 * @param {number} [settings.blurThreshold=50] - New blur threshold
 * @returns {Array<object>} - Re-ranked groups
 */
export function reRankGroups(groups, settings = {}) {
  const { blurThreshold = 50 } = settings;

  return groups.map((group, idx) => {
    // Extract raw images and rebuild the group
    const rawImages = group.images.map((img) => ({
      ...img,
      // Preserve raw scores, reset computed flags
      isSharpest: undefined,
      blurFlag: undefined,
      sharpnessNormalized: undefined,
      autoSuggestion: undefined,
      autoReason: undefined
    }));

    return buildGroup(rawImages, idx + 1, blurThreshold);
  });
}

/**
 * Compute session-level statistics from groups.
 *
 * @param {Array<object>} groups
 * @returns {object} - Stats object
 */
export function computeStats(groups) {
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  let blurFlagged = 0;
  let eyesClosedFlagged = 0;
  let totalImages = 0;

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

export default groupBursts;
