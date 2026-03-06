var query = (params.query || "").trim();

if (!query) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_ai_pulse_search_topic", query: "", results: [], error: "Please provide a search query" })
    }]
  };
}

var results = [];
try {
  var searchResult = await ctx.search("AI " + query + " 2025 2026 research paper tool");
  if (searchResult.ok && searchResult.results && searchResult.results.length > 0) {
    var snippets = searchResult.results.slice(0, 6).map(function(r) { return r.title + " (" + r.url + "): " + r.description; }).join("\n");
    var aiResult = await ctx.ask("Based on these search results about '" + query + "':\n" + snippets + "\n\nReturn a JSON array of 4-8 relevant results. Each object must have: title (string), source (string like 'arXiv' or 'GitHub' or site name), summary (1-2 sentences), url (string), type (one of: paper, article, repo, tool, tutorial). Return ONLY valid JSON array, no markdown.");
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
      tool: "enso_ai_pulse_search_topic",
      query: query,
      results: results
    })
  }]
};
