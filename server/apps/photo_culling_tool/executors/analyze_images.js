// analyze_images.js — Run AI analysis on scanned images: sharpness, pHash similarity, face detection, ranking.
// Operates on existing session — re-analyzes with updated thresholds, adds pHash-based similarity grouping.

var fs = require("fs");
var path = require("path");

var blurThreshold = typeof params.blurThreshold === "number" ? params.blurThreshold : 50;
var earThreshold = typeof params.earThreshold === "number" ? params.earThreshold : 0.2;
var skipFaces = params.skipFaces === true;
var skipPHash = params.skipPHash === true;
var similarityThreshold = typeof params.similarityThreshold === "number" ? params.similarityThreshold : 10; // Hamming distance (0-64)
var TOOL = "enso_photo_culling_tool_analyze_images";

var sessionPath = await ctx.store.get("currentSessionPath");
if (!sessionPath) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "No active session. Run scan_folder first." }) }] };
}

var session;
try { session = JSON.parse(fs.readFileSync(sessionPath, "utf-8")); } catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: TOOL, error: "Failed to load session: " + e.message }) }] };
}

// Update thresholds
session.settings.blurThreshold = blurThreshold;
session.settings.earThreshold = earThreshold;
session.settings.skipFaces = skipFaces;

var sharp;
try { sharp = require("sharp"); } catch (e) { sharp = null; }

var analyzedCount = 0;
var pHashCount = 0;
var similarityGroups = [];

// --- Stage 1: Sharpness analysis (Laplacian variance) ---
var needsSharpness = false;
for (var cg = 0; cg < session.groups.length; cg++) {
  for (var ci = 0; ci < session.groups[cg].images.length; ci++) {
    if (!session.groups[cg].images[ci].sharpnessScore) { needsSharpness = true; break; }
  }
  if (needsSharpness) break;
}

if (needsSharpness && sharp) {
  for (var sg = 0; sg < session.groups.length; sg++) {
    for (var si = 0; si < session.groups[sg].images.length; si++) {
      var img = session.groups[sg].images[si];
      if (img.sharpnessScore) continue;
      try {
        var resized = sharp(img.path, { failOn: "none" }).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).grayscale();
        var laplacian = resized.convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] });
        var bufResult = await laplacian.raw().toBuffer({ resolveWithObject: true });
        var pixels = bufResult.data;
        var n = pixels.length;
        if (n > 0) {
          var sum = 0; for (var pi = 0; pi < n; pi++) sum += pixels[pi];
          var mean = sum / n;
          var vSum = 0; for (var vi = 0; vi < n; vi++) { var diff = pixels[vi] - mean; vSum += diff * diff; }
          img.sharpnessScore = Math.round((vSum / n) * 100) / 100;
        }
        analyzedCount++;
      } catch (e) { /* sharpness failed for this image */ }
    }
  }
}

