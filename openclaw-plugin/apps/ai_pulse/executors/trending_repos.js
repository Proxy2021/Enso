var category = (params.category || "").trim() || "all";

var repos = [];
try {
  var searchQuery = "trending GitHub repositories AI machine learning";
  if (category !== "all") {
    var catMap = {
      llm: "large language model LLM",
      vision: "computer vision image",
      agents: "AI agents autonomous",
      tools: "AI developer tools framework",
      datasets: "AI ML datasets benchmark"
    };
    searchQuery = "trending GitHub repositories " + (catMap[category] || category);
  }
  searchQuery += " 2025 2026";

  var searchResult = await ctx.search(searchQuery);
  if (searchResult.ok && searchResult.results && searchResult.results.length > 0) {
    var snippets = searchResult.results.slice(0, 6).map(function(r) { return r.title + ": " + r.description; }).join("\n");
    var aiResult = await ctx.ask("Based on these search results about trending AI GitHub repos:\n" + snippets + "\n\nReturn a JSON array of 6-8 trending AI/ML GitHub repositories. Each object must have: name (string like 'owner/repo'), stars (string like '52.3k'), description (one sentence), language (string like 'Python'), trending (string like '+1.2k this week'), url (string, GitHub URL). Return ONLY valid JSON array, no markdown.");
    if (aiResult.ok && aiResult.text) {
      var cleaned = aiResult.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      try { repos = JSON.parse(cleaned); } catch(e) {}
    }
  }
} catch(e) {}

if (!Array.isArray(repos)) repos = [];

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_ai_pulse_trending_repos",
      category: category,
      repos: repos
    })
  }]
};
