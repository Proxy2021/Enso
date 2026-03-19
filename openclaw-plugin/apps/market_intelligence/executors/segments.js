var query = (params.query || "").trim() || "global market";
var year = new Date().getFullYear();

var searchResults = await ctx.search(query + " market segments breakdown " + year + " B2B B2C categories", { count: 8 });
var snippets = "";
if (searchResults && searchResults.ok && searchResults.results) {
  snippets = searchResults.results.map(function(r) { return (r.title || "") + ": " + (r.description || ""); }).join("\n");
}

var colors = ["#6366f1", "#3b82f6", "#ec4899", "#f59e0b", "#10b981", "#8b5cf6", "#06b6d4", "#ef4444"];

var prompt = "You are a market research analyst. Based on these search results about '" + query + "' market segments:\n\n" + snippets + "\n\nReturn a JSON object (no markdown, no code fences) with this exact structure:\n{\n  \"year\": " + year + ",\n  \"segments\": [\n    {\"name\": \"<segment name>\", \"value\": <size in billions>, \"share\": <percentage of total>, \"growth\": <annual growth rate percentage>}\n  ]\n}\nInclude 4-8 key segments. Use real data from search results. Shares should roughly sum to 100.";

var result = await ctx.ask(prompt);
var parsed = {};
try {
  var text = (result && result.text) || "{}";
  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
} catch(e) {
  parsed = { year: year, segments: [] };
}

if (parsed.segments && Array.isArray(parsed.segments)) {
  parsed.segments = parsed.segments.map(function(s, i) {
    s.color = colors[i % colors.length];
    return s;
  });
}

parsed.tool = "enso_market_intelligence_segments";
parsed.query = query;

return {
  content: [{
    type: "text",
    text: JSON.stringify(parsed)
  }]
};