// --- Stage 2: Perceptual hash (pHash) computation and similarity grouping ---
// Uses average hash (aHash): resize to 8x8 grayscale, compare mean to produce 64-bit hash.
// Hamming distance < similarityThreshold → visually similar.
if (!skipPHash && sharp) {
  // Collect all images flat for pHash computation
  var allImages = [];
  for (var pg = 0; pg < session.groups.length; pg++) {
    for (var pi2 = 0; pi2 < session.groups[pg].images.length; pi2++) {
      allImages.push({ groupIdx: pg, imageIdx: pi2, image: session.groups[pg].images[pi2] });
    }
  }

  // Compute pHash for each image
  for (var hi = 0; hi < allImages.length; hi++) {
    var himg = allImages[hi].image;
    if (himg.pHash) { pHashCount++; continue; } // Already computed
    try {
      // Resize to 8x8 grayscale and get raw pixel values
      var hashBuf = await sharp(himg.path, { failOn: "none" })
        .resize(8, 8, { fit: "fill" })
        .grayscale()
        .raw()
        .toBuffer();

      // Compute mean pixel value
      var hashPixels = new Uint8Array(hashBuf);
      var hashSum = 0;
      for (var hpi = 0; hpi < hashPixels.length; hpi++) hashSum += hashPixels[hpi];
      var hashMean = hashSum / hashPixels.length;

      // Generate 64-bit hash: each pixel > mean = 1, else 0
      var hashBits = [];
      for (var hbi = 0; hbi < hashPixels.length; hbi++) {
        hashBits.push(hashPixels[hbi] >= hashMean ? 1 : 0);
      }

      // Pack into hex string (16 hex chars = 64 bits)
      var hashHex = "";
      for (var hxi = 0; hxi < hashBits.length; hxi += 4) {
        var nibble = (hashBits[hxi] << 3) | (hashBits[hxi + 1] << 2) | (hashBits[hxi + 2] << 1) | hashBits[hxi + 3];
        hashHex += nibble.toString(16);
      }

      himg.pHash = hashHex;
      pHashCount++;
    } catch (e) {
      // pHash computation failed — skip
      himg.pHash = null;
    }
  }

  // Compute Hamming distance between two hex hash strings
  function hammingDistance(hash1, hash2) {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) return 64;
    var dist = 0;
    for (var di = 0; di < hash1.length; di++) {
      var xor = parseInt(hash1[di], 16) ^ parseInt(hash2[di], 16);
      // Count bits in xor (each hex digit = 4 bits max)
      while (xor > 0) { dist += xor & 1; xor >>= 1; }
    }
    return dist;
  }

  // Find similarity clusters across all images
  var visited = {};
  for (var s1 = 0; s1 < allImages.length; s1++) {
    if (visited[s1]) continue;
    var img1 = allImages[s1].image;
    if (!img1.pHash) continue;

    var cluster = [s1];
    visited[s1] = true;

    for (var s2 = s1 + 1; s2 < allImages.length; s2++) {
      if (visited[s2]) continue;
      var img2 = allImages[s2].image;
      if (!img2.pHash) continue;

      var dist = hammingDistance(img1.pHash, img2.pHash);
      if (dist <= similarityThreshold) {
        cluster.push(s2);
        visited[s2] = true;
      }
    }

    // Only record clusters with 2+ images from different groups
    if (cluster.length > 1) {
      var groupSet = {};
      for (var ci2 = 0; ci2 < cluster.length; ci2++) {
        groupSet[allImages[cluster[ci2]].groupIdx] = true;
      }
      var crossGroup = Object.keys(groupSet).length > 1;

      if (crossGroup) {
        var simGroup = {
          similarGroupId: "S" + String(similarityGroups.length + 1).padStart(3, "0"),
          images: cluster.map(function(idx) {
            return {
              path: allImages[idx].image.path,
              filename: allImages[idx].image.filename,
              groupId: session.groups[allImages[idx].groupIdx].groupId,
              pHash: allImages[idx].image.pHash
            };
          })
        };
        similarityGroups.push(simGroup);
      }

      // Tag each image with its similarity group
      for (var tagi = 0; tagi < cluster.length; tagi++) {
        var tagImg = allImages[cluster[tagi]].image;
        if (!tagImg.similarTo) tagImg.similarTo = [];
        for (var tagj = 0; tagj < cluster.length; tagj++) {
          if (tagi !== tagj) {
            var otherImg = allImages[cluster[tagj]].image;
            tagImg.similarTo.push({
              filename: otherImg.filename,
              groupId: session.groups[allImages[cluster[tagj]].groupIdx].groupId,
              distance: hammingDistance(tagImg.pHash, otherImg.pHash)
            });
          }
        }
      }
    }
  }
}

// --- Stage 3: Face detection (via @vladmandic/face-api) ---
if (!skipFaces && sharp) {
  var faceapi = null;
  try { faceapi = require("@vladmandic/face-api"); } catch (e) { faceapi = null; }
  if (faceapi) {
    var modelsDir = null;
    var modelCandidates = [path.resolve(process.cwd(), "node_modules", "@vladmandic", "face-api", "model"), path.resolve(process.cwd(), "models")];
    for (var mc = 0; mc < modelCandidates.length; mc++) { try { fs.statSync(modelCandidates[mc]); modelsDir = modelCandidates[mc]; break; } catch (e) { /* */ } }
    if (modelsDir) {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsDir);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsDir);
        var tf = faceapi.tf; if (!tf) { try { tf = require("@tensorflow/tfjs-node"); } catch (e) { tf = null; } }
        if (tf) {
          for (var fg = 0; fg < session.groups.length; fg++) {
            for (var fi = 0; fi < session.groups[fg].images.length; fi++) {
              var fimg = session.groups[fg].images[fi];
              if (fimg.faces && fimg.faces.length > 0) continue;
              try {
                var faceResult = await sharp(fimg.path, { failOn: "none" }).resize(640, 640, { fit: "inside", withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
                var faceTensor = tf.tensor3d(new Uint8Array(faceResult.data), [faceResult.info.height, faceResult.info.width, 3]);
                var detections = await faceapi.detectAllFaces(faceTensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceLandmarks();
                faceTensor.dispose();
                var faces = [];
                for (var di = 0; di < detections.length; di++) {
                  var det = detections[di]; var box = det.detection.box; var landmarks = det.landmarks.positions;
                  var leftEAR = 0, rightEAR = 0, avgEAR = 0, eyesClosed = false;
                  if (landmarks && landmarks.length >= 68) {
                    var edist = function(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)); };
                    var le = landmarks.slice(36, 42); if (le.length === 6) leftEAR = (edist(le[1], le[5]) + edist(le[2], le[4])) / (2 * edist(le[0], le[3]));
                    var re = landmarks.slice(42, 48); if (re.length === 6) rightEAR = (edist(re[1], re[5]) + edist(re[2], re[4])) / (2 * edist(re[0], re[3]));
                    avgEAR = (leftEAR + rightEAR) / 2; eyesClosed = avgEAR > 0 && avgEAR < earThreshold;
                  }
                  faces.push({ box: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }, confidence: Math.round(det.detection.score * 1000) / 1000, avgEAR: Math.round(avgEAR * 1000) / 1000, eyesClosed: eyesClosed });
                }
                fimg.faces = faces;
                fimg.eyesClosedFlag = faces.some(function(f) { return f.eyesClosed; });
              } catch (e) { /* face detection failed */ }
            }
          }
        }
      } catch (e) { /* model loading failed */ }
    }
  }
}

