var galleryId = (params.galleryId || "").trim();

if (!galleryId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_client_gallery_get_download_stats",
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
        tool: "enso_client_gallery_get_download_stats",
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
        tool: "enso_client_gallery_get_download_stats",
        error: "Failed to parse gallery data"
      })
    }]
  };
}

var downloads = gallery.downloads || [];
var photos = gallery.photos || [];

// Aggregate stats
var totalDownloads = downloads.length;
var webDownloads = 0;
var printDownloads = 0;
var clientMap = {};
var photoMap = {};

for (var i = 0; i < downloads.length; i++) {
  var dl = downloads[i];
  if (dl.resolution === "web") webDownloads++;
  else if (dl.resolution === "print") printDownloads++;

  // Client breakdown
  var cName = dl.clientName || "Guest";
  if (!clientMap[cName]) clientMap[cName] = { downloads: 0, web: 0, print: 0 };
  clientMap[cName].downloads++;
  if (dl.resolution === "web") clientMap[cName].web++;
  else clientMap[cName].print++;

  // Photo breakdown
  if (!photoMap[dl.photoId]) {
    photoMap[dl.photoId] = { totalDownloads: 0, webDownloads: 0, printDownloads: 0 };
  }
  photoMap[dl.photoId].totalDownloads++;
  if (dl.resolution === "web") photoMap[dl.photoId].webDownloads++;
  else photoMap[dl.photoId].printDownloads++;
}

// Build topPhotos sorted by total downloads
var topPhotos = [];
for (var p = 0; p < photos.length; p++) {
  var ph = photos[p];
  var pStats = photoMap[ph.id] || { totalDownloads: 0, webDownloads: 0, printDownloads: 0 };
  if (pStats.totalDownloads > 0) {
    topPhotos.push({
      photoId: ph.id,
      filename: ph.filename,
      url: ph.url,
      totalDownloads: pStats.totalDownloads,
      webDownloads: pStats.webDownloads,
      printDownloads: pStats.printDownloads
    });
  }
}
topPhotos.sort(function(a, b) { return b.totalDownloads - a.totalDownloads; });

// Build client breakdown sorted by downloads
var clientBreakdown = [];
var clientNames = Object.keys(clientMap);
for (var c = 0; c < clientNames.length; c++) {
  var cn = clientNames[c];
  clientBreakdown.push({
    clientName: cn,
    downloads: clientMap[cn].downloads,
    web: clientMap[cn].web,
    print: clientMap[cn].print
  });
}
clientBreakdown.sort(function(a, b) { return b.downloads - a.downloads; });

// Recent downloads (last 20)
var recentDownloads = downloads.slice(-20).reverse().map(function(dl) {
  return {
    photoId: dl.photoId,
    photoFilename: dl.photoFilename,
    resolution: dl.resolution,
    clientName: dl.clientName,
    timestamp: dl.timestamp
  };
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_client_gallery_get_download_stats",
      galleryId: galleryId,
      galleryName: gallery.name,
      stats: {
        totalDownloads: totalDownloads,
        webDownloads: webDownloads,
        printDownloads: printDownloads,
        uniqueClients: clientNames.length,
        totalPhotos: photos.length
      },
      topPhotos: topPhotos,
      clientBreakdown: clientBreakdown,
      recentDownloads: recentDownloads
    })
  }]
};