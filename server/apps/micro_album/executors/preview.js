// Micro Album Preview — Auto-generated album layout
// Shows 12 photos as full-bleed spreads, chronologically ordered

var albumState = await ctx.store.get("albumState");

if (!albumState || !albumState.candidates) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_micro_album_preview",
        error: "No album in progress. Launch a new album first!",
        suggestion: "Use the Launch tool to scan your photos."
      })
    }]
  };
}

var candidates = albumState.candidates;
var kept = albumState.kept || [];

if (kept.length < 1) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_micro_album_preview",
        error: "No photos selected yet. Complete the curation step first!",
        status: "needs_curation",
        keptCount: 0
      })
    }]
  };
}

// Gather kept photos
var keptPhotos = [];
for (var i = 0; i < kept.length; i++) {
  if (kept[i] < candidates.length) {
    keptPhotos.push(candidates[kept[i]]);
  }
}

// Sort chronologically by date taken
keptPhotos.sort(function(a, b) {
  var dateA = a.dateTaken ? new Date(a.dateTaken).getTime() : 0;
  var dateB = b.dateTaken ? new Date(b.dateTaken).getTime() : 0;
  if (isNaN(dateA)) dateA = 0;
  if (isNaN(dateB)) dateB = 0;
  return dateA - dateB;
});

// Determine cover photo — highest rated, or first favorite, or first photo
var coverPhoto = keptPhotos[0];
var highestRating = 0;
for (var ci = 0; ci < keptPhotos.length; ci++) {
  var cRating = keptPhotos[ci].rating || 0;
  if (cRating > highestRating) {
    highestRating = cRating;
    coverPhoto = keptPhotos[ci];
  } else if (cRating === highestRating && keptPhotos[ci].isFavorite && !coverPhoto.isFavorite) {
    coverPhoto = keptPhotos[ci];
  }
}

// Build spreads — each photo gets a full-bleed spread (2 pages)
var spreads = [];
for (var si = 0; si < keptPhotos.length; si++) {
  var photo = keptPhotos[si];
  var spreadDate = "";
  if (photo.dateTaken) {
    try {
      var d = new Date(photo.dateTaken);
      if (!isNaN(d.getTime())) {
        spreadDate = d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      }
    } catch(e) {}
  }

  spreads.push({
    spreadNumber: si + 1,
    pageStart: (si * 2) + 3,  // Pages 1-2 are cover, spread 1 starts at page 3
    pageEnd: (si * 2) + 4,
    photo: {
      path: photo.path,
      name: photo.name,
      mediaUrl: photo.mediaUrl,
      thumbnailUrl: photo.thumbnailUrl || photo.mediaUrl,
      description: photo.description,
      dateTaken: spreadDate,
      camera: photo.camera,
      rating: photo.rating,
      width: photo.width,
      height: photo.height
    },
    layout: "full_bleed"
  });
}

// Compute date range
var earliestDate = "";
var latestDate = "";
for (var di = 0; di < keptPhotos.length; di++) {
  if (keptPhotos[di].dateTaken) {
    if (!earliestDate) earliestDate = keptPhotos[di].dateTaken;
    latestDate = keptPhotos[di].dateTaken;
  }
}

var dateRange = "";
if (earliestDate && latestDate) {
  try {
    var ed = new Date(earliestDate);
    var ld = new Date(latestDate);
    if (!isNaN(ed.getTime()) && !isNaN(ld.getTime())) {
      var fmt = { year: "numeric", month: "short" };
      dateRange = ed.toLocaleDateString("en-US", fmt) + " – " + ld.toLocaleDateString("en-US", fmt);
    }
  } catch(e) {}
}

// Camera stats
var cameraStats = {};
for (var csi = 0; csi < keptPhotos.length; csi++) {
  var cam = (keptPhotos[csi].camera || "").trim();
  if (cam) {
    cameraStats[cam] = (cameraStats[cam] || 0) + 1;
  }
}

// Cost estimate based on Printique pricing
var costEstimate = "$45–65";
var pageCount = 2 + (keptPhotos.length * 2); // cover + spreads
if (pageCount > 30) costEstimate = "$55–75";
if (pageCount > 40) costEstimate = "$65–85";

// Update album state with preview info
albumState.status = "preview_ready";
albumState.previewGenerated = Date.now();
await ctx.store.set("albumState", albumState);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_micro_album_preview",
      status: "preview_ready",
      album: {
        title: albumState.albumSpec.theme || "My Best Shots",
        coverPhoto: {
          path: coverPhoto.path,
          name: coverPhoto.name,
          mediaUrl: coverPhoto.mediaUrl,
          thumbnailUrl: coverPhoto.thumbnailUrl || coverPhoto.mediaUrl,
          description: coverPhoto.description,
          rating: coverPhoto.rating
        },
        photoCount: keptPhotos.length,
        spreads: spreads,
        dateRange: dateRange,
        cameras: cameraStats,
        specs: {
          size: albumState.albumSpec.size || "10x10 inches",
          pages: pageCount,
          printer: "Printique",
          paper: "Lustre",
          cover: "Hardcover Lustre",
          layout: "Full-bleed spreads"
        },
        costEstimate: costEstimate
      }
    })
  }]
};
