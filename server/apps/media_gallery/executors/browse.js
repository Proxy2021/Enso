var path = (params.path || "").trim();
var filter = (params.filter || "").trim() || "all";
var sortBy = (params.sortBy || "").trim() || "name";
var sortDir = (params.sortDir || "").trim() || "asc";

// ── Path normalization ──
// Fix relative paths that should be absolute (e.g., "Users/foo/Photos" → "/Users/foo/Photos")
if (path && path.charAt(0) !== '/' && path.charAt(0) !== '~' && !/^[A-Z]:/i.test(path)) {
  if (path.indexOf('/') > 0) {
    path = '/' + path;
  }
}

// Default to home directory when no path given
if (!path) {
  path = "~";
}

var toolParams = { path: path };
if (filter !== "all") toolParams.filter = filter;
if (sortBy !== "name") toolParams.sortBy = sortBy;
if (sortDir !== "asc") toolParams.sortDir = sortDir;

var result = await ctx.callTool("enso_media_browse_folder", toolParams);

if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_browse",
        error: result.error || "Failed to browse folder",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

// Compute summary stats from items
var items = data.items || [];
var totalSize = 0;
var imageCount = 0;
var videoCount = 0;
var favoriteCount = 0;
var ratedCount = 0;
var earliestDate = null;
var latestDate = null;
var cameras = {};

for (var i = 0; i < items.length; i++) {
  var item = items[i];
  totalSize += (item.size || 0);
  if (item.type === "image") imageCount++;
  else if (item.type === "video") videoCount++;
  if (item.isFavorite) favoriteCount++;
  if (item.rating && item.rating > 0) ratedCount++;

  var dateStr = (item.exif && item.exif.dateTaken) || item.modifiedAt || "";
  if (dateStr) {
    try {
      var ts = new Date(dateStr).getTime();
      if (!isNaN(ts)) {
        if (earliestDate === null || ts < earliestDate) earliestDate = ts;
        if (latestDate === null || ts > latestDate) latestDate = ts;
      }
    } catch(e) {}
  }

  // Track cameras
  var exif = item.exif || {};
  if (exif.cameraMake || exif.cameraModel) {
    var camName = ((exif.cameraMake || "") + " " + (exif.cameraModel || "")).trim();
    cameras[camName] = (cameras[camName] || 0) + 1;
  }
}

data.summary = {
  totalSize: totalSize,
  imageCount: imageCount,
  videoCount: videoCount,
  favoriteCount: favoriteCount,
  ratedCount: ratedCount,
  dateRange: (earliestDate && latestDate) ? {
    earliest: new Date(earliestDate).toISOString(),
    latest: new Date(latestDate).toISOString()
  } : null,
  topCamera: (function() {
    var best = null;
    var bestCount = 0;
    var keys = Object.keys(cameras);
    for (var ci = 0; ci < keys.length; ci++) {
      if (cameras[keys[ci]] > bestCount) {
        best = keys[ci];
        bestCount = cameras[keys[ci]];
      }
    }
    return best;
  })()
};

// Cache last browsed path for UX continuity
try {
  await ctx.store.set("lastBrowsedPath", data.path || path || "~");
} catch(e) {}

data.tool = "enso_media_gallery_browse";
data.filter = filter;
data.sortBy = sortBy;
data.sortDir = sortDir;
return { content: [{ type: "text", text: JSON.stringify(data) }] };
