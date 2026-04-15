var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var mediaTypeFilter = (params.mediaType || "").trim();
var limit = params.limit || 5;

var typeMap = {
  books: ["book"],
  movies: ["movie"],
  tv: ["tv-series"],
  documentaries: ["documentary"],
  games: ["game"],
  music: ["song", "artist", "playlist"],
  articles: ["article"],
  photos: ["album"]
};

// ── Load entity index ──
var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_discover", error: "Could not load entity index", categories: [] })
    }]
  };
}

var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "song", "artist", "playlist", "article"];
var allowedTypes = null;
if (mediaTypeFilter && typeMap[mediaTypeFilter]) {
  allowedTypes = typeMap[mediaTypeFilter];
}

var allEntities = Object.values(index);
var entities = [];
for (var i = 0; i < allEntities.length; i++) {
  var e = allEntities[i];
  if (mediaEntityTypes.indexOf(e.type) === -1) continue;
  entities.push(e);
}

// ── Load taste profile (cached or inline fallback) ──
var cachedTasteProfile = null;
var tasteProfilePath = path.join(os.homedir(), ".enso", "data", "media-library", "taste-profile.json");
try {
  if (fs.existsSync(tasteProfilePath)) {
    var tpRaw = fs.readFileSync(tasteProfilePath, "utf8");
    cachedTasteProfile = JSON.parse(tpRaw);
  }
} catch (e) { /* cache miss — fall back to inline */ }

var favorited = [];
var highlyRated = [];
var completed = [];
var unstarted = [];

for (var fi = 0; fi < entities.length; fi++) {
  var ent = entities[fi];
  if (ent.isFavorite) favorited.push(ent);
  if (ent.userRating && ent.userRating >= 7) highlyRated.push(ent);
  if (ent.consumptionStatus === "completed") completed.push(ent);
  if (!ent.consumptionStatus || ent.consumptionStatus === "not_started") unstarted.push(ent);
}

// Taste entities = union of favorites and highly rated
var tasteEntities = [];
var tasteIdSet = {};
for (var te = 0; te < favorited.length; te++) {
  if (!tasteIdSet[favorited[te].entityId]) {
    tasteIdSet[favorited[te].entityId] = true;
    tasteEntities.push(favorited[te]);
  }
}
for (var te2 = 0; te2 < highlyRated.length; te2++) {
  if (!tasteIdSet[highlyRated[te2].entityId]) {
    tasteIdSet[highlyRated[te2].entityId] = true;
    tasteEntities.push(highlyRated[te2]);
  }
}

// Use cached taste profile tags if available, otherwise compute inline
var topTasteTags = [];
var topTagNames = [];

