// Cortex Daily Discovery v2 — deep analysis, personalized relevance, executive summary

// Determine server base URL for quick-add links in email
var serverBaseUrl = "http://localhost:3001";
try {
  if (process.env.ENSO_TUNNEL_URL) {
    serverBaseUrl = process.env.ENSO_TUNNEL_URL;
  } else if (process.env.ENSO_MACHINE_NAME) {
    serverBaseUrl = "https://" + process.env.ENSO_MACHINE_NAME + ".enso.net";
  }
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
  var searchTopic = topic.length > 80 ? topic.slice(0, 80).replace(/\s+\S*$/, "") : topic;
  try {
    var webResult = await ctx.search(searchTopic + " latest news 2026", { count: 5 });
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
  // Read the user profile + active focus areas from the filesystem so the analyst
  // can prioritize findings that advance the user's actual goals
  var personalContext = "";
  try {
    var os = require("os");
    var path = require("path");
    var fs = require("fs");
    var ensoHome = process.env.ENSO_HOME || path.join(os.homedir(), ".enso");
    var profilePath = path.join(ensoHome, "wiki", "synthesis", "user-profile.md");
    if (fs.existsSync(profilePath)) {
      personalContext += "## Who the user is\n" + fs.readFileSync(profilePath, "utf8").slice(0, 800) + "\n\n";
    }
    var focusStatePath = path.join(ensoHome, "data", "focus-areas.json");
    if (fs.existsSync(focusStatePath)) {
      var focusState = JSON.parse(fs.readFileSync(focusStatePath, "utf8"));
      var active = (focusState.areas || []).filter(function(a) { return a.status === "active" || a.status === "emerging"; });
      if (active.length > 0) {
        personalContext += "## User's active focus areas\nWeight findings that advance these higher:\n" +
          active.map(function(a) { return "- **" + a.title + "**: " + (a.intent || a.description || ""); }).join("\n") + "\n\n";
      }
    }
  } catch(e) { /* non-critical */ }

  try {
    var analysisPrompt = "You are a personal intelligence analyst. Your client has a Knowledge Cortex (personal knowledge base) with these topics:\n\n" +
      knowledgeProfile.slice(0, 3000) +
      "\n\n---\n\n" + personalContext +
      "---\n\nHere are today's web search results across their tracked topics:\n\n" +
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

// ── Step 5: Build shareable page via enso_pages_create ──
var emailSent = false;
var categoryIcons = { breaking: "\u26A1", strategic: "\uD83C\uDFAF", update: "\uD83D\uDD04", emerging: "\uD83C\uDF31" };

var pageSections = [];

// Stats bar
pageSections.push({
  type: "stats",
  items: [
    { label: "Topics Scanned", value: String(topicsSearched), icon: "\uD83D\uDD0D" },
    { label: "Findings", value: String(totalItems), icon: "\uD83D\uDCCA" },
    { label: "Cortex Pages", value: String(pagesCreated.length + pagesUpdated.length), icon: "\uD83D\uDCDD" }
  ]
});

// Executive Summary
if (analysisResult && analysisResult.executiveSummary) {
  pageSections.push({ type: "text", title: "\uD83D\uDCCB Executive Summary", content: analysisResult.executiveSummary, style: "blockquote" });
}

// Weekly Theme
if (analysisResult && analysisResult.weeklyTheme) {
  pageSections.push({ type: "text", title: "\uD83D\uDD2E Weekly Theme", content: analysisResult.weeklyTheme });
}

// Findings sections
for (var es = 0; es < sections.length; es++) {
  var sect = sections[es];
  var sItems = sect.items || [];
  if (sItems.length === 0) continue;

  var catIcon = categoryIcons[sect.category] || "\uD83D\uDCCC";
  var findingItems = [];
  for (var ei = 0; ei < sItems.length; ei++) {
    var item = sItems[ei];
    var idx2 = (item.index || 0) - 1;
    var source2 = (idx2 >= 0 && idx2 < allFindings.length) ? allFindings[idx2] : null;
    findingItems.push({
      headline: item.headline,
      analysis: item.analysis,
      impact: item.impact || "low",
      topic: source2 ? source2.topic : undefined,
      url: source2 ? source2.url : undefined,
      actionItem: item.actionItem,
      connections: item.connections
    });
  }
  pageSections.push({ type: "findings", title: catIcon + " " + (sect.categoryLabel || sect.category), items: findingItems });
}

// Blind Spots
if (analysisResult && analysisResult.blindSpots && analysisResult.blindSpots.length > 0) {
  pageSections.push({
    type: "list", title: "\uD83D\uDCA1 Blind Spots \u2014 Topics Worth Tracking",
    items: analysisResult.blindSpots.map(function(bs) { return { text: bs }; })
  });
}

// On This Day photo memories
if (briefingData.onThisDay.length > 0) {
  pageSections.push({
    type: "list", title: "\uD83D\uDCC5 On This Day",
    items: briefingData.onThisDay.slice(0, 5).map(function(m) {
      return { text: m.yearsAgo + " year" + (m.yearsAgo > 1 ? "s" : "") + " ago \u2014 " + m.name, detail: m.photoCount + " photos" };
    })
  });
}

// Fresh YouTube videos
if (briefingData.freshVideos.length > 0) {
  pageSections.push({
    type: "video-grid", title: "\uD83D\uDCFA Your Daily YouTube Picks",
    videos: briefingData.freshVideos.slice(0, 8).map(function(v) {
      return { title: v.title, channel: v.channel, thumbnailUrl: v.thumbnailUrl, videoUrl: v.videoUrl, viewCount: v.viewCount, duration: v.duration, description: v.description };
    })
  });
}

// Reading Nudge
if (briefingData.readingNudge) {
  var rn = briefingData.readingNudge;
  var rnText = rn.totalBooks + " books in your Kindle library";
  if (rn.topCategories && rn.topCategories.length > 0) rnText += " \u2022 Strongest in: " + rn.topCategories.join(", ");
  pageSections.push({ type: "text", title: "\uD83D\uDCDA Your Library", content: rnText });
}

// Project Pulse
if (briefingData.projectPulse && (briefingData.projectPulse.active || []).length > 0) {
  var pp = briefingData.projectPulse;
  var ppItems = [];
  for (var ppi = 0; ppi < pp.active.length; ppi++) {
    ppItems.push({ text: pp.active[ppi].name, detail: pp.active[ppi].tech });
  }
  if (pp.stale && pp.stale.length > 0) {
    for (var psi = 0; psi < pp.stale.length; psi++) {
      ppItems.push({ text: pp.stale[psi].name + " (stale 30+ days)" });
    }
  }
  pageSections.push({ type: "list", title: "\uD83D\uDCBB Project Pulse", items: ppItems });
}

// Knowledge Growth
if (briefingData.knowledgeGrowth) {
  var kg = briefingData.knowledgeGrowth;
  pageSections.push({
    type: "stats",
    items: [
      { label: "Total Pages", value: String(kg.totalPages), icon: "\uD83E\uDDE0" },
      { label: "Entities", value: String(kg.entities) },
      { label: "Concepts", value: String(kg.concepts) },
      { label: "Sources", value: String(kg.sources) },
      { label: "Synthesis", value: String(kg.synthesis) }
    ]
  });
}

// Library Connections — cross-source synthesis
var connectionTopics = Object.keys(libraryConnections);
if (connectionTopics.length > 0) {
  var connItems = [];
  for (var lci = 0; lci < connectionTopics.length; lci++) {
    var lcTopic = connectionTopics[lci];
    var lc = libraryConnections[lcTopic];
    connItems.push({
      text: lcTopic + (lc.narrative ? " \u2014 " + lc.narrative : ""),
      detail: lc.sources.length > 0 ? "Across: " + lc.sources.join(", ") + " (" + lc.totalMatches + " matches)" : undefined
    });
  }
  pageSections.push({ type: "list", title: "\uD83E\uDDE0 From Your Brain", items: connItems });
}

// Cortex Updates
if (pagesCreated.length > 0 || pagesUpdated.length > 0) {
  var updateItems = [];
  if (pagesCreated.length > 0) updateItems.push({ text: "New pages: " + pagesCreated.join(", ") });
  if (pagesUpdated.length > 0) updateItems.push({ text: "Updated: " + pagesUpdated.join(", ") });
  pageSections.push({ type: "list", title: "\uD83D\uDCDD Cortex Auto-Updated", items: updateItems });
}

// Tracked Topics
pageSections.push({
  type: "tags", title: "\uD83C\uDFAF Tracked Topics",
  tags: ranked.map(function(r) { return { label: r.title, color: "#312e81" }; })
});

// Create the shareable page via tool
var pageId = "discovery-" + new Date().toISOString().slice(0, 10);
var pageResult = null;
try {
  pageResult = await ctx.callTool("enso_pages_create", {
    id: pageId,
    title: "\uD83E\uDDE0 Cortex Daily Discovery",
    subtitle: ctx.formatDate() + " \u2014 " + topicsSearched + " topics scanned \u2022 " + totalItems + " significant findings",
    badge: { label: "Daily Intelligence Briefing", color: "#312e81" },
    sections: pageSections,
    footer: "Enso Knowledge Cortex \u2022 Your AI-maintained intelligence system",
    meta: { description: analysisResult ? analysisResult.executiveSummary : "" }
  });
  if (pageResult && pageResult.data) pageResult = pageResult.data;
  ctx.log("Shareable page created: " + (pageResult && pageResult.shortUrl ? pageResult.shortUrl : "unknown"));
} catch(e) {
  ctx.log("Page creation failed: " + (e.message || e));
}

// Send email with link to the hosted page
var emailTo = await ctx.store.get("discovery_email_to");
if (!emailTo && pageResult && pageResult.notifyEmail) emailTo = pageResult.notifyEmail;
if (!emailTo) emailTo = "";

if (emailTo && pageResult && pageResult.shortUrl) {
  var summaryPreview = analysisResult && analysisResult.executiveSummary ? analysisResult.executiveSummary.slice(0, 300) : "";
  var emailHtml = "<div style='font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:12px;overflow:hidden'>";
  emailHtml += "<div style='padding:24px;text-align:center;background:linear-gradient(135deg,#1e1b4b,#312e81)'>";
  emailHtml += "<h1 style='color:white;font-size:22px;margin:0 0 4px'>\uD83E\uDDE0 Cortex Daily Discovery</h1>";
  emailHtml += "<p style='color:#a5b4fc;font-size:13px;margin:4px 0'>" + ctx.formatDate() + " \u2014 " + topicsSearched + " topics \u2022 " + totalItems + " findings</p>";
  emailHtml += "</div>";
  emailHtml += "<div style='padding:16px 24px'>";
  if (summaryPreview) emailHtml += "<p style='color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 16px'>" + summaryPreview + (summaryPreview.length >= 300 ? "..." : "") + "</p>";
  emailHtml += "<div style='text-align:center'>";
  emailHtml += "<a href='" + pageResult.shortUrl + "' style='display:inline-block;background:#7c3aed;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px'>View Full Briefing \u2192</a>";
  emailHtml += "</div></div>";
  emailHtml += "<div style='padding:12px 24px;text-align:center;border-top:1px solid #2a2a4a'>";
  emailHtml += "<p style='color:#475569;font-size:11px;margin:0'>Enso AI \u2022 " + ctx.formatDate() + "</p>";
  emailHtml += "</div></div>";

  try {
    var emailResult = await ctx.callTool("enso_email_send", {
      to: emailTo,
      subject: "\uD83E\uDDE0 Cortex Intelligence Briefing \u2014 " + ctx.formatDate(),
      body: emailHtml,
      html: true
    });
    emailSent = emailResult.success;
    ctx.log("Email " + (emailSent ? "sent" : "failed"));
  } catch(e) {
    ctx.log("Email failed: " + (e.message || e));
  }
} else {
  ctx.log("Email skipped: " + (!emailTo ? "no recipient configured" : "page creation failed"));
}

// ── Step 6: Send WeChat notification ──
var wechatSent = false;
if (pageResult && pageResult.shortUrl) {
  try {
    var followers = await ctx.callTool("enso_wechat_followers", {});
    var followerList = (followers && followers.data && followers.data.followers) || [];
    if (followerList.length > 0) {
      var wcResult = await ctx.callTool("enso_wechat_send", {
        to: followerList[0].openId,
        type: "news",
        title: "\uD83E\uDDE0 Daily Discovery",
        content: topicsSearched + " topics \u00B7 " + totalItems + " findings",
        url: pageResult.shortUrl
      });
      wechatSent = !!(wcResult && wcResult.data && wcResult.data.success);
    }
  } catch(e) { ctx.log("WeChat send failed: " + (e.message || e)); }
}

return {
  content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_daily_discovery",
    topicsSearched: topicsSearched,
    newFindings: totalItems,
    pagesCreated: pagesCreated,
    pagesUpdated: pagesUpdated,
    emailSent: emailSent,
    wechatSent: wechatSent,
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
