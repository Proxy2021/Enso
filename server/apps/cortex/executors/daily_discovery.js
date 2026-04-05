// Cortex Daily Discovery v2 — deep analysis, personalized relevance, executive summary

ctx.log("Cortex Daily Discovery v2 starting...");

// ── Step 1: Read Cortex state — understand what the user knows ──
var searchResult = await ctx.callTool("enso_wiki_search", { query: "", maxResults: 200 });
var entries = (searchResult.success && searchResult.data) ? (searchResult.data.results || []) : [];

if (entries.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_daily_discovery",
    topicsSearched: 0, newFindings: 0, pagesCreated: [], pagesUpdated: [], emailSent: false,
    message: "Cortex is empty. Import data sources or add knowledge first."
  }) }] };
}

// Build a compact knowledge profile for AI context
var knowledgeProfile = entries.map(function(e) {
  return "[" + (e.path || "").split("/")[0] + "] " + e.title + ": " + (e.summary || "").slice(0, 80);
}).join("\n");

// Get top topics (entities + concepts ranked by tag count)
var ranked = entries
  .filter(function(e) { var cat = (e.path || "").split("/")[0]; return cat === "entities" || cat === "concepts"; })
  .sort(function(a, b) { return (b.tags || []).length - (a.tags || []).length; })
  .slice(0, 10);

ctx.log("Top topics: " + ranked.map(function(r) { return r.title; }).join(", "));

// ── Step 2: Search web — 3 results per topic ──
var allFindings = [];
var topicsSearched = 0;

