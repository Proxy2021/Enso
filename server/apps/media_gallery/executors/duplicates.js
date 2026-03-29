var path = (params.path || "").trim();

// ── Path normalization ──
if (path && path.charAt(0) !== '/' && path.charAt(0) !== '~' && !/^[A-Z]:/i.test(path)) {
  if (path.indexOf('/') > 0) {
    path = '/' + path;
  }
}

// If no path, use last browsed path or default
if (!path) {
  try {
    var lastPath = await ctx.store.get("lastBrowsedPath");
    if (lastPath) path = lastPath;
  } catch(e) {}
  if (!path) path = "~";
}

var result = await ctx.callTool("enso_media_browse_folder", { path: path });
if (!result.success) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_gallery_duplicates",
        error: result.error || "Failed to browse folder",
        path: path
      })
    }]
  };
}

var data = result.data;
if (typeof data === "string") {
  try { data = JSON.parse(data); } catch(e) { data = {}; }
}

var items = data.items || [];

// ── Group items by file size to find potential duplicates ──
var sizeMap = {};
for (var i = 0; i < items.length; i++) {
  var item = items[i];
  var size = item.size || 0;
  if (size < 100) continue; // Skip tiny files
  var key = String(size);
  if (!sizeMap[key]) sizeMap[key] = [];
  sizeMap[key].push(item);
}

// ── Also group by exact dimensions (same resolution = likely duplicate) ──
var dimMap = {};
for (var di = 0; di < items.length; di++) {
  var dItem = items[di];
  var dExif = dItem.exif || {};
  if (dExif.width && dExif.height) {
    var dimKey = dExif.width + "x" + dExif.height;
    if (!dimMap[dimKey]) dimMap[dimKey] = [];
    dimMap[dimKey].push(dItem);
  }
}

// ── Build groups: items sharing exact file size ──
var groups = [];
var totalWaste = 0;
var seenPaths = {};
var sizeKeys = Object.keys(sizeMap);
for (var j = 0; j < sizeKeys.length; j++) {
  var group = sizeMap[sizeKeys[j]];
  if (group.length >= 2) {
    var groupSize = group[0].size || 0;
    var waste = groupSize * (group.length - 1);
    totalWaste += waste;
    for (var gk = 0; gk < group.length; gk++) {
      seenPaths[group[gk].path] = true;
    }
    groups.push({
      matchType: "exact_size",
      size: groupSize,
      count: group.length,
      waste: waste,
      items: group
    });
  }
}

// ── Add dimension-match groups not already covered by size ──
var dimKeys = Object.keys(dimMap);
for (var dk = 0; dk < dimKeys.length; dk++) {
  var dimGroup = dimMap[dimKeys[dk]];
  if (dimGroup.length >= 2) {
    // Check if this group adds new info beyond size matching
    var newItems = dimGroup.filter(function(it) { return !seenPaths[it.path]; });
    if (newItems.length > 0 || dimGroup.length > 2) {
      groups.push({
        matchType: "same_resolution",
        resolution: dimKeys[dk],
        count: dimGroup.length,
        waste: 0,
        items: dimGroup
      });
    }
  }
}

// Sort by waste (largest potential savings first), then by count
groups.sort(function(a, b) {
  if (b.waste !== a.waste) return b.waste - a.waste;
  return b.count - a.count;
});

// Limit to top 30 groups
groups = groups.slice(0, 30);

var totalDupeFiles = 0;
for (var gi = 0; gi < groups.length; gi++) {
  totalDupeFiles += groups[gi].count;
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_gallery_duplicates",
      path: data.path || path,
      parentPath: data.parentPath || null,
      totalScanned: items.length,
      duplicateGroups: groups.length,
      duplicateFiles: totalDupeFiles,
      potentialSavings: totalWaste,
      groups: groups
    })
  }]
};
