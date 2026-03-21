var query = (params.query || "").trim() || "global market";
var limit = params.limit || 15;
var year = new Date().getFullYear();

var searchResults = await ctx.search("top companies " + query + " " + year + " revenue market share leaders", { count: 8 });
var snippets = "";
if (searchResults && searchResults.ok && searchResults.results) {
  snippets = searchResults.results.map(function(r) { return (r.title || "") + ": " + (r.description || ""); }).join("\n");
}

var prompt = "You are a market research analyst. Based on these search results about top companies in '" + query + "':\n\n" + snippets + "\n\nReturn a JSON object (no markdown, no code fences) with this exact structure:\n{\n  \"year\": " + year + ",\n  \"players\": [\n    {\"rank\": <number>, \"name\": \"<company>\", \"hq\": \"<country>\", \"gmv\": \"<GMV string or N/A>\", \"revenue\": \"<revenue string>\", \"marketShare\": \"<share string>\", \"yoyGrowth\": <number>}\n  ]\n}\nInclude up to " + limit + " companies ranked by market position. Use real data from search results.";

var result = await ctx.ask(prompt);
var parsed = {};
try {
  var text = (result && result.text) || "{}";
  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
} catch(e) {
  parsed = { year: year, players: [] };
}

parsed.tool = "enso_market_intelligence_players";
parsed.query = query;

return {
  content: [{
    type: "text",
    text: JSON.stringify(parsed)
  }]
};
