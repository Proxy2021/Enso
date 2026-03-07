var query = (params.query || "").trim();
var budget = (params.budget || "").trim();
var climate = (params.climate || "").trim();

if (!query) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_trip_planner_search_dest",
        error: "No search query provided.",
        query: "",
        results: []
      })
    }]
  };
}

// Search the web for destination info
var searchQuery = query;
if (budget) searchQuery += " " + budget + " budget";
if (climate) searchQuery += " " + climate + " climate";
searchQuery += " travel destination";

var webResults = await ctx.search(searchQuery);
var webSnippets = [];
if (webResults.ok && webResults.results) {
  webSnippets = webResults.results.slice(0, 5);
}

// Use LLM to synthesize into structured results
var prompt = "Based on the search query '" + query + "'";
if (budget) prompt += " (budget: " + budget + ")";
if (climate) prompt += " (climate: " + climate + ")";
prompt += ", suggest 4-6 travel destinations.\n\n";

if (webSnippets.length > 0) {
  prompt += "Web search results for context:\n";
  webSnippets.forEach(function(s) {
    prompt += "- " + s.title + ": " + (s.description || "") + "\n";
  });
  prompt += "\n";
}

prompt += "Return JSON with:\n";
prompt += "- results: array of {name (city/region + country), description (2-3 sentences), highlights (array of 3-4 keyword tags)}\n";
prompt += "Return ONLY valid JSON, no markdown.";

var result = await ctx.ask(prompt);
var searchData = { results: [] };
if (result.ok && result.text) {
  try {
    var cleaned = result.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    searchData = JSON.parse(cleaned);
  } catch(e) {
    // Fall back to web results
    searchData = {
      results: webSnippets.map(function(s) {
        return { name: s.title, description: s.description || "", highlights: [] };
      })
    };
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_trip_planner_search_dest",
      query: query,
      results: Array.isArray(searchData.results) ? searchData.results : []
    })
  }]
};
