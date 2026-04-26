// Cortex Daily Book Discovery — discovers new books via AI, deep processes, sends email with podcast + Cortex button

ctx.log("Daily Book Discovery starting...");

var os = require("os");
var path = require("path");
var fs = require("fs");

// Read top Cortex themes for context
var cortexIndexPath = path.join(os.homedir(), ".enso", "wiki", "_index.md");
var topThemes = [];
try {
  if (fs.existsSync(cortexIndexPath)) {
    var idx = fs.readFileSync(cortexIndexPath, "utf-8");
    var themeMatches = idx.match(/Themes:\s*(.+)/g) || [];
    var themeCounts = {};
    themeMatches.forEach(function(m) {
      var themes = m.replace(/Themes:\s*/, "").split(",");
      themes.forEach(function(t) {
        var theme = t.trim().toLowerCase();
        if (theme) themeCounts[theme] = (themeCounts[theme] || 0) + 1;
      });
    });
    topThemes = Object.keys(themeCounts).sort(function(a, b) { return themeCounts[b] - themeCounts[a]; }).slice(0, 8);
  }
} catch(e) {}

ctx.log("Top Cortex themes: " + topThemes.join(", "));

// Count existing podcast stats
var deepContentDir = path.join(os.homedir(), ".enso", "data", "deep-content");
var processedCount = 0;
try {
  if (fs.existsSync(deepContentDir)) {
    processedCount = fs.readdirSync(deepContentDir).filter(function(f) { return f.endsWith(".json"); }).length;
  }
} catch(e) {}

// Trigger the discovery pipeline via REST API (returns immediately, processes in background)
ctx.log("Searching for a new book recommendation based on your interests...");

var result = null;
try {
  var response = await ctx.fetch("http://localhost:3001/api/book-recommendation/daily", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeoutMs: 180000,
  });

  if (response.ok) {
    result = response.data || response;
    ctx.log("Discovery result: " + JSON.stringify(result));
  } else {
    ctx.log("Pipeline error: " + (response.status || "unknown"));
    result = { success: false, message: "Server returned error: " + (response.status || "unknown") };
  }
} catch(e) {
  ctx.log("Pipeline request failed: " + (e.message || e));
  result = { success: false, message: "Failed to trigger pipeline: " + (e.message || e) };
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_daily_book_recommendation",
  success: result ? result.success : false,
  message: result ? result.message : "Pipeline did not return a result",
  discoveredBook: result ? result.title : null,
  author: result ? result.author : null,
  entityId: result ? result.entityId : null,
  whyRecommended: result ? result.whyRecommended : null,
  totalPodcastsGenerated: processedCount,
  topCortexThemes: topThemes,
  note: "The deep processing pipeline runs in the background (15-30 min). An email with the podcast + 'Add to Cortex' button will be sent to your notification email when ready."
}) }] };
