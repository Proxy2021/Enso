var mood = (params.mood || "").trim();

var items = (await ctx.store.get("watchlist")) || [];

// Build context from watch history
var completed = items.filter(function(item) { return item.status === "completed"; });
var highRated = completed.filter(function(item) { return item.rating >= 4; });
var existing = items.map(function(item) { return item.title; });

var historyContext = "";
if (highRated.length > 0) {
  historyContext = "Highly rated titles: " + highRated.map(function(item) {
    return item.title + " (" + item.type + ", " + item.genre + ", " + item.rating + "/5)";
  }).join(", ") + ". ";
}
if (completed.length > 0 && highRated.length === 0) {
  historyContext = "Watched: " + completed.slice(-5).map(function(item) {
    return item.title + " (" + item.type + ", " + item.genre + ")";
  }).join(", ") + ". ";
}

var moodContext = mood ? " Current mood/preference: " + mood + "." : "";
var excludeContext = existing.length > 0 ? " Do NOT recommend these (already in watchlist): " + existing.join(", ") + "." : "";

var recommendations = [];
try {
  var searchQuery = mood ? mood + " best movies TV shows 2024 2025" : "best movies TV shows 2024 2025 critically acclaimed";
  var searchResult = await ctx.search(searchQuery);
  var snippets = "";
  if (searchResult.ok && searchResult.results) {
    snippets = "Recent search context: " + searchResult.results.slice(0, 4).map(function(r) { return r.title + ": " + r.description; }).join("\n");
  }

  var prompt = "You are a movie/TV recommendation engine. " + historyContext + moodContext + excludeContext + "\n" + snippets + "\n\nReturn a JSON array of 4-6 recommended movies or TV shows. Each object must have: title (string), year (number), type ('movie' or 'tv'), genre (string), reason (one sentence explaining why this fits the user), rating (string like '8.4/10'). Return ONLY valid JSON array, no markdown.";
  var aiResult = await ctx.ask(prompt);
  if (aiResult.ok && aiResult.text) {
    var cleaned = aiResult.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    try { recommendations = JSON.parse(cleaned); } catch(e) {}
  }
} catch(e) {}

if (!Array.isArray(recommendations)) recommendations = [];

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_watchlist_recommend",
      mood: mood,
      watchedCount: completed.length,
      recommendations: recommendations
    })
  }]
};
