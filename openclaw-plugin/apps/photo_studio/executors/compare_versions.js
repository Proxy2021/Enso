var photoId = (params.photoId || "").trim();

if (!photoId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_compare_versions",
        error: "Photo ID is required"
      })
    }]
  };
}

// Load photo
var stored = await ctx.store.get("photos");
var photos = [];
if (stored) {
  try { photos = JSON.parse(stored); } catch(e) { photos = []; }
}

var photo = null;
for (var i = 0; i < photos.length; i++) {
  if (photos[i].id === photoId) { photo = photos[i]; break; }
}

if (!photo) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_compare_versions",
        error: "Photo not found: " + photoId
      })
    }]
  };
}

// Load styled versions
var stylesStored = await ctx.store.get("styles_" + photoId);
var versions = [];
if (stylesStored) {
  try { versions = JSON.parse(stylesStored); } catch(e) { versions = []; }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_compare_versions",
      photoId: photoId,
      original: {
        id: photo.id,
        name: photo.name,
        url: photo.url,
        dimensions: photo.dimensions || ""
      },
      versions: versions
    })
  }]
};