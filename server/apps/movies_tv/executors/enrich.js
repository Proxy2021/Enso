var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "movies-tv.json");
var keysPath = path.join(os.homedir(), ".enso", "api-keys.json");

var cached = null;
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

// Read TMDB API key
var tmdbKey = process.env.TMDB_API_KEY || "";
if (!tmdbKey) {
  try { var keys = JSON.parse(fs.readFileSync(keysPath, "utf-8")); tmdbKey = keys.tmdb || ""; } catch(e) {}
}

if (!tmdbKey) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_movies_tv_enrich", enriched: 0, message: "TMDB API key not configured. Add it in Settings > API Keys." }) }] };
} else if (!cached || !cached.items) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_movies_tv_enrich", enriched: 0, message: "No items to enrich. Run a scan first." }) }] };
} else {
  var enriched = 0;
  var errors = 0;
  var unenriched = cached.items.filter(function(m) { return !m.enrichedAt; });

  for (var i = 0; i < unenriched.length; i++) {
    var item = unenriched[i];
    try {
      var searchType = (item.category === "tv") ? "tv" : "movie";
      var url = "https://api.themoviedb.org/3/search/" + searchType + "?api_key=" + tmdbKey + "&query=" + encodeURIComponent(item.title);
      if (item.year) url += "&year=" + item.year;

      var resp = await ctx.fetch(url);
      var data = JSON.parse(resp);

      if (data.results && data.results.length > 0) {
        var match = data.results[0];
        item.tmdbId = match.id;
        item.overview = match.overview || "";
        item.rating = match.vote_average || null;
        item.voteCount = match.vote_count || 0;
        item.posterPath = match.poster_path ? "https://image.tmdb.org/t/p/w342" + match.poster_path : null;
        item.backdropPath = match.backdrop_path ? "https://image.tmdb.org/t/p/w780" + match.backdrop_path : null;
        item.genreIds = match.genre_ids || [];
        item.originalLanguage = match.original_language || null;
        item.releaseDate = match.release_date || match.first_air_date || null;

        // Fetch full details for genres, cast, runtime
        try {
          var detailUrl = "https://api.themoviedb.org/3/" + searchType + "/" + match.id + "?api_key=" + tmdbKey + "&append_to_response=credits";
          var detailResp = await ctx.fetch(detailUrl);
          var detail = JSON.parse(detailResp);

          item.genres = (detail.genres || []).map(function(g) { return g.name; });
          item.runtime = detail.runtime || (detail.episode_run_time && detail.episode_run_time[0]) || null;
          item.imdbId = detail.imdb_id || null;
          item.tagline = detail.tagline || null;
          item.status = detail.status || null;
          item.numberOfSeasons = detail.number_of_seasons || null;

          if (detail.credits) {
            item.cast = (detail.credits.cast || []).slice(0, 8).map(function(c) { return c.name; });
            item.directors = (detail.credits.crew || []).filter(function(c) { return c.job === "Director"; }).map(function(c) { return c.name; });
          }
        } catch(e) {}

        item.enrichedAt = Date.now();
        enriched++;
      }
    } catch(e) {
      errors++;
    }

    // Save every 10
    if (enriched % 10 === 0 && enriched > 0) {
      fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2));
    }

    // Rate limit - 250ms
    if (i < unenriched.length - 1) {
      await new Promise(function(r) { setTimeout(r, 250); });
    }
  }

  fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2));

  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_movies_tv_enrich", enriched: enriched, errors: errors, total: cached.items.length, unenrichedRemaining: unenriched.length - enriched - errors }) }] };
}
