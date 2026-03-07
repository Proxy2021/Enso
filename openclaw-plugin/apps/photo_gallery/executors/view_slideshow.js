var collection = (params.collection || "").trim();
var transition = (params.transition || "").trim() || "fade";
var interval = typeof params.interval === "number" ? params.interval : 4000;
var captions = params.captions !== false;

// Load photos from store or browse
var storeKey = collection ? "collection_" + collection : "all_photos";
var stored = await ctx.store.get(storeKey);
var photos = [];

if (stored) {
  try {
    photos = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!Array.isArray(photos)) photos = [];
  } catch(e) { photos = []; }
}

// If no stored photos, try filesystem
if (photos.length === 0 && collection) {
  var browseResult = await ctx.listDir(collection);
  if (browseResult.success && browseResult.data) {
    var dirData = browseResult.data;
    if (typeof dirData === "string") {
      try { dirData = JSON.parse(dirData); } catch(e) { dirData = []; }
    }
    var entries = Array.isArray(dirData) ? dirData : (dirData.entries || dirData.items || []);
    var imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
    entries.forEach(function(entry) {
      var name = entry.name || entry;
      if (typeof name !== "string") return;
      var ext = name.substring(name.lastIndexOf(".")).toLowerCase();
      if (imageExts.indexOf(ext) >= 0) {
        photos.push({
          id: "p_" + photos.length,
          title: name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
          url: "/media/" + name,
          thumbnail: "/media/thumb_" + name,
          style: "",
          description: ""
        });
      }
    });
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_gallery_view_slideshow",
      collection: collection || "Gallery",
      transition: transition,
      interval: interval,
      captions: captions,
      photos: photos
    })
  }]
};
