var photoPaths = params.paths || [];
var layout = (params.layout || "magazine").trim();
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

// Resolve photo details for each path
var photos = [];
for (var i = 0; i < photoPaths.length; i++) {
  var p = photoPaths[i];
  var viewResult = await ctx.callTool("enso_media_view_photo", { path: p });
  if (viewResult.success) {
    var d = viewResult.data;
    photos.push({
      path: p,
      name: d.name || p.split("/").pop(),
      mediaUrl: d.mediaUrl || "",
      width: d.width || 0,
      height: d.height || 0,
      caption: d.caption || ""
    });
  } else {
    photos.push({
      path: p,
      name: p.split("/").pop(),
      mediaUrl: "",
      width: 0,
      height: 0,
      caption: ""
    });
  }
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
      photos: pagePhotos.map(function(ph) {
        return { path: ph.mediaUrl || ph.path, width: ph.width, height: ph.height, caption: ph.name, position: "grid" };
      })
    });
  }
} else if (layout === "editorial") {
  // Alternating: full-bleed hero then a pair
  for (var i = 0; i < photos.length; i++) {
    if (i % 3 === 0) {
      // Hero page
      pages.push({
        pageNum: pages.length + 1,
        type: "hero",
        photos: [{
          path: photos[i].mediaUrl || photos[i].path,
          width: photos[i].width,
          height: photos[i].height,
          caption: photos[i].caption || photos[i].name,
          position: "full"
        }]
      });
    } else if (i % 3 === 1) {
      // Pair page
      var pair = [photos[i]];
      if (i + 1 < photos.length && (i + 1) % 3 === 2) {
        pair.push(photos[i + 1]);
        i++;
      }
      pages.push({
        pageNum: pages.length + 1,
        type: "grid",
        photos: pair.map(function(ph) {
          return { path: ph.mediaUrl || ph.path, width: ph.width, height: ph.height, caption: ph.caption || ph.name, position: "half" };
        })
      });
    }
  }
} else if (layout === "storytelling") {
  // Cinematic: single images with captions, building narrative
  for (var i = 0; i < photos.length; i++) {
    pages.push({
      pageNum: pages.length + 1,
      type: i === 0 || i === photos.length - 1 ? "hero" : (i % 2 === 0 ? "hero" : "grid"),
      photos: [{
        path: photos[i].mediaUrl || photos[i].path,
        width: photos[i].width,
        height: photos[i].height,
        caption: photos[i].caption || photos[i].name,
        position: "full"
      }]
    });
  }
} else {
  // Magazine grid: hero + supporting images per spread
  for (var i = 0; i < photos.length;) {
    if (i === 0 || (photos.length - i) >= 3) {
      // Hero + 2 supporting
      var heroPhoto = photos[i];
      var supporting = [];
      if (i + 1 < photos.length) supporting.push(photos[i + 1]);
      if (i + 2 < photos.length) supporting.push(photos[i + 2]);

      var pagePhotos = [{
        path: heroPhoto.mediaUrl || heroPhoto.path,
        width: heroPhoto.width,
        height: heroPhoto.height,
        caption: heroPhoto.caption || heroPhoto.name,
        position: "hero"
      }];
      supporting.forEach(function(ph) {
        pagePhotos.push({
          path: ph.mediaUrl || ph.path,
          width: ph.width,
          height: ph.height,
          caption: ph.caption || ph.name,
          position: "supporting"
        });
      });

      pages.push({
        pageNum: pages.length + 1,
        type: "hero",
        photos: pagePhotos
      });
      i += 1 + supporting.length;
    } else {
      // Remaining photos in grid
      var remaining = photos.slice(i);
      pages.push({
        pageNum: pages.length + 1,
        type: "grid",
        photos: remaining.map(function(ph) {
          return { path: ph.mediaUrl || ph.path, width: ph.width, height: ph.height, caption: ph.caption || ph.name, position: "grid" };
        })
      });
      i = photos.length;
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
