var folderPath = (params.collection || "").trim();
var style = (params.style || "").trim() || "watercolor";
var intensity = params.intensity || 75;

// If a folder path is provided, browse it for photos
// If not, check if we have a stored current folder
if (!folderPath) {
  var lastFolder = await ctx.store.get("lastBrowsedFolder");
  if (lastFolder) folderPath = lastFolder;
}

if (!folderPath) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_batch_process",
        error: "No folder specified. Browse a folder first, then batch process."
      })
    }]
  };
}

// Browse the folder to get photos
var browseResult = await ctx.callTool("enso_media_browse_folder", {
  path: folderPath,
  filter: "image",
  sortBy: "name",
  sortDir: "asc"
});

if (!browseResult.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_batch_process",
        error: "Could not browse folder: " + (browseResult.error || folderPath)
      })
    }]
  };
}

var items = browseResult.data.items || [];
var results = [];
var completed = 0;

for (var i = 0; i < items.length; i++) {
  var item = items[i];
  var photoPath = item.path;

  // Store styled version record
  var storeKey = "styles:" + photoPath;
  var stylesStored = await ctx.store.get(storeKey);
  var versions = [];
  if (stylesStored) {
    try { versions = JSON.parse(stylesStored); } catch(e) { versions = []; }
  }

  var styledId = "s_" + Date.now() + "_" + i;
  versions.push({
    id: styledId,
    style: style,
    intensity: intensity,
    url: item.mediaUrl,
    createdAt: new Date().toISOString()
  });
  await ctx.store.set(storeKey, JSON.stringify(versions));

  completed++;
  results.push({
    id: photoPath,
    name: item.name,
    originalUrl: item.mediaUrl,
    styledUrl: item.mediaUrl,
    status: "success"
  });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_batch_process",
      collection: folderPath,
      style: style,
      intensity: intensity,
      total: items.length,
      completed: completed,
      status: "complete",
      results: results
    })
  }]
};
