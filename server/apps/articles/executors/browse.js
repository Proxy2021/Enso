// Articles — Browse saved articles from Cortex with rich metadata
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

// Read entity index for article entities
var articles = [];
var topicCounts = {};
try {
  var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
  if (fs.existsSync(indexPath)) {
    var entityIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    var entries = Object.values(entityIndex);
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.type === "article") {
        var meta = e.metadata || {};

        // Extract URL from metadata or cortex page
        var url = meta.url || meta.sourceUrl || "";
        if (!url && e.cortexPath) {
          try {
            var pagePath = path.join(os.homedir(), ".enso", "wiki", e.cortexPath);
            if (fs.existsSync(pagePath)) {
              var content = fs.readFileSync(pagePath, "utf-8");
              var urlMatch = content.match(/\*\*(?:URL|Source Link)\*\*:\s*\[.*?\]\((https?:\/\/[^\s)]+)\)/);
              if (urlMatch) url = urlMatch[1];
            }
          } catch(ex) {}
        }

        // Read description from cortex page if not in metadata
        var desc = meta.description || "";
        if (!desc && e.cortexPath) {
          try {
            var pagePath2 = path.join(os.homedir(), ".enso", "wiki", e.cortexPath);
            if (fs.existsSync(pagePath2)) {
              var content2 = fs.readFileSync(pagePath2, "utf-8");
              var descMatch = content2.match(/## Overview\n\n([\s\S]*?)(?=\n## |\n\*Enriched)/);
              if (descMatch) desc = descMatch[1].trim().slice(0, 400);
            }
          } catch(ex) {}
        }

        // Count topics for filtering
        var tags = (e.tags || []).filter(function(t) {
          return t !== "article" && t !== "research" && t !== "manual" && t !== "enriched" && t !== "cortex";
        });
        tags.forEach(function(t) { topicCounts[t] = (topicCounts[t] || 0) + 1; });

        // Extract domain from URL
        var domain = "";
        if (url) try { domain = new URL(url).hostname.replace("www.", ""); } catch(ex) {}

        articles.push({
          entityId: e.entityId,
          title: e.title,
          source: e.source,
          url: url,
          domain: domain || meta.siteName || e.source || "",
          author: meta.author || "",
          publishedDate: meta.publishedDate || "",
          readTime: meta.readTime || "",
          imageUrl: e.imageUrl || "",
          tags: tags,
          updatedAt: e.updatedAt,
          description: desc.slice(0, 400),
          hasPodcast: false,
        });
      }
    }
  }
} catch(e) { ctx.log("Browse error: " + (e.message || e)); }

// Check which articles have deep content podcasts
var deepContentDir = path.join(os.homedir(), ".enso", "data", "deep-content");
try {
  if (fs.existsSync(deepContentDir)) {
    var dcFiles = fs.readdirSync(deepContentDir).filter(function(f) { return f.endsWith(".json"); });
    var dcSet = {};
    dcFiles.forEach(function(f) { dcSet[f.replace(".json", "")] = true; });
    articles.forEach(function(a) {
      var slug = a.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (dcSet[slug] || dcSet["research_article_" + slug]) a.hasPodcast = true;
    });
  }
} catch(e) {}

// Filter by query
if (p.query) {
  var q = p.query.toLowerCase();
  articles = articles.filter(function(a) {
    return a.title.toLowerCase().indexOf(q) >= 0 ||
      (a.description && a.description.toLowerCase().indexOf(q) >= 0) ||
      a.author.toLowerCase().indexOf(q) >= 0 ||
      a.domain.toLowerCase().indexOf(q) >= 0 ||
      a.tags.some(function(t) { return t.toLowerCase().indexOf(q) >= 0; });
  });
}

// Filter by topic
if (p.topic) {
  var topic = p.topic.toLowerCase();
  articles = articles.filter(function(a) {
    return a.tags.some(function(t) { return t.toLowerCase().indexOf(topic) >= 0; });
  });
}

// Sort
var sortBy = p.sortBy || "date";
if (sortBy === "title") {
  articles.sort(function(a, b) { return a.title.localeCompare(b.title); });
} else {
  articles.sort(function(a, b) {
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
}

// Pagination
var page = Math.max(1, p.page || 1);
var pageSize = Math.min(50, p.pageSize || 20);
var totalArticles = articles.length;
var paged = articles.slice((page - 1) * pageSize, page * pageSize);

// Build top topics for filter
var topics = Object.keys(topicCounts)
  .sort(function(a, b) { return topicCounts[b] - topicCounts[a]; })
  .slice(0, 15);

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_articles_browse",
  totalArticles: totalArticles,
  query: p.query || null,
  topic: p.topic || null,
  sortBy: sortBy,
  page: page,
  pageSize: pageSize,
  totalPages: Math.ceil(totalArticles / pageSize),
  topics: topics,
  articles: paged,
}) }] };
