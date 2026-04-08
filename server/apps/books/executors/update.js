// Books Update — incremental scan for Kindle + WeRead, detect new books, auto-ingest to Cortex
var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
var results = { kindle: { before: 0, after: 0, newBooks: [], error: null }, weread: { before: 0, after: 0, newBooks: [], error: null } };

// ── Kindle Update ──
ctx.log("Updating Kindle library...");
var kindleCacheFile = path.join(cacheDir, "kindle-library.json");
var kindleExisting = { books: [] };
try { kindleExisting = JSON.parse(fs.readFileSync(kindleCacheFile, "utf-8")); } catch (e) {}
var kindleExistingAsins = new Set(kindleExisting.books.map(function(b) { return b.asin; }));
results.kindle.before = kindleExisting.books.length;

try {
  await ctx.callTool("enso_context_scan_kindle_library", {});
  var kindleUpdated = { books: [] };
  try { kindleUpdated = JSON.parse(fs.readFileSync(kindleCacheFile, "utf-8")); } catch (e) {}
  results.kindle.after = kindleUpdated.books.length;
  results.kindle.newBooks = kindleUpdated.books
    .filter(function(b) { return b.asin && !kindleExistingAsins.has(b.asin); })
    .map(function(b) { return b.title + (b.author ? " — " + b.author : ""); });
} catch (e) {
  results.kindle.error = e.message || String(e);
  ctx.log("Kindle scan error: " + results.kindle.error);
}

// ── WeRead Update (only if session exists — requires prior manual login) ──
var wereadBrowserDir = path.join(os.homedir(), ".enso", "data", "weread-browser");
var wereadCacheFile = path.join(cacheDir, "weread-library.json");

if (fs.existsSync(wereadBrowserDir)) {
  ctx.log("Updating WeRead library...");
  var wereadExisting = { books: [] };
  try { wereadExisting = JSON.parse(fs.readFileSync(wereadCacheFile, "utf-8")); } catch (e) {}
  var wereadExistingTitles = new Set(wereadExisting.books.map(function(b) { return b.title; }));
  results.weread.before = wereadExisting.books.length;

  try {
    await ctx.callTool("enso_context_scan_weread", {});
    var wereadUpdated = { books: [] };
    try { wereadUpdated = JSON.parse(fs.readFileSync(wereadCacheFile, "utf-8")); } catch (e) {}
    results.weread.after = wereadUpdated.books.length;
    results.weread.newBooks = wereadUpdated.books
      .filter(function(b) { return b.title && !wereadExistingTitles.has(b.title); })
      .map(function(b) { return b.title + (b.author ? " — " + b.author : ""); });
  } catch (e) {
    results.weread.error = e.message || String(e);
    ctx.log("WeRead scan error: " + results.weread.error);
  }
} else {
  ctx.log("WeRead browser session not found — skipping (use /browser to log in first)");
  results.weread.error = "No browser session — login required via /browser → weread.qq.com";
}

// ── Cortex Ingest for new books ──
var allNewBooks = results.kindle.newBooks.concat(results.weread.newBooks);
var cortexIngested = false;
if (allNewBooks.length > 0) {
  try {
    await ctx.callTool("enso_wiki_ingest", {
      text: "New books added to library:\n" + allNewBooks.map(function(b) { return "- " + b; }).join("\n"),
      topic: "Books Library Update"
    });
    cortexIngested = true;
  } catch (e) {
    ctx.log("Cortex ingest error: " + (e.message || e));
  }
}

var totalBefore = results.kindle.before + results.weread.before;
var totalAfter = results.kindle.after + results.weread.after;
ctx.log("Update complete: Kindle " + results.kindle.before + "→" + results.kindle.after + " (" + results.kindle.newBooks.length + " new), WeRead " + results.weread.before + "→" + results.weread.after + " (" + results.weread.newBooks.length + " new)");

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_books_update",
  totalBefore: totalBefore,
  totalAfter: totalAfter,
  totalNew: allNewBooks.length,
  kindle: {
    before: results.kindle.before,
    after: results.kindle.after,
    newCount: results.kindle.newBooks.length,
    newTitles: results.kindle.newBooks.slice(0, 10),
    error: results.kindle.error,
  },
  weread: {
    before: results.weread.before,
    after: results.weread.after,
    newCount: results.weread.newBooks.length,
    newTitles: results.weread.newBooks.slice(0, 10),
    error: results.weread.error,
  },
  cortexIngested: cortexIngested,
}) }] };
