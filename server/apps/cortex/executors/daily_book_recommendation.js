// Cortex Daily Book Recommendation — finds best book, deep processes, sends email with podcast

ctx.log("Daily Book Recommendation starting...");

var os = require("os");
var path = require("path");
var fs = require("fs");
var http = require("http");

// Determine server port
var port = 3001;

// Check if there are any unprocessed books first (quick check before triggering pipeline)
var entityIndexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var cortexIndexPath = path.join(os.homedir(), ".enso", "wiki", "_index.md");
var deepContentDir = path.join(os.homedir(), ".enso", "data", "deep-content");

// Count processed books
var processedCount = 0;
try {
  if (fs.existsSync(deepContentDir)) {
    var files = fs.readdirSync(deepContentDir);
    processedCount = files.filter(function(f) { return f.endsWith(".json"); }).length;
  }
} catch(e) {}

// Count total kindle books
var totalBooks = 0;
try {
  var kindlePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "kindle-library.json");
  if (fs.existsSync(kindlePath)) {
    var kindle = JSON.parse(fs.readFileSync(kindlePath, "utf-8"));
    totalBooks = (kindle.books || []).length;
  }
} catch(e) {}

ctx.log("Library: " + totalBooks + " books, " + processedCount + " already deep-processed");

if (totalBooks === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_daily_book_recommendation",
    success: false,
    message: "No Kindle books found. Run a Kindle scan first.",
    totalBooks: 0,
    processedCount: 0
  }) }] };
}

// Trigger the pipeline via REST API (returns immediately, processes in background)
ctx.log("Triggering daily book recommendation pipeline...");

var result = null;
try {
  var response = await ctx.fetch("http://localhost:" + port + "/api/book-recommendation/daily", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (response.ok) {
    result = response.data || response;
    ctx.log("Pipeline response: " + JSON.stringify(result));
  } else {
    ctx.log("Pipeline error: " + (response.status || "unknown"));
    result = { success: false, message: "Server returned error: " + (response.status || "unknown") };
  }
} catch(e) {
  ctx.log("Pipeline request failed: " + (e.message || e));
  result = { success: false, message: "Failed to trigger pipeline: " + (e.message || e) };
}

// Read top Cortex themes for context
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
    topThemes = Object.keys(themeCounts).sort(function(a, b) { return themeCounts[b] - themeCounts[a]; }).slice(0, 5);
  }
} catch(e) {}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_daily_book_recommendation",
  success: result ? result.success : false,
  message: result ? result.message : "Pipeline did not return a result",
  selectedBook: result ? result.title : null,
  entityId: result ? result.entityId : null,
  reason: result ? result.reason : null,
  totalBooks: totalBooks,
  processedCount: processedCount,
  remainingBooks: totalBooks - processedCount,
  topCortexThemes: topThemes,
  note: "The deep processing pipeline runs in the background (15-30 min). An email with the podcast will be sent to kkwong@xiaomi.com when ready."
}) }] };
