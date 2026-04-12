// Monthly Knowledge Growth Report — entity stats + LLM synthesis + HTML email
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

ctx.log("Monthly Knowledge Growth Report starting...");

// ── 1. Gather stats ──
var wikiDir = path.join(os.homedir(), ".enso", "wiki");
var entityDir = path.join(wikiDir, "entities");
var synthesisDir = path.join(wikiDir, "synthesis");

var entityCount = 0, synthesisCount = 0;
try { entityCount = fs.readdirSync(entityDir).filter(function(f) { return f.endsWith(".md"); }).length; } catch(e) {}
try { synthesisCount = fs.readdirSync(synthesisDir).filter(function(f) { return f.endsWith(".md"); }).length; } catch(e) {}

// Read entity index for type breakdown
var entityIndexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var typeBreakdown = {};
var totalEntities = 0;
var recentEntities = [];
var thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

try {
  if (fs.existsSync(entityIndexPath)) {
    var entries = JSON.parse(fs.readFileSync(entityIndexPath, "utf-8"));
    if (Array.isArray(entries)) {
      totalEntities = entries.length;
      entries.forEach(function(e) {
        var t = e.type || "unknown";
        typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
        if (e.addedAt && new Date(e.addedAt).getTime() > thirtyDaysAgo) {
          recentEntities.push({ title: e.title, type: e.type, addedAt: e.addedAt });
        }
      });
    }
  }
} catch(e) { ctx.log("Entity index error: " + (e.message || e)); }

// Count deep content podcasts
var deepContentDir = path.join(os.homedir(), ".enso", "data", "deep-content");
var podcastCount = 0;
try { podcastCount = fs.readdirSync(deepContentDir).filter(function(f) { return f.endsWith(".json"); }).length; } catch(e) {}

ctx.log("Stats: " + totalEntities + " entities, " + entityCount + " wiki pages, " + podcastCount + " podcasts, " + recentEntities.length + " added last 30 days");

// ── 2. LLM synthesis ──
var statsText = "Knowledge base stats:\n"
  + "- Total entities: " + totalEntities + "\n"
  + "- Wiki pages: " + entityCount + " entities, " + synthesisCount + " synthesis\n"
  + "- Deep content podcasts: " + podcastCount + "\n"
  + "- New in last 30 days: " + recentEntities.length + "\n\n"
  + "Type breakdown:\n" + Object.keys(typeBreakdown).map(function(t) { return "  " + t + ": " + typeBreakdown[t]; }).join("\n")
  + "\n\nRecent additions (last 30 days):\n" + recentEntities.slice(0, 20).map(function(e) { return "  - " + e.title + " (" + e.type + ")"; }).join("\n");

var analysisPrompt = "You are creating a Monthly Knowledge Growth Report for a personal knowledge system. Based on these stats, write a concise analysis with:\n\n"
  + "1. growth_summary: 2-3 sentences summarizing growth this month\n"
  + "2. emerging_themes: array of 3-4 themes the user seems gravitating toward\n"
  + "3. strongest_area: the type/domain with most coverage\n"
  + "4. gaps: array of 2-3 knowledge gaps or underrepresented areas\n"
  + "5. recommendations: array of 3-5 specific actions (books to add, topics to research)\n\n"
  + "Return ONLY a JSON object. No markdown fences.\n\n" + statsText;

var analysis = {};
try {
  var aiResult = await ctx.ask(analysisPrompt, { maxTokens: 1500 });
  var rawText = (aiResult && aiResult.text) ? aiResult.text : String(aiResult || "");
  var jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  analysis = JSON.parse(jsonStr);
} catch(e) { ctx.log("LLM analysis failed: " + (e.message || e)); }

// ── 3. Build HTML email ──
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
var monthYear = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

var html = "<div style='background:#0f172a;padding:30px 16px;font-family:system-ui,-apple-system,sans-serif;'>";
html += "<div style='max-width:640px;margin:0 auto;'>";
html += "<h1 style='color:#c4b5fd;text-align:center;font-size:22px;margin:0 0 4px;'>Monthly Knowledge Growth Report</h1>";
html += "<p style='color:#94a3b8;text-align:center;font-size:13px;margin:0 0 20px;'>" + monthYear + "</p>";

