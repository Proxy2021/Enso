var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "photo-library.json");
var oldCache = null;
try { oldCache = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}
var oldAlbumPaths = new Set();
if (oldCache && oldCache.albums) {
  oldCache.albums.forEach(function(a) { oldAlbumPaths.add(a.path); });
}

var scanResult = await ctx.callTool("enso_context_scan_photos", {});

var newCache = null;
try { newCache = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

var newAlbums = [];
if (newCache && newCache.albums) {
  newAlbums = newCache.albums.filter(function(a) { return !oldAlbumPaths.has(a.path); });
}

if (newAlbums.length > 0) {
  var names = newAlbums.map(function(a) { return a.name + " (" + a.photoCount + " photos)"; }).join(", ");
  try {
    await ctx.callTool("enso_wiki_ingest", { text: "New photo albums discovered:\n" + names, topic: "Photo Library Update" });
  } catch(e) {}
}

result = {
  tool: "enso_photo_library_update",
  beforeAlbums: oldAlbumPaths.size,
  afterAlbums: newCache ? newCache.albums.length : 0,
  newAlbums: newAlbums.map(function(a) { return { name: a.name, photoCount: a.photoCount }; }),
  message: newAlbums.length > 0 ? newAlbums.length + " new album(s) found" : "No new albums detected"
};
