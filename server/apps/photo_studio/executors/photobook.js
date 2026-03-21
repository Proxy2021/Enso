var photoPaths = params.paths || [];
var layout = (params.layout || "auto").trim();
var title = (params.title || "Photo Book").trim();
var subtitle = (params.subtitle || "").trim();
var folderPath = (params.folderPath || "").trim();

if (!photoPaths || photoPaths.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_photobook",
        error: "At least one photo path is required"
      })
    }]
  };
}

// Resolve photo details and classify orientation
var photos = [];
for (var i = 0; i < photoPaths.length; i++) {
  var p = photoPaths[i];
  var viewResult = await ctx.callTool("enso_media_view_photo", { path: p });
  var d = viewResult.success ? viewResult.data : null;
  var w = d ? (d.width || 0) : 0;
  var h = d ? (d.height || 0) : 0;
  var orientation = "unknown";
  if (w > 0 && h > 0) {
    var ratio = w / h;
    if (ratio > 1.3) orientation = "landscape";
    else if (ratio < 0.77) orientation = "portrait";
    else orientation = "square";
  }
  photos.push({
    path: p,
    name: d ? (d.name || p.split("/").pop()) : p.split("/").pop(),
    mediaUrl: d ? (d.mediaUrl || "") : "",
    width: w,
    height: h,
    orientation: orientation,
    caption: d ? (d.caption || "") : "",
    aspectRatio: (w > 0 && h > 0) ? Math.round((w / h) * 100) / 100 : 1.5
  });
}

// Find the best hero candidate (widest landscape photo, or first)
var heroIdx = 0;
var bestRatio = 0;
for (var i = 0; i < photos.length; i++) {
  if (photos[i].orientation === "landscape" && photos[i].aspectRatio > bestRatio) {
    bestRatio = photos[i].aspectRatio;
    heroIdx = i;
  }
}

// Page type rotation for auto/magazine layouts
var PAGE_TYPES = ["hero", "grid", "editorial", "panoramic"];

function makePhotoEntry(ph, position) {
  return {
    path: ph.mediaUrl || ph.path,
    width: ph.width,
    height: ph.height,
    caption: ph.caption || ph.name,
    position: position,
    orientation: ph.orientation,
    aspectRatio: ph.aspectRatio
  };
}

// Build pages based on layout type
var pages = [];