// Stats cards
html += "<div style='display:flex;gap:8px;margin-bottom:16px;'>";
var statItems = [
  { label: "Entities", value: totalEntities, color: "#7c3aed" },
  { label: "Podcasts", value: podcastCount, color: "#059669" },
  { label: "New (30d)", value: recentEntities.length, color: "#2563eb" },
  { label: "Wiki Pages", value: entityCount + synthesisCount, color: "#d97706" }
];
statItems.forEach(function(s) {
  html += "<div style='flex:1;background:#1e293b;border-radius:8px;padding:12px;text-align:center;border-top:3px solid " + s.color + ";'>";
  html += "<div style='color:#e2e8f0;font-size:20px;font-weight:700;'>" + s.value + "</div>";
  html += "<div style='color:#94a3b8;font-size:11px;'>" + s.label + "</div>";
  html += "</div>";
});
html += "</div>";

// Type breakdown bar chart
html += "<div style='background:#1e293b;border-radius:10px;padding:14px 16px;margin-bottom:12px;'>";
html += "<h3 style='color:#e2e8f0;font-size:14px;margin:0 0 10px;'>Entity Breakdown</h3>";
var maxCount = Math.max.apply(null, Object.values(typeBreakdown).concat([1]));
Object.keys(typeBreakdown).sort(function(a,b) { return typeBreakdown[b] - typeBreakdown[a]; }).slice(0, 8).forEach(function(t) {
  var pct = Math.round(typeBreakdown[t] / maxCount * 100);
  html += "<div style='margin-bottom:4px;'>";
  html += "<div style='display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;'><span>" + t + "</span><span>" + typeBreakdown[t] + "</span></div>";
  html += "<div style='background:#0f172a;border-radius:4px;height:8px;margin-top:2px;'><div style='background:#7c3aed;height:8px;border-radius:4px;width:" + pct + "%;'></div></div>";
  html += "</div>";
});
html += "</div>";

// LLM analysis sections
if (analysis.growth_summary) {
  html += "<div style='background:#1e293b;border-radius:10px;padding:14px 16px;margin-bottom:12px;'>";
  html += "<h3 style='color:#e2e8f0;font-size:14px;margin:0 0 6px;'>Growth Summary</h3>";
  html += "<p style='color:#94a3b8;font-size:13px;line-height:1.5;margin:0;'>" + analysis.growth_summary + "</p>";
  html += "</div>";
}

if (analysis.emerging_themes && analysis.emerging_themes.length > 0) {
  html += "<div style='background:#1e293b;border-radius:10px;padding:14px 16px;margin-bottom:12px;'>";
  html += "<h3 style='color:#e2e8f0;font-size:14px;margin:0 0 6px;'>Emerging Themes</h3>";
  analysis.emerging_themes.forEach(function(t) {
    html += "<span style='display:inline-block;background:#312e81;color:#c4b5fd;font-size:11px;padding:4px 10px;border-radius:12px;margin:2px 4px 2px 0;'>" + t + "</span>";
  });
  html += "</div>";
}

if (analysis.recommendations && analysis.recommendations.length > 0) {
  html += "<div style='background:#1e293b;border-radius:10px;padding:14px 16px;margin-bottom:12px;'>";
  html += "<h3 style='color:#e2e8f0;font-size:14px;margin:0 0 6px;'>Recommendations</h3>";
  analysis.recommendations.forEach(function(r) {
    html += "<p style='color:#94a3b8;font-size:12px;line-height:1.4;margin:4px 0;padding-left:12px;border-left:2px solid #7c3aed;'>" + r + "</p>";
  });
  html += "</div>";
}

html += "<p style='color:#475569;text-align:center;font-size:11px;margin:20px 0 0;'>Enso AI</p>";
html += "</div></div>";

// ── 4. Send email ──
var emailSent = false;
var emailTo = (await ctx.store.get("growth_email_to")) || "kkwong@xiaomi.com";
try {
  var emailResult = await ctx.callTool("enso_email_send", {
    to: emailTo,
    subject: "Monthly Knowledge Growth Report \u2014 " + monthYear,
    body: html,
    html: true
  });
  emailSent = !!(emailResult && emailResult.success);
} catch(e) { ctx.log("Email send failed: " + (e.message || e)); }

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_knowledge_growth",
  success: true,
  totalEntities: totalEntities,
  newLast30Days: recentEntities.length,
  podcastCount: podcastCount,
  emailSent: emailSent
}) }] };
