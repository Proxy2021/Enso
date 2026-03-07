var photoPath = (params.photoId || "").trim();

if (!photoPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_compare_versions",
        error: "Photo path is required"
      })
    }]
  };
}

// Get photo details from filesystem
var viewResult = await ctx.callTool("enso_media_view_photo", { path: photoPath });
if (!viewResult.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_compare_versions",
        error: "Photo not found: " + photoPath
      })
    }]
  };
}

var photo = viewResult.data;

// Load styled versions for this photo path
var storeKey = "styles:" + photoPath;
var stylesStored = await ctx.store.get(storeKey);
var versions = [];
if (stylesStored) {
  try { versions = JSON.parse(stylesStored); } catch(e) { versions = []; }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_compare_versions",
      photoId: photoPath,
      original: {
        id: photoPath,
        name: photo.name,
        url: photo.mediaUrl,
        path: photoPath,
        dimensions: photo.dimensions || "",
        size: photo.size
      },
      versions: versions
    })
  }]
};