// --- Stage 4: Re-rank within groups and update flags ---
var blurFlagged = 0, eyesClosedFlagged = 0;
for (var rg = 0; rg < session.groups.length; rg++) {
  var grp = session.groups[rg];
  grp.images.sort(function(a, b) { return (b.sharpnessScore || 0) - (a.sharpnessScore || 0); });
  var maxScore = grp.images[0] ? (grp.images[0].sharpnessScore || 0) : 0;
  var minScore = grp.images[grp.images.length - 1] ? (grp.images[grp.images.length - 1].sharpnessScore || 0) : 0;
  var scoreRange = maxScore - minScore;

  for (var ri = 0; ri < grp.images.length; ri++) {
    var rimg = grp.images[ri];
    rimg.isSharpest = ri === 0;
    rimg.blurFlag = (rimg.sharpnessScore || 0) < blurThreshold;
    rimg.sharpnessNormalized = scoreRange > 0 ? Math.round(((rimg.sharpnessScore - minScore) / scoreRange) * 100) : (rimg.sharpnessScore >= blurThreshold ? 100 : 0);
    if (!rimg.mediaUrl && rimg.path) rimg.mediaUrl = "/media/" + Buffer.from(rimg.path).toString("base64url");
    if (rimg.blurFlag) blurFlagged++;
    if (rimg.eyesClosedFlag) eyesClosedFlagged++;

    // Update auto-suggestions
    if (grp.images.length === 1) {
      if (rimg.blurFlag) { rimg.autoSuggestion = "reject"; rimg.autoReason = "Blurry (score: " + Math.round(rimg.sharpnessScore) + ")"; }
      else if (rimg.eyesClosedFlag) { rimg.autoSuggestion = "reject"; rimg.autoReason = "Eyes closed"; }
      else { rimg.autoSuggestion = "approve"; rimg.autoReason = "Single image, no issues"; }
    } else if (rimg.isSharpest) {
      rimg.autoSuggestion = rimg.eyesClosedFlag ? null : "approve";
      rimg.autoReason = rimg.eyesClosedFlag ? "Sharpest but eyes closed" : "Sharpest in burst of " + grp.images.length;
    } else if (rimg.blurFlag) { rimg.autoSuggestion = "reject"; rimg.autoReason = "Blurry (score: " + Math.round(rimg.sharpnessScore) + ")"; }
    else if (rimg.eyesClosedFlag) { rimg.autoSuggestion = "reject"; rimg.autoReason = "Eyes closed"; }
    else { rimg.autoSuggestion = "reject"; rimg.autoReason = "Superseded by sharper image"; }

    analyzedCount++;
  }
}

session.stats.blurFlagged = blurFlagged;
session.stats.eyesClosedFlagged = eyesClosedFlagged;

// Save session
try { var tempPath = sessionPath + ".tmp"; fs.writeFileSync(tempPath, JSON.stringify(session, null, 2), "utf-8"); fs.renameSync(tempPath, sessionPath); } catch (e) { /* non-fatal */ }

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: TOOL, sessionId: session.sessionId, analyzed: analyzedCount,
      totalImages: session.totalImages, totalGroups: session.totalGroups,
      pHashComputed: pHashCount,
      similarityGroups: similarityGroups.length > 0 ? similarityGroups : undefined,
      stats: session.stats, groups: session.groups, settings: session.settings,
      message: "Analyzed " + analyzedCount + " images: " + blurFlagged + " blur-flagged, " + eyesClosedFlagged + " eyes-closed" + (pHashCount > 0 ? ", " + pHashCount + " pHash computed" : "") + (similarityGroups.length > 0 ? ", " + similarityGroups.length + " cross-group similarity clusters found" : "")
    })
  }]
};
