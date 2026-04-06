var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheFile = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "bookmarks.json");
var folders = [];
var totalBookmarks = 0;

try {
  var raw = fs.readFileSync(cacheFile, "utf-8");
  var data = JSON.parse(raw);
  folders = data.folders || [];
  totalBookmarks = data.totalBookmarks || 0;
} catch (e) {
  result = {
    tool: "enso_bookmarks_browse",
    totalBookmarks: 0,
    folders: [],
    error: "No bookmarks cached. Run a scan first.",
  };
  return;
}

// Apply folder filter
if (params.folder) {
  var folderName = params.folder.toLowerCase();
  folders = folders.filter(function(f) {
    return f.folder.toLowerCase().indexOf(folderName) >= 0;
  });
}

// Apply query search across bookmark titles and URLs
if (params.query) {
  var q = params.query.toLowerCase();
  folders = folders.map(function(f) {
    var filtered = f.bookmarks.filter(function(b) {
      return (b.title && b.title.toLowerCase().indexOf(q) >= 0) ||
        (b.url && b.url.toLowerCase().indexOf(q) >= 0);
    });
    return { folder: f.folder, count: filtered.length, bookmarks: filtered };
  }).filter(function(f) { return f.count > 0; });
}

result = {
  tool: "enso_bookmarks_browse",
  totalBookmarks: totalBookmarks,
  folder: params.folder || null,
  query: params.query || null,
  folders: folders,
};
