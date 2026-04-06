var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "qq-music.json");
var cached = null;
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

if (!cached) {
  result = { tool: "enso_qq_music_browse", playlists: [], favorites: [], localFiles: [], artists: [], totalTracks: 0, message: "No music data. Run a scan first." };
} else {
  var view = params.view || "playlists";
  var q = params.query ? params.query.toLowerCase() : null;

  if (view === "playlists") {
    var playlists = (cached.playlists || []).slice();
    if (q) playlists = playlists.filter(function(p) { return p.name.toLowerCase().indexOf(q) >= 0; });
    result = { tool: "enso_qq_music_browse", view: "playlists", playlists: playlists, totalPlaylists: (cached.playlists || []).length };
  } else if (view === "favorites") {
    var favs = (cached.favorites || []).slice();
    if (q) favs = favs.filter(function(f) { return f.title.toLowerCase().indexOf(q) >= 0 || f.artist.toLowerCase().indexOf(q) >= 0; });
    result = { tool: "enso_qq_music_browse", view: "favorites", favorites: favs, totalFavorites: (cached.favorites || []).length };
  } else if (view === "local") {
    var files = (cached.localFiles || []).slice();
    if (q) files = files.filter(function(f) { return f.title.toLowerCase().indexOf(q) >= 0 || (f.artist && f.artist.toLowerCase().indexOf(q) >= 0); });
    result = { tool: "enso_qq_music_browse", view: "local", localFiles: files, totalLocalFiles: (cached.localFiles || []).length };
  } else if (view === "artists") {
    var artistMap = {};
    (cached.favorites || []).concat(cached.localFiles || []).forEach(function(t) {
      if (t.artist) {
        if (!artistMap[t.artist]) artistMap[t.artist] = { name: t.artist, trackCount: 0, tracks: [] };
        artistMap[t.artist].trackCount++;
        if (artistMap[t.artist].tracks.length < 5) artistMap[t.artist].tracks.push(t.title);
      }
    });
    var artists = Object.values(artistMap).sort(function(a, b) { return b.trackCount - a.trackCount; });
    if (q) artists = artists.filter(function(a) { return a.name.toLowerCase().indexOf(q) >= 0; });
    result = { tool: "enso_qq_music_browse", view: "artists", artists: artists, totalArtists: artists.length };
  }

  result.scannedAt = cached.scannedAt;
  result.totalTracks = (cached.favorites || []).length + (cached.localFiles || []).length;
}
