// Export/save processed photos to a chosen destination directory
var paths = params.paths || [];
var destination = (params.destination || "").trim();
var format = (params.format || "").trim() || "original";

if (!paths || paths.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_export_photos",
        error: "At least one photo path is required"
      })
    }]
  };
}

if (!destination) {
  // Default to Desktop/PhotoStudio_Export
  destination = (process.env.HOME || "/tmp") + "/Desktop/PhotoStudio_Export";
}

// Ensure destination directory exists
try {
  var mkdirResult = await ctx.callTool("enso_terminal_exec", {
    command: 'mkdir -p "' + destination + '"'
  });
} catch(e) { /* best effort */ }

var results = [];
var successCount = 0;
var failCount = 0;

for (var i = 0; i < paths.length; i++) {
  var srcPath = paths[i];
  var fileName = srcPath.split("/").pop() || ("photo_" + i + ".jpg");
  var destPath = destination + "/" + fileName;

  try {
    // Copy file to destination
    var cpResult = await ctx.callTool("enso_terminal_exec", {
      command: 'cp "' + srcPath + '" "' + destPath + '"'
    });

    if (cpResult && cpResult.success) {
      successCount++;
      results.push({
        name: fileName,
        source: srcPath,
        destination: destPath,
        status: "success"
      });
    } else {
      failCount++;
      results.push({
        name: fileName,
        source: srcPath,
        destination: destPath,
        status: "error",
        error: (cpResult && cpResult.error) || "Copy failed"
      });
    }
  } catch(e) {
    failCount++;
    results.push({
      name: fileName,
      source: srcPath,
      destination: destPath,
      status: "error",
      error: e.message || "Copy failed"
    });
  }
}

// Log to history
try {
  var histKey = "history";
  var histStored = await ctx.store.get(histKey);
  var histList = [];
  if (histStored) {
    try { histList = JSON.parse(histStored); } catch(e) { histList = []; }
  }
  histList.unshift({
    action: "export",
    destination: destination,
    total: paths.length,
    success: successCount,
    timestamp: new Date().toISOString()
  });
  if (histList.length > 50) histList = histList.slice(0, 50);
  await ctx.store.set(histKey, JSON.stringify(histList));
} catch(e) { /* skip */ }

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_export_photos",
      destination: destination,
      total: paths.length,
      success: successCount,
      failed: failCount,
      results: results
    })
  }]
};
