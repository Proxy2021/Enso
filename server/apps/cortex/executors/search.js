// Cortex Search — uses wiki search tool with category/tag filters
var query = String(params.query || "").trim();
var categoryFilter = params.category ? String(params.category) : null;
var tagFilter = params.tag ? String(params.tag).toLowerCase() : null;

// Use wiki search tool
var searchResult = await ctx.callTool("enso_wiki_search", { query: query || "", maxResults: 100 });
var searchData = searchResult.success ? searchResult.data : {};
var results = searchData.results || [];

// Apply category filter
if (categoryFilter) {
  results = results.filter(function(r) { return (r.path || "").split("/")[0] === categoryFilter; });
}

// Apply tag filter
if (tagFilter) {
  results = results.filter(function(r) { return (r.tags || []).some(function(t) { return t.toLowerCase().includes(tagFilter); }); });
}

// Add category to each result
results = results.map(function(r) {
  r.category = (r.path || "").split("/")[0];
  return r;
});

// Build tag cloud from all results (pre-filter)
var allTags = {};
var allResults = searchData.results || [];
for (var ti = 0; ti < allResults.length; ti++) {
  var tags = allResults[ti].tags || [];
  for (var tj = 0; tj < tags.length; tj++) {
    allTags[tags[tj]] = (allTags[tags[tj]] || 0) + 1;
  }
}
var tagCloud = Object.keys(allTags).map(function(t) { return { tag: t, count: allTags[t] }; });
tagCloud.sort(function(a, b) { return b.count - a.count; });

return {
  content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_search",
    query: query,
    category: categoryFilter,
    tag: tagFilter,
    results: results.slice(0, 30),
    totalResults: results.length,
    tagCloud: tagCloud.slice(0, 25)
  }) }]
};
