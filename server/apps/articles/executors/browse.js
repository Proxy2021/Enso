// Articles — Browse saved articles from Cortex
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

// Read entity index for article entities
var articles = [];
try {
  var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
  if (fs.existsSync(indexPath)) {
    var entityIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    var entries = Object.values(entityIndex);
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.type === "article") {
        // Read cortex page for description
        var desc = "";
        if (e.cortexPath) {
          try {
            var pagePath = path.join(os.homedir(), ".enso", "wiki", e.cortexPath);
            if (fs.existsSync(pagePath)) {
              var content = fs.readFileSync(pagePath, "utf-8");
              var descMatch = content.match(/## Overview\n\n([\s\S]*?)(?=\n## |\n\*Enriched)/);
              if (descMatch) desc = descMatch[1].trim().slice(0, 300);
            }
          } catch(ex) {}
        }
        articles.push({
          entityId: e.entityId,
          title: e.title,
          source: e.source,
          tags: e.tags || [],
          updatedAt: e.updatedAt,
          description: desc,
          imageUrl: e.imageUrl,
        });
      }
    }
  }
} catch(e) {}

// Filter by query
if (p.query) {
  var q = p.query.toLowerCase();
  articles = articles.filter(function(a) {
    return a.title.toLowerCase().indexOf(q) >= 0 ||
      (a.description && a.description.toLowerCase().indexOf(q) >= 0) ||
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

// Sort by most recent
articles.sort(function(a, b) {
  return (b.updatedAt || "").localeCompare(a.updatedAt || "");
});

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_articles_browse",
  totalArticles: articles.length,
  query: p.query || null,
  topic: p.topic || null,
  articles: articles.slice(0, 50),
}) }] };
