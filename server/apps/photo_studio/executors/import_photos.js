var inputPath = (params.path || "").trim();
var filter = params.filter || "image";

// Delegate to the native media browse tool for filesystem listing
var result = await ctx.callTool("enso_media_browse_folder", {
  path: inputPath || "",
  filter: filter,
  sortBy: params.sortBy || "name",
  sortDir: params.sortDir || "asc"
});

if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photo_studio_import_photos",
        error: result.error || "Failed to browse directory"
      })
    }]
  };
}

var data = result.data;

// Re-tag the tool so our template renders it
data.tool = "enso_photo_studio_import_photos";

// ── Compute folder stats for non-root directories with items ──
var items = data.items || [];
if (items.length > 0) {
  var totalSize = 0;
  var formatCounts = {};
  var oldest = null;
  var newest = null;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item.size) totalSize += item.size;
    var ext = (item.ext || "").toLowerCase().replace(".", "");
    if (ext) {
      formatCounts[ext] = (formatCounts[ext] || 0) + 1;
    }
    if (item.modifiedAt) {
      var ts = new Date(item.modifiedAt).getTime();
      if (!oldest || ts < oldest) oldest = ts;
      if (!newest || ts > newest) newest = ts;
    }
  }
  data.folderStats = {
    totalSize: totalSize,
    totalSizeMB: Math.round(totalSize / 1048576 * 10) / 10,
    formatCounts: formatCounts,
    dateRange: {
      oldest: oldest ? new Date(oldest).toISOString() : null,
      newest: newest ? new Date(newest).toISOString() : null
    }
  };
}

// ── Store last browsed folder for batch_process fallback ──
if (inputPath && inputPath !== "/") {
  try {
    await ctx.store.set("lastBrowsedFolder", inputPath);
  } catch(e) { /* skip */ }
}

// ── Track recently visited folders (up to 5) ──
if (inputPath && inputPath !== "/" && items.length > 0) {
  try {
    var recentKey = "recentFolders";
    var recentStored = await ctx.store.get(recentKey);
    var recentList = [];
    if (recentStored) {
      try { recentList = JSON.parse(recentStored); } catch(e) { recentList = []; }
    }
    // Remove duplicate and prepend
    recentList = recentList.filter(function(f) { return f.path !== inputPath; });
    recentList.unshift({
      path: inputPath,
      name: inputPath.split("/").filter(Boolean).pop() || inputPath,
      itemCount: items.length,
      visitedAt: new Date().toISOString()
    });
    // Keep only 5 most recent
    if (recentList.length > 5) recentList = recentList.slice(0, 5);
    await ctx.store.set(recentKey, JSON.stringify(recentList));
  } catch(e) { /* skip */ }
}

// ── Load recent folders for root view ──
var isRoot = !data.path || data.path === "/";
if (isRoot || (items.length === 0 && !inputPath)) {
  try {
    var recentStored = await ctx.store.get("recentFolders");
    if (recentStored) {
      var recentFolders = JSON.parse(recentStored);
      if (recentFolders.length > 0) {
        data.recentFolders = recentFolders;
      }
    }
  } catch(e) { /* skip */ }
}

// Include demo showcase image URLs so they resolve correctly on remote/mobile clients
if (isRoot || items.length === 0) {
  data.demoImages = {
    kodak_portra_400: "/demo/kodak_portra_400.jpg",
    blade_runner: "/demo/blade_runner.jpg",
    wong_kar_wai: "/demo/wong_kar_wai.jpg",
    cinestill_800t: "/demo/cinestill_800t.jpg",
    moriyama: "/demo/moriyama.jpg",
    nordic_noir: "/demo/nordic_noir.jpg",
    wes_anderson: "/demo/wes_anderson.jpg",
    ghibli: "/demo/ghibli.jpg",
    faded_editorial: "/demo/faded_editorial.jpg"
  };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify(data)
  }]
};
