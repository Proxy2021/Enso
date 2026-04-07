var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "qq-music.json");
var oldCache = null;
try { oldCache = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}
var oldTrackCount = 0;
if (oldCache) {
  oldTrackCount = (oldCache.favorites || []).length + (oldCache.localFiles || []).length;
}

var scanResult = await ctx.callTool("enso_context_scan_qq_music", {});

var newCache = null;
try { newCache = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}
var newTrackCount = 0;
if (newCache) {
  newTrackCount = (newCache.favorites || []).length + (newCache.localFiles || []).length;
}

var diff = newTrackCount - oldTrackCount;

if (diff > 0) {
  try {
    await ctx.callTool("enso_wiki_ingest", { text: diff + " new tracks added to QQ Music library", topic: "QQ Music Library Update" });
  } catch(e) {}
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_qq_music_update",
  beforeTracks: oldTrackCount,
  afterTracks: newTrackCount,
  newTracks: diff > 0 ? diff : 0,
  message: diff > 0 ? diff + " new track(s) found" : "No new tracks detected"
}) }] };