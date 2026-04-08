// Steam — Add Game: search Steam Store API
var p = params || {};
var query = p.query || "";

if (!query) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_steam_add", error: "Please provide a game title.", results: [] }) }] };
}

ctx.log("Searching Steam Store for: " + query);

var results = [];
try {
  var res = await ctx.fetch("https://store.steampowered.com/api/storesearch/?term=" + encodeURIComponent(query) + "&cc=us&l=en");
  if (res.ok || res.data) {
    var data = res.data || res;
    results = (data.items || []).slice(0, 8).map(function(r) {
      return {
        title: r.name || "",
        appId: r.id,
        coverUrl: r.tiny_image || "",
        price: r.price ? (r.price.final / 100).toFixed(2) : "Free",
      };
    }).filter(function(r) { return r.title; });
    ctx.log("Found " + results.length + " results");
  }
} catch (e) {
  ctx.log("Steam search error: " + (e.message || e));
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_steam_add",
  query: query,
  totalResults: results.length,
  results: results,
}) }] };
