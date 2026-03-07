var destination = (params.destination || "").trim();
var travelMonth = (params.travelMonth || "").trim();
var interests = (params.interests || "").trim();

if (!destination) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_trip_planner_research",
        error: "No destination provided. Please specify a destination to research."
      })
    }]
  };
}

// Build research prompt
var prompt = "Research the travel destination: " + destination + ".\n";
if (travelMonth) prompt += "Travel period: " + travelMonth + ".\n";
if (interests) prompt += "Traveler interests: " + interests + ".\n";
prompt += "\nProvide a JSON response with these fields:\n";
prompt += "- summary: 2-3 sentence overview\n";
prompt += "- bestTimeToVisit: short answer like 'Mar-May'\n";
prompt += "- safetyRating: e.g. 'Very Safe', 'Safe', 'Moderate', 'Caution'\n";
prompt += "- visaInfo: brief visa info for US travelers\n";
prompt += "- weather: array of 4-6 objects with {month, avgTemp (Celsius number), rainfall (mm number)}\n";
prompt += "- costs: object with keys like budget_hotel, mid_range_hotel, meal_budget, meal_mid_range, public_transport_day, attraction_avg — values as price range strings\n";
prompt += "- attractions: array of 5-8 objects with {name, category, rating (number), estimatedCost, description}\n";
prompt += "- tips: array of 4-6 practical travel tip strings\n";
prompt += "Return ONLY valid JSON, no markdown.";

var result = await ctx.ask(prompt);
var researchData = {};
if (result.ok && result.text) {
  try {
    var cleaned = result.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    researchData = JSON.parse(cleaned);
  } catch(e) {
    researchData = { summary: result.text };
  }
}

// Also try web search for supplementary data
var searchResult = await ctx.search(destination + " travel guide tips");
if (searchResult.ok && searchResult.results && searchResult.results.length > 0) {
  if (!researchData.tips || researchData.tips.length === 0) {
    researchData.tips = searchResult.results.slice(0, 3).map(function(r) { return r.description || r.title; });
  }
}

// Ensure all required fields exist
researchData.tool = "enso_trip_planner_research";
researchData.destination = destination;
if (!researchData.summary) researchData.summary = "";
if (!researchData.bestTimeToVisit) researchData.bestTimeToVisit = "";
if (!researchData.safetyRating) researchData.safetyRating = "";
if (!researchData.visaInfo) researchData.visaInfo = "";
if (!Array.isArray(researchData.weather)) researchData.weather = [];
if (!researchData.costs || typeof researchData.costs !== "object") researchData.costs = {};
if (!Array.isArray(researchData.attractions)) researchData.attractions = [];
if (!Array.isArray(researchData.tips)) researchData.tips = [];

return {
  content: [{
    type: "text",
    text: JSON.stringify(researchData)
  }]
};
