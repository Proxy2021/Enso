var folderPath = (params.collection || "").trim();
var style = (params.style || "").trim();
var specificPaths = params.paths || [];

if (!style) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_batch_process",
        error: "Style is required. Use list_styles or style_gallery to browse available styles."
      })
    }]
  };
}

// If no folder path, check stored last browsed folder
if (!folderPath && specificPaths.length === 0) {
  var lastFolder = await ctx.store.get("lastBrowsedFolder");
  if (lastFolder) folderPath = lastFolder;
}

if (!folderPath && specificPaths.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_batch_process",
        error: "No folder or photos specified. Browse a folder first, then batch process."
      })
    }]
  };
}

// Call real photo processing tool
var processParams = {
  style: style,
  outputSubfolder: "processed"
};

// Support processing specific photo paths (from multi-select) or entire directory
if (specificPaths.length > 0) {
  processParams.paths = specificPaths;
  // Derive inputDir from first path for output organization
  if (!folderPath && specificPaths[0]) {
    folderPath = specificPaths[0].split("/").slice(0, -1).join("/");
  }
  processParams.inputDir = folderPath;
} else {
  processParams.inputDir = folderPath;
}

var result = await ctx.callTool("enso_media_process_photos", processParams);

// Handle errors
if (!result || !result.success) {
  var errMsg = (result && result.error) || "Processing failed";
  // Try to extract error from data
  if (result && result.data) {
    try {
      var d = typeof result.data === "string" ? JSON.parse(result.data) : result.data;
      if (d.error) errMsg = d.error;
    } catch(e) {}
  }
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_batch_process",
        error: errMsg
      })
    }]
  };
}

// Extract result data
var data = result.data || result;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

var files = data.files || [];
var processed = data.processed || files.length;
var failed = data.failed || 0;

// Build results for template (prefer thumbnail for web display, full-res for download)
var results = files.map(function(f) {
  return {
    id: f.path,
    name: f.name,
    styledUrl: f.thumbUrl || f.mediaUrl,
    fullUrl: f.mediaUrl,
    status: "success"
  };
});

// Auto-save processed photos to "Recent" collection via native tool (unified storage)
var savedToCollection = false;
if (results.length > 0) {
  try {
    await ctx.callTool("enso_media_manage_collection", {
      action: "create",
      collectionName: "Recent"
    });
    for (var ri = 0; ri < results.length; ri++) {
      if (results[ri].id) {
        await ctx.callTool("enso_media_manage_collection", {
          action: "add",
          collectionName: "Recent",
          photoPath: results[ri].id
        });
      }
    }
    savedToCollection = true;
  } catch(e) { /* silently skip collection save errors */ }
}

// ── Log to processing history ──
try {
  var histKey = "history";
  var histStored = await ctx.store.get(histKey);
  var histList = [];
  if (histStored) {
    try { histList = JSON.parse(histStored); } catch(e) { histList = []; }
  }
  histList.unshift({
    action: "batch_process",
    folder: folderPath,
    style: style,
    total: processed + failed,
    completed: processed,
    failed: failed,
    timestamp: new Date().toISOString()
  });
  if (histList.length > 50) histList = histList.slice(0, 50);
  await ctx.store.set(histKey, JSON.stringify(histList));
} catch(e) { /* skip */ }

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_batch_process",
      collection: folderPath,
      style: style,
      intensity: params.intensity || 75,
      total: processed + failed,
      completed: processed,
      failed: failed,
      status: "complete",
      outputDir: data.outputDir || "",
      inputDir: folderPath,
      savedToCollection: savedToCollection,
      results: results
    })
  }]
};
