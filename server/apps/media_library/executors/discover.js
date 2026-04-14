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
      text: JSON.stringify({ tool: "enso_media_library_discover", error: "Could not load entity index", categories: [] })
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
  entities.push(e);
}

// Build taste profile from favorites and highly rated items
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

// Extract taste clusters from semantic tags of favorites + high rated
var tasteTags = {};
var tasteEntities = favorited.concat(highlyRated);
for (var ti = 0; ti < tasteEntities.length; ti++) {
  var stags = tasteEntities[ti].semanticTags || [];
  for (var tj = 0; tj < stags.length; tj++) {
    tasteTags[stags[tj]] = (tasteTags[stags[tj]] || 0) + 1;
  }
}

var topTasteTags = Object.keys(tasteTags)
  .map(function(k) { return { tag: k, count: tasteTags[k] }; })
  .sort(function(a, b) { return b.count - a.count; })
  .slice(0, 10);

var topTagNames = topTasteTags.map(function(t) { return t.tag; });

// Category 1: Based on favorites — find unstarted items with similar semantic tags
var favBasedScored = [];
for (var fb = 0; fb < unstarted.length; fb++) {
  var item = unstarted[fb];
  if (allowedTypes && allowedTypes.indexOf(item.type) === -1) continue;
  if (item.isFavorite) continue; // Already favorited

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
      reason: "Shares " + overlap + " theme(s) with your favorites: " + stg.filter(function(s) { return topTagNames.indexOf(s) !== -1; }).slice(0, 3).join(", ")
    });
  }
}
favBasedScored.sort(function(a, b) { return b.overlapScore - a.overlapScore; });

// Category 2: Highly rated in genres you enjoy — items with high cross-reference density to rated items
var ratedIds = {};
for (var ri = 0; ri < highlyRated.length; ri++) {
  ratedIds[highlyRated[ri].entityId] = true;
}

var crossRefScored = [];
for (var cr = 0; cr < unstarted.length; cr++) {
  var crItem = unstarted[cr];
  if (allowedTypes && allowedTypes.indexOf(crItem.type) === -1) continue;

  var refs = crItem.crossReferences || [];
  var refOverlap = 0;
  var matchedRefs = [];
  for (var rj = 0; rj < refs.length; rj++) {
    if (ratedIds[refs[rj].entityId]) {
      refOverlap++;
      matchedRefs.push(refs[rj].reason);
    }
  }
  if (refOverlap > 0) {
    crossRefScored.push({
      entityId: crItem.entityId,
      type: crItem.type,
      title: crItem.title,
      imageUrl: crItem.imageUrl || null,
      overlapScore: refOverlap,
      reason: "Connected to " + refOverlap + " of your highly-rated items"
    });
  }
}
crossRefScored.sort(function(a, b) { return b.overlapScore - a.overlapScore; });

// Category 3: Cross-media connections — for each favorite/rated type, find items in OTHER types
var favTypes = {};
for (var ft = 0; ft < tasteEntities.length; ft++) {
  favTypes[tasteEntities[ft].type] = true;
}

var crossMediaScored = [];
for (var cm = 0; cm < unstarted.length; cm++) {
  var cmItem = unstarted[cm];
  if (allowedTypes && allowedTypes.indexOf(cmItem.type) === -1) continue;
  if (favTypes[cmItem.type]) continue; // Same type as favorites, skip for cross-media

  var cmTags = cmItem.semanticTags || [];
  var cmOverlap = 0;
  for (var cmi = 0; cmi < cmTags.length; cmi++) {
    if (topTagNames.indexOf(cmTags[cmi]) !== -1) cmOverlap++;
  }
  if (cmOverlap > 0) {
    crossMediaScored.push({
      entityId: cmItem.entityId,
      type: cmItem.type,
      title: cmItem.title,
      imageUrl: cmItem.imageUrl || null,
      overlapScore: cmOverlap,
      reason: "Different medium, similar themes: " + cmTags.filter(function(s) { return topTagNames.indexOf(s) !== -1; }).slice(0, 3).join(", ")
    });
  }
}
crossMediaScored.sort(function(a, b) { return b.overlapScore - a.overlapScore; });

// Deduplicate across categories
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

var categories = [
  { title: "Based on your favorites", items: dedup(favBasedScored) },
  { title: "Highly connected to your rated items", items: dedup(crossRefScored) },
  { title: "Cross-media connections", items: dedup(crossMediaScored) }
];

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_discover",
      mediaType: mediaTypeFilter || "all",
      categories: categories,
      tasteProfile: {
        topTags: topTasteTags,
        totalFavorites: favorited.length,
        totalRated: highlyRated.length,
        totalCompleted: completed.length,
        totalUnstarted: unstarted.length
      }
    })
  }]
};
