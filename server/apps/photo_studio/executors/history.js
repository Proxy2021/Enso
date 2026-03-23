// Processing history — shows recent style applications, batch jobs, analyses, and exports
var limit = params.limit || 20;
var filterAction = (params.action || "").trim();

var histKey = "history";
var histStored = await ctx.store.get(histKey);
var histList = [];
if (histStored) {
  try { histList = JSON.parse(histStored); } catch(e) { histList = []; }
}

// Filter by action type if specified
if (filterAction) {
  histList = histList.filter(function(h) { return h.action === filterAction; });
}

// Apply limit
histList = histList.slice(0, limit);

// Compute summary stats
var stats = { total: histList.length, styles: 0, batches: 0, analyses: 0, exports: 0 };
var styleSet = {};
for (var i = 0; i < histList.length; i++) {
  var entry = histList[i];
  if (entry.action === "apply_style") {
    stats.styles++;
    if (entry.style) styleSet[entry.style] = (styleSet[entry.style] || 0) + 1;
  }
  else if (entry.action === "batch_process") stats.batches++;
  else if (entry.action === "analyze") stats.analyses++;
  else if (entry.action === "export") stats.exports++;
}

// Most used styles
var topStyles = Object.entries(styleSet)
  .sort(function(a, b) { return b[1] - a[1]; })
  .slice(0, 5)
  .map(function(e) { return { style: e[0], styleName: e[0].replace(/_/g, " "), count: e[1] }; });

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photo_studio_history",
      total: histList.length,
      stats: stats,
      topStyles: topStyles,
      entries: histList
    })
  }]
};
