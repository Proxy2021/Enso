var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "steam-games.json");
var indexPath = path.join(os.homedir(), ".enso", "wiki", "_index.md");

var cached = null;
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

if (!cached || !cached.games || cached.games.length === 0) {
  result = { tool: "enso_steam_browse", games: [], totalGames: 0, message: "No Steam games found. Run a scan first.", genres: [] };
} else {
  var games = cached.games.slice();

  // Filter by genre
  if (params.genre) {
    var g = params.genre.toLowerCase();
    games = games.filter(function(gm) { return gm.genres && gm.genres.some(function(genre) { return genre.toLowerCase().includes(g); }); });
  }

  // Search by name
  if (params.query) {
    var q = params.query.toLowerCase();
    games = games.filter(function(gm) { return gm.name.toLowerCase().includes(q); });
  }

  // Sort
  var sortBy = params.sortBy || "name";
  if (sortBy === "name") games.sort(function(a, b) { return a.name.localeCompare(b.name); });
  else if (sortBy === "lastPlayed") games.sort(function(a, b) { return (b.lastPlayed || 0) - (a.lastPlayed || 0); });
  else if (sortBy === "size") games.sort(function(a, b) { return (b.sizeOnDisk || 0) - (a.sizeOnDisk || 0); });
  else if (sortBy === "metacritic") games.sort(function(a, b) { return (b.metacritic || 0) - (a.metacritic || 0); });

  // Collect all genres
  var genreSet = {};
  cached.games.forEach(function(gm) { (gm.genres || []).forEach(function(genre) { genreSet[genre] = true; }); });
  var allGenres = Object.keys(genreSet).sort();

  // Check wiki pages
  var indexContent = "";
  try { indexContent = fs.readFileSync(indexPath, "utf-8"); } catch(e) {}

  games = games.map(function(gm) {
    var slug = gm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    return Object.assign({}, gm, {
      hasWikiPage: indexContent.includes("entities/game-" + slug + ".md"),
      wikiSlug: "entities/game-" + slug + ".md",
      sizeGB: gm.sizeOnDisk ? (gm.sizeOnDisk / (1024*1024*1024)).toFixed(1) + " GB" : null
    });
  });

  result = {
    tool: "enso_steam_browse",
    games: games.slice(0, 100),
    totalGames: cached.games.length,
    filteredCount: games.length,
    genres: allGenres,
    scannedAt: cached.scannedAt
  };
}
