var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var profileDir = path.join(os.homedir(), ".enso", "data", "media-library");
var profilePath = path.join(profileDir, "taste-profile.json");
var forceRefresh = params.refresh === true;

var CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Load entity index ──
var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_taste_profile", error: "Could not load entity index" })
    }]
  };
}

var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "song", "artist", "playlist", "article"];
var allEntities = Object.values(index);
var entities = [];
for (var i = 0; i < allEntities.length; i++) {
  if (mediaEntityTypes.indexOf(allEntities[i].type) !== -1) {
    entities.push(allEntities[i]);
  }
}

// ── Cache validation ──
// Find the latest updatedAt across all entities
var latestUpdatedAt = "";
for (var lu = 0; lu < entities.length; lu++) {
  var upd = entities[lu].updatedAt || "";
  if (upd > latestUpdatedAt) latestUpdatedAt = upd;
}

if (!forceRefresh) {
  try {
    if (fs.existsSync(profilePath)) {
      var cachedRaw = fs.readFileSync(profilePath, "utf8");
      var cachedProfile = JSON.parse(cachedRaw);
      var cacheAge = Date.now() - (cachedProfile.generatedAt || 0);
      var entityCountMatch = cachedProfile.entityCount === entities.length;
      var updatedAtMatch = cachedProfile.latestEntityUpdate === latestUpdatedAt;

      if (cacheAge < CACHE_TTL_MS && entityCountMatch && updatedAtMatch) {
        cachedProfile.fromCache = true;
        cachedProfile.cacheAge = Math.round(cacheAge / 60000) + " minutes";
        cachedProfile.tool = "enso_media_library_taste_profile";
        return {
          content: [{
            type: "text",
            text: JSON.stringify(cachedProfile)
          }]
        };
      }
    }
  } catch (e) { /* cache miss — regenerate */ }
}

// ── Analyze engagement data ──
var favorited = [];
var rated = [];
var completed = [];
var inProgress = [];
var allRatings = [];

// Engagement weights: favorite=3, rating>=8 → 2, completed=1
var entityWeights = {};

for (var ei = 0; ei < entities.length; ei++) {
  var ent = entities[ei];
  var weight = 0;

  if (ent.isFavorite) {
    favorited.push(ent);
    weight += 3;
  }
  if (ent.userRating && ent.userRating > 0) {
    allRatings.push(ent.userRating);
    if (ent.userRating >= 8) {
      rated.push(ent);
      weight += 2;
    } else if (ent.userRating >= 6) {
      weight += 1;
    }
  }
  if (ent.consumptionStatus === "completed") {
    completed.push(ent);
    weight += 1;
  }
  if (ent.consumptionStatus === "in_progress") {
    inProgress.push(ent);
  }

  if (weight > 0) {
    entityWeights[ent.entityId] = weight;
  }
}

// ── Genre/Theme Affinities ──
// Weighted semantic tag frequencies from engaged entities
var genreScores = {};
var engagedEntityIds = Object.keys(entityWeights);

for (var gi = 0; gi < engagedEntityIds.length; gi++) {
  var gEnt = index[engagedEntityIds[gi]];
  if (!gEnt) continue;
  var gWeight = entityWeights[engagedEntityIds[gi]];
  var gTags = (gEnt.semanticTags || []).concat(gEnt.tags || []);

  for (var gj = 0; gj < gTags.length; gj++) {
    var tag = gTags[gj].toLowerCase();
    // Skip generic source/type tags
    if (["book", "kindle", "weread", "steam", "game", "movie", "video", "photo-album", "photos",
         "music", "artist", "qq-music", "youtube", "channel", "subscription", "project"].indexOf(tag) !== -1) continue;
    genreScores[tag] = (genreScores[tag] || 0) + gWeight;
  }
}

var genreAffinities = Object.keys(genreScores)
  .map(function(k) { return { genre: k, score: genreScores[k] }; })
  .sort(function(a, b) { return b.score - a.score; })
  .slice(0, 25);

// ── Media Preferences ──
var mediaTypeCounts = {};
var mediaTypeEngaged = {};
for (var mi = 0; mi < entities.length; mi++) {
  var mType = entities[mi].type;
  mediaTypeCounts[mType] = (mediaTypeCounts[mType] || 0) + 1;
}
for (var mei = 0; mei < engagedEntityIds.length; mei++) {
  var mEnt = index[engagedEntityIds[mei]];
  if (mEnt) {
    mediaTypeEngaged[mEnt.type] = (mediaTypeEngaged[mEnt.type] || 0) + 1;
  }
}

var mediaPreferences = Object.keys(mediaTypeCounts)
  .map(function(k) {
    var total = mediaTypeCounts[k];
    var engaged = mediaTypeEngaged[k] || 0;
    return {
      type: k,
      total: total,
      engaged: engaged,
      engagementRate: total > 0 ? Math.round((engaged / total) * 1000) / 10 : 0
    };
  })
  .sort(function(a, b) { return b.engaged - a.engaged; });

// ── Top Tags (all engaged items, frequency-sorted) ──
var tagFrequency = {};
for (var ti = 0; ti < engagedEntityIds.length; ti++) {
  var tEnt = index[engagedEntityIds[ti]];
  if (!tEnt) continue;
  var sTags = tEnt.semanticTags || [];
  for (var tj = 0; tj < sTags.length; tj++) {
    tagFrequency[sTags[tj]] = (tagFrequency[sTags[tj]] || 0) + 1;
  }
}

