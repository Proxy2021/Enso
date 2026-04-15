// Cortex Discover — search web for latest content, suggest branches
var topic = String(params.topic || "").trim();
var pagePath = params.path ? String(params.path) : null;

if (!topic) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_cortex_discover", error: "No topic provided" }) }] };
}

// Read existing wiki page context (if path provided)
var existingContext = "";
if (pagePath) {
  var readResult = await ctx.callTool("enso_wiki_read", { path: pagePath });
  if (readResult.success && readResult.data && readResult.data.content) {
    existingContext = readResult.data.content;
  }
}

// Search the web for latest content
var webResults = [];
try {
  var searchResult = await ctx.search(topic + " latest news developments 2026", { count: 8 });
  if (searchResult.ok && searchResult.results) {
    webResults = searchResult.results.map(function(r) {
      return { title: r.title, url: r.url, description: r.description };
    });
  }
} catch(e) {
  ctx.log("Web search failed: " + (e.message || e));
}

// Use AI to suggest related branches
var suggestions = [];
try {
  var contextSnippet = existingContext ? existingContext.slice(0, 800) : "No existing Cortex page for this topic.";

  // Bias suggestions toward the user's active focus areas
  var personalContext = "";
  try {
    var os2 = require("os");
    var path2 = require("path");
    var fs2 = require("fs");
    var ensoHome2 = process.env.ENSO_HOME || path2.join(os2.homedir(), ".enso");
    var focusStatePath2 = path2.join(ensoHome2, "data", "focus-areas.json");
    if (fs2.existsSync(focusStatePath2)) {
      var focusState2 = JSON.parse(fs2.readFileSync(focusStatePath2, "utf8"));
      var active2 = (focusState2.areas || []).filter(function(a) { return a.status === "active" || a.status === "emerging"; });
      if (active2.length > 0) {
        personalContext = "\n\nThe user is actively pursuing these focus areas — bias suggestions toward topics that advance them:\n" +
          active2.map(function(a) { return "- " + a.title + ": " + (a.intent || a.description || ""); }).join("\n");
      }
    }
  } catch(e) { /* non-critical */ }

  var prompt = "Given a topic '" + topic + "' and existing knowledge:\n\n" + contextSnippet +
    personalContext +
    "\n\nAnd these web search results:\n" + webResults.map(function(r) { return "- " + r.title + ": " + r.description; }).join("\n") +
    "\n\nSuggest 5 related topics to explore that would deepen or broaden understanding. " +
    "For each, explain WHY it's worth exploring in 1 sentence. " +
    "Return JSON array: [{\"topic\": \"...\", \"reason\": \"...\", \"category\": \"entity|concept|trend\"}]" +
    "\nReturn ONLY the JSON array, no markdown.";

  var aiResult = await ctx.ask(prompt, { maxTokens: 500 });
  if (aiResult.ok && aiResult.text) {
    try {
      var cleaned = aiResult.text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
      suggestions = JSON.parse(cleaned);
    } catch(e) {
      ctx.log("Failed to parse AI suggestions: " + e.message);
    }
  }
} catch(e) {
  ctx.log("AI suggestion failed: " + (e.message || e));
}

return {
  content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_discover",
    topic: topic,
    pagePath: pagePath,
    existingContext: existingContext ? existingContext.slice(0, 200) + "..." : "",
    webResults: webResults,
    suggestions: Array.isArray(suggestions) ? suggestions : [],
    hasExistingPage: !!existingContext
  }) }]
};
