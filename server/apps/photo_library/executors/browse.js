var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "photo-library.json");
var cached = null;
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

if (!cached || !cached.albums || cached.albums.length === 0) {
  result = { tool: "enso_photo_library_browse", albums: [], totalPhotos: 0, totalAlbums: 0, message: "No photos found. Run a scan first." };
} else {
  var albums = cached.albums.slice();
  var groupBy = params.groupBy || "directory";

  if (params.query) {
    var q = params.query.toLowerCase();
    albums = albums.filter(function(a) {
      return a.name.toLowerCase().indexOf(q) >= 0 ||
        (a.parentPath && a.parentPath.toLowerCase().indexOf(q) >= 0);
    });
  }

  // Group albums
  var grouped = {};
  if (groupBy === "year") {
    albums.forEach(function(a) {
      var year = a.dateRange && a.dateRange.from ? a.dateRange.from.substring(0, 4) : "Unknown";
      if (!grouped[year]) grouped[year] = [];
      grouped[year].push(a);
    });
  } else if (groupBy === "camera") {
    albums.forEach(function(a) {
      var cam = (a.cameras && a.cameras.length > 0) ? a.cameras[0] : "Unknown";
      if (!grouped[cam]) grouped[cam] = [];
      grouped[cam].push(a);
    });
  } else {
    albums.forEach(function(a) {
      var parent = a.parentPath || "Root";
      if (!grouped[parent]) grouped[parent] = [];
      grouped[parent].push(a);
    });
  }

  // Sort albums within groups by photo count descending
  for (var key in grouped) {
    grouped[key].sort(function(a, b) { return b.photoCount - a.photoCount; });
  }

  result = {
    tool: "enso_photo_library_browse",
    albums: albums.slice(0, 200),
    grouped: grouped,
    groupBy: groupBy,
    totalPhotos: cached.totalPhotos || 0,
    totalAlbums: cached.albums.length,
    filteredCount: albums.length,
    cameras: cached.cameras || [],
    yearRange: cached.yearRange || null,
    scannedAt: cached.scannedAt
  };
}
