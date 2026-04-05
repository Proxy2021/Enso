// Cortex Daily Discovery — scheduled task: search web, ingest findings, email digest

ctx.log("Cortex Daily Discovery starting...");

// Step 1: Get all pages and find top topics
var searchResult = await ctx.callTool("enso_wiki_search", { query: "", maxResults: 200 });
var entries = (searchResult.success && searchResult.data) ? (searchResult.data.results || []) : [];

if (entries.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_daily_discovery",
    topicsSearched: 0, newFindings: 0, pagesCreated: [], pagesUpdated: [], emailSent: false,
    message: "Cortex is empty. Import data sources or add knowledge first."
  }) }] };
}

// Filter to entities and concepts only, rank by tag count as connectivity proxy
var ranked = entries
  .filter(function(e) { var cat = (e.path || "").split("/")[0]; return cat === "entities" || cat === "concepts"; })
  .sort(function(a, b) { return (b.tags || []).length - (a.tags || []).length; })
  .slice(0, 10);

ctx.log("Top topics: " + ranked.map(function(r) { return r.title; }).join(", "));

// Step 2: Search web for each topic
var allFindings = [];
var topicsSearched = 0;

for (var ri = 0; ri < ranked.length; ri++) {
  var topic = ranked[ri].title;
  try {
    var webResult = await ctx.search(topic + " latest news 2026", { count: 5 });
    topicsSearched++;
    if (webResult.ok && webResult.results && webResult.results.length > 0) {
      for (var si = 0; si < Math.min(webResult.results.length, 3); si++) {
        allFindings.push({
          topic: topic,
          title: webResult.results[si].title,
          url: webResult.results[si].url,
          description: webResult.results[si].description
        });
      }
    }
  } catch(e) {
    ctx.log("Search failed for " + topic + ": " + (e.message || e));
  }
  await ctx.sleep(500);
}

ctx.log("Found " + allFindings.length + " results across " + topicsSearched + " topics");

// Step 3: AI filter for significant findings
var worthyFindings = [];
if (allFindings.length > 0) {
  try {
    var filterPrompt = "Given these web results about topics I track, identify which contain genuinely NEW or SIGNIFICANT information:\n\n" +
      allFindings.map(function(f, i) { return (i+1) + ". [" + f.topic + "] " + f.title + ": " + f.description; }).join("\n") +
      "\n\nReturn JSON array of indices (1-based) worth ingesting: [{\"index\": 1, \"reason\": \"...\"}]\nReturn ONLY JSON.";

    var aiResult = await ctx.ask(filterPrompt, { maxTokens: 400 });
    if (aiResult.ok && aiResult.text) {
      try {
        var cleaned = aiResult.text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
        var selected = JSON.parse(cleaned);
        if (Array.isArray(selected)) {
          for (var wi = 0; wi < selected.length; wi++) {
            var idx = selected[wi].index - 1;
            if (idx >= 0 && idx < allFindings.length) {
              worthyFindings.push({ finding: allFindings[idx], reason: selected[wi].reason || "" });
            }
          }
        }
      } catch(e) {}
    }
  } catch(e) {
    worthyFindings = allFindings.slice(0, 5).map(function(f) { return { finding: f, reason: "Top result" }; });
  }
}

ctx.log("Worthy findings: " + worthyFindings.length);

// Step 4: Ingest worthy findings
var pagesCreated = [];
var pagesUpdated = [];

if (worthyFindings.length > 0) {
  var ingestText = "# Daily Discovery - " + ctx.formatDate() + "\n\n";
  for (var ii = 0; ii < worthyFindings.length; ii++) {
    var f = worthyFindings[ii].finding;
    ingestText += "## " + f.topic + ": " + f.title + "\n" + f.description + "\nSource: " + f.url + "\n\n";
  }

  try {
    var ingestResult = await ctx.callTool("enso_wiki_ingest", {
      text: ingestText,
      topic: "Daily Discovery " + ctx.formatDate(),
      source_label: "Daily web discovery " + ctx.formatDate()
    });
    if (ingestResult.success && ingestResult.data) {
      pagesCreated = ingestResult.data.pagesCreated || [];
      pagesUpdated = ingestResult.data.pagesUpdated || [];
    }
  } catch(e) {
    ctx.log("Ingest failed: " + (e.message || e));
  }
}

// Step 5: Email digest
var emailSent = false;
var emailBody = "<h1>\uD83E\uDDE0 Cortex Daily Discovery</h1>";
emailBody += "<p style='color:#666;'>" + ctx.formatDate() + " \u2014 " + topicsSearched + " topics, " + worthyFindings.length + " findings</p><hr>";

if (worthyFindings.length > 0) {
  emailBody += "<h2>\uD83D\uDCE1 New Discoveries</h2>";
  for (var di = 0; di < worthyFindings.length; di++) {
    var finding = worthyFindings[di].finding;
    emailBody += "<div style='margin-bottom:16px;padding:12px;background:#f8f9fa;border-radius:8px;border-left:4px solid #6366f1;'>";
    emailBody += "<strong style='color:#4338ca;'>" + finding.topic + "</strong><br>";
    emailBody += "<a href='" + finding.url + "' style='color:#2563eb;'>" + finding.title + "</a><br>";
    emailBody += "<span style='color:#666;'>" + finding.description + "</span><br>";
    emailBody += "<em style='color:#059669;font-size:12px;'>Why: " + worthyFindings[di].reason + "</em></div>";
  }
} else {
  emailBody += "<p>No significant new developments found today. Your knowledge is up to date! \u2705</p>";
}

if (pagesCreated.length > 0 || pagesUpdated.length > 0) {
  emailBody += "<h2>\uD83D\uDCDD Cortex Updates</h2>";
  if (pagesCreated.length > 0) emailBody += "<p><strong>New:</strong> " + pagesCreated.join(", ") + "</p>";
  if (pagesUpdated.length > 0) emailBody += "<p><strong>Updated:</strong> " + pagesUpdated.join(", ") + "</p>";
}

emailBody += "<h2>\uD83C\uDFAF Tracked Topics</h2><p>" +
  ranked.map(function(r) { return "<span style='display:inline-block;padding:2px 8px;margin:2px;background:#e0e7ff;border-radius:12px;font-size:12px;'>" + r.title + "</span>"; }).join("") +
  "</p><hr><p style='color:#999;font-size:11px;'>Sent by Enso Knowledge Cortex</p>";

// Read recipient from store (set by user), fallback to SMTP sender
var emailTo = await ctx.store.get("discovery_email_to");
if (!emailTo) emailTo = "kkwong@xiaomi.com";

try {
  var emailResult = await ctx.callTool("enso_email_send", {
    to: emailTo,
    subject: "\uD83E\uDDE0 Cortex Daily Discovery \u2014 " + ctx.formatDate(),
    body: emailBody,
    html: true
  });
  emailSent = emailResult.success;
  ctx.log("Email " + (emailSent ? "sent" : "failed"));
} catch(e) {
  ctx.log("Email failed: " + (e.message || e));
}

return {
  content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_daily_discovery",
    topicsSearched: topicsSearched,
    newFindings: worthyFindings.length,
    pagesCreated: pagesCreated,
    pagesUpdated: pagesUpdated,
    emailSent: emailSent,
    topTopics: ranked.map(function(r) { return r.title; }),
    findings: worthyFindings.map(function(w) { return { topic: w.finding.topic, title: w.finding.title, reason: w.reason }; })
  }) }]
};
