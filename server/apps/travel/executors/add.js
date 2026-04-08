// Travel — Add Place: search for destinations
var p = params || {};
var query = p.query || "";

if (!query) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_travel_add", error: "Please provide a place or destination name.", results: [] }) }] };
}

ctx.log("Searching for destination: " + query);

var results = [];
try {
  var searchResult = await ctx.search(query + " travel guide destination", { count: 6 });
  if (searchResult && searchResult.results) {
    results = searchResult.results.map(function(r) {
      return {
        title: r.title.replace(/ - .*$/, "").replace(/ \| .*$/, "").trim(),
        url: r.url,
        description: (r.description || "").slice(0, 300),
        source: r.url ? r.url.replace(/https?:\/\/(www\.)?/, "").split("/")[0] : "",
      };
    }).filter(function(r) { return r.title; });
  }
} catch (e) {
  ctx.log("Search error: " + (e.message || e));
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_travel_add",
  query: query,
  totalResults: results.length,
  results: results.slice(0, 6),
}) }] };
