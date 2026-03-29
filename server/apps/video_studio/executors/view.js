// Landing page: loads saved draft, history stats, gallery count
var draft = null;
try {
  var draftStored = await ctx.store.get("current_draft");
  if (draftStored) {
    draft = JSON.parse(draftStored);
  }
} catch(e) {}

// Load history stats
var totalGenerations = 0;
var successCount = 0;
var failedCount = 0;
var recentEntries = [];
try {
  var histStored = await ctx.store.get("history");
  if (histStored) {
    var histList = JSON.parse(histStored);
    totalGenerations = histList.length;
    for (var i = 0; i < histList.length; i++) {
      if (histList[i].status === "success") successCount++;
      else if (histList[i].status === "failed") failedCount++;
    }
    recentEntries = histList.slice(0, 3).map(function(e) {
      var dateStr = "";
      if (e.date) {
        try { dateStr = new Date(e.date).toISOString().replace("T", " ").slice(0, 16); } catch(err) { dateStr = String(e.date); }
      }
      return {
        date: dateStr,
        type: e.type || "t2v",
        prompt: (e.prompt || "").slice(0, 80),
        status: e.status || "unknown",
        url: e.url || ""
      };
    });
  }
} catch(e) {}

// Count gallery videos
var galleryCount = 0;
try {
  var listResult = await ctx.listDir("~/.enso/data/seedance");
  if (listResult && listResult.success && listResult.data) {
    var items = listResult.data;
    if (typeof items === "string") {
      try { items = JSON.parse(items); } catch(e) { items = []; }
    }
    if (!Array.isArray(items)) {
      items = items.items || items.files || [];
    }
    for (var j = 0; j < items.length; j++) {
      var name = (items[j].name || "");
      if (name.split(".").pop().toLowerCase() === "mp4") galleryCount++;
    }
  }
} catch(e) {}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_video_studio_view",
      draft: draft,
      stats: {
        totalGenerations: totalGenerations,
        successCount: successCount,
        failedCount: failedCount,
        galleryCount: galleryCount
      },
      recentEntries: recentEntries
    })
  }]
};
