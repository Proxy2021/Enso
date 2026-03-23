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

// Load styled versions for this photo path from store
var storeKey = "styles:" + photoPath;
var stylesStored = await ctx.store.get(storeKey);
var versions = [];
if (stylesStored) {
  try { versions = JSON.parse(stylesStored); } catch(e) { versions = []; }
}

// Also scan the processed/ subdirectory for on-disk versions not in store
var parentDir = photoPath.split("/").slice(0, -1).join("/");
var photoBaseName = (photo.name || "").replace(/\.[^.]+$/, "");
if (parentDir && photoBaseName) {
  try {
    var processedDir = parentDir + "/processed";
    var scanResult = await ctx.callTool("enso_media_browse_folder", {
      path: processedDir,
      filter: "image",
      sortBy: "name",
      sortDir: "asc"
    });
    if (scanResult && scanResult.success) {
      var scanItems = (scanResult.data || {}).items || [];
      // Find files that match this photo's base name (e.g., sunset_kodak_portra_400.jpg)
      var existingStyles = {};
      for (var vi = 0; vi < versions.length; vi++) {
        existingStyles[versions[vi].style || ""] = true;
      }
      for (var si = 0; si < scanItems.length; si++) {
        var scanName = scanItems[si].name || "";
        if (scanName.indexOf(photoBaseName) === 0 && scanName !== photo.name) {
          // Extract style from filename (format: basename_styleid.ext)
          var styleId = scanName.replace(photoBaseName + "_", "").replace(/\.[^.]+$/, "");
          if (styleId && !existingStyles[styleId]) {
            versions.push({
              style: styleId,
              styleName: styleId.replace(/_/g, " "),
              mediaUrl: scanItems[si].mediaUrl || "",
              thumbUrl: "",
              outputFile: scanItems[si].path || "",
              width: 0,
              height: 0,
              createdAt: scanItems[si].modifiedAt || "",
              source: "disk"
            });
            existingStyles[styleId] = true;
          }
        }
      }
    }
  } catch(e) { /* disk scan is best-effort */ }
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
      versions: versions,
      totalVersions: versions.length
    })
  }]
};
