// Kindle Update — incremental scan, detect new books, auto-ingest to Cortex
var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheFile = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "kindle-library.json");

// 1. Read existing cache to get current ASINs
var existing = { books: [], totalBooks: 0 };
try { existing = JSON.parse(fs.readFileSync(cacheFile, "utf-8")); } catch (e) {}
var existingAsins = new Set(existing.books.map(function(b) { return b.asin; }));
var beforeCount = existing.books.length;

// 2. Re-scan via the Kindle scanner (fetches full library from read.amazon.com)
var scanResult = await ctx.callTool("enso_context_scan_kindle_library", {});

// 3. Read the updated cache to find new items
var updated = { books: [], totalBooks: 0 };
try { updated = JSON.parse(fs.readFileSync(cacheFile, "utf-8")); } catch (e) {}

var newBooks = updated.books.filter(function(b) { return b.asin && !existingAsins.has(b.asin); });

// 4. If there are new books, trigger Cortex direct ingest for kindleLibrary source
var cortexResult = { created: 0, updated: 0 };
if (newBooks.length > 0) {
  try {
    var pipelineResult = await ctx.callTool("enso_wiki_ingest", {
      text: "New Kindle books added to library:\n" + newBooks.map(function(b) {
        return "- " + b.title + (b.author ? " by " + b.author : "") + (b.categories ? " [" + b.categories.join(", ") + "]" : "");
      }).join("\n"),
      topic: "Kindle Library Update"
    });
    cortexResult.created = 1;
  } catch (e) {}
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_books_update",
  beforeCount: beforeCount,
  afterCount: updated.books.length,
  newBooks: newBooks.length,
  newTitles: newBooks.slice(0, 20).map(function(b) { return b.title + (b.author ? " — " + b.author : ""); }),
  cortexIngested: cortexResult.created > 0,
}) }] };
