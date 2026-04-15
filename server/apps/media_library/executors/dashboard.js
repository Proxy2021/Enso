var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var colDir = path.join(os.homedir(), ".enso", "data", "media-library");
var colPath = path.join(colDir, "collections.json");
var embCachePath = path.join(colDir, "embeddings-cache.json");

// ── Load entity index ──
var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_dashboard",
        error: "Could not load entity index: " + e.message,
        healthScore: 0,
        overview: {},
        gaps: [],
        quickActions: []
      })
    }]
  };
}

// ── Load collections ──
var colData = { collections: [] };
try {
  var colRaw = fs.readFileSync(colPath, "utf8");
  colData = JSON.parse(colRaw);
  if (!colData.collections) colData.collections = [];
} catch (e) {
  colData = { collections: [] };
}

// ── Load embedding cache ──
var embCache = {};
try {
  var embRaw = fs.readFileSync(embCachePath, "utf8");
  embCache = JSON.parse(embRaw);
} catch (e) {
  embCache = {};
}

// ── Filter media entities ──
var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "song", "artist", "playlist", "article"];
var allEntities = Object.values(index);
var entities = [];
for (var i = 0; i < allEntities.length; i++) {
  if (mediaEntityTypes.indexOf(allEntities[i].type) !== -1) {
    entities.push(allEntities[i]);
  }
}

// ══════════════════════════════════════════════
// 1. LIBRARY OVERVIEW
// ══════════════════════════════════════════════
var typeCounts = {};
var typeLabels = {
  "book": "books", "movie": "movies", "tv-series": "tv",
  "documentary": "documentaries", "game": "games",
  "song": "music", "artist": "music", "playlist": "music",
  "article": "articles"
};

for (var tc = 0; tc < entities.length; tc++) {
  var t = entities[tc].type;
  typeCounts[t] = (typeCounts[t] || 0) + 1;
}

// Aggregate into user-facing categories
var categoryCounts = {};
for (var ck in typeCounts) {
  var label = typeLabels[ck] || ck;
  categoryCounts[label] = (categoryCounts[label] || 0) + typeCounts[ck];
}

// Ratings
var ratedCount = 0;
var ratingSum = 0;
var ratingDistribution = {};
for (var ri = 0; ri < entities.length; ri++) {
  var rating = entities[ri].userRating;
  if (rating && rating > 0) {
    ratedCount++;
    ratingSum += rating;
    var rKey = String(Math.floor(rating));
    ratingDistribution[rKey] = (ratingDistribution[rKey] || 0) + 1;
  }
}

// Favorites
var favoriteCount = 0;
for (var fi = 0; fi < entities.length; fi++) {
  if (entities[fi].isFavorite) favoriteCount++;
}

// Consumption status
var statusDist = { not_started: 0, in_progress: 0, completed: 0, dropped: 0, on_hold: 0 };
var statusTrackedCount = 0;
for (var si = 0; si < entities.length; si++) {
  var st = entities[si].consumptionStatus;
  if (st && st !== "not_started") {
    statusDist[st] = (statusDist[st] || 0) + 1;
    statusTrackedCount++;
  } else {
    statusDist["not_started"] = (statusDist["not_started"] || 0) + 1;
  }
}

// Collections
var manualCollections = 0;
var smartCollections = 0;
var entitiesInCollections = {};
for (var ci = 0; ci < colData.collections.length; ci++) {
  var col = colData.collections[ci];
  if (col.isSmartCollection || (col.id && col.id.indexOf("smart:") === 0)) {
    smartCollections++;
  } else {
    manualCollections++;
  }
  var eids = col.entityIds || [];
  for (var ei = 0; ei < eids.length; ei++) {
    entitiesInCollections[eids[ei]] = true;
  }
}
var inCollectionsCount = Object.keys(entitiesInCollections).length;

// Semantic tags
var entitiesWithSemanticTags = 0;
var totalSemanticTags = 0;
for (var sti = 0; sti < entities.length; sti++) {
  var stags = entities[sti].semanticTags || [];
  if (stags.length > 0) {
    entitiesWithSemanticTags++;
    totalSemanticTags += stags.length;
  }
}

