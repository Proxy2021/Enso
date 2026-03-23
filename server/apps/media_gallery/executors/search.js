var path = (params.path || "").trim();
var query = (params.query || "").trim();
var limit = typeof params.limit === "number" ? params.limit : 30;

// ── Path normalization ──
if (path && path.charAt(0) !== '/' && path.charAt(0) !== '~' && !/^[A-Z]:/i.test(path)) {
  if (path.indexOf('/') > 0) {
    path = '/' + path;
  }
}

// If no path, use last browsed path or default
if (!path) {
  try {
    var lastPath = await ctx.store.get("lastBrowsedPath");
    if (lastPath) path = lastPath;
  } catch(e) {}
  if (!path) path = "~/Pictures";
}

if (!query) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_search",
        error: "No search query provided",
        path: path,
        query: "",
        total: 0,
        results: []
      })
    }]
  };
}

var toolParams = { query: query, path: path };
if (limit !== 30) toolParams.limit = limit;

var result = await ctx.callTool("enso_media_search_photos", toolParams);
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_search",
        error: result.error || "Search failed",
        path: path,
        query: query,
        total: 0,
        results: []
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

// Compute search analytics from results
var results = data.results || [];
var matchTypes = { description: 0, tag: 0, filename: 0 };
var imageResults = 0;
var videoResults = 0;
var totalResultSize = 0;
var ratingSum = 0;
var ratedCount = 0;

for (var i = 0; i < results.length; i++) {
  var r = results[i];
  var reason = (r.matchReason || "").toLowerCase();
  if (reason.indexOf("description") >= 0) matchTypes.description++;
  if (reason.indexOf("tag") >= 0) matchTypes.tag++;
  if (reason.indexOf("filename") >= 0 || reason.indexOf("name") >= 0) matchTypes.filename++;
  if (r.type === "image") imageResults++;
  else if (r.type === "video") videoResults++;
  totalResultSize += (r.size || 0);
  if (r.rating && r.rating > 0) {
    ratingSum += r.rating;
    ratedCount++;
  }
}

data.searchAnalytics = {
  matchTypes: matchTypes,
  imageResults: imageResults,
  videoResults: videoResults,
  totalResultSize: totalResultSize,
  avgRating: ratedCount > 0 ? Math.round(ratingSum / ratedCount * 10) / 10 : 0
};

// Save search to history
try {
  var history = (await ctx.store.get("searchHistory")) || [];
  history.unshift({ query: query, path: path, resultCount: results.length, at: Date.now() });
  if (history.length > 20) history = history.slice(0, 20);
  await ctx.store.set("searchHistory", history);
} catch(e) {}

data.tool = "enso_media_gallery_search";
return { content: [{ type: "text", text: JSON.stringify(data) }] };
