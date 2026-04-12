// Weekly Media Podcast Digest — checks existing podcasts, recommends unprocessed items, emails digest
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

ctx.log("Weekly Media Podcast Digest starting...");

// ── 1. Scan existing deep content (podcasts) ──
var deepContentDir = path.join(os.homedir(), ".enso", "data", "deep-content");
var existingPodcasts = [];
try {
  if (fs.existsSync(deepContentDir)) {
    var files = fs.readdirSync(deepContentDir).filter(function(f) { return f.endsWith(".json"); });
    files.forEach(function(f) {
      try {
        var meta = JSON.parse(fs.readFileSync(path.join(deepContentDir, f), "utf-8"));
        existingPodcasts.push({
          slug: f.replace(".json", ""),
          title: meta.title || meta.entityTitle || f,
          type: meta.type || meta.entityType || "unknown",
          durationMin: meta.durationMinutes || 0,
          generatedAt: meta.generatedAt || meta.createdAt || ""
        });
      } catch(e) {}
    });
  }
} catch(e) {}

ctx.log("Found " + existingPodcasts.length + " existing podcasts");

// ── 2. Find unprocessed entities from Cortex ──
var entityIndexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var processedSlugs = {};
existingPodcasts.forEach(function(p) { processedSlugs[p.slug] = true; });

var unprocessedByType = { book: [], movie: [], game: [], channel: [] };
try {
  if (fs.existsSync(entityIndexPath)) {
    var entries = JSON.parse(fs.readFileSync(entityIndexPath, "utf-8"));
    if (Array.isArray(entries)) {
      entries.forEach(function(e) {
        if (!e.title || !e.type) return;
        var slug = (e.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (processedSlugs[slug]) return;
        if (unprocessedByType[e.type]) {
          unprocessedByType[e.type].push({ title: e.title, type: e.type, source: e.source });
        }
      });
    }
  }
} catch(e) {}

var unprocessedCounts = {};
for (var t in unprocessedByType) unprocessedCounts[t] = unprocessedByType[t].length;
ctx.log("Unprocessed: " + JSON.stringify(unprocessedCounts));

// ── 3. Pick recommendations (deterministic: newest unprocessed from each type) ──
var picks = [];
var types = ["book", "movie", "game"];
types.forEach(function(t) {
  if (unprocessedByType[t].length > 0) {
    picks.push(unprocessedByType[t][0]);
  }
});

// ── 4. Build HTML email ──
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

var html = "<div style='background:#0f172a;padding:30px 16px;font-family:system-ui,-apple-system,sans-serif;'>";
html += "<div style='max-width:640px;margin:0 auto;'>";
html += "<h1 style='color:#c4b5fd;text-align:center;font-size:22px;margin:0 0 4px;'>Weekly Media Podcast Digest</h1>";
html += "<p style='color:#94a3b8;text-align:center;font-size:13px;margin:0 0 20px;'>" + todayStr + " \u2014 " + existingPodcasts.length + " podcasts in library</p>";

// Recent podcasts section
var recentPodcasts = existingPodcasts.sort(function(a, b) {
  return (b.generatedAt || "").localeCompare(a.generatedAt || "");
}).slice(0, 5);

if (recentPodcasts.length > 0) {
  html += "<h3 style='color:#a78bfa;font-size:14px;margin:0 0 10px;'>Recently Generated</h3>";
  recentPodcasts.forEach(function(p) {
    var streamUrl = "https://pc1.enso.net/api/podcast/stream/" + p.slug;
    html += "<div style='background:#1e293b;border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;'>";
    html += "<div>";
    html += "<div style='color:#e2e8f0;font-size:14px;font-weight:500;'>" + p.title + "</div>";
    html += "<div style='color:#64748b;font-size:11px;'>" + p.type + (p.durationMin ? " \u00B7 " + p.durationMin + " min" : "") + "</div>";
    html += "</div>";
    html += "<a href='" + streamUrl + "' style='display:inline-block;background:#7c3aed;color:white;padding:6px 14px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;white-space:nowrap;'>\u25B6 Listen</a>";
    html += "</div>";
  });
}

// Unprocessed picks
if (picks.length > 0) {
  html += "<h3 style='color:#fbbf24;font-size:14px;margin:16px 0 10px;'>Up Next (No Podcast Yet)</h3>";
  picks.forEach(function(pick) {
    html += "<div style='background:#1e293b;border-radius:10px;padding:12px 16px;margin-bottom:8px;'>";
    html += "<div style='color:#e2e8f0;font-size:14px;font-weight:500;'>" + pick.title + "</div>";
    html += "<div style='color:#64748b;font-size:11px;'>" + pick.type + (pick.source ? " \u00B7 " + pick.source : "") + "</div>";
    html += "<div style='color:#fbbf24;font-size:11px;margin-top:4px;'>\u23F3 Podcast will be generated soon</div>";
    html += "</div>";
  });
}

// Stats
html += "<div style='background:#1e293b;border-radius:10px;padding:12px 16px;margin-top:14px;'>";
html += "<h3 style='color:#94a3b8;font-size:12px;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px;'>Library Stats</h3>";
html += "<div style='color:#64748b;font-size:12px;line-height:1.6;'>";
html += "Total podcasts: " + existingPodcasts.length + "<br>";
for (var ut in unprocessedCounts) {
  if (unprocessedCounts[ut] > 0) html += "Unprocessed " + ut + "s: " + unprocessedCounts[ut] + "<br>";
}
html += "</div></div>";

html += "<p style='color:#475569;text-align:center;font-size:11px;margin:20px 0 0;'>Enso AI</p>";
html += "</div></div>";

// ── 5. Send email ──
var emailSent = false;
var emailTo = (await ctx.store.get("podcast_email_to")) || "kkwong@xiaomi.com";
try {
  var emailResult = await ctx.callTool("enso_email_send", {
    to: emailTo,
    subject: "Weekly Media Podcast Digest - " + new Date().toISOString().slice(0, 10),
    body: html,
    html: true
  });
  emailSent = !!(emailResult && emailResult.success);
} catch(e) { ctx.log("Email send failed: " + (e.message || e)); }

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_media_podcast_digest",
  success: true,
  existingPodcasts: existingPodcasts.length,
  picks: picks.length,
  emailSent: emailSent
}) }] };
