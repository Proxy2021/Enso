var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "steam-games.json");
var cached = null;
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

if (!cached || !cached.games || cached.games.length === 0) {
  result = { tool: "enso_steam_enrich", enriched: 0, total: 0, message: "No games to enrich. Run a scan first." };
} else {
  var enriched = 0;
  var errors = 0;
  var total = cached.games.length;
  var unenriched = cached.games.filter(function(g) { return !g.enrichedAt; });

  for (var i = 0; i < unenriched.length; i++) {
    var game = unenriched[i];
    try {
      var resp = await ctx.fetch("https://store.steampowered.com/api/appdetails?appids=" + game.appId);
      var data = JSON.parse(resp);
      var detail = data[game.appId];
      if (detail && detail.success && detail.data) {
        var d = detail.data;
        game.description = d.short_description || "";
        game.headerImage = d.header_image || "";
        game.genres = (d.genres || []).map(function(g) { return g.description; });
        game.categories = (d.categories || []).map(function(c) { return c.description; });
        game.metacritic = d.metacritic ? d.metacritic.score : null;
        game.releaseDate = d.release_date ? d.release_date.date : null;
        game.developers = d.developers || [];
        game.publishers = d.publishers || [];
        game.platforms = d.platforms || {};
        game.screenshots = (d.screenshots || []).slice(0, 3).map(function(s) { return s.path_thumbnail; });
        game.enrichedAt = Date.now();
        enriched++;
      }
    } catch(e) {
      errors++;
    }

    // Save every 5 games
    if (enriched % 5 === 0 && enriched > 0) {
      fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2));
    }

    // Rate limit — 1 second between requests
    if (i < unenriched.length - 1) {
      await new Promise(function(r) { setTimeout(r, 1000); });
    }
  }

  // Final save
  fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2));

  result = { tool: "enso_steam_enrich", enriched: enriched, errors: errors, total: total, unenrichedRemaining: unenriched.length - enriched - errors };
}
