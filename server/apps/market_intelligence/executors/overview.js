var query = (params.query || "").trim() || "global market";
var year = new Date().getFullYear();

var searchResults = await ctx.search(query + " market size " + year + " forecast growth rate", { count: 8 });
var snippets = "";
if (searchResults && searchResults.ok && searchResults.results) {
  snippets = searchResults.results.map(function(r) { return (r.title || "") + ": " + (r.description || ""); }).join("\n");
}

var prompt = "You are a market research analyst. Based on these search results about '" + query + "':\n\n" + snippets + "\n\nReturn a JSON object (no markdown, no code fences) with this exact structure:\n{\n  \"title\": \"<market name> Market " + year + "\",\n  \"subtitle\": \"Market intelligence overview\",\n  \"query\": \"" + query + "\",\n  \"year\": " + year + ",\n  \"metrics\": {\n    \"metric1Label\": \"Market Size\", \"metric1Value\": \"<e.g. $6.88T>\", \"metric1Change\": \"<e.g. +7.2% YoY>\",\n    \"metric2Label\": \"CAGR\", \"metric2Value\": \"<e.g. 18.9%>\", \"metric2Change\": \"<period>\",\n    \"metric3Label\": \"<relevant metric>\", \"metric3Value\": \"<value>\", \"metric3Change\": \"<context>\",\n    \"metric4Label\": \"<relevant metric>\", \"metric4Value\": \"<value>\", \"metric4Change\": \"<context>\"\n  },\n  \"regionalPreview\": [{\"region\": \"<name>\", \"marketSize\": <number in billions>}],\n  \"highlights\": [\"<insight 1>\", \"<insight 2>\", \"<insight 3>\", \"<insight 4>\"],\n  \"source\": \"<data sources>\"\n}\nInclude 3-5 regions and 3-6 highlights. Use real data from the search results. Market sizes in billions.";

var result = await ctx.ask(prompt);
var parsed = {};
try {
  var text = (result && result.text) || "{}";
  var jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
} catch(e) {
  parsed = {
    title: query + " Market " + year,
    subtitle: "Market intelligence overview",
    query: query,
    year: year,
    metrics: { metric1Label: "Status", metric1Value: "Research pending", metric1Change: "", metric2Label: "", metric2Value: "", metric2Change: "", metric3Label: "", metric3Value: "", metric3Change: "", metric4Label: "", metric4Value: "", metric4Change: "" },
    regionalPreview: [],
    highlights: ["Search for more specific market data"],
    source: "Web search"
  };
}

parsed.tool = "enso_market_intelligence_overview";
parsed.query = query;

return {
  content: [{
    type: "text",
    text: JSON.stringify(parsed)
  }]
};
