var query = (params.query || "").trim() || "global market";
var year = new Date().getFullYear();

var searchResults = await ctx.search(query + " market size by region " + year + " Asia North America Europe Latin America Middle East Africa", { count: 8 });
var snippets = "";
if (searchResults && searchResults.ok && searchResults.results) {
  snippets = searchResults.results.map(function(r) { return (r.title || "") + ": " + (r.description || ""); }).join("\n");
}

var prompt = "You are a market research analyst. Based on these search results about '" + query + "' regional breakdown:\n\n" + snippets + "\n\nReturn a JSON object (no markdown, no code fences) with this exact structure:\n{\n  \"year\": " + year + ",\n  \"regions\": [\n    {\"region\": \"<name>\", \"marketSize\": <number in billions>, \"share\": <percentage number>, \"growth\": <CAGR percentage number>, \"keyMarkets\": \"<top 2-3 countries>\"}\n  ]\n}\nInclude these regions: Asia-Pacific, North America, Europe, Latin America, Middle East & Africa. Use real data from search results. If data is missing, provide reasonable estimates.";

var result = await ctx.ask(prompt);
var parsed = {};
try {
  var text = (result && result.text) || "{}";
  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
} catch(e) {
  parsed = { year: year, regions: [] };
}

parsed.tool = "enso_market_intelligence_regions";
parsed.query = query;

return {
  content: [{
    type: "text",
    text: JSON.stringify(parsed)
  }]
};