// Cross-references
var totalCrossRefs = 0;
var entitiesWithCrossRefs = 0;
for (var cri = 0; cri < entities.length; cri++) {
  var refs = entities[cri].crossReferences || [];
  if (refs.length > 0) {
    entitiesWithCrossRefs++;
    totalCrossRefs += refs.length;
  }
}

// Embeddings
var embeddingCount = Object.keys(embCache).length;

// Source counts
var sourceCounts = {};
for (var sc = 0; sc < entities.length; sc++) {
  var s = entities[sc].source || "unknown";
  sourceCounts[s] = (sourceCounts[s] || 0) + 1;
}

var overview = {
  totalEntities: entities.length,
  categoryCounts: categoryCounts,
  typeCounts: typeCounts,
  sourceCounts: sourceCounts,
  ratedCount: ratedCount,
  unratedCount: entities.length - ratedCount,
  ratedPercent: entities.length > 0 ? Math.round((ratedCount / entities.length) * 1000) / 10 : 0,
  averageRating: ratedCount > 0 ? Math.round((ratingSum / ratedCount) * 10) / 10 : null,
  ratingDistribution: ratingDistribution,
  favoriteCount: favoriteCount,
  favoritePercent: entities.length > 0 ? Math.round((favoriteCount / entities.length) * 1000) / 10 : 0,
  statusDistribution: statusDist,
  statusTrackedCount: statusTrackedCount,
  statusTrackedPercent: entities.length > 0 ? Math.round((statusTrackedCount / entities.length) * 1000) / 10 : 0,
  manualCollections: manualCollections,
  smartCollections: smartCollections,
  totalCollections: manualCollections + smartCollections,
  inCollectionsCount: inCollectionsCount,
  inCollectionsPercent: entities.length > 0 ? Math.round((inCollectionsCount / entities.length) * 1000) / 10 : 0,
  semanticTagCoverage: entities.length > 0 ? Math.round((entitiesWithSemanticTags / entities.length) * 1000) / 10 : 0,
  avgSemanticTags: entitiesWithSemanticTags > 0 ? Math.round((totalSemanticTags / entitiesWithSemanticTags) * 10) / 10 : 0,
  crossRefDensity: entities.length > 0 ? Math.round((totalCrossRefs / entities.length) * 100) / 100 : 0,
  entitiesWithCrossRefs: entitiesWithCrossRefs,
  embeddingCount: embeddingCount,
  embeddingPercent: entities.length > 0 ? Math.round((embeddingCount / entities.length) * 1000) / 10 : 0
};

// ══════════════════════════════════════════════
// 2. ENGAGEMENT HEALTH SCORE (0-100)
// ══════════════════════════════════════════════
var total = entities.length || 1;
var ratedPct = ratedCount / total;
var favoritedPct = favoriteCount / total;
var statusPct = statusTrackedCount / total;
var collectionPct = inCollectionsCount / total;
var tagPct = entitiesWithSemanticTags / total;

var healthScore = Math.round(
  (ratedPct * 30) + (favoritedPct * 20) + (statusPct * 20) + (collectionPct * 15) + (tagPct * 15)
);
// Clamp to 0-100
healthScore = Math.max(0, Math.min(100, healthScore));

var healthColor = healthScore < 30 ? "red" : (healthScore < 60 ? "amber" : "emerald");

var healthBreakdown = [
  { label: "Rated", weight: 30, rawPercent: Math.round(ratedPct * 1000) / 10, contribution: Math.round(ratedPct * 30 * 10) / 10 },
  { label: "Favorited", weight: 20, rawPercent: Math.round(favoritedPct * 1000) / 10, contribution: Math.round(favoritedPct * 20 * 10) / 10 },
  { label: "Status Tracked", weight: 20, rawPercent: Math.round(statusPct * 1000) / 10, contribution: Math.round(statusPct * 20 * 10) / 10 },
  { label: "In Collections", weight: 15, rawPercent: Math.round(collectionPct * 1000) / 10, contribution: Math.round(collectionPct * 15 * 10) / 10 },
  { label: "Semantic Tags", weight: 15, rawPercent: Math.round(tagPct * 1000) / 10, contribution: Math.round(tagPct * 15 * 10) / 10 }
];

// ══════════════════════════════════════════════
// 3. COVERAGE GAPS
// ══════════════════════════════════════════════
var gaps = [];

