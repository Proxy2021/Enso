// Cortex Daily Discovery v2 — deep analysis, personalized relevance, executive summary

// Determine server base URL for quick-add links in email
var serverBaseUrl = "https://pc1.enso.net";
try {
  var os = require("os");
  var hostname = os.hostname().toLowerCase();
  if (hostname.includes("pc1")) serverBaseUrl = "https://pc1.enso.net";
  else if (hostname.includes("pc2")) serverBaseUrl = "https://pc2.enso.net";
  else serverBaseUrl = "http://localhost:3001";
} catch(e) {}

// Decode HTML numeric entities (&#128161; → 💡) that LLMs sometimes generate
function decodeHtmlEntities(str) {
  if (!str) return str;
  return str.replace(/&#(\d+);/g, function(match, dec) {
    try { return String.fromCodePoint(parseInt(dec, 10)); } catch(e) { return match; }
  }).replace(/&#x([0-9a-fA-F]+);/g, function(match, hex) {
    try { return String.fromCodePoint(parseInt(hex, 16)); } catch(e) { return match; }
  });
}

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
      '          "connections": ["names of existing Cortex entities/concepts this connects to"],\n' +
      '          "entityTitle": "if about a specific book/movie/game/TV show, the exact title, else null",\n' +
      '          "entityType": "book|movie|tv-series|game|documentary or null",\n' +
      '          "entityCreator": "author/director/developer or null"\n' +
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
      "- Use plain text only — do NOT use HTML entities like &#128161; or &#128301;. Use UTF-8 emoji directly if needed.\n" +
      "- Return ONLY valid JSON, no markdown fences";

    var aiResult = await ctx.ask(analysisPrompt, { maxTokens: 2000 });
    if (aiResult.ok && aiResult.text) {
      try {
        var cleaned = aiResult.text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
        analysisResult = JSON.parse(cleaned);
        // Decode HTML entities the LLM may have injected
        if (analysisResult.executiveSummary) analysisResult.executiveSummary = decodeHtmlEntities(analysisResult.executiveSummary);
        if (analysisResult.weeklyTheme) analysisResult.weeklyTheme = decodeHtmlEntities(analysisResult.weeklyTheme);
        if (Array.isArray(analysisResult.blindSpots)) {
          analysisResult.blindSpots = analysisResult.blindSpots.map(function(s) { return decodeHtmlEntities(s); });
        }
        if (Array.isArray(analysisResult.sections)) {
          for (var ds = 0; ds < analysisResult.sections.length; ds++) {
            var sect2 = analysisResult.sections[ds];
            if (sect2.categoryLabel) sect2.categoryLabel = decodeHtmlEntities(sect2.categoryLabel);
            if (Array.isArray(sect2.items)) {
              for (var di = 0; di < sect2.items.length; di++) {
                var dItem = sect2.items[di];
                if (dItem.headline) dItem.headline = decodeHtmlEntities(dItem.headline);
                if (dItem.analysis) dItem.analysis = decodeHtmlEntities(dItem.analysis);
                if (dItem.impactReason) dItem.impactReason = decodeHtmlEntities(dItem.impactReason);
                if (dItem.actionItem) dItem.actionItem = decodeHtmlEntities(dItem.actionItem);
              }
            }
          }
        }
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

// ── Step 3.5: Cross-reference top topics against all data sources ──
var libraryConnections = {};
try {
  for (var xri = 0; xri < Math.min(ranked.length, 5); xri++) {
    var xrefTopic = ranked[xri].title;
    try {
      var xrefResult = await ctx.callTool("enso_cross_reference", { topic: xrefTopic, synthesize: true });
      if (xrefResult && xrefResult.data) {
        var xd = typeof xrefResult.data === "string" ? JSON.parse(xrefResult.data) : xrefResult.data;
        if (xd.narrative || xd.totalMatches > 0) {
          libraryConnections[xrefTopic] = {
            narrative: xd.narrative || "",
            totalMatches: xd.totalMatches || 0,
            sources: Object.keys(xd.bySource || {}),
            connections: (xd.connections || []).slice(0, 2),
            themes: xd.themes || []
          };
        }
      }
    } catch(xre) {
      ctx.log("Cross-ref failed for " + xrefTopic + ": " + (xre.message || xre));
    }
  }
  ctx.log("Cross-referenced " + Object.keys(libraryConnections).length + " topics against library");
} catch(xre2) {
  ctx.log("Cross-reference step failed: " + (xre2.message || xre2));
}

// ── Step 3.6: Gather personal data for morning briefing sections ──
var briefingData = { onThisDay: [], freshVideos: [], trendingTopics: [], readingNudge: null, projectPulse: [], knowledgeGrowth: null };

// On This Day — photo memories from today's date in past years
try {
  var os = require("os");
  var path = require("path");
  var fs = require("fs");
  var photoCache = null;
  var photoCachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "photo-library.json");
  try { photoCache = JSON.parse(fs.readFileSync(photoCachePath, "utf-8")); } catch(e) {}
  if (photoCache && photoCache.albums) {
    var today = new Date();
    var monthDay = (today.getMonth() + 1).toString().padStart(2, "0") + "-" + today.getDate().toString().padStart(2, "0");
    var thisYear = today.getFullYear();
    for (var ai = 0; ai < photoCache.albums.length; ai++) {
      var album = photoCache.albums[ai];
      if (album.dateRange && album.dateRange.from) {
        var albumDate = album.dateRange.from; // "2023-04-07" format
        if (albumDate.substring(5, 10) === monthDay && parseInt(albumDate.substring(0, 4)) < thisYear) {
          var yearsAgo = thisYear - parseInt(albumDate.substring(0, 4));
          briefingData.onThisDay.push({ name: album.name, yearsAgo: yearsAgo, photoCount: album.photoCount, path: album.path });
        }
      }
    }
    briefingData.onThisDay.sort(function(a, b) { return a.yearsAgo - b.yearsAgo; });
  }
} catch(e) { ctx.log("On This Day failed: " + (e.message || e)); }

// Fresh Videos — new videos from YouTube subscriptions
try {
  var ytCachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "youtube-data.json");
  var ytCache = null;
  try { ytCache = JSON.parse(fs.readFileSync(ytCachePath, "utf-8")); } catch(e) {}
  if (ytCache && ytCache.feed) {
    for (var fi = 0; fi < Math.min(ytCache.feed.length, 20); fi++) {
      var video = ytCache.feed[fi];
      var videoId = video.videoId || (video.videoUrl || "").split("v=")[1] || "";
      briefingData.freshVideos.push({
        title: video.title,
        channel: video.channelTitle || "",
        publishedAt: video.publishedAt || "",
        thumbnailUrl: video.thumbnailUrl || (videoId ? "https://i.ytimg.com/vi/" + videoId + "/mqdefault.jpg" : ""),
        videoUrl: video.videoUrl || (videoId ? "https://www.youtube.com/watch?v=" + videoId : ""),
        viewCount: video.viewCount || "",
        duration: video.duration || "",
        description: (video.description || "").slice(0, 120)
      });
    }
  }
} catch(e) { ctx.log("Fresh Videos failed: " + (e.message || e)); }

