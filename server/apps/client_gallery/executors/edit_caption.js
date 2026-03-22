var galleryId = (params.galleryId || "").trim();
var photoId = (params.photoId || "").trim();
var caption = (params.caption || "").trim();

if (!galleryId || !photoId || !caption) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_edit_caption",
        error: "Gallery ID, photo ID, and caption text are all required"
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
        tool: "enso_client_gallery_edit_caption",
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
        tool: "enso_client_gallery_edit_caption",
        error: "Failed to parse gallery data"
      })
    }]
  };
}

var found = false;
for (var i = 0; i < gallery.photos.length; i++) {
  if (gallery.photos[i].id === photoId) {
    gallery.photos[i].caption = caption;
    gallery.photos[i].captionGenerated = false;
    gallery.photos[i].captionEditedByUser = true;
    found = true;
    break;
  }
}

if (!found) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_edit_caption",
        error: "Photo not found: " + photoId
      })
    }]
  };
}

gallery.updatedAt = Date.now();
await ctx.store.set("gallery_" + galleryId, JSON.stringify(gallery));

var photoSummary = gallery.photos.map(function(p) {
  return {
    id: p.id,
    url: p.url,
    filename: p.filename,
    caption: p.caption,
    captionGenerated: p.captionGenerated,
    captionEditedByUser: p.captionEditedByUser
  };
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_client_gallery_edit_caption",
      galleryId: galleryId,
      galleryName: gallery.name,
      action: "view",
      total: gallery.photos.length,
      photos: photoSummary,
      message: "Caption updated"
    })
  }]
};