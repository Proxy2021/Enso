var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var mediaType = (params.mediaType || "").trim() || "all";
var statusFilter = (params.status || "").trim();
var favoriteFilter = params.favorite;
var minRating = params.minRating || 0;
var collectionId = (params.collectionId || "").trim();
var sortBy = (params.sortBy || "").trim() || "title";
var groupBy = (params.groupBy || "").trim();
var limit = params.limit || 50;
var offset = params.offset || 0;

// Media type → entity type mapping
var typeMap = {
  books: ["book"],
  movies: ["movie"],
  tv: ["tv-series"],
  documentaries: ["documentary"],
  games: ["game"],
  music: ["album", "artist"],
  photos: ["album"]
};

// Load entity index
var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_browse",
        error: "Could not load entity index: " + e.message,
        items: [],
        total: 0
      })
    }]
  };
}

// Load collection if filtering by collection
var collectionEntityIds = null;
if (collectionId) {
  try {
    var colPath = path.join(os.homedir(), ".enso", "data", "media-library", "collections.json");
    var colData = JSON.parse(fs.readFileSync(colPath, "utf8"));
    var cols = colData.collections || [];
    for (var ci = 0; ci < cols.length; ci++) {
      if (cols[ci].id === collectionId) {
        collectionEntityIds = cols[ci].entityIds || [];
        break;
      }
    }
  } catch (e) {
    collectionEntityIds = [];
  }
}

// Filter entities — only media types (exclude project, article, idea, app, synthesis, place)
var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "album", "artist"];
var allowedTypes = null;
if (mediaType !== "all" && typeMap[mediaType]) {
  allowedTypes = typeMap[mediaType];
}

var allEntities = Object.values(index);
var filtered = [];
for (var i = 0; i < allEntities.length; i++) {
  var e = allEntities[i];
  // Only media entity types
  if (mediaEntityTypes.indexOf(e.type) === -1) continue;
  // Type filter
  if (allowedTypes && allowedTypes.indexOf(e.type) === -1) continue;
  // Status filter
  if (statusFilter && (e.consumptionStatus || "not_started") !== statusFilter) continue;
  // Favorite filter
  if (favoriteFilter === true && !e.isFavorite) continue;
  // Min rating filter
  if (minRating > 0 && (!e.userRating || e.userRating < minRating)) continue;
  // Collection filter
  if (collectionEntityIds !== null && collectionEntityIds.indexOf(e.entityId) === -1) continue;

  filtered.push({
    entityId: e.entityId,
    type: e.type,
    source: e.source,
    title: e.title,
    slug: e.slug,
    imageUrl: e.imageUrl || null,
    tags: (e.tags || []).slice(0, 5),
    semanticTags: (e.semanticTags || []).slice(0, 5),
    userRating: e.userRating || null,
    isFavorite: !!e.isFavorite,
    consumptionStatus: e.consumptionStatus || null,
    consumptionProgress: e.consumptionProgress || null,
    dateCompleted: e.dateCompleted || null,
    updatedAt: e.updatedAt || null
  });
}

// Compute type counts before pagination
var typeCounts = {};
for (var tc = 0; tc < filtered.length; tc++) {
  var t = filtered[tc].type;
  typeCounts[t] = (typeCounts[t] || 0) + 1;
}

// Sort
filtered.sort(function(a, b) {
  if (sortBy === "rating") {
    return (b.userRating || 0) - (a.userRating || 0);
  } else if (sortBy === "updatedAt") {
    var aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    var bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  } else if (sortBy === "dateCompleted") {
    var aComp = a.dateCompleted ? new Date(a.dateCompleted).getTime() : 0;
    var bComp = b.dateCompleted ? new Date(b.dateCompleted).getTime() : 0;
    return bComp - aComp;
  } else {
    // title
    return (a.title || "").localeCompare(b.title || "");
  }
});

var total = filtered.length;

// Grouping
var groups = null;
if (groupBy) {
  var groupMap = {};
  for (var gi = 0; gi < filtered.length; gi++) {
    var item = filtered[gi];
    var key = "";
    if (groupBy === "mediaType") key = item.type;
    else if (groupBy === "status") key = item.consumptionStatus || "not_started";
    else if (groupBy === "rating") key = item.userRating ? String(item.userRating) : "unrated";
    else key = "all";
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(item);
  }
  groups = [];
  var groupKeys = Object.keys(groupMap).sort();
  for (var gk = 0; gk < groupKeys.length; gk++) {
    groups.push({ group: groupKeys[gk], count: groupMap[groupKeys[gk]].length, items: groupMap[groupKeys[gk]].slice(0, limit) });
  }
}

// Paginate (only for non-grouped results)
var pageItems = groups ? [] : filtered.slice(offset, offset + limit);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_browse",
      mediaType: mediaType,
      total: total,
      showing: groups ? total : pageItems.length,
      offset: offset,
      limit: limit,
      sortBy: sortBy,
      groupBy: groupBy || null,
      items: pageItems,
      groups: groups,
      typeCounts: typeCounts
    })
  }]
};