// Reading Nudge — check Kindle last scan time
try {
  var scanLogPath = path.join(os.homedir(), ".enso", "data", "user-context", "scan-log.json");
  var scanLog = {};
  try { scanLog = JSON.parse(fs.readFileSync(scanLogPath, "utf-8")); } catch(e) {}
  var kindleCachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "kindle-library.json");
  var kindleCache = null;
  try { kindleCache = JSON.parse(fs.readFileSync(kindleCachePath, "utf-8")); } catch(e) {}
  if (kindleCache && kindleCache.books) {
    var totalBooks = kindleCache.books.length;
    var enrichedBooks = kindleCache.books.filter(function(b) { return b.enrichedAt; }).length;
    var topCategories = {};
    kindleCache.books.forEach(function(b) { (b.categories || []).forEach(function(c) { topCategories[c] = (topCategories[c] || 0) + 1; }); });
    var topCats = Object.entries(topCategories).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3).map(function(e) { return e[0]; });
    briefingData.readingNudge = { totalBooks: totalBooks, enriched: enrichedBooks, topCategories: topCats };
  }
} catch(e) { ctx.log("Reading Nudge failed: " + (e.message || e)); }

// Project Pulse — recent activity and stale projects
try {
  var fileCachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "file-index.json");
  var fileCache = null;
  try { fileCache = JSON.parse(fs.readFileSync(fileCachePath, "utf-8")); } catch(e) {}
  if (fileCache && fileCache.projects) {
    var oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    var active = [];
    var stale = [];
    for (var pi = 0; pi < fileCache.projects.length; pi++) {
      var proj = fileCache.projects[pi];
      if (proj.lastModified && proj.lastModified > oneWeekAgo) {
        active.push({ name: proj.name, tech: (proj.technologies || []).join(", ") });
      } else if (proj.lastModified && proj.lastModified < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) {
        stale.push({ name: proj.name, tech: (proj.technologies || []).join(", ") });
      }
    }
    briefingData.projectPulse = { active: active.slice(0, 5), stale: stale.slice(0, 3), total: fileCache.projects.length };
  }
} catch(e) { ctx.log("Project Pulse failed: " + (e.message || e)); }

