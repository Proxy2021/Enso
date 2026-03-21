var sortBy = (params.sortBy || "date").trim();
var path = (params.path || "").trim();

// Attempt to list existing books from store
var storedBooks = await ctx.store.get("books");
var books = [];
if (storedBooks && Array.isArray(storedBooks)) {
  books = storedBooks;
}

// Sort books
if (sortBy === "name") {
  books.sort(function(a, b) { return (a.title || "").localeCompare(b.title || ""); });
} else {
  books.sort(function(a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); });
}

// Find photo sources by browsing common directories
var photoSources = [];
var defaultPaths = ["~/Pictures", "~/Photos", "~/Downloads", "~/Desktop"];
if (path) defaultPaths = [path];

for (var i = 0; i < defaultPaths.length; i++) {
  var dirResult = await ctx.listDir(defaultPaths[i]);
  if (dirResult && dirResult.success && dirResult.data) {
    var items = Array.isArray(dirResult.data) ? dirResult.data : (dirResult.data.items || []);
    var imageCount = 0;
    for (var j = 0; j < items.length; j++) {
      var ext = (items[j].ext || items[j].name || "").toLowerCase();
      if (ext.match && ext.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)) {
        imageCount++;
      }
    }
    if (imageCount > 0 || items.length > 0) {
      var dirName = defaultPaths[i].split("/").pop() || defaultPaths[i];
      photoSources.push({
        name: dirName,
        path: defaultPaths[i],
        count: imageCount || items.length
      });
    }
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photobook_browse",
      books: books,
      photoSources: photoSources,
      sortBy: sortBy
    })
  }]
};
