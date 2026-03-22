var galleryId = (params.galleryId || "").trim();
var photos = params.photos || [];

if (!galleryId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_add_photos",
        error: "Gallery ID is required"
      })
    }]
  };
}

var raw = await ctx.store.get("gallery_" + galleryId);
if (!raw) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_add_photos",
        error: "Gallery not found: " + galleryId
      })
    }]
  };
}

var gallery = {};
try { gallery = JSON.parse(raw); } catch(e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_add_photos",
        error: "Failed to parse gallery data"
      })
    }]
  };
}

if (!Array.isArray(gallery.photos)) gallery.photos = [];
var addedCount = 0;

for (var i = 0; i < photos.length; i++) {
  var photo = photos[i];
  var url = (photo.url || "").trim();
  if (!url) continue;

  var photoId = "ph_" + Math.random().toString(36).substring(2, 8);
  var filename = (photo.filename || "").trim();
  if (!filename) {
    // Extract filename from URL
    var parts = url.split("/");
    filename = parts[parts.length - 1] || "Photo " + (gallery.photos.length + 1);
  }

  gallery.photos.push({
    id: photoId,
    url: url,
    filename: filename,
    notes: (photo.notes || "").trim(),
    caption: "",
    captionGenerated: false,
    captionEditedByUser: false,
    addedAt: Date.now()
  });
  addedCount++;
}

gallery.updatedAt = Date.now();
await ctx.store.set("gallery_" + galleryId, JSON.stringify(gallery));

// Update index photo count
var indexRaw = await ctx.store.get("galleries_index");
var galleries = [];
try { galleries = indexRaw ? JSON.parse(indexRaw) : []; } catch(e) { galleries = []; }
for (var j = 0; j < galleries.length; j++) {
  if (galleries[j].id === galleryId) {
    galleries[j].photoCount = gallery.photos.length;
    if (!galleries[j].coverPhotoUrl && gallery.photos.length > 0) {
      galleries[j].coverPhotoUrl = gallery.photos[0].url;
    }
    break;
  }
}
await ctx.store.set("galleries_index", JSON.stringify(galleries));

var result = {
  tool: "enso_client_gallery_add_photos",
  galleryId: galleryId,
  galleryName: gallery.name,
  action: "view",
  total: gallery.photos.length,
  photos: gallery.photos
};
if (addedCount > 0) {
  result.message = addedCount + " photo" + (addedCount !== 1 ? "s" : "") + " added";
}

return {
  content: [{
    type: "text",
    text: JSON.stringify(result)
  }]
};