// Per-type engagement rates
var typeEngagement = [];
var typeKeys = Object.keys(typeCounts);
for (var tei = 0; tei < typeKeys.length; tei++) {
  var typ = typeKeys[tei];
  var typeTotal = typeCounts[typ];
  var typeRated = 0;
  var typeFav = 0;
  var typeTracked = 0;
  var typeWithTags = 0;
  for (var tej = 0; tej < entities.length; tej++) {
    if (entities[tej].type !== typ) continue;
    if (entities[tej].userRating && entities[tej].userRating > 0) typeRated++;
    if (entities[tej].isFavorite) typeFav++;
    if (entities[tej].consumptionStatus && entities[tej].consumptionStatus !== "not_started") typeTracked++;
    if ((entities[tej].semanticTags || []).length > 0) typeWithTags++;
  }
  var engRate = typeTotal > 0 ? Math.round(((typeRated + typeFav + typeTracked) / (typeTotal * 3)) * 1000) / 10 : 0;
  typeEngagement.push({
    type: typ,
    count: typeTotal,
    rated: typeRated,
    ratedPercent: typeTotal > 0 ? Math.round((typeRated / typeTotal) * 1000) / 10 : 0,
    favorited: typeFav,
    tracked: typeTracked,
    withTags: typeWithTags,
    withTagsPercent: typeTotal > 0 ? Math.round((typeWithTags / typeTotal) * 1000) / 10 : 0,
    engagementRate: engRate
  });
}
typeEngagement.sort(function(a, b) { return a.engagementRate - b.engagementRate; });

// Flag types with < 5% engagement
for (var gti = 0; gti < typeEngagement.length; gti++) {
  if (typeEngagement[gti].engagementRate < 5 && typeEngagement[gti].count >= 5) {
    gaps.push({
      type: "low_engagement",
      severity: "high",
      mediaType: typeEngagement[gti].type,
      message: typeEngagement[gti].type.replace("-", " ") + " (" + typeEngagement[gti].count + " items): only " + typeEngagement[gti].engagementRate + "% engagement",
      count: typeEngagement[gti].count
    });
  }
}

// High external ratings but no user rating (opportunities)
var opportunities = [];
for (var oi = 0; oi < entities.length; oi++) {
  var ent = entities[oi];
  if (ent.userRating && ent.userRating > 0) continue;
  // Check for external ratings in metadata
  var extRating = null;
  var meta = ent.metadata || ent;
  if (meta.averageRating && meta.averageRating >= 4) extRating = meta.averageRating;
  else if (meta.imdbRating && meta.imdbRating >= 7) extRating = meta.imdbRating;
  else if (meta.metacritic && meta.metacritic >= 75) extRating = meta.metacritic / 10;
  else if (meta.voteAverage && meta.voteAverage >= 7) extRating = meta.voteAverage;

  if (extRating !== null) {
    opportunities.push({
      entityId: ent.entityId,
      title: ent.title,
      type: ent.type,
      imageUrl: ent.imageUrl || null,
      externalRating: extRating
    });
  }
}
opportunities.sort(function(a, b) { return (b.externalRating || 0) - (a.externalRating || 0); });
var topOpportunities = opportunities.slice(0, 10);

if (opportunities.length > 0) {
  gaps.push({
    type: "unrated_popular",
    severity: "medium",
    message: opportunities.length + " highly-rated items have no user rating — rate them to improve discovery",
    count: opportunities.length
  });
}

// Types with missing enrichment
for (var mei = 0; mei < typeEngagement.length; mei++) {
  if (typeEngagement[mei].withTagsPercent < 30 && typeEngagement[mei].count >= 5) {
    gaps.push({
      type: "missing_tags",
      severity: "medium",
      mediaType: typeEngagement[mei].type,
      message: typeEngagement[mei].type.replace("-", " ") + ": only " + typeEngagement[mei].withTagsPercent + "% have semantic tags",
      count: typeEngagement[mei].count
    });
  }
}

// Music gap
var musicCount = (typeCounts["song"] || 0) + (typeCounts["artist"] || 0) + (typeCounts["playlist"] || 0);
if (musicCount < 5) {
  gaps.push({
    type: "music_gap",
    severity: "high",
    message: "Music is nearly empty (" + musicCount + " entities) — scan your music library",
    count: musicCount
  });
}

