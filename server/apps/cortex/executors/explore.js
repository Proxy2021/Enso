// Cortex Dashboard — uses wiki tools for stats, pages, and health

// Get search results (empty query = all pages from index)
var searchResult = await ctx.callTool("enso_wiki_search", { query: "", maxResults: 200 });
var searchData = searchResult.success ? searchResult.data : {};
var allResults = searchData.results || [];
var totalPages = searchData.totalPages || 0;
var categories = searchData.categories || {};

// Get list for file sizes and modification dates
var listResult = await ctx.callTool("enso_wiki_list", {});
var listPages = (listResult.success && listResult.data) ? (listResult.data.pages || []) : [];

// Get health report
var lintResult = await ctx.callTool("enso_wiki_lint", {});
var lintData = lintResult.success ? lintResult.data : {};

// Stats
var stats = {
  total: totalPages,
  entities: categories.entities || 0,
  synthesis: categories.synthesis || 0
};

// Recent updates (from list data which has modification dates)
var recent = listPages.slice(0, 15).map(function(p) {
  var indexEntry = allResults.find(function(r) { return r.path === p.path; });
  return {
    path: p.path,
    title: p.title || indexEntry?.title || p.path,
    summary: indexEntry?.summary || p.summary || "",
    category: (p.path || "").split("/")[0],
    tags: indexEntry?.tags || p.tags || [],
    updated: p.modified || indexEntry?.updated || ""
  };
});

// Top entities — use search results sorted by index order (which reflects connectivity via the search scoring)
// The wiki search tool already returns all entries — we can rank by who has the most tags as a proxy
var topEntities = allResults.map(function(r) {
  return {
    path: r.path,
    title: r.title,
    category: (r.path || "").split("/")[0],
    backlinks: (r.tags || []).length,
    tags: r.tags || []
  };
}).sort(function(a, b) { return b.backlinks - a.backlinks; }).slice(0, 20);

// Knowledge gaps from lint
var gaps = [];
var brokenLinks = lintData.brokenLinks || [];
var gapSeen = {};
for (var gi = 0; gi < brokenLinks.length; gi++) {
  var linkName = brokenLinks[gi].link || "";
  if (!gapSeen[linkName]) {
    var existing = gaps.find(function(g) { return g.name === linkName; });
    if (existing) { existing.references++; }
    else { gaps.push({ name: linkName, references: 1 }); }
    gapSeen[linkName + brokenLinks[gi].page] = true;
  }
}
gaps.sort(function(a, b) { return b.references - a.references; });

return {
  content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_explore",
    stats: stats,
    recent: recent,
    topEntities: topEntities,
    gaps: gaps,
    log: [],
    healthy: lintData.healthy || false,
    orphanCount: (lintData.orphanPages || []).length,
    brokenLinkCount: brokenLinks.length,
    staleCount: (lintData.stalePages || []).length
  }) }]
};