var topTags = Object.keys(tagFrequency)
  .map(function(k) { return { tag: k, count: tagFrequency[k] }; })
  .sort(function(a, b) { return b.count - a.count; })
  .slice(0, 20);

// ── Consumption Patterns ──
var totalRatingSum = 0;
for (var rs = 0; rs < allRatings.length; rs++) {
  totalRatingSum += allRatings[rs];
}
var avgRating = allRatings.length > 0 ? Math.round((totalRatingSum / allRatings.length) * 10) / 10 : null;

// Top 5 rated items
var ratedSorted = [];
for (var rsi = 0; rsi < entities.length; rsi++) {
  if (entities[rsi].userRating && entities[rsi].userRating > 0) {
    ratedSorted.push(entities[rsi]);
  }
}
ratedSorted.sort(function(a, b) { return (b.userRating || 0) - (a.userRating || 0); });
var topRatedItems = [];
for (var tri = 0; tri < Math.min(5, ratedSorted.length); tri++) {
  topRatedItems.push({
    entityId: ratedSorted[tri].entityId,
    title: ratedSorted[tri].title,
    type: ratedSorted[tri].type,
    userRating: ratedSorted[tri].userRating,
    imageUrl: ratedSorted[tri].imageUrl || null
  });
}

var consumptionPatterns = {
  totalRated: allRatings.length,
  totalFavorites: favorited.length,
  totalCompleted: completed.length,
  totalInProgress: inProgress.length,
  avgRating: avgRating,
  completionRate: entities.length > 0 ? Math.round((completed.length / entities.length) * 1000) / 10 : 0,
  topRatedItems: topRatedItems
};

// ── Cross-Media Connections ──
// Find themes (semantic tags) that span multiple media types
var tagTypeMap = {};
for (var ci = 0; ci < engagedEntityIds.length; ci++) {
  var cEnt = index[engagedEntityIds[ci]];
  if (!cEnt) continue;
  var cTags = cEnt.semanticTags || [];
  for (var cj = 0; cj < cTags.length; cj++) {
    var cTag = cTags[cj];
    if (!tagTypeMap[cTag]) tagTypeMap[cTag] = {};
    tagTypeMap[cTag][cEnt.type] = (tagTypeMap[cTag][cEnt.type] || 0) + 1;
  }
}

var crossMediaConnections = [];
var tagTypeKeys = Object.keys(tagTypeMap);
for (var cmk = 0; cmk < tagTypeKeys.length; cmk++) {
  var cmTag = tagTypeKeys[cmk];
  var types = Object.keys(tagTypeMap[cmTag]);
  if (types.length >= 2) {
    var totalCount = 0;
    for (var cmj = 0; cmj < types.length; cmj++) {
      totalCount += tagTypeMap[cmTag][types[cmj]];
    }
    crossMediaConnections.push({
      theme: cmTag,
      mediaTypes: types,
      typeBreakdown: tagTypeMap[cmTag],
      totalOccurrences: totalCount
    });
  }
}
crossMediaConnections.sort(function(a, b) {
  if (b.mediaTypes.length !== a.mediaTypes.length) return b.mediaTypes.length - a.mediaTypes.length;
  return b.totalOccurrences - a.totalOccurrences;
});
crossMediaConnections = crossMediaConnections.slice(0, 15);

// ── Taste DNA (compact natural language summary) ──
var dnaparts = [];

// Top genres
var topGenreNames = genreAffinities.slice(0, 5).map(function(g) { return g.genre; });
if (topGenreNames.length > 0) {
  dnaparts.push("Drawn to " + topGenreNames.join(", "));
}

// Preferred media
var topMedia = mediaPreferences.filter(function(m) { return m.engaged > 0; }).slice(0, 3);
if (topMedia.length > 0) {
  var mediaNames = topMedia.map(function(m) { return m.type.replace("-", " ") + "s"; });
  dnaparts.push("primarily consuming " + mediaNames.join(", "));
}

// Rating style
if (avgRating !== null) {
  if (avgRating >= 8) dnaparts.push("generous rater (avg " + avgRating + "/10)");
  else if (avgRating >= 6) dnaparts.push("balanced rater (avg " + avgRating + "/10)");
  else dnaparts.push("selective rater (avg " + avgRating + "/10)");
}

// Cross-media breadth
if (crossMediaConnections.length >= 5) {
  dnaparts.push("with strong cross-media exploration");
} else if (crossMediaConnections.length >= 2) {
  dnaparts.push("with some cross-media interest");
}

// Engagement level
var engagedCount = engagedEntityIds.length;
if (engagedCount >= 50) dnaparts.push("— highly engaged curator");
else if (engagedCount >= 20) dnaparts.push("— active curator");
else if (engagedCount >= 5) dnaparts.push("— emerging curator");
else dnaparts.push("— just getting started");

var tasteDNA = dnaparts.join(", ") + ".";

// ── Persist profile ──
var profile = {
  generatedAt: Date.now(),
  entityCount: entities.length,
  latestEntityUpdate: latestUpdatedAt,
  engagedEntityCount: engagedEntityIds.length,
  genreAffinities: genreAffinities,
  mediaPreferences: mediaPreferences,
  topTags: topTags,
  consumptionPatterns: consumptionPatterns,
  crossMediaConnections: crossMediaConnections,
  tasteDNA: tasteDNA
};

try {
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), "utf8");
} catch (e) {
  // Non-fatal — profile will still be returned, just not cached
}

// ── Return result ──
profile.tool = "enso_media_library_taste_profile";
profile.fromCache = false;

return {
  content: [{
    type: "text",
    text: JSON.stringify(profile)
  }]
};
