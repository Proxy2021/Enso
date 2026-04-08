// Articles — Save Article: search web for articles and save to Cortex
var p = params || {};
var query = p.query || "";

if (!query) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_articles_add", error: "Please provide an article title, topic, or URL.", results: [] }) }] };
}

ctx.log("Searching for articles: " + query);

var results = [];
try {
  // Check if query is a URL
  var isUrl = query.startsWith("http://") || query.startsWith("https://");

  if (isUrl) {
    // Direct URL — fetch and extract
    var pageResult = await ctx.fetch(query);
    if (pageResult.ok || pageResult.data) {
      var html = typeof pageResult.data === "string" ? pageResult.data : (pageResult.text || "");
      // Extract title from HTML
      var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      var title = titleMatch ? titleMatch[1].replace(/ [-|–] .*$/, "").trim() : query;
      results.push({
        title: title,
        url: query,
        description: "",
        source: query.replace(/https?:\/\/(www\.)?/, "").split("/")[0],
      });
    }
  } else {
    // Search via Brave
    var searchResult = await ctx.search(query + " article", { count: 8 });
    if (searchResult && searchResult.results) {
      results = searchResult.results.map(function(r) {
        return {
          title: r.title || "",
          url: r.url || "",
          description: (r.description || "").slice(0, 300),
          source: r.url ? r.url.replace(/https?:\/\/(www\.)?/, "").split("/")[0] : "",
        };
      }).filter(function(r) { return r.title && r.url; });
    }
  }

  ctx.log("Found " + results.length + " results");
} catch (e) {
  ctx.log("Search error: " + (e.message || e));
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_articles_add",
  query: query,
  totalResults: results.length,
  results: results.slice(0, 8),
}) }] };