if (cachedTasteProfile && cachedTasteProfile.topTags && cachedTasteProfile.topTags.length > 0) {
  topTasteTags = cachedTasteProfile.topTags.slice(0, 10);
  topTagNames = topTasteTags.map(function(t) { return t.tag; });
} else {
  // Fallback: compute inline from taste entities
  var tasteTags = {};
  for (var ti = 0; ti < tasteEntities.length; ti++) {
    var stags = tasteEntities[ti].semanticTags || [];
    for (var tj = 0; tj < stags.length; tj++) {
      tasteTags[stags[tj]] = (tasteTags[stags[tj]] || 0) + 1;
    }
  }
  topTasteTags = Object.keys(tasteTags)
    .map(function(k) { return { tag: k, count: tasteTags[k] }; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 10);
  topTagNames = topTasteTags.map(function(t) { return t.tag; });
}

// ── Import shared embedding utilities from embeddings.ts ──
var emb = await import('../../../src/embeddings.js');
var cosineSimilarity = emb.cosineSimilarity;
var averageVectors = emb.averageVectors;
var getEntityEmbeddings = emb.getEntityEmbeddings;

// ── Main discovery logic ──

// Determine which entities need embeddings
var candidatePool = [];
for (var cp = 0; cp < unstarted.length; cp++) {
  if (allowedTypes && allowedTypes.indexOf(unstarted[cp].type) === -1) continue;
  candidatePool.push(unstarted[cp]);
}

// Try embedding-based discovery
var useEmbeddings = false;
var embeddingMethod = "tag-overlap";
var embeddingStats = { cached: 0, computed: 0 };
var allEmbeddings = {};
var tasteVector = null;
var scoredCandidates = [];

// Check if we have an API key (via process env accessible in executor sandbox)
var apiKey = "";
try {
  apiKey = require("process").env.GEMINI_API_KEY || "";
} catch (e) { /* no api key */ }

// Need at least 1 taste entity for embedding-based recommendations
if (apiKey && tasteEntities.length > 0) {
  try {
    // Get embeddings for all needed entities via shared module
    var allNeeded = tasteEntities.concat(candidatePool);
    var embResult = await getEntityEmbeddings(allNeeded);
    allEmbeddings = embResult.embeddings;
    embeddingStats.cached = embResult.cached;
    embeddingStats.computed = embResult.computed;

    // Build taste vector (centroid of taste entity embeddings)
    var tasteVectors = [];
    for (var tv = 0; tv < tasteEntities.length; tv++) {
      var teVec = allEmbeddings[tasteEntities[tv].entityId];
      if (teVec && teVec.length > 0) {
        tasteVectors.push(teVec);
      }
    }

    if (tasteVectors.length > 0) {
      tasteVector = averageVectors(tasteVectors);
      useEmbeddings = true;
      embeddingMethod = "embedding-cosine";

      // Score all candidates by cosine similarity to taste vector
      for (var sc = 0; sc < candidatePool.length; sc++) {
        var cand = candidatePool[sc];
        if (cand.isFavorite) continue;

        var candVec = allEmbeddings[cand.entityId];
        if (candVec && candVec.length > 0) {
          var sim = cosineSimilarity(tasteVector, candVec);
          scoredCandidates.push({
            entityId: cand.entityId,
            type: cand.type,
            title: cand.title,
            imageUrl: cand.imageUrl || null,
            semanticTags: (cand.semanticTags || []).slice(0, 5),
            similarity: sim,
            similarityPct: Math.round(sim * 100),
            reason: Math.round(sim * 100) + "% match to your taste profile"
          });
        }
      }

      scoredCandidates.sort(function(a, b) { return b.similarity - a.similarity; });
    }
  } catch (embedErr) {
    // Embedding failed — fall back to tag-overlap
    useEmbeddings = false;
    embeddingMethod = "tag-overlap (embedding error: " + (embedErr.message || embedErr) + ")";
  }
}

// ── Build categories ──

var categories = [];

if (useEmbeddings && scoredCandidates && scoredCandidates.length > 0) {
  // Category 1: Closest to your taste (top N by cosine similarity)
  var seen = {};
  var closestItems = [];
  for (var cl = 0; cl < scoredCandidates.length && closestItems.length < limit; cl++) {
    var ci = scoredCandidates[cl];
    if (!seen[ci.entityId]) {
      seen[ci.entityId] = true;
      closestItems.push(ci);
    }
  }
  categories.push({ title: "Closest to your taste", items: closestItems });

  // Category 2: Highly connected (cross-references to rated items — keep existing logic)
  var ratedIds = {};
  for (var ri = 0; ri < highlyRated.length; ri++) {
    ratedIds[highlyRated[ri].entityId] = true;
  }

  var crossRefScored = [];
  for (var cr = 0; cr < candidatePool.length; cr++) {
    var crItem = candidatePool[cr];
    if (seen[crItem.entityId]) continue;

    var refs = crItem.crossReferences || [];
    var refOverlap = 0;
    for (var rj = 0; rj < refs.length; rj++) {
      if (ratedIds[refs[rj].entityId]) refOverlap++;
    }
    if (refOverlap > 0) {
      // Also include similarity score if available
      var crVec = allEmbeddings[crItem.entityId];
      var crSim = 0;
      if (crVec && crVec.length > 0) {
        crSim = cosineSimilarity(tasteVector, crVec);
      }
      crossRefScored.push({
        entityId: crItem.entityId,
        type: crItem.type,
        title: crItem.title,
        imageUrl: crItem.imageUrl || null,
        overlapScore: refOverlap,
        similarity: crSim,
        similarityPct: Math.round(crSim * 100),
        reason: "Connected to " + refOverlap + " rated item(s)" + (crSim > 0 ? " \u2022 " + Math.round(crSim * 100) + "% match" : "")
      });
    }
  }
  crossRefScored.sort(function(a, b) { return b.overlapScore - a.overlapScore; });
  var connectedItems = [];
  for (var cn = 0; cn < crossRefScored.length && connectedItems.length < limit; cn++) {
    if (!seen[crossRefScored[cn].entityId]) {
      seen[crossRefScored[cn].entityId] = true;
      connectedItems.push(crossRefScored[cn]);
    }
  }
  categories.push({ title: "Highly connected", items: connectedItems });

  // Category 3: Cross-media exploration (top N from different media types)
  var favTypes = {};
  for (var ft = 0; ft < tasteEntities.length; ft++) {
    favTypes[tasteEntities[ft].type] = (favTypes[tasteEntities[ft].type] || 0) + 1;
  }
  // Find the primary type (most taste entities)
  var primaryType = "";
  var primaryCount = 0;
  var ftKeys = Object.keys(favTypes);
  for (var fk = 0; fk < ftKeys.length; fk++) {
    if (favTypes[ftKeys[fk]] > primaryCount) {
      primaryCount = favTypes[ftKeys[fk]];
      primaryType = ftKeys[fk];
    }
  }

  var crossMediaItems = [];
  for (var xm = 0; xm < scoredCandidates.length && crossMediaItems.length < limit; xm++) {
    var xmItem = scoredCandidates[xm];
    if (seen[xmItem.entityId]) continue;
    if (xmItem.type === primaryType) continue; // Skip primary consumption type
    seen[xmItem.entityId] = true;
    crossMediaItems.push({
      entityId: xmItem.entityId,
      type: xmItem.type,
      title: xmItem.title,
      imageUrl: xmItem.imageUrl || null,
      semanticTags: xmItem.semanticTags,
      similarity: xmItem.similarity,
      similarityPct: xmItem.similarityPct,
      reason: "Cross-media: " + xmItem.similarityPct + "% match from " + (xmItem.type || "").replace("-", " ")
    });
  }
  categories.push({ title: "Cross-media exploration", items: crossMediaItems });

} else {
  // ── FALLBACK: Tag-overlap logic (original algorithm) ──

  var seen = {};
  var dedup = function(arr) {
    var result = [];
    for (var d = 0; d < arr.length && result.length < limit; d++) {
      if (!seen[arr[d].entityId]) {
        seen[arr[d].entityId] = true;
        result.push(arr[d]);
      }
    }
    return result;
  };

  // Category 1: Based on favorites — tag overlap
  var favBasedScored = [];
  for (var fb = 0; fb < candidatePool.length; fb++) {
    var item = candidatePool[fb];
    if (item.isFavorite) continue;
    var stg = item.semanticTags || [];
    var overlap = 0;
    for (var si = 0; si < stg.length; si++) {
      if (topTagNames.indexOf(stg[si]) !== -1) overlap++;
    }
    if (overlap > 0) {
      favBasedScored.push({
        entityId: item.entityId,
        type: item.type,
        title: item.title,
        imageUrl: item.imageUrl || null,
        semanticTags: stg.slice(0, 5),
        overlapScore: overlap,
        similarity: null,
        similarityPct: null,
        reason: "Shares " + overlap + " theme(s) with your favorites: " + stg.filter(function(s) { return topTagNames.indexOf(s) !== -1; }).slice(0, 3).join(", ")
      });
    }
  }
  favBasedScored.sort(function(a, b) { return b.overlapScore - a.overlapScore; });
  categories.push({ title: "Based on your favorites", items: dedup(favBasedScored) });

  // Category 2: Cross-reference connections
  var ratedIds = {};
  for (var ri2 = 0; ri2 < highlyRated.length; ri2++) {
    ratedIds[highlyRated[ri2].entityId] = true;
  }
  var crossRefScored2 = [];
  for (var cr2 = 0; cr2 < candidatePool.length; cr2++) {
    var crItem2 = candidatePool[cr2];
    var refs2 = crItem2.crossReferences || [];
    var refOverlap2 = 0;
    for (var rj2 = 0; rj2 < refs2.length; rj2++) {
      if (ratedIds[refs2[rj2].entityId]) refOverlap2++;
    }
    if (refOverlap2 > 0) {
      crossRefScored2.push({
        entityId: crItem2.entityId,
        type: crItem2.type,
        title: crItem2.title,
        imageUrl: crItem2.imageUrl || null,
        overlapScore: refOverlap2,
        similarity: null,
        similarityPct: null,
        reason: "Connected to " + refOverlap2 + " of your highly-rated items"
      });
    }
  }
  crossRefScored2.sort(function(a, b) { return b.overlapScore - a.overlapScore; });
  categories.push({ title: "Highly connected to your rated items", items: dedup(crossRefScored2) });

  // Category 3: Cross-media connections
  var favTypes2 = {};
  for (var ft2 = 0; ft2 < tasteEntities.length; ft2++) {
    favTypes2[tasteEntities[ft2].type] = true;
  }
  var crossMediaScored2 = [];
  for (var cm2 = 0; cm2 < candidatePool.length; cm2++) {
    var cmItem2 = candidatePool[cm2];
    if (favTypes2[cmItem2.type]) continue;
    var cmTags2 = cmItem2.semanticTags || [];
    var cmOverlap2 = 0;
    for (var cmi2 = 0; cmi2 < cmTags2.length; cmi2++) {
      if (topTagNames.indexOf(cmTags2[cmi2]) !== -1) cmOverlap2++;
    }
    if (cmOverlap2 > 0) {
      crossMediaScored2.push({
        entityId: cmItem2.entityId,
        type: cmItem2.type,
        title: cmItem2.title,
        imageUrl: cmItem2.imageUrl || null,
        overlapScore: cmOverlap2,
        similarity: null,
        similarityPct: null,
        reason: "Different medium, similar themes: " + cmTags2.filter(function(s) { return topTagNames.indexOf(s) !== -1; }).slice(0, 3).join(", ")
      });
    }
  }
  crossMediaScored2.sort(function(a, b) { return b.overlapScore - a.overlapScore; });
  categories.push({ title: "Cross-media connections", items: dedup(crossMediaScored2) });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_discover",
      mediaType: mediaTypeFilter || "all",
      embeddingMethod: embeddingMethod,
      embeddingStats: embeddingStats,
      categories: categories,
      tasteProfile: {
        topTags: topTasteTags,
        totalFavorites: favorited.length,
        totalRated: highlyRated.length,
        totalCompleted: completed.length,
        totalUnstarted: unstarted.length,
        tasteEntityCount: tasteEntities.length,
        tasteDNA: cachedTasteProfile ? cachedTasteProfile.tasteDNA : null,
        fromCachedProfile: !!cachedTasteProfile
      }
    })
  }]
};
