var galleryId = (params.galleryId || "").trim();

if (!galleryId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_get_gallery_page",
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
        tool: "enso_client_gallery_get_gallery_page",
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
        tool: "enso_client_gallery_get_gallery_page",
        error: "Failed to parse gallery data"
      })
    }]
  };
}

var downloads = gallery.downloads || [];

// Compute per-photo download counts
var photoDownloadMap = {};
for (var d = 0; d < downloads.length; d++) {
  var dl = downloads[d];
  if (!photoDownloadMap[dl.photoId]) {
    photoDownloadMap[dl.photoId] = { web: 0, print: 0 };
  }
  if (dl.resolution === "web") photoDownloadMap[dl.photoId].web++;
  else if (dl.resolution === "print") photoDownloadMap[dl.photoId].print++;
}

var photos = (gallery.photos || []).map(function(p) {
  var dlStats = photoDownloadMap[p.id] || { web: 0, print: 0 };
  return {
    id: p.id,
    url: p.url,
    filename: p.filename,
    caption: p.caption || "",
    webDownloads: dlStats.web,
    printDownloads: dlStats.print
  };
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_client_gallery_get_gallery_page",
      galleryId: galleryId,
      galleryName: gallery.name,
      clientName: gallery.clientName,
      description: gallery.description,
      coverPhotoUrl: gallery.coverPhotoUrl || (photos.length > 0 ? photos[0].url : ""),
      status: gallery.status,
      total: photos.length,
      photos: photos
    })
  }]
};