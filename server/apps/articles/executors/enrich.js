// Articles — Enrich: fetch OpenGraph metadata for articles missing images/metadata
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

ctx.log("Article enrichment starting...");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var articles = [];

try {
  if (fs.existsSync(indexPath)) {
    var entityIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    var entries = Object.values(entityIndex);
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.type === "article") {
        // Check if needs enrichment (missing image, author, or URL)
        var meta = e.metadata || {};
        var needsEnrich = !e.imageUrl || !meta.author || !meta.url;
        if (needsEnrich) {
          articles.push(e);
        }
      }
    }
  }
} catch(e) { ctx.log("Index read error: " + (e.message || e)); }

ctx.log("Found " + articles.length + " articles needing enrichment");

var enriched = 0;
var errors = 0;
var limit = p.limit || 20;

for (var ai = 0; ai < Math.min(articles.length, limit); ai++) {
  var article = articles[ai];
  try {
    // Trigger the enrichment pipeline via the server
    var response = await ctx.fetch("http://localhost:3001/api/cortex-enrich?entityId=" + encodeURIComponent(article.entityId), {
      method: "POST",
      headers: { "Origin": "http://localhost:3001" },
    });
    if (response.ok || (response.data && response.data.success)) {
      enriched++;
      ctx.log("Enriched: " + article.title);
    } else {
      errors++;
      ctx.log("Failed: " + article.title);
    }
  } catch(e) {
    errors++;
    ctx.log("Error enriching " + article.title + ": " + (e.message || e));
  }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_articles_enrich",
  totalNeedingEnrichment: articles.length,
  enriched: enriched,
  errors: errors,
  limit: limit,
}) }] };
