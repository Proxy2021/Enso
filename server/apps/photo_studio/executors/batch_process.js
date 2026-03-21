var folderPath = (params.collection || "").trim();
var style = (params.style || "").trim();

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

// Call real photo processing tool
var result = await ctx.callTool("enso_media_process_photos", {
  inputDir: folderPath,
  style: style,
  outputSubfolder: "processed"
});

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
      savedToCollection: savedToCollection,
      results: results
    })
  }]
};
