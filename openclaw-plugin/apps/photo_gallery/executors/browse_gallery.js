var collection = (params.collection || "").trim();
var viewMode = (params.viewMode || "").trim() || "grid";
var sortBy = (params.sortBy || "").trim() || "date";
var filterStyle = (params.filterStyle || "").trim();

// Try to load photos from persistent store
var storeKey = collection ? "collection_" + collection : "all_photos";
var stored = await ctx.store.get(storeKey);
var photos = [];

if (stored) {
  try {
    photos = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!Array.isArray(photos)) photos = [];
  } catch(e) { photos = []; }
}

// If no stored photos, try browsing the filesystem for images
if (photos.length === 0) {
  var browsePath = collection || "~/Pictures";
  var browseResult = await ctx.listDir(browsePath);
  if (browseResult.success && browseResult.data) {
    var dirData = browseResult.data;
    if (typeof dirData === "string") {
      try { dirData = JSON.parse(dirData); } catch(e) { dirData = []; }
    }
    var entries = Array.isArray(dirData) ? dirData : (dirData.entries || dirData.items || []);
    var imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".svg"];
    entries.forEach(function(entry) {
      var name = entry.name || entry;
      if (typeof name !== "string") return;
      var ext = name.substring(name.lastIndexOf(".")).toLowerCase();
      if (imageExts.indexOf(ext) >= 0) {
        var filePath = browsePath + "/" + name;
        photos.push({
          id: "p_" + photos.length,
          title: name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
          name: name,
          url: "/media/" + name,
          thumbnail: "/media/thumb_" + name,
          style: "",
          description: "",
          date: entry.modifiedAt || entry.mtime || new Date().toISOString(),
          tags: []
        });
      }
    });
  }
}

// Apply style filter
if (filterStyle) {
  photos = photos.filter(function(p) {
    return (p.style || "").toLowerCase() === filterStyle.toLowerCase();
  });
}

// Sort
photos.sort(function(a, b) {
  if (sortBy === "name") return (a.title || a.name || "").localeCompare(b.title || b.name || "");
  if (sortBy === "style") return (a.style || "").localeCompare(b.style || "");
  // default: date
  return new Date(b.date || 0) - new Date(a.date || 0);
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_gallery_browse_gallery",
      collection: collection || null,
      sortBy: sortBy,
      viewMode: viewMode,
      filterStyle: filterStyle || null,
      total: photos.length,
      photos: photos
    })
  }]
};
