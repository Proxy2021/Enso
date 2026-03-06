var query = (params.query || "").trim();

if (!query) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_dev_search_github", query: "", results: [], error: "Please provide a search query" })
    }]
  };
}

var results = [];
try {
  var searchResult = await ctx.search("github.com " + query + " repository");
  if (searchResult.ok && searchResult.results && searchResult.results.length > 0) {
    var snippets = searchResult.results.slice(0, 6).map(function(r) { return r.title + " (" + r.url + "): " + r.description; }).join("\n");
    var aiResult = await ctx.ask("Based on these search results for GitHub repositories matching '" + query + "':\n" + snippets + "\n\nReturn a JSON array of 4-8 relevant GitHub repositories. Each object must have: name (string like 'owner/repo'), stars (string like '10.2k'), description (one sentence), language (string), url (string, GitHub URL). Return ONLY valid JSON array, no markdown.");
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
      tool: "enso_dev_search_github",
      query: query,
      results: results
    })
  }]
};
