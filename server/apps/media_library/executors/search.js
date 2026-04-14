var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var query = (params.query || "").trim().toLowerCase();
var mediaType = (params.mediaType || "").trim();
var limit = params.limit || 30;

if (!query) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_search",
        query: "",
        error: "Search query is required",
        total: 0,
        results: []
      })
    }]
  };
}

var typeMap = {
  books: ["book"],
  movies: ["movie"],
  tv: ["tv-series"],
  documentaries: ["documentary"],
  games: ["game"],
  music: ["album", "artist"],
  photos: ["album"]
};

var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_search",
        query: query,
        error: "Could not load entity index",
        total: 0,
        results: []
      })
    }]
  };
}

var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "album", "artist"];
var allowedTypes = null;
if (mediaType && typeMap[mediaType]) {
  allowedTypes = typeMap[mediaType];
}

var queryTerms = query.split(/\s+/);
var allEntities = Object.values(index);
var scored = [];

for (var i = 0; i < allEntities.length; i++) {
  var e = allEntities[i];
  if (mediaEntityTypes.indexOf(e.type) === -1) continue;
  if (allowedTypes && allowedTypes.indexOf(e.type) === -1) continue;

  var score = 0;
  var reasons = [];
  var titleLower = (e.title || "").toLowerCase();
  var tagsJoined = (e.tags || []).join(" ").toLowerCase();
  var semTagsJoined = (e.semanticTags || []).join(" ").toLowerCase();
  var slugLower = (e.slug || "").toLowerCase();

  for (var qi = 0; qi < queryTerms.length; qi++) {
    var term = queryTerms[qi];
    if (titleLower.indexOf(term) !== -1) {
      score += 10;
      if (reasons.indexOf("title match") === -1) reasons.push("title match");
    }
    if (tagsJoined.indexOf(term) !== -1) {
      score += 5;
      if (reasons.indexOf("tag match") === -1) reasons.push("tag match");
    }
    if (semTagsJoined.indexOf(term) !== -1) {
      score += 7;
      if (reasons.indexOf("semantic tag match") === -1) reasons.push("semantic tag match");
    }
    if (slugLower.indexOf(term) !== -1 && titleLower.indexOf(term) === -1) {
      score += 3;
      if (reasons.indexOf("slug match") === -1) reasons.push("slug match");
    }
  }

  // Boost favorited/rated items slightly
  if (score > 0) {
    if (e.isFavorite) score += 2;
    if (e.userRating) score += 1;
  }

  if (score > 0) {
    scored.push({
      entityId: e.entityId,
      type: e.type,
      source: e.source,
      title: e.title,
      imageUrl: e.imageUrl || null,
      tags: (e.tags || []).slice(0, 5),
      semanticTags: (e.semanticTags || []).slice(0, 5),
      userRating: e.userRating || null,
      isFavorite: !!e.isFavorite,
      consumptionStatus: e.consumptionStatus || null,
      matchScore: score,
      matchReasons: reasons
    });
  }
}

// Sort by score descending
scored.sort(function(a, b) { return b.matchScore - a.matchScore; });

var results = scored.slice(0, limit);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_search",
      query: params.query,
      total: scored.length,
      showing: results.length,
      results: results
    })
  }]
};
