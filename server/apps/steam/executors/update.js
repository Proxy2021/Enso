var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "steam-games.json");
var oldCache = null;
try { oldCache = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}
var oldIds = new Set();
if (oldCache && oldCache.games) {
  oldCache.games.forEach(function(g) { oldIds.add(g.appId); });
}

// Re-scan
var scanResult = await ctx.callTool("enso_context_scan_steam", {});

// Read new cache
var newCache = null;
try { newCache = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

var newGames = [];
if (newCache && newCache.games) {
  newGames = newCache.games.filter(function(g) { return !oldIds.has(g.appId); });
}

// If new games found, trigger Cortex ingest
if (newGames.length > 0) {
  var titles = newGames.map(function(g) { return g.name; }).join(", ");
  try {
    await ctx.callTool("enso_wiki_ingest", {
      text: "New Steam games installed: " + titles,
      topic: "Steam Library Update"
    });
  } catch(e) {}
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_steam_update",
  beforeCount: oldIds.size,
  afterCount: newCache ? newCache.games.length : 0,
  newGames: newGames.map(function(g) { return g.name; }),
  message: newGames.length > 0 ? newGames.length + " new game(s) found" : "No new games detected"
}) }] };