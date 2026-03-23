var targetPath = (params.path || "").trim();

// ── Path normalization ──
if (targetPath && targetPath.charAt(0) !== '/' && targetPath.charAt(0) !== '~' && !/^[A-Z]:/i.test(targetPath)) {
  if (targetPath.indexOf('/') > 0) {
    targetPath = '/' + targetPath;
  }
}

if (!targetPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_stats",
        error: "No folder path provided"
      })
    }]
  };
}

// Check cache first (5-minute expiry)
var cacheKey = "stats_" + targetPath.replace(/[^a-zA-Z0-9]/g, "_");
try {
  var cached = await ctx.store.get(cacheKey);
  if (cached && cached.cachedAt && (Date.now() - cached.cachedAt) < 300000) {
    cached.data.fromCache = true;
    return { content: [{ type: "text", text: JSON.stringify(cached.data) }] };
  }
} catch(e) {}

// Fetch all media items from the folder via the browse tool
var browseResult = await ctx.callTool("enso_media_browse_folder", { path: targetPath, sortBy: "date", sortDir: "desc" });
if (!browseResult.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_stats",
        error: browseResult.error || "Failed to scan folder",
        path: targetPath
      })
    }]
  };
}

var browseData = browseResult.data;
if (typeof browseData === "string") {
  try { browseData = JSON.parse(browseData); } catch(e) { browseData = {}; }
}

var items = browseData.items || [];
var directories = browseData.directories || [];

// Compute statistics
var totalSize = 0;
var imageCount = 0;
var videoCount = 0;
var favoriteCount = 0;
var byExtension = {};
var byCamera = {};
var byMonth = {};
var ratingDist = { "unrated": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
var dates = [];
var largestFile = null;
var smallestFile = null;
var topRated = [];
var withAI = 0;
var withGPS = 0;
var isoValues = [];

for (var i = 0; i < items.length; i++) {
  var item = items[i];

  // Size
  var size = item.size || 0;
  totalSize += size;
  if (!largestFile || size > (largestFile.size || 0)) {
    largestFile = { name: item.name, size: size, path: item.path };
  }
  if (size > 0 && (!smallestFile || size < (smallestFile.size || 0))) {
    smallestFile = { name: item.name, size: size, path: item.path };
  }

  // Type
  if (item.type === "image") imageCount++;
  else if (item.type === "video") videoCount++;

  // Extension
  var ext = (item.ext || "").toLowerCase();
  if (ext) {
    byExtension[ext] = (byExtension[ext] || 0) + 1;
  }

  // Favorites
  if (item.isFavorite) favoriteCount++;

  // AI metadata tracking
  if (item.aiDescription || (item.aiTags && item.aiTags.length > 0)) withAI++;

  // Rating
  var rating = item.rating || 0;
  if (rating >= 1 && rating <= 5) {
    ratingDist[String(rating)]++;
    if (rating >= 4) {
      topRated.push({
        name: item.name,
        path: item.path,
        rating: rating,
        mediaUrl: item.mediaUrl || ""
      });
    }
  } else {
    ratingDist["unrated"]++;
  }

  // Camera from EXIF
  var exif = item.exif || {};
  if (exif.cameraMake || exif.cameraModel) {
    var cameraName = ((exif.cameraMake || "") + " " + (exif.cameraModel || "")).trim();
    byCamera[cameraName] = (byCamera[cameraName] || 0) + 1;
  } else {
    byCamera["Unknown"] = (byCamera["Unknown"] || 0) + 1;
  }

  // GPS tracking
  if (exif.gps) withGPS++;

  // ISO tracking
  if (exif.iso) isoValues.push(exif.iso);

  // Dates
  var dateStr = exif.dateTaken || item.modifiedAt || "";
  if (dateStr) {
    try {
      var d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        dates.push(d.getTime());
        var monthKey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        byMonth[monthKey] = (byMonth[monthKey] || 0) + 1;
      }
    } catch(e) {}
  }
}

// Sort top rated by rating desc, limit to 10
topRated.sort(function(a, b) { return b.rating - a.rating; });
topRated = topRated.slice(0, 10);

// Camera array sorted by count
var cameraArray = [];
var cameraKeys = Object.keys(byCamera);
for (var ci = 0; ci < cameraKeys.length; ci++) {
  cameraArray.push({ camera: cameraKeys[ci], count: byCamera[cameraKeys[ci]] });
}
cameraArray.sort(function(a, b) { return b.count - a.count; });

// Month array sorted chronologically
var monthArray = [];
var monthKeys = Object.keys(byMonth).sort();
for (var mi = 0; mi < monthKeys.length; mi++) {
  monthArray.push({ month: monthKeys[mi], count: byMonth[monthKeys[mi]] });
}

// Date range
var dateRange = null;
if (dates.length > 0) {
  dates.sort(function(a, b) { return a - b; });
  dateRange = {
    earliest: new Date(dates[0]).toISOString(),
    latest: new Date(dates[dates.length - 1]).toISOString()
  };
}

var totalFiles = items.length;
var avgFileSize = totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0;

// Compute average ISO
var avgISO = 0;
if (isoValues.length > 0) {
  var isoSum = 0;
  for (var ii = 0; ii < isoValues.length; ii++) isoSum += isoValues[ii];
  avgISO = Math.round(isoSum / isoValues.length);
}

var statsResult = {
  tool: "enso_media_gallery_stats",
  path: targetPath,
  totalFiles: totalFiles,
  totalSize: totalSize,
  imageCount: imageCount,
  videoCount: videoCount,
  dateRange: dateRange,
  byExtension: byExtension,
  byCamera: cameraArray,
  byMonth: monthArray,
  ratingDistribution: ratingDist,
  favoriteCount: favoriteCount,
  topRated: topRated,
  avgFileSize: avgFileSize,
  largestFile: largestFile,
  smallestFile: smallestFile,
  subdirectoryCount: directories.length,
  withAI: withAI,
  withGPS: withGPS,
  avgISO: avgISO
};

// Cache the stats
try {
  await ctx.store.set(cacheKey, { data: statsResult, cachedAt: Date.now() });
} catch(e) {}

return { content: [{ type: "text", text: JSON.stringify(statsResult) }] };
