var sortBy = (params.sortBy || "").trim() || "date";
var sortDir = (params.sortDir || "").trim() || "desc";
var filter = (params.filter || "").trim() || "all";

// List seedance video directory
var seedancePath = "~/.enso/data/seedance";
var listResult = await ctx.listDir(seedancePath);

var videos = [];
var totalSize = 0;

if (listResult && listResult.success && listResult.data) {
  var items = listResult.data;
  if (typeof items === "string") {
    try { items = JSON.parse(items); } catch(e) { items = []; }
  }
  if (!Array.isArray(items)) {
    items = items.items || items.files || [];
  }

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var name = item.name || "";
    if (!name) continue;

    // Only include .mp4 files
    var ext = name.split(".").pop().toLowerCase();
    if (ext !== "mp4") continue;

    // Determine type from filename
    var videoType = "t2v";
    if (name.indexOf("i2v") >= 0) videoType = "i2v";

    // Apply filter
    if (filter === "t2v" && videoType !== "t2v") continue;
    if (filter === "i2v" && videoType !== "i2v") continue;

    var sizeBytes = item.size || 0;
    var sizeMB = Math.round(sizeBytes / 1048576 * 10) / 10;
    totalSize += sizeBytes;

    // Extract date from filename or use modified date
    var dateStr = "";
    if (item.modifiedAt || item.modified) {
      try {
        var d = new Date(item.modifiedAt || item.modified);
        dateStr = d.toISOString().split("T")[0];
      } catch(e) {}
    }
    if (!dateStr) {
      // Try to extract timestamp from filename
      var tsMatch = name.match(/(\d{10,13})/);
      if (tsMatch) {
        try {
          var ts = parseInt(tsMatch[1]);
          if (ts < 10000000000) ts *= 1000; // seconds to ms
          dateStr = new Date(ts).toISOString().split("T")[0];
        } catch(e) {}
      }
    }
    if (!dateStr) dateStr = "unknown";

    // Build media URL from path
    var filePath = item.path || (seedancePath + "/" + name);
    var url = item.mediaUrl || ("/media/" + name);

    videos.push({
      name: name,
      url: url,
      path: filePath,
      type: videoType,
      date: dateStr,
      sizeMB: sizeMB,
      sizeBytes: sizeBytes,
      prompt: ""
    });
  }
}

// Cross-reference with generation history to enrich videos with prompt data
try {
  var histStored = await ctx.store.get("history");
  if (histStored) {
    var histList = JSON.parse(histStored);
    for (var j = 0; j < videos.length; j++) {
      for (var k = 0; k < histList.length; k++) {
        var entry = histList[k];
        if (!entry.prompt) continue;
        // Match by URL
        if (entry.url && entry.url === videos[j].url) {
          videos[j].prompt = entry.prompt;
          if (entry.date) videos[j].generatedAt = entry.date;
          break;
        }
        // Match by video path or filename
        if (entry.videoPath && videos[j].name && entry.videoPath.indexOf(videos[j].name) >= 0) {
          videos[j].prompt = entry.prompt;
          if (entry.date) videos[j].generatedAt = entry.date;
          break;
        }
      }
    }
  }
} catch(e) {}

// Sort videos
if (sortBy === "date") {
  videos.sort(function(a, b) {
    if (sortDir === "desc") return a.date < b.date ? 1 : -1;
    return a.date > b.date ? 1 : -1;
  });
} else if (sortBy === "size") {
  videos.sort(function(a, b) {
    if (sortDir === "desc") return b.sizeBytes - a.sizeBytes;
    return a.sizeBytes - b.sizeBytes;
  });
}

var totalSizeMB = Math.round(totalSize / 1048576 * 10) / 10;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_video_studio_gallery",
      totalCount: videos.length,
      totalSizeMB: totalSizeMB,
      filter: filter,
      sortBy: sortBy,
      sortDir: sortDir,
      videos: videos
    })
  }]
};
