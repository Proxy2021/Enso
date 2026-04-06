// Browser Data Update — incremental scan of recent history + bookmarks, ingest new to Cortex
var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
var historyCacheFile = path.join(cacheDir, "browser-history.json");
var bookmarksCacheFile = path.join(cacheDir, "bookmarks.json");

// 1. Read existing history cache to get known URLs
var existingHistory = { domains: [], totalVisits: 0, entries: [] };
try { existingHistory = JSON.parse(fs.readFileSync(historyCacheFile, "utf-8")); } catch (e) {}
var existingUrls = new Set();
if (existingHistory.entries) {
  existingHistory.entries.forEach(function(e) { existingUrls.add(e.url); });
} else if (existingHistory.domains) {
  existingHistory.domains.forEach(function(d) {
    if (d.topPages) d.topPages.forEach(function(p) { existingUrls.add(p.url); });
  });
}
var beforeHistoryCount = existingUrls.size;

// Read existing bookmarks cache
var existingBookmarks = { folders: [], totalBookmarks: 0 };
try { existingBookmarks = JSON.parse(fs.readFileSync(bookmarksCacheFile, "utf-8")); } catch (e) {}
var beforeBookmarkCount = existingBookmarks.totalBookmarks || 0;

// 2. Scan recent history (last 3 days only for incremental)
var historyResult = await ctx.callTool("enso_context_scan_browser_history", {
  browser: "all",
  sinceDays: 3,
  limit: 200,
});

// 3. Scan bookmarks (full — bookmarks are small)
var bookmarksResult = await ctx.callTool("enso_context_scan_bookmarks", {});

// 4. Read updated caches
var updatedHistory = { domains: [], totalVisits: 0, entries: [] };
try { updatedHistory = JSON.parse(fs.readFileSync(historyCacheFile, "utf-8")); } catch (e) {}
var updatedBookmarks = { folders: [], totalBookmarks: 0 };
try { updatedBookmarks = JSON.parse(fs.readFileSync(bookmarksCacheFile, "utf-8")); } catch (e) {}

// 5. Detect new URLs
var newUrls = [];
if (updatedHistory.entries) {
  updatedHistory.entries.forEach(function(e) {
    if (!existingUrls.has(e.url)) newUrls.push(e);
  });
}
var afterBookmarkCount = updatedBookmarks.totalBookmarks || 0;
var newBookmarks = Math.max(0, afterBookmarkCount - beforeBookmarkCount);

// 6. Ingest new browsing data to Cortex if meaningful changes
var cortexIngested = false;
if (newUrls.length > 5) {
  try {
    var domains = {};
    newUrls.forEach(function(u) {
      try { var d = new URL(u.url).hostname; domains[d] = (domains[d] || 0) + 1; } catch (e) {}
    });
    var topDomains = Object.entries(domains).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 15);
    var summary = "Recent browsing activity (" + newUrls.length + " new pages):\n" +
      topDomains.map(function(d) { return "- " + d[0] + " (" + d[1] + " visits)"; }).join("\n");
    await ctx.callTool("enso_wiki_ingest", { text: summary, topic: "Browser Activity Update" });
    cortexIngested = true;
  } catch (e) {}
}

result = {
  tool: "enso_browser_data_update",
  history: {
    newUrls: newUrls.length,
    totalVisits: updatedHistory.totalVisits || 0,
  },
  bookmarks: {
    newBookmarks: newBookmarks,
    totalBookmarks: afterBookmarkCount,
  },
  cortexIngested: cortexIngested,
};
