// YouTube — Add Channel: search YouTube for channels
var p = params || {};
var query = p.query || "";

if (!query) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_youtube_manager_add", error: "Please provide a channel name.", results: [] }) }] };
}

ctx.log("Searching YouTube for channels: " + query);

// Use the YouTube search tool if available, otherwise use API directly
var results = [];
try {
  var searchResult = await ctx.callTool("enso_youtube_search", { query: query, type: "channel", maxResults: 8 });
  if (searchResult && searchResult.data && searchResult.data.channels) {
    results = searchResult.data.channels;
  }
} catch(e) {
  ctx.log("YouTube search via tool failed: " + (e.message || e) + ", trying direct search");
}

// Fallback: search via Brave if YouTube tool not available
if (results.length === 0) {
  try {
    var braveRes = await ctx.search(query + " youtube channel", { count: 5 });
    if (braveRes && braveRes.results) {
      results = braveRes.results
        .filter(function(r) { return r.url && r.url.includes("youtube.com"); })
        .map(function(r) {
          return {
            title: r.title.replace(/ - YouTube$/, ""),
            description: r.description || "",
            url: r.url,
          };
        });
    }
  } catch(e) { ctx.log("Brave search failed: " + (e.message || e)); }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_youtube_manager_add",
  query: query,
  totalResults: results.length,
  results: results,
}) }] };
