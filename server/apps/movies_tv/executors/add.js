// Movies & TV — Add: search TMDB for movies/TV shows
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};
var query = p.query || "";

if (!query) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_movies_tv_add", error: "Please provide a search query.", results: [] }) }] };
}

// Read TMDB API key
var tmdbKey = "";
try {
  var keysPath = path.join(os.homedir(), ".enso", "api-keys.json");
  if (fs.existsSync(keysPath)) {
    var keys = JSON.parse(fs.readFileSync(keysPath, "utf-8"));
    tmdbKey = keys.tmdb || "";
  }
} catch(e) {}

if (!tmdbKey) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_movies_tv_add", error: "No TMDB API key configured. Add 'tmdb' to ~/.enso/api-keys.json", results: [] }) }] };
}

ctx.log("Searching TMDB for: " + query);

var results = [];
try {
  // Search both movies and TV
  var movieRes = await ctx.fetch("https://api.themoviedb.org/3/search/multi?api_key=" + tmdbKey + "&query=" + encodeURIComponent(query) + "&language=en-US&page=1");

  if (movieRes.ok || movieRes.data) {
    var data = movieRes.data || movieRes;
    var items = (data.results || []).filter(function(r) {
      return r.media_type === "movie" || r.media_type === "tv";
    });

    results = items.slice(0, 8).map(function(r) {
      var isTV = r.media_type === "tv";
      return {
        title: r.title || r.name || "",
        type: isTV ? "tv-series" : "movie",
        year: (r.release_date || r.first_air_date || "").slice(0, 4),
        overview: (r.overview || "").slice(0, 400),
        rating: r.vote_average || 0,
        voteCount: r.vote_count || 0,
        posterUrl: r.poster_path ? "https://image.tmdb.org/t/p/w342" + r.poster_path : "",
        backdropUrl: r.backdrop_path ? "https://image.tmdb.org/t/p/w780" + r.backdrop_path : "",
        tmdbId: r.id,
        genreIds: r.genre_ids || [],
      };
    }).filter(function(r) { return r.title; });

    ctx.log("Found " + results.length + " results");
  }
} catch (e) {
  ctx.log("TMDB search error: " + (e.message || e));
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_movies_tv_add",
  query: query,
  totalResults: results.length,
  results: results,
}) }] };