// ══════════════════════════════════════════════
// 4. DISCOVERY READINESS
// ══════════════════════════════════════════════
var tasteProfileStrength = "none";
var tasteRatedCount = 0;
for (var tpi = 0; tpi < entities.length; tpi++) {
  if (entities[tpi].userRating && entities[tpi].userRating > 0) tasteRatedCount++;
  if (entities[tpi].isFavorite) tasteRatedCount++;
}
if (tasteRatedCount >= 50) tasteProfileStrength = "strong";
else if (tasteRatedCount >= 20) tasteProfileStrength = "moderate";
else if (tasteRatedCount >= 5) tasteProfileStrength = "weak";
else tasteProfileStrength = "none";

var discovery = {
  tasteProfileStrength: tasteProfileStrength,
  tasteSignals: tasteRatedCount,
  semanticTagCoverage: overview.semanticTagCoverage,
  crossRefDensity: overview.crossRefDensity,
  entitiesWithCrossRefs: entitiesWithCrossRefs,
  crossRefPercent: entities.length > 0 ? Math.round((entitiesWithCrossRefs / entities.length) * 1000) / 10 : 0,
  embeddingsCached: embeddingCount,
  embeddingsPercent: overview.embeddingPercent,
  overallReadiness: "not_ready"
};

// Compute overall readiness
var readinessScore = 0;
if (tasteProfileStrength === "strong") readinessScore += 3;
else if (tasteProfileStrength === "moderate") readinessScore += 2;
else if (tasteProfileStrength === "weak") readinessScore += 1;
if (overview.semanticTagCoverage >= 50) readinessScore += 2;
else if (overview.semanticTagCoverage >= 25) readinessScore += 1;
if (overview.crossRefDensity >= 1) readinessScore += 2;
else if (overview.crossRefDensity >= 0.3) readinessScore += 1;
if (overview.embeddingPercent >= 30) readinessScore += 2;
else if (overview.embeddingPercent >= 10) readinessScore += 1;

if (readinessScore >= 7) discovery.overallReadiness = "ready";
else if (readinessScore >= 4) discovery.overallReadiness = "partial";
else discovery.overallReadiness = "not_ready";

// ══════════════════════════════════════════════
// 5. QUICK ACTIONS
// ══════════════════════════════════════════════
var quickActions = [];

if (ratedCount < entities.length * 0.1) {
  quickActions.push({
    id: "batch_seed",
    label: "Auto-Seed Ratings",
    description: "Auto-generate ~800+ ratings from Amazon/TMDB/Metacritic data",
    priority: "high",
    action: "batch_seed",
    actionParams: {}
  });
}

if (manualCollections + smartCollections === 0) {
  quickActions.push({
    id: "smart_collections",
    label: "Generate Smart Collections",
    description: "Auto-organize your library into thematic collections",
    priority: "high",
    action: "smart_collections",
    actionParams: { action: "generate" }
  });
}

if (musicCount < 5) {
  quickActions.push({
    id: "scan_music",
    label: "Scan Music Library",
    description: "Import your music collection to close the music gap",
    priority: "medium",
    action: "add",
    actionParams: { type: "album" }
  });
}

// "Rate your top 10" — pick popular unrated items
if (topOpportunities.length > 0) {
  quickActions.push({
    id: "rate_top_10",
    label: "Rate Top 10 Unrated",
    description: "Rate " + Math.min(10, topOpportunities.length) + " popular items to boost discovery accuracy",
    priority: "medium",
    items: topOpportunities.slice(0, 10)
  });
}

if (ratedCount > 0 && overview.embeddingPercent < 10) {
  quickActions.push({
    id: "compute_embeddings",
    label: "Compute Embeddings",
    description: "Generate AI embeddings for smarter recommendations",
    priority: "low",
    action: "discover",
    actionParams: {}
  });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_dashboard",
      overview: overview,
      healthScore: healthScore,
      healthColor: healthColor,
      healthBreakdown: healthBreakdown,
      typeEngagement: typeEngagement,
      gaps: gaps,
      discovery: discovery,
      quickActions: quickActions,
      topOpportunities: topOpportunities,
      generatedAt: new Date().toISOString()
    })
  }]
};
