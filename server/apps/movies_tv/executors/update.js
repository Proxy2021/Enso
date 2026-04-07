var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "movies-tv.json");
var oldCache = null;
try { oldCache = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}
var oldPaths = new Set();
if (oldCache && oldCache.items) {
  oldCache.items.forEach(function(m) { oldPaths.add(m.filePath); });
}

var scanResult = await ctx.callTool("enso_context_scan_movies_tv", {});

var newCache = null;
try { newCache = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

var newItems = [];
if (newCache && newCache.items) {
  newItems = newCache.items.filter(function(m) { return !oldPaths.has(m.filePath); });
}

if (newItems.length > 0) {
  var titles = newItems.map(function(m) { return m.title; }).join(", ");
  try {
    await ctx.callTool("enso_wiki_ingest", { text: "New movies/TV added: " + titles, topic: "Movies & TV Update" });
  } catch(e) {}
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_movies_tv_update",
  beforeCount: oldPaths.size,
  afterCount: newCache ? newCache.items.length : 0,
  newItems: newItems.map(function(m) { return { title: m.title, category: m.category }; }),
  message: newItems.length > 0 ? newItems.length + " new item(s) found" : "No new items detected"
}) }] };