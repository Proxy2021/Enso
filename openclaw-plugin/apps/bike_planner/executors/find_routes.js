var location = (params.location || "").trim();
var difficulty = (params.difficulty || "").trim() || "all";

if (!location) {
  var savedLoc = await ctx.store.get("preferred_location");
  location = savedLoc || "San Francisco";
}

var routes = [];
try {
  var searchResult = await ctx.search("best cycling bike routes trails near " + location + " 2024");
  if (searchResult.ok && searchResult.results && searchResult.results.length > 0) {
    var snippets = searchResult.results.slice(0, 5).map(function(r) { return r.title + ": " + r.description; }).join("\n");
    var diffFilter = difficulty !== "all" ? " Focus on " + difficulty + " difficulty routes." : "";
    var aiResult = await ctx.ask("Based on these search results about bike routes near " + location + ":\n" + snippets + "\n\nReturn a JSON array of 5-8 bike routes. Each route object must have: name (string), distance (string like '12 mi'), difficulty (one of: easy, moderate, hard), elevation (string like '500 ft'), description (one sentence)." + diffFilter + " Return ONLY a valid JSON array, no markdown.");
    if (aiResult.ok && aiResult.text) {
      var cleaned = aiResult.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      try { routes = JSON.parse(cleaned); } catch(e) {}
    }
  }
} catch(e) {}

if (!Array.isArray(routes) || routes.length === 0) {
  routes = [
    { name: "Local Loop", distance: "10 mi", difficulty: "easy", elevation: "200 ft", description: "A gentle loop around the city center" },
    { name: "Hill Climb Challenge", distance: "15 mi", difficulty: "hard", elevation: "1,500 ft", description: "A challenging route with serious elevation gain" },
    { name: "Waterfront Path", distance: "8 mi", difficulty: "easy", elevation: "50 ft", description: "Flat scenic path along the waterfront" }
  ];
}

// Filter by difficulty if specified
if (difficulty !== "all") {
  var filtered = routes.filter(function(r) { return (r.difficulty || "").toLowerCase() === difficulty.toLowerCase(); });
  if (filtered.length > 0) routes = filtered;
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_bike_find_routes",
      location: location,
      difficulty: difficulty,
      routes: routes
    })
  }]
};
