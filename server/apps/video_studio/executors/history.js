var limit = typeof params.limit === "number" ? params.limit : 50;
var search = (params.search || "").trim().toLowerCase();
var statusFilter = (params.status || "").trim() || "all";

if (limit < 1) limit = 1;
if (limit > 200) limit = 200;

var histKey = "history";
var histStored = await ctx.store.get(histKey);
var histList = [];
if (histStored) {
  try { histList = JSON.parse(histStored); } catch(e) { histList = []; }
}

// Apply search filter
var filtered = histList;
if (search) {
  filtered = filtered.filter(function(e) {
    return (e.prompt || "").toLowerCase().indexOf(search) >= 0;
  });
}

// Apply status filter
if (statusFilter !== "all") {
  filtered = filtered.filter(function(e) {
    return e.status === statusFilter;
  });
}

// Apply limit
var entries = filtered.slice(0, limit);

// Compute stats from full (unfiltered) list
var t2vCount = 0;
var i2vCount = 0;
var successCount = 0;
var failedCount = 0;

for (var i = 0; i < histList.length; i++) {
  var entry = histList[i];
  if (entry.type === "t2v") t2vCount++;
  else if (entry.type === "i2v") i2vCount++;
  if (entry.status === "success") successCount++;
  else if (entry.status === "failed") failedCount++;
}

// Format dates for display
var formattedEntries = entries.map(function(e) {
  var dateStr = "";
  if (e.date) {
    try {
      var d = new Date(e.date);
      dateStr = d.toISOString().replace("T", " ").slice(0, 16);
    } catch(err) {
      dateStr = String(e.date);
    }
  }
  return {
    date: dateStr,
    type: e.type || "t2v",
    prompt: e.prompt || "",
    duration: e.duration || 0,
    resolution: e.resolution || "720p",
    ratio: e.ratio || "16:9",
    status: e.status || "unknown",
    url: e.url || "",
    taskId: e.taskId || "",
    sourceImage: e.sourceImage || ""
  };
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_video_studio_history",
      totalGenerations: histList.length,
      filteredCount: filtered.length,
      t2vCount: t2vCount,
      i2vCount: i2vCount,
      successCount: successCount,
      failedCount: failedCount,
      search: search || "",
      statusFilter: statusFilter,
      entries: formattedEntries
    })
  }]
};
