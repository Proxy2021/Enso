// Cortex Digest — AI summary of knowledge state using wiki tools

// Get all pages via search
var searchResult = await ctx.callTool("enso_wiki_search", { query: "", maxResults: 200 });
var entries = (searchResult.success && searchResult.data) ? (searchResult.data.results || []) : [];
var categories = (searchResult.success && searchResult.data) ? (searchResult.data.categories || {}) : {};
var totalPages = (searchResult.success && searchResult.data) ? (searchResult.data.totalPages || 0) : 0;

// Stats
var stats = {
  total: totalPages,
  entities: categories.entities || 0,
  concepts: categories.concepts || 0,
  sources: categories.sources || 0,
  synthesis: categories.synthesis || 0
};

// Build context for AI
var contextLines = [];
contextLines.push("Knowledge Cortex has " + totalPages + " pages:");
contextLines.push("- Entities: " + stats.entities + " (companies, projects, people, tools)");
contextLines.push("- Concepts: " + stats.concepts + " (patterns, techniques, standards)");
contextLines.push("- Sources: " + stats.sources + " (reference material)");
contextLines.push("- Synthesis: " + stats.synthesis + " (cross-cutting analyses)");
contextLines.push("");
contextLines.push("Pages:");
for (var ei = 0; ei < entries.length; ei++) {
  contextLines.push("- [" + (entries[ei].path || "").split("/")[0] + "] " + entries[ei].title + ": " + (entries[ei].summary || ""));
}

var summary = "";
var strengths = [];
var gaps = [];
var suggestions = [];

try {
  var prompt = "You are analyzing a personal knowledge base (Knowledge Cortex). Here is its current state:\n\n" +
    contextLines.join("\n") +
    "\n\nProvide a comprehensive analysis as JSON:\n" +
    '{"summary": "2-3 sentence overview of what this person knows and is interested in",' +
    '"strengths": ["top 3-5 knowledge areas where coverage is deep"],' +
    '"gaps": ["3-5 important topics that are referenced but underdeveloped or missing"],' +
    '"suggestions": [{"topic": "...", "reason": "why this would be valuable to explore", "type": "deepen|branch|connect"}]}' +
    "\nReturn ONLY the JSON, no markdown fences.";

  var aiResult = await ctx.ask(prompt, { maxTokens: 800 });
  if (aiResult.ok && aiResult.text) {
    try {
      var cleaned = aiResult.text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
      var parsed = JSON.parse(cleaned);
      summary = parsed.summary || "";
      strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
      gaps = Array.isArray(parsed.gaps) ? parsed.gaps : [];
      suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    } catch(e) {
      summary = aiResult.text.slice(0, 500);
    }
  }
} catch(e) {
  summary = "Analysis unavailable: " + (e.message || String(e));
}

return {
  content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_digest",
    stats: stats,
    summary: summary,
    strengths: strengths,
    gaps: gaps,
    suggestions: suggestions
  }) }]
};
