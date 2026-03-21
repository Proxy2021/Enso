var query = (params.query || "").trim() || "market data";
var year = new Date().getFullYear();

var searchResults = await ctx.search(query + " market " + year + " data statistics", { count: 8 });
var snippets = "";
if (searchResults && searchResults.ok && searchResults.results) {
  snippets = searchResults.results.map(function(r) { return (r.title || "") + ": " + (r.description || ""); }).join("\n");
}

var prompt = "You are a market research analyst. Based on these search results for '" + query + "':\n\n" + snippets + "\n\nReturn a JSON object (no markdown, no code fences) with this exact structure:\n{\n  \"results\": [\n    {\"type\": \"company|region|segment|trend|stat\", \"title\": \"<result title>\", \"summary\": \"<2-3 sentence summary>\", \"metrics\": {\"<key>\": \"<value>\"}}\n  ]\n}\nInclude 3-8 relevant results. Classify each as company, region, segment, trend, or stat. Include 1-3 key metrics per result.";

var result = await ctx.ask(prompt);
var parsed = {};
try {
  var text = (result && result.text) || "{}";
  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
} catch(e) {
  parsed = { results: [] };
}

parsed.tool = "enso_market_intelligence_search";
parsed.query = query;

return {
  content: [{
    type: "text",
    text: JSON.stringify(parsed)
  }]
};
