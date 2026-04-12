// AI/Tech News Digest — web search + LLM analysis + HTML email
var p = params || {};

ctx.log("AI/Tech News Digest starting...");

// ── 1. Search for news ──
var allResults = [];
var queries = [
  "latest AI news today breakthroughs announcements",
  "new AI model releases LLM updates today",
  "tech industry news startups funding today"
];

for (var qi = 0; qi < queries.length; qi++) {
  try {
    var sr = await ctx.search(queries[qi], { count: 8 });
    if (sr && sr.results) {
      sr.results.forEach(function(r) {
        allResults.push({
          title: r.title || "",
          url: r.url || "",
          description: (r.description || "").slice(0, 500),
          source: r.url ? r.url.replace(/https?:\/\/(www\.)?/, "").split("/")[0] : "",
        });
      });
    }
  } catch(e) { ctx.log("Search failed for query " + qi + ": " + (e.message || e)); }
}

ctx.log("Found " + allResults.length + " raw results across " + queries.length + " queries");

if (allResults.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_tech_news_digest",
    success: false,
    error: "No search results found"
  }) }] };
}

// ── 2. LLM synthesis ──
var resultsText = allResults.slice(0, 20).map(function(r, i) {
  return (i + 1) + ". " + r.title + "\n   URL: " + r.url + "\n   " + r.description;
}).join("\n\n");

var analysisPrompt = "You are an AI/tech news analyst. From these search results, identify the TOP 8 most significant stories.\n\n"
  + "For each story, provide a JSON object with:\n"
  + "- headline: compelling title\n"
  + "- url: source URL\n"
  + "- summary: 2-3 sentence summary of what happened and why it matters\n"
  + "- impact: HIGH, MEDIUM, or LOW\n"
  + "- soWhat: one sentence about what this means for an AI developer/entrepreneur\n\n"
  + "Return ONLY a JSON array of 8 objects. No markdown fences, no explanation.\n\n"
  + "Search results:\n" + resultsText;

var stories = [];
try {
  var aiResult = await ctx.ask(analysisPrompt, { maxTokens: 2000 });
  var rawText = (aiResult && aiResult.text) ? aiResult.text : String(aiResult || "");
  var jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  stories = JSON.parse(jsonStr);
} catch(e) {
  ctx.log("LLM analysis failed: " + (e.message || e));
}

if (stories.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_tech_news_digest",
    success: false,
    error: "LLM analysis returned no stories"
  }) }] };
}

// ── 3. Build HTML email ──
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
var impactColors = { HIGH: "#ef4444", MEDIUM: "#eab308", LOW: "#22c55e" };

var html = "<div style='background:#0f172a;padding:30px 16px;font-family:system-ui,-apple-system,sans-serif;'>";
html += "<div style='max-width:640px;margin:0 auto;'>";
html += "<h1 style='color:#60a5fa;text-align:center;font-size:22px;margin:0 0 4px;'>AI & Tech Daily Briefing</h1>";
html += "<p style='color:#94a3b8;text-align:center;font-size:13px;margin:0 0 20px;'>" + todayStr + "</p>";

for (var si = 0; si < stories.length; si++) {
  var s = stories[si];
  var ic = impactColors[s.impact] || "#94a3b8";
  html += "<div style='background:#1e293b;border-radius:10px;padding:14px 16px;margin-bottom:12px;border-left:3px solid " + ic + ";'>";
  html += "<a href='" + (s.url || "#") + "' style='color:#e2e8f0;font-size:15px;font-weight:600;text-decoration:none;line-height:1.3;'>" + (s.headline || "") + "</a>";
  html += "<span style='display:inline-block;background:" + ic + ";color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:8px;vertical-align:middle;'>" + (s.impact || "") + "</span>";
  html += "<p style='color:#94a3b8;font-size:13px;line-height:1.5;margin:8px 0 4px;'>" + (s.summary || "") + "</p>";
  html += "<p style='color:#64748b;font-size:12px;font-style:italic;margin:4px 0 0;'>So what? " + (s.soWhat || "") + "</p>";
  html += "</div>";
}

html += "<p style='color:#475569;text-align:center;font-size:11px;margin:20px 0 0;'>Enso AI</p>";
html += "</div></div>";

// ── 4. Send email ──
var emailSent = false;
var emailTo = (await ctx.store.get("news_email_to")) || "kkwong@xiaomi.com";
try {
  var emailResult = await ctx.callTool("enso_email_send", {
    to: emailTo,
    subject: "AI/Tech Daily Briefing - " + new Date().toISOString().slice(0, 10),
    body: html,
    html: true
  });
  emailSent = !!(emailResult && emailResult.success);
} catch(e) { ctx.log("Email send failed: " + (e.message || e)); }

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_tech_news_digest",
  success: true,
  storiesCount: stories.length,
  emailSent: emailSent,
  to: emailTo
}) }] };
