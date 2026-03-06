var query = (params.query || "").trim();

if (!query) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_watchlist_search",
        query: "",
        results: [],
        error: "Please provide a search query"
      })
    }]
  };
}

var results = [];
try {
  var searchResult = await ctx.search(query + " movie OR tv series review rating");
  if (searchResult.ok && searchResult.results && searchResult.results.length > 0) {
    var snippets = searchResult.results.slice(0, 5).map(function(r) { return r.title + ": " + r.description; }).join("\n");
    var aiResult = await ctx.ask("Based on these search results for '" + query + "':\n" + snippets + "\n\nReturn a JSON array of up to 5 matching movies or TV shows. Each object must have: title (string), year (number), type ('movie' or 'tv'), genre (string), director (string, or 'Various' for TV), synopsis (one sentence), rating (string like '8.4/10' from IMDb/RT or 'N/A'). Return ONLY valid JSON array, no markdown.");
    if (aiResult.ok && aiResult.text) {
      var cleaned = aiResult.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      try { results = JSON.parse(cleaned); } catch(e) {}
    }
  }
} catch(e) {}

if (!Array.isArray(results)) results = [];

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_watchlist_search",
      query: query,
      results: results
    })
  }]
};
