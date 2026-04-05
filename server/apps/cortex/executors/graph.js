// Cortex Knowledge Graph — build nodes + edges using wiki tools

// Get all pages from wiki search
var searchResult = await ctx.callTool("enso_wiki_search", { query: "", maxResults: 200 });
var entries = (searchResult.success && searchResult.data) ? (searchResult.data.results || []) : [];
var categories = (searchResult.success && searchResult.data) ? (searchResult.data.categories || {}) : {};

var nodes = [];
var edges = [];
var backlinkCounts = {};

// Read each page to extract [[links]] (limit to 60 pages for performance)
var pagesToRead = entries.slice(0, 60);
for (var i = 0; i < pagesToRead.length; i++) {
  var entry = pagesToRead[i];
  var slug = (entry.path || "").replace(/.*\//, "").replace(/\.md$/, "");
  var cat = (entry.path || "").split("/")[0];

  nodes.push({
    id: slug,
    path: entry.path,
    title: entry.title || slug.replace(/-/g, " "),
    category: cat,
    tags: entry.tags || [],
    connections: 0,
    backlinks: 0,
    outgoing: 0
  });

  // Read page content for links
  var readResult = await ctx.callTool("enso_wiki_read", { path: entry.path });
  if (readResult.success && readResult.data && readResult.data.content) {
    var linkMatches = readResult.data.content.match(/\[\[([^\]]+)\]\]/g) || [];
    var seen = {};
    for (var li = 0; li < linkMatches.length; li++) {
      var target = linkMatches[li].replace(/\[\[|\]\]/g, "").toLowerCase().replace(/\s+/g, "-").replace(/^(entities|concepts|sources|synthesis)\//, "");
      if (!seen[target]) {
        edges.push({ source: slug, target: target });
        backlinkCounts[target] = (backlinkCounts[target] || 0) + 1;
        seen[target] = true;
      }
    }
  }
}

// Update connection counts
for (var ni = 0; ni < nodes.length; ni++) {
  var nId = nodes[ni].id;
  var outgoing = edges.filter(function(e) { return e.source === nId; }).length;
  var incoming = backlinkCounts[nId] || 0;
  nodes[ni].connections = outgoing + incoming;
  nodes[ni].backlinks = incoming;
  nodes[ni].outgoing = outgoing;
}

nodes.sort(function(a, b) { return b.connections - a.connections; });

return {
  content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_graph",
    nodes: nodes,
    edges: edges,
    categories: categories,
    totalNodes: nodes.length,
    totalEdges: edges.length
  }) }]
};
