var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheFile = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "browser-history.json");
var topDomains = [];
var recentSearches = [];
var recentPages = [];
var totalEntries = 0;

try {
  var raw = fs.readFileSync(cacheFile, "utf-8");
  var data = JSON.parse(raw);
  topDomains = data.topDomains || [];
  recentSearches = data.recentSearches || [];
  recentPages = data.recentPages || [];
  totalEntries = data.totalEntries || 0;
} catch (e) {
  result = {
    tool: "enso_browser_history_browse",
    totalEntries: 0,
    topDomains: [],
    recentSearches: [],
    recentPages: [],
    error: "No browser history cached. Run a scan first.",
  };
  return;
}

// Apply query filter if provided
if (params.query) {
  var q = params.query.toLowerCase();
  topDomains = topDomains.filter(function(d) {
    return d.domain.toLowerCase().indexOf(q) >= 0;
  });
  recentSearches = recentSearches.filter(function(s) {
    var text = (typeof s === "string") ? s : (s.query || "");
    return text.toLowerCase().indexOf(q) >= 0;
  });
  recentPages = recentPages.filter(function(p) {
    return (p.title && p.title.toLowerCase().indexOf(q) >= 0) ||
      (p.domain && p.domain.toLowerCase().indexOf(q) >= 0);
  });
}

// Check wiki for existing pages per domain
var wikiDir = path.join(os.homedir(), ".enso", "wiki");
var indexPath = path.join(wikiDir, "_index.md");
var existingPages = new Set();
try {
  if (fs.existsSync(indexPath)) {
    var idx = fs.readFileSync(indexPath, "utf-8");
    var matches = idx.matchAll(/^## (.+\.md)$/gm);
    for (var m of matches) existingPages.add(m[1]);
  }
} catch (e) {}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

var domainsWithWiki = topDomains.map(function(d) {
  var slug = slugify(d.domain);
  return {
    domain: d.domain,
    visits: d.visits,
    hasWikiPage: existingPages.has("entities/" + slug + ".md"),
    wikiPath: "entities/" + slug + ".md",
  };
});

result = {
  tool: "enso_browser_history_browse",
  totalEntries: totalEntries,
  query: params.query || null,
  topDomains: domainsWithWiki,
  recentSearches: recentSearches,
  recentPages: recentPages,
};
