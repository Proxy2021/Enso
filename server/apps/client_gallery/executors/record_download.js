var galleryId = (params.galleryId || "").trim();
var photoId = (params.photoId || "").trim();
var resolution = (params.resolution || "").trim() || "web";
var clientName = (params.clientName || "").trim() || "Guest";

if (!galleryId || !photoId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_record_download",
        error: "Gallery ID and photo ID are required"
      })
    }]
  };
}

if (resolution !== "web" && resolution !== "print") {
  resolution = "web";
}

var raw = await ctx.store.get("gallery_" + galleryId);
if (!raw) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_record_download",
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
        tool: "enso_client_gallery_record_download",
        error: "Failed to parse gallery data"
      })
    }]
  };
}

// Find the photo
var photoFilename = "";
var photoUrl = "";
var photoFound = false;
for (var i = 0; i < (gallery.photos || []).length; i++) {
  if (gallery.photos[i].id === photoId) {
    photoFilename = gallery.photos[i].filename;
    photoUrl = gallery.photos[i].url;
    photoFound = true;
    break;
  }
}

if (!photoFound) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_record_download",
        error: "Photo not found: " + photoId
      })
    }]
  };
}

if (!Array.isArray(gallery.downloads)) gallery.downloads = [];

var timestamp = Date.now();
var downloadId = "dl_" + Math.random().toString(36).substring(2, 8);

gallery.downloads.push({
  id: downloadId,
  photoId: photoId,
  photoFilename: photoFilename,
  resolution: resolution,
  clientName: clientName,
  timestamp: timestamp
});

gallery.updatedAt = Date.now();
await ctx.store.set("gallery_" + galleryId, JSON.stringify(gallery));

// Update index total downloads
var indexRaw = await ctx.store.get("galleries_index");
var galleries = [];
try { galleries = indexRaw ? JSON.parse(indexRaw) : []; } catch(e) { galleries = []; }
for (var j = 0; j < galleries.length; j++) {
  if (galleries[j].id === galleryId) {
    galleries[j].totalDownloads = gallery.downloads.length;
    break;
  }
}
await ctx.store.set("galleries_index", JSON.stringify(galleries));

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_client_gallery_record_download",
      galleryId: galleryId,
      galleryName: gallery.name,
      photoId: photoId,
      photoFilename: photoFilename,
      photoUrl: photoUrl,
      resolution: resolution,
      clientName: clientName,
      timestamp: timestamp,
      message: "Download recorded — " + resolution + " resolution by " + clientName,
      totalDownloads: gallery.downloads.length
    })
  }]
};