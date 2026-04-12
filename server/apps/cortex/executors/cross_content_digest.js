// Weekly Cross-Content Digest — cross-references + LLM synthesis of surprising connections
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

ctx.log("Weekly Cross-Content Digest starting...");

// ── 1. Find top entities to cross-reference ──
var entityIndexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var topEntities = [];
var typeCounts = {};
try {
  if (fs.existsSync(entityIndexPath)) {
    var entries = JSON.parse(fs.readFileSync(entityIndexPath, "utf-8"));
    if (Array.isArray(entries)) {
      entries.forEach(function(e) {
        typeCounts[e.type || "unknown"] = (typeCounts[e.type || "unknown"] || 0) + 1;
      });
      // Pick entities with most cross-references or semantic tags
      var scored = entries.filter(function(e) { return e.title; }).map(function(e) {
        var score = (e.crossReferences ? e.crossReferences.length : 0) * 3
          + (e.semanticTags ? e.semanticTags.length : 0);
        return { title: e.title, type: e.type, source: e.source, score: score };
      });
      scored.sort(function(a, b) { return b.score - a.score; });
      topEntities = scored.slice(0, 10);
    }
  }
} catch(e) { ctx.log("Entity index error: " + (e.message || e)); }

ctx.log("Top entities: " + topEntities.length + " | Types: " + Object.keys(typeCounts).join(", "));

// ── 2. Run cross-references for top topics ──
var crossRefResults = [];
var topics = topEntities.slice(0, 5).map(function(e) { return e.title; });

for (var ti = 0; ti < topics.length; ti++) {
  try {
    var crResult = await ctx.callTool("enso_cross_reference", { topic: topics[ti], synthesize: true });
    if (crResult && crResult.success && crResult.data) {
      crossRefResults.push({
        topic: topics[ti],
        narrative: crResult.data.narrative || "",
        connections: (crResult.data.connections || []).slice(0, 3),
        themes: crResult.data.themes || []
      });
    }
  } catch(e) { ctx.log("Cross-ref failed for " + topics[ti] + ": " + (e.message || e)); }
}

ctx.log("Cross-referenced " + crossRefResults.length + " topics");

// ── 3. LLM synthesis ──
var crText = crossRefResults.map(function(cr) {
  return "Topic: " + cr.topic + "\nNarrative: " + (cr.narrative || "").slice(0, 300)
    + "\nConnections: " + cr.connections.map(function(c) { return c.title || c; }).join(", ")
    + "\nThemes: " + cr.themes.join(", ");
}).join("\n\n");

var synthesisPrompt = "You are creating a weekly cross-content intelligence digest. Based on these cross-reference results from a personal knowledge base, create:\n\n"
  + "1. discovery: The single most surprising cross-content connection (a paragraph)\n"
  + "2. threads: Array of 2-3 thematic threads, each with a theme name and 2-3 sentence description of how it connects different content types\n"
  + "3. blind_spots: Array of 2-3 content types or topics that are underrepresented\n"
  + "4. stats_summary: 1-sentence summary of the library's breadth\n\n"
  + "Return ONLY a JSON object. No markdown fences.\n\n"
  + "Entity type counts: " + JSON.stringify(typeCounts) + "\n\n"
  + "Cross-reference results:\n" + crText;

var synthesis = {};
try {
  var aiResult = await ctx.ask(synthesisPrompt, { maxTokens: 1500 });
  var rawText = (aiResult && aiResult.text) ? aiResult.text : String(aiResult || "");
  var jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  synthesis = JSON.parse(jsonStr);
} catch(e) { ctx.log("LLM synthesis failed: " + (e.message || e)); }

// ── 4. Build HTML email ──
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

var html = "<div style='background:#0f172a;padding:30px 16px;font-family:system-ui,-apple-system,sans-serif;'>";
html += "<div style='max-width:640px;margin:0 auto;'>";
html += "<h1 style='color:#c4b5fd;text-align:center;font-size:22px;margin:0 0 4px;'>Weekly Cross-Content Intelligence</h1>";
html += "<p style='color:#94a3b8;text-align:center;font-size:13px;margin:0 0 20px;'>" + todayStr + "</p>";

if (synthesis.discovery) {
  html += "<div style='background:#312e81;border-radius:10px;padding:16px;margin-bottom:14px;border:1px solid #4c1d95;'>";
  html += "<h3 style='color:#c4b5fd;font-size:13px;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;'>This Week's Discovery</h3>";
  html += "<p style='color:#e2e8f0;font-size:14px;line-height:1.5;margin:0;'>" + synthesis.discovery + "</p>";
  html += "</div>";
}

if (synthesis.threads && synthesis.threads.length > 0) {
  synthesis.threads.forEach(function(thread) {
    html += "<div style='background:#1e293b;border-radius:10px;padding:14px 16px;margin-bottom:10px;border-left:3px solid #7c3aed;'>";
    html += "<h3 style='color:#a78bfa;font-size:14px;margin:0 0 4px;'>Thread: " + (thread.theme || thread.name || "") + "</h3>";
    html += "<p style='color:#94a3b8;font-size:13px;line-height:1.5;margin:0;'>" + (thread.description || "") + "</p>";
    html += "</div>";
  });
}

if (synthesis.blind_spots && synthesis.blind_spots.length > 0) {
  html += "<div style='background:#1e293b;border-radius:10px;padding:14px 16px;margin-bottom:12px;'>";
  html += "<h3 style='color:#fbbf24;font-size:14px;margin:0 0 6px;'>Blind Spots</h3>";
  synthesis.blind_spots.forEach(function(bs) {
    html += "<p style='color:#94a3b8;font-size:12px;margin:4px 0;padding-left:12px;border-left:2px solid #fbbf24;'>" + bs + "</p>";
  });
  html += "</div>";
}

html += "<p style='color:#475569;text-align:center;font-size:11px;margin:20px 0 0;'>Enso AI</p>";
html += "</div></div>";

// ── 5. Send email ──
var emailSent = false;
var emailTo = (await ctx.store.get("digest_email_to")) || "kkwong@xiaomi.com";
try {
  var emailResult = await ctx.callTool("enso_email_send", {
    to: emailTo,
    subject: "Weekly Cross-Content Intelligence Digest - " + new Date().toISOString().slice(0, 10),
    body: html,
    html: true
  });
  emailSent = !!(emailResult && emailResult.success);
} catch(e) { ctx.log("Email send failed: " + (e.message || e)); }

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_cross_content_digest",
  success: true,
  topicsAnalyzed: crossRefResults.length,
  emailSent: emailSent,
  to: emailTo
}) }] };
