var topic = (params.topic || "").trim() || "general";
var today = new Date().toISOString().split("T")[0];

var highlights = [];
var trendingTopics = [];

try {
  // Search for latest AI news
  var searchQuery = topic === "general"
    ? "latest AI artificial intelligence news developments 2025 2026"
    : "latest AI " + topic + " news developments 2025 2026";

  var newsSearch = await ctx.search(searchQuery);
  var modelSearch = await ctx.search("new AI model release announcement 2025 2026");

  var allSnippets = [];
  if (newsSearch.ok && newsSearch.results) {
    allSnippets = allSnippets.concat(newsSearch.results.slice(0, 5));
  }
  if (modelSearch.ok && modelSearch.results) {
    allSnippets = allSnippets.concat(modelSearch.results.slice(0, 3));
  }

  if (allSnippets.length > 0) {
    var snippetText = allSnippets.map(function(r) { return r.title + " (" + r.url + "): " + r.description; }).join("\n");
    var aiResult = await ctx.ask("Based on these recent AI news results:\n" + snippetText + "\n\nReturn a JSON object with:\n1. 'highlights': array of 4-6 most important AI items, each with: title (string), source (string), summary (1-2 sentences), category (one of: model_release, research, tool, industry, safety, open_source), url (string or empty)\n2. 'trendingTopics': array of 4-6 trending AI topic strings\n\nFocus on the most significant and recent items. Return ONLY valid JSON, no markdown.");
    if (aiResult.ok && aiResult.text) {
      var cleaned = aiResult.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      try {
        var parsed = JSON.parse(cleaned);
        highlights = parsed.highlights || [];
        trendingTopics = parsed.trendingTopics || [];
      } catch(e) {}
    }
  }
} catch(e) {}

if (highlights.length === 0) {
  highlights = [{ title: "Unable to fetch latest news", source: "N/A", summary: "Try again later or search for a specific topic", category: "info", url: "" }];
}

// Get saved reading list count
var readingList = (await ctx.store.get("reading_list")) || [];

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_ai_pulse_briefing",
      date: today,
      topic: topic,
      highlights: highlights,
      trendingTopics: trendingTopics,
      savedCount: readingList.length
    })
  }]
};
