var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var mediaTypeFilter = (params.mediaType || "").trim();

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
      text: JSON.stringify({ tool: "enso_media_library_stats", error: "Could not load entity index", totalEntities: 0 })
    }]
  };
}

var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "album", "artist"];
var allowedTypes = null;
if (mediaTypeFilter && typeMap[mediaTypeFilter]) {
  allowedTypes = typeMap[mediaTypeFilter];
}

var allEntities = Object.values(index);
var entities = [];
for (var i = 0; i < allEntities.length; i++) {
  var e = allEntities[i];
  if (mediaEntityTypes.indexOf(e.type) === -1) continue;
  if (allowedTypes && allowedTypes.indexOf(e.type) === -1) continue;
  entities.push(e);
}

// Type counts
var typeCounts = {};
for (var tc = 0; tc < entities.length; tc++) {
  var t = entities[tc].type;
  typeCounts[t] = (typeCounts[t] || 0) + 1;
}

// Source counts
var sourceCounts = {};
for (var sc = 0; sc < entities.length; sc++) {
  var s = entities[sc].source || "unknown";
  sourceCounts[s] = (sourceCounts[s] || 0) + 1;
}

// Favorites
var favoriteCount = 0;
var favorites = [];
for (var fi = 0; fi < entities.length; fi++) {
  if (entities[fi].isFavorite) {
    favoriteCount++;
    favorites.push({ entityId: entities[fi].entityId, title: entities[fi].title, type: entities[fi].type });
  }
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
    var rKey = String(rating);
    ratingDistribution[rKey] = (ratingDistribution[rKey] || 0) + 1;
  }
}

// Status distribution
var statusDist = { not_started: 0, in_progress: 0, completed: 0, dropped: 0, on_hold: 0 };
for (var si = 0; si < entities.length; si++) {
  var st = entities[si].consumptionStatus || "not_started";
  statusDist[st] = (statusDist[st] || 0) + 1;
}

// Top rated items
var rated = [];
for (var tr = 0; tr < entities.length; tr++) {
  if (entities[tr].userRating && entities[tr].userRating > 0) {
    rated.push(entities[tr]);
  }
}
rated.sort(function(a, b) { return (b.userRating || 0) - (a.userRating || 0); });
var topRated = [];
for (var trs = 0; trs < Math.min(10, rated.length); trs++) {
  topRated.push({
    entityId: rated[trs].entityId,
    title: rated[trs].title,
    type: rated[trs].type,
    userRating: rated[trs].userRating,
    imageUrl: rated[trs].imageUrl || null
  });
}

// Recently completed
var completed = [];
for (var ci = 0; ci < entities.length; ci++) {
  if (entities[ci].consumptionStatus === "completed" && entities[ci].dateCompleted) {
    completed.push(entities[ci]);
  }
}
completed.sort(function(a, b) {
  return new Date(b.dateCompleted).getTime() - new Date(a.dateCompleted).getTime();
});
var recentlyCompleted = [];
for (var rc = 0; rc < Math.min(10, completed.length); rc++) {
  recentlyCompleted.push({
    entityId: completed[rc].entityId,
    title: completed[rc].title,
    type: completed[rc].type,
    dateCompleted: completed[rc].dateCompleted,
    userRating: completed[rc].userRating || null
  });
}

// Top semantic tags
var tagCounts = {};
for (var sti = 0; sti < entities.length; sti++) {
  var stags = entities[sti].semanticTags || [];
  for (var stj = 0; stj < stags.length; stj++) {
    tagCounts[stags[stj]] = (tagCounts[stags[stj]] || 0) + 1;
  }
}
var tagEntries = Object.keys(tagCounts).map(function(k) { return { tag: k, count: tagCounts[k] }; });
tagEntries.sort(function(a, b) { return b.count - a.count; });
var topTags = tagEntries.slice(0, 15);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_stats",
      mediaType: mediaTypeFilter || "all",
      totalEntities: entities.length,
      typeCounts: typeCounts,
      sourceCounts: sourceCounts,
      favoriteCount: favoriteCount,
      ratedCount: ratedCount,
      averageRating: ratedCount > 0 ? Math.round((ratingSum / ratedCount) * 10) / 10 : null,
      ratingDistribution: ratingDistribution,
      statusDistribution: statusDist,
      completionRate: entities.length > 0 ? Math.round((statusDist.completed / entities.length) * 1000) / 10 : 0,
      topRated: topRated,
      recentlyCompleted: recentlyCompleted,
      topSemanticTags: topTags,
      favorites: favorites.slice(0, 10)
    })
  }]
};