if (layout === "contact_sheet") {
  // Uniform grid: 6 photos per page
  var perPage = 6;
  for (var i = 0; i < photos.length; i += perPage) {
    var pagePhotos = photos.slice(i, i + perPage);
    pages.push({
      pageNum: pages.length + 1,
      type: "contact",
      columns: 3,
      photos: pagePhotos.map(function(ph) { return makePhotoEntry(ph, "grid"); })
    });
  }

} else if (layout === "editorial") {
  // Professional editorial: alternating hero (full-bleed) and pair spreads
  // Prefer landscape photos for heroes
  var used = [];
  for (var i = 0; i < photos.length; i++) used.push(false);

  // First pass: find landscape photos for hero pages
  var landscapeIdxs = [];
  var otherIdxs = [];
  for (var i = 0; i < photos.length; i++) {
    if (photos[i].orientation === "landscape") landscapeIdxs.push(i);
    else otherIdxs.push(i);
  }

  var allOrdered = [];
  // Interleave: 1 landscape hero, then 2-3 others for grid
  var li = 0;
  var oi = 0;
  while (li < landscapeIdxs.length || oi < otherIdxs.length) {
    if (li < landscapeIdxs.length) {
      // Hero page with landscape photo
      pages.push({
        pageNum: pages.length + 1,
        type: "hero",
        photos: [makePhotoEntry(photos[landscapeIdxs[li]], "full")]
      });
      li++;
    }
    // Pair/grid page with next 2-3 photos
    var pair = [];
    var pairCount = (oi + 2 <= otherIdxs.length) ? 2 : Math.min(otherIdxs.length - oi, 3);
    if (pairCount === 0 && li < landscapeIdxs.length) {
      // Use landscape for pair if no portraits left
      pair.push(photos[landscapeIdxs[li]]);
      li++;
    }
    for (var j = 0; j < pairCount && oi < otherIdxs.length; j++) {
      pair.push(photos[otherIdxs[oi]]);
      oi++;
    }
    if (pair.length > 0) {
      pages.push({
        pageNum: pages.length + 1,
        type: pair.length === 1 ? "hero" : "grid",
        photos: pair.map(function(ph) { return makePhotoEntry(ph, pair.length === 1 ? "full" : "half"); })
      });
    }
  }

} else if (layout === "storytelling") {
  // Cinematic single-image pages with captions
  for (var i = 0; i < photos.length; i++) {
    pages.push({
      pageNum: pages.length + 1,
      type: i === 0 ? "title" : (photos[i].orientation === "landscape" ? "hero" : "editorial"),
      photos: [makePhotoEntry(photos[i], "full")]
    });
  }

} else if (layout === "minimal") {
  // One photo per page — maximum impact
  for (var i = 0; i < photos.length; i++) {
    pages.push({
      pageNum: pages.length + 1,
      type: "minimal",
      photos: [makePhotoEntry(photos[i], "full")]
    });
  }

} else {
  // Auto or Magazine: intelligent layout based on aspect ratios
  // Rotate page types, group photos by orientation for best fit
  var remaining = photos.slice();

  // Move hero candidate to front
  if (heroIdx > 0) {
    var hero = remaining.splice(heroIdx, 1)[0];
    remaining.unshift(hero);
  }

  var typeIdx = 0;
  var idx = 0;

  while (idx < remaining.length) {
    var pageType = PAGE_TYPES[typeIdx % PAGE_TYPES.length];
    typeIdx++;

    if (pageType === "hero") {
      // 1 hero image (prefer landscape) + up to 2 supporting
      var heroPhoto = remaining[idx];
      idx++;
      var supporting = [];
      // Add up to 2 more if available
      var supportCount = Math.min(2, remaining.length - idx);
      for (var s = 0; s < supportCount; s++) {
        supporting.push(remaining[idx]);
        idx++;
      }
      var pagePhotos = [makePhotoEntry(heroPhoto, "hero")];
      for (var s = 0; s < supporting.length; s++) {
        pagePhotos.push(makePhotoEntry(supporting[s], "supporting"));
      }
      pages.push({ pageNum: pages.length + 1, type: "hero", photos: pagePhotos });

    } else if (pageType === "grid") {
      // 3-4 photos in a grid
      var gridCount = Math.min(4, remaining.length - idx);
      if (gridCount < 2) gridCount = remaining.length - idx;
      var gridPhotos = [];
      for (var g = 0; g < gridCount; g++) {
        gridPhotos.push(makePhotoEntry(remaining[idx], "grid"));
        idx++;
      }
      pages.push({ pageNum: pages.length + 1, type: "grid", columns: gridCount <= 2 ? 2 : (gridCount === 3 ? 3 : 2), photos: gridPhotos });

    } else if (pageType === "editorial") {
      // 1 large + 1 small (or 2 side by side)
      var editPhotos = [];
      editPhotos.push(makePhotoEntry(remaining[idx], "large"));
      idx++;
      if (idx < remaining.length) {
        editPhotos.push(makePhotoEntry(remaining[idx], "small"));
        idx++;
      }
      pages.push({ pageNum: pages.length + 1, type: "editorial", photos: editPhotos });

    } else if (pageType === "panoramic") {
      // 1 wide photo full-bleed (prefer landscape)
      var panPhoto = remaining[idx];
      idx++;
      pages.push({ pageNum: pages.length + 1, type: "panoramic", photos: [makePhotoEntry(panPhoto, "full")] });
    }
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_photobook",
      title: title,
      subtitle: subtitle,
      layout: layout,
      totalPhotos: photos.length,
      totalPages: pages.length,
      pages: pages,
      folderPath: folderPath
    })
  }]
};