for (var ri = 0; ri < ranked.length; ri++) {
  var topic = ranked[ri].title;
  try {
    var webResult = await ctx.search(topic + " latest news developments 2026", { count: 5 });
    topicsSearched++;
    if (webResult.ok && webResult.results && webResult.results.length > 0) {
      for (var si = 0; si < Math.min(webResult.results.length, 3); si++) {
        allFindings.push({
          topic: topic,
          topicSummary: ranked[ri].summary || "",
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

ctx.log("Found " + allFindings.length + " web results across " + topicsSearched + " topics");

// ── Step 3: Deep AI analysis — filter, categorize, personalize, synthesize ──
var analysisResult = null;
if (allFindings.length > 0) {
  try {
    var analysisPrompt = "You are a personal intelligence analyst. Your client has a Knowledge Cortex (personal knowledge base) with these topics:\n\n" +
      knowledgeProfile.slice(0, 3000) +
      "\n\n---\n\nHere are today's web search results across their tracked topics:\n\n" +
      allFindings.map(function(f, i) {
        return (i+1) + ". [" + f.topic + "] " + f.title + "\n   " + f.description + "\n   URL: " + f.url;
      }).join("\n\n") +
      "\n\n---\n\nProduce a comprehensive daily intelligence briefing as JSON:\n" +
      "{\n" +
      '  "executiveSummary": "3-4 sentence overview of today\'s most important developments and what they mean for this person specifically",\n' +
      '  "sections": [\n' +
      '    {\n' +
      '      "category": "breaking|strategic|update|emerging",\n' +
      '      "categoryLabel": "human-readable label like Breaking News, Strategic Shifts, Industry Updates, Emerging Signals",\n' +
      '      "items": [\n' +
      '        {\n' +
      '          "index": 1,\n' +
      '          "headline": "concise rewritten headline (max 15 words)",\n' +
      '          "analysis": "2-3 sentence analysis: what happened, why it matters, how it connects to their existing knowledge",\n' +
      '          "impact": "high|medium|low",\n' +
      '          "impactReason": "1 sentence on why this impact level",\n' +
      '          "actionItem": "specific suggestion: what should they do with this info (read more, update a project, explore a new direction, etc.)",\n' +
      '          "connections": ["names of existing Cortex entities/concepts this connects to"]\n' +
      '        }\n' +
      '      ]\n' +
      '    }\n' +
      '  ],\n' +
      '  "blindSpots": ["1-2 important topics related to their interests that they should be tracking but aren\'t yet"],\n' +
      '  "weeklyTheme": "1 sentence identifying the overarching theme across today\'s discoveries"\n' +
      "}\n\n" +
      "RULES:\n" +
      "- Only include findings that are genuinely significant (skip spam, SEO articles, trivial updates)\n" +
      "- Group into 2-4 sections by category\n" +
      "- The analysis must reference their EXISTING Cortex knowledge — show how new info connects to what they already know\n" +
      "- Action items must be specific and actionable, not generic\n" +
      "- Return ONLY valid JSON, no markdown fences";

    var aiResult = await ctx.ask(analysisPrompt, { maxTokens: 2000 });
    if (aiResult.ok && aiResult.text) {
      try {
        var cleaned = aiResult.text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
        analysisResult = JSON.parse(cleaned);
      } catch(e) {
        ctx.log("Failed to parse analysis: " + e.message);
      }
    }
  } catch(e) {
    ctx.log("AI analysis failed: " + (e.message || e));
  }
}

ctx.log("Analysis complete: " + (analysisResult ? "success" : "failed"));

// Count total items across sections
var totalItems = 0;
var sections = (analysisResult && Array.isArray(analysisResult.sections)) ? analysisResult.sections : [];
for (var sci = 0; sci < sections.length; sci++) {
  totalItems += (sections[sci].items || []).length;
}

// ── Step 4: Ingest significant findings ──
var pagesCreated = [];
var pagesUpdated = [];

if (totalItems > 0) {
  var ingestText = "# Daily Discovery - " + ctx.formatDate() + "\n\n";
  if (analysisResult.executiveSummary) {
    ingestText += analysisResult.executiveSummary + "\n\n";
  }
  for (var si2 = 0; si2 < sections.length; si2++) {
    var section = sections[si2];
    ingestText += "## " + (section.categoryLabel || section.category) + "\n\n";
    var items = section.items || [];
    for (var ii = 0; ii < items.length; ii++) {
      var item = items[ii];
      var idx = (item.index || 0) - 1;
      var source = (idx >= 0 && idx < allFindings.length) ? allFindings[idx] : null;
      ingestText += "### " + item.headline + "\n";
      ingestText += item.analysis + "\n";
      if (source) ingestText += "Source: " + source.url + "\n";
      ingestText += "\n";
    }
  }

  try {
    var ingestResult = await ctx.callTool("enso_wiki_ingest", {
      text: ingestText,
      topic: "Daily Discovery " + ctx.formatDate(),
      source_label: "Daily intelligence briefing " + ctx.formatDate()
    });
    if (ingestResult.success && ingestResult.data) {
      pagesCreated = ingestResult.data.pagesCreated || [];
      pagesUpdated = ingestResult.data.pagesUpdated || [];
    }
  } catch(e) {
    ctx.log("Ingest failed: " + (e.message || e));
  }
}

// ── Step 5: Build rich HTML email ──
var emailSent = false;

// Impact colors
var impactColors = { high: "#dc2626", medium: "#d97706", low: "#059669" };
var impactLabels = { high: "HIGH IMPACT", medium: "MEDIUM", low: "LOW" };
var categoryIcons = { breaking: "\u26A1", strategic: "\uD83C\uDFAF", update: "\uD83D\uDD04", emerging: "\uD83C\uDF31" };

var emailBody = "";
emailBody += "<div style='max-width:680px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1a1a2e;'>";

// Header
emailBody += "<div style='background:linear-gradient(135deg,#1e1b4b,#312e81);padding:32px;border-radius:12px 12px 0 0;'>";
emailBody += "<h1 style='margin:0;color:#fff;font-size:24px;'>\uD83E\uDDE0 Cortex Daily Discovery</h1>";
emailBody += "<p style='margin:8px 0 0;color:#a5b4fc;font-size:14px;'>" + ctx.formatDate() + " \u2014 " + topicsSearched + " topics scanned \u2022 " + totalItems + " significant findings</p>";
emailBody += "</div>";

// Executive Summary
if (analysisResult && analysisResult.executiveSummary) {
  emailBody += "<div style='background:#eef2ff;padding:20px 24px;border-left:4px solid #6366f1;margin:0;'>";
  emailBody += "<h2 style='margin:0 0 8px;font-size:14px;color:#4338ca;text-transform:uppercase;letter-spacing:1px;'>\uD83D\uDCCB Executive Summary</h2>";
  emailBody += "<p style='margin:0;font-size:15px;line-height:1.6;color:#1e1b4b;'>" + analysisResult.executiveSummary + "</p>";
  emailBody += "</div>";
}

// Weekly Theme
if (analysisResult && analysisResult.weeklyTheme) {
  emailBody += "<div style='background:#faf5ff;padding:12px 24px;border-left:4px solid #a855f7;'>";
  emailBody += "<p style='margin:0;font-size:13px;'><strong style='color:#7e22ce;'>\uD83D\uDD2E Theme:</strong> <em>" + analysisResult.weeklyTheme + "</em></p>";
  emailBody += "</div>";
}

emailBody += "<div style='padding:0 24px;background:#fff;'>";

// Sections with items
for (var es = 0; es < sections.length; es++) {
  var sect = sections[es];
  var sItems = sect.items || [];
  if (sItems.length === 0) continue;

  var catIcon = categoryIcons[sect.category] || "\uD83D\uDCCC";
  emailBody += "<h2 style='margin:24px 0 12px;font-size:18px;color:#1e1b4b;border-bottom:2px solid #e5e7eb;padding-bottom:8px;'>" + catIcon + " " + (sect.categoryLabel || sect.category) + "</h2>";

  for (var ei = 0; ei < sItems.length; ei++) {
    var item = sItems[ei];
    var idx2 = (item.index || 0) - 1;
    var source2 = (idx2 >= 0 && idx2 < allFindings.length) ? allFindings[idx2] : null;
    var impactColor = impactColors[item.impact] || "#6b7280";
    var impactLabel = impactLabels[item.impact] || item.impact;

    emailBody += "<div style='margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;'>";

    // Topic + Impact badge
    emailBody += "<div style='margin-bottom:8px;'>";
    if (source2) emailBody += "<span style='font-size:11px;color:#6366f1;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;'>" + source2.topic + "</span> ";
    emailBody += "<span style='display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;color:#fff;background:" + impactColor + ";'>" + impactLabel + "</span>";
    emailBody += "</div>";

    // Headline
    emailBody += "<h3 style='margin:0 0 8px;font-size:16px;'>";
    if (source2) emailBody += "<a href='" + source2.url + "' style='color:#1e40af;text-decoration:none;'>" + item.headline + "</a>";
    else emailBody += item.headline;
    emailBody += "</h3>";

    // Analysis
    emailBody += "<p style='margin:0 0 10px;font-size:14px;line-height:1.6;color:#374151;'>" + item.analysis + "</p>";

    // Impact reason
    if (item.impactReason) {
      emailBody += "<p style='margin:0 0 8px;font-size:12px;color:" + impactColor + ";'><strong>Impact:</strong> " + item.impactReason + "</p>";
    }

    // Action item
    if (item.actionItem) {
      emailBody += "<div style='margin:8px 0;padding:8px 12px;background:#ecfdf5;border-radius:6px;border-left:3px solid #10b981;'>";
      emailBody += "<p style='margin:0;font-size:13px;color:#065f46;'>\u2192 <strong>Action:</strong> " + item.actionItem + "</p>";
      emailBody += "</div>";
    }

    // Connections to existing Cortex knowledge
    if (item.connections && item.connections.length > 0) {
      emailBody += "<p style='margin:8px 0 0;font-size:11px;color:#6b7280;'>\uD83D\uDD17 Connects to: ";
      emailBody += item.connections.map(function(c) {
        return "<span style='display:inline-block;padding:1px 6px;margin:1px;background:#e0e7ff;border-radius:8px;font-size:11px;color:#4338ca;'>" + c + "</span>";
      }).join(" ");
      emailBody += "</p>";
    }

    emailBody += "</div>";
  }
}

// Blind Spots
if (analysisResult && analysisResult.blindSpots && analysisResult.blindSpots.length > 0) {
  emailBody += "<div style='margin:24px 0;padding:16px;background:#fffbeb;border-radius:8px;border:1px solid #fde68a;'>";
  emailBody += "<h3 style='margin:0 0 8px;font-size:14px;color:#92400e;'>\uD83D\uDCA1 Blind Spots \u2014 Topics Worth Tracking</h3>";
  for (var bi = 0; bi < analysisResult.blindSpots.length; bi++) {
    emailBody += "<p style='margin:4px 0;font-size:13px;color:#78350f;'>\u2022 " + analysisResult.blindSpots[bi] + "</p>";
  }
  emailBody += "</div>";
}

// Cortex Updates
if (pagesCreated.length > 0 || pagesUpdated.length > 0) {
  emailBody += "<div style='margin:24px 0;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;'>";
  emailBody += "<h3 style='margin:0 0 8px;font-size:14px;color:#166534;'>\uD83D\uDCDD Cortex Auto-Updated</h3>";
  if (pagesCreated.length > 0) emailBody += "<p style='margin:4px 0;font-size:13px;color:#15803d;'><strong>New pages:</strong> " + pagesCreated.join(", ") + "</p>";
  if (pagesUpdated.length > 0) emailBody += "<p style='margin:4px 0;font-size:13px;color:#15803d;'><strong>Updated:</strong> " + pagesUpdated.join(", ") + "</p>";
  emailBody += "</div>";
}

// Tracked Topics
emailBody += "<div style='margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;'>";
emailBody += "<p style='margin:0 0 8px;font-size:12px;color:#6b7280;font-weight:600;'>\uD83C\uDFAF TRACKED TOPICS</p>";
emailBody += "<p style='margin:0;'>" + ranked.map(function(r) {
  return "<span style='display:inline-block;padding:3px 10px;margin:2px;background:#e0e7ff;border-radius:12px;font-size:12px;color:#3730a3;'>" + r.title + "</span>";
}).join("") + "</p>";
emailBody += "</div>";

emailBody += "</div>"; // close padding div

// Footer
emailBody += "<div style='background:#f1f5f9;padding:16px 24px;border-radius:0 0 12px 12px;text-align:center;'>";
emailBody += "<p style='margin:0;font-size:11px;color:#94a3b8;'>Sent by Enso Knowledge Cortex \u2022 Your AI-maintained intelligence system</p>";
emailBody += "</div>";
emailBody += "</div>"; // close outer container

// Read recipient
var emailTo = await ctx.store.get("discovery_email_to");
if (!emailTo) emailTo = "kkwong@xiaomi.com";

try {
  var emailResult = await ctx.callTool("enso_email_send", {
    to: emailTo,
    subject: "\uD83E\uDDE0 Cortex Intelligence Briefing \u2014 " + ctx.formatDate(),
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
    newFindings: totalItems,
    pagesCreated: pagesCreated,
    pagesUpdated: pagesUpdated,
    emailSent: emailSent,
    topTopics: ranked.map(function(r) { return r.title; }),
    executiveSummary: analysisResult ? analysisResult.executiveSummary : "",
    blindSpots: analysisResult ? analysisResult.blindSpots : [],
    findings: sections.reduce(function(acc, s) {
      return acc.concat((s.items || []).map(function(item) {
        return { headline: item.headline, impact: item.impact, action: item.actionItem, connections: item.connections };
      }));
    }, [])
  }) }]
};