// Knowledge Growth — Cortex stats
try {
  var wikiIndex = path.join(os.homedir(), ".enso", "wiki", "_index.md");
  if (fs.existsSync(wikiIndex)) {
    var indexContent = fs.readFileSync(wikiIndex, "utf-8");
    var totalPages = (indexContent.match(/^## /gm) || []).length;
    var entityCount = (indexContent.match(/entities\//g) || []).length;
    var conceptCount = (indexContent.match(/concepts\//g) || []).length;
    var sourceCount = (indexContent.match(/sources\//g) || []).length;
    var synthesisCount = (indexContent.match(/synthesis\//g) || []).length;
    briefingData.knowledgeGrowth = { totalPages: totalPages, entities: entityCount, concepts: conceptCount, sources: sourceCount, synthesis: synthesisCount };
  }
} catch(e) { ctx.log("Knowledge Growth failed: " + (e.message || e)); }

ctx.log("Briefing data gathered: " + briefingData.onThisDay.length + " memories, " + briefingData.freshVideos.length + " videos, " + (briefingData.projectPulse.active || []).length + " active projects");

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

    // Quick-add to Cortex link (for discovered entities)
    if (item.entityTitle && item.entityType) {
      var quickAddUrl = serverBaseUrl + "/api/cortex/quick-add?title=" + encodeURIComponent(item.entityTitle) + "&type=" + encodeURIComponent(item.entityType);
      if (item.entityCreator) quickAddUrl += "&creator=" + encodeURIComponent(item.entityCreator);
      emailBody += "<p style='margin:8px 0 0;'>";
      emailBody += "<a href='" + quickAddUrl + "' style='display:inline-block;padding:4px 10px;background:#059669;color:white;border-radius:4px;text-decoration:none;font-size:11px;font-weight:600;'>\uD83D\uDCE5 Add \"" + item.entityTitle + "\" to Cortex</a>";
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

// ── On This Day — photo memories ──
if (briefingData.onThisDay.length > 0) {
  emailBody += "<div style='margin:24px 0;padding:16px;background:#fff7ed;border-radius:8px;border:1px solid #fed7aa;'>";
  emailBody += "<h3 style='margin:0 0 10px;font-size:14px;color:#c2410c;'>📅 On This Day</h3>";
  for (var otdi = 0; otdi < Math.min(briefingData.onThisDay.length, 5); otdi++) {
    var memory = briefingData.onThisDay[otdi];
    emailBody += "<p style='margin:4px 0;font-size:13px;color:#9a3412;'><strong>" + memory.yearsAgo + " year" + (memory.yearsAgo > 1 ? "s" : "") + " ago</strong> — " + memory.name + " (" + memory.photoCount + " photos)</p>";
  }
  emailBody += "</div>";
}

// ── Fresh from Your Channels — YouTube (mobile-friendly card grid) ──
if (briefingData.freshVideos.length > 0) {
  emailBody += "<div style='margin:24px 0;padding:16px 16px 8px;background:linear-gradient(135deg,#1a1025,#1e1b3a);border-radius:12px;border:1px solid #3b2d5c;'>";
  emailBody += "<h3 style='margin:0 0 4px;font-size:18px;color:#e879f9;text-align:center;'>Your Daily YouTube Picks</h3>";
  var todayStr = new Date().toISOString().slice(0, 10);
  emailBody += "<p style='margin:0 0 14px;font-size:12px;color:#9ca3af;text-align:center;'>" + todayStr + " \u2014 Fresh from your subscriptions</p>";

  // 2-column grid using table for email compatibility
  emailBody += "<table cellpadding='0' cellspacing='0' border='0' width='100%' style='border-collapse:separate;border-spacing:8px;'>";
  var maxVids = Math.min(briefingData.freshVideos.length, 8);
  for (var fvi = 0; fvi < maxVids; fvi += 2) {
    emailBody += "<tr>";
    for (var col = 0; col < 2; col++) {
      var vidIdx = fvi + col;
      if (vidIdx < maxVids) {
        var vid = briefingData.freshVideos[vidIdx];
        var viewStr = "";
        if (vid.viewCount) {
          var vc = parseInt(vid.viewCount);
          if (vc >= 1000000) viewStr = (vc / 1000000).toFixed(1) + "M views";
          else if (vc >= 1000) viewStr = Math.round(vc / 1000) + "K views";
          else viewStr = vc + " views";
        }
        var timeStr = "";
        if (vid.publishedAt) {
          var pubDate = vid.publishedAt.slice(0, 10);
          timeStr = pubDate;
        }
        var metaParts = [];
        if (viewStr) metaParts.push(viewStr);
        if (vid.duration) metaParts.push(vid.duration);
        if (timeStr) metaParts.push(timeStr);

        emailBody += "<td width='50%' valign='top' style='padding:0;'>";
        emailBody += "<div style='background:#0f0d1a;border-radius:10px;overflow:hidden;border:1px solid #2d2640;'>";
        // Thumbnail with link
        if (vid.thumbnailUrl && vid.videoUrl) {
          emailBody += "<a href='" + vid.videoUrl + "' style='display:block;'>";
          emailBody += "<img src='" + vid.thumbnailUrl + "' alt='' width='100%' style='display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:10px 10px 0 0;' />";
          emailBody += "</a>";
        }
        emailBody += "<div style='padding:8px 10px 10px;'>";
        // Title
        if (vid.videoUrl) {
          emailBody += "<a href='" + vid.videoUrl + "' style='display:block;font-size:13px;font-weight:600;color:#e2e8f0;text-decoration:none;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;'>" + vid.title + "</a>";
        } else {
          emailBody += "<p style='margin:0;font-size:13px;font-weight:600;color:#e2e8f0;line-height:1.3;'>" + vid.title + "</p>";
        }
        // Channel name
        if (vid.channel) {
          emailBody += "<p style='margin:4px 0 0;font-size:11px;color:#e879f9;font-weight:500;'>" + vid.channel + "</p>";
        }
        // Meta line
        if (metaParts.length > 0) {
          emailBody += "<p style='margin:3px 0 0;font-size:10px;color:#6b7280;'>" + metaParts.join(" \u00B7 ") + "</p>";
        }
        // Description snippet
        if (vid.description) {
          emailBody += "<p style='margin:4px 0 0;font-size:10px;color:#4b5563;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;'>" + vid.description + "</p>";
        }
        emailBody += "</div></div></td>";
      } else {
        emailBody += "<td width='50%'></td>";
      }
    }
    emailBody += "</tr>";
  }
  emailBody += "</table>";

  if (briefingData.freshVideos.length > maxVids) {
    emailBody += "<p style='margin:8px 0 4px;font-size:11px;color:#9ca3af;text-align:center;'>+" + (briefingData.freshVideos.length - maxVids) + " more videos from your subscriptions</p>";
  }
  emailBody += "</div>";
}

// ── Reading Nudge — Kindle ──
if (briefingData.readingNudge) {
  var rn = briefingData.readingNudge;
  emailBody += "<div style='margin:24px 0;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;'>";
  emailBody += "<h3 style='margin:0 0 8px;font-size:14px;color:#166534;'>📚 Your Library</h3>";
  emailBody += "<p style='margin:4px 0;font-size:13px;color:#15803d;'>" + rn.totalBooks + " books in your Kindle library</p>";
  if (rn.topCategories.length > 0) {
    emailBody += "<p style='margin:4px 0;font-size:12px;color:#16a34a;'>Strongest in: " + rn.topCategories.join(", ") + "</p>";
  }
  emailBody += "</div>";
}

// ── Project Pulse ──
if (briefingData.projectPulse && (briefingData.projectPulse.active || []).length > 0) {
  var pp = briefingData.projectPulse;
  emailBody += "<div style='margin:24px 0;padding:16px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;'>";
  emailBody += "<h3 style='margin:0 0 8px;font-size:14px;color:#1e40af;'>💻 Project Pulse</h3>";
  if (pp.active.length > 0) {
    emailBody += "<p style='margin:4px 0;font-size:12px;color:#1e3a8a;font-weight:600;'>Active this week:</p>";
    for (var ppi = 0; ppi < pp.active.length; ppi++) {
      emailBody += "<p style='margin:2px 0 2px 12px;font-size:13px;color:#1e40af;'>• " + pp.active[ppi].name + " <span style='color:#60a5fa;'>(" + pp.active[ppi].tech + ")</span></p>";
    }
  }
  if (pp.stale.length > 0) {
    emailBody += "<p style='margin:8px 0 4px;font-size:12px;color:#6b7280;font-weight:600;'>Going stale (30+ days):</p>";
    for (var psi = 0; psi < pp.stale.length; psi++) {
      emailBody += "<p style='margin:2px 0 2px 12px;font-size:12px;color:#9ca3af;'>• " + pp.stale[psi].name + "</p>";
    }
  }
  emailBody += "</div>";
}

// ── Knowledge Growth ──
if (briefingData.knowledgeGrowth) {
  var kg = briefingData.knowledgeGrowth;
  emailBody += "<div style='margin:24px 0;padding:12px 16px;background:#f5f3ff;border-radius:8px;border:1px solid #ddd6fe;'>";
  emailBody += "<p style='margin:0;font-size:13px;color:#5b21b6;'>🧠 <strong>Cortex: " + kg.totalPages + " pages</strong> — " + kg.entities + " entities, " + kg.concepts + " concepts, " + kg.sources + " sources, " + kg.synthesis + " synthesis</p>";
  emailBody += "</div>";
}

// Library Connections — cross-source synthesis
var connectionTopics = Object.keys(libraryConnections);
if (connectionTopics.length > 0) {
  emailBody += "<div style='margin:24px 0;padding:16px;background:#faf5ff;border-radius:8px;border:1px solid #e9d5ff;'>";
  emailBody += "<h3 style='margin:0 0 12px;font-size:14px;color:#6b21a8;'>\uD83E\uDDE0 From Your Brain</h3>";
  for (var lci = 0; lci < connectionTopics.length; lci++) {
    var lcTopic = connectionTopics[lci];
    var lc = libraryConnections[lcTopic];
    emailBody += "<div style='margin:8px 0;padding:10px;background:white;border-radius:6px;border:1px solid #f3e8ff;'>";
    emailBody += "<p style='margin:0 0 4px;font-size:13px;color:#7c3aed;font-weight:600;'>" + lcTopic + "</p>";
    if (lc.narrative) {
      emailBody += "<p style='margin:0 0 6px;font-size:12px;color:#4c1d95;line-height:1.5;'>" + lc.narrative + "</p>";
    }
    if (lc.sources.length > 0) {
      emailBody += "<p style='margin:0;font-size:11px;color:#8b5cf6;'>Across: " + lc.sources.join(", ") + " (" + lc.totalMatches + " matches)</p>";
    }
    emailBody += "</div>";
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
    libraryConnections: libraryConnections,
    briefing: {
      onThisDay: briefingData.onThisDay,
      freshVideos: briefingData.freshVideos.length,
      readingNudge: briefingData.readingNudge,
      projectPulse: briefingData.projectPulse,
      knowledgeGrowth: briefingData.knowledgeGrowth
    },
    findings: sections.reduce(function(acc, s) {
      return acc.concat((s.items || []).map(function(item) {
        return { headline: item.headline, impact: item.impact, action: item.actionItem, connections: item.connections };
      }));
    }, [])
  }) }]
};
