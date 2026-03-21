var query = (params.query || "").trim() || "global market";
var year = new Date().getFullYear();

var searchResults = await ctx.search(query + " " + year + " trends growth drivers challenges headwinds forecast", { count: 8 });
var snippets = "";
if (searchResults && searchResults.ok && searchResults.results) {
  snippets = searchResults.results.map(function(r) { return (r.title || "") + ": " + (r.description || ""); }).join("\n");
}

var prompt = "You are a market research analyst. Based on these search results about trends in '" + query + "':\n\n" + snippets + "\n\nReturn a JSON object (no markdown, no code fences) with this exact structure:\n{\n  \"year\": " + year + ",\n  \"drivers\": [\n    {\"title\": \"<driver name>\", \"desc\": \"<1-2 sentence description>\", \"impact\": \"high|medium|low\"}\n  ],\n  \"headwinds\": [\n    {\"title\": \"<headwind name>\", \"desc\": \"<1-2 sentence description>\", \"severity\": \"high|medium|low\"}\n  ]\n}\nInclude 5-8 growth drivers and 4-6 headwinds. Use real insights from search results.";

var result = await ctx.ask(prompt);
var parsed = {};
try {
  var text = (result && result.text) || "{}";
  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
} catch(e) {
  parsed = { year: year, drivers: [], headwinds: [] };
}

parsed.tool = "enso_market_intelligence_trends";
parsed.query = query;

return {
  content: [{
    type: "text",
    text: JSON.stringify(parsed)
  }]
};
