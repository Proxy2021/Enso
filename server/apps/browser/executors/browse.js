var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
var view = params.view || "history";

// Wiki page lookup
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

if (view === "bookmarks") {
  // ── Bookmarks view ──
  var bkFile = path.join(cacheDir, "bookmarks.json");
  var folders = [];
  var totalBookmarks = 0;
  try {
    var bkData = JSON.parse(fs.readFileSync(bkFile, "utf-8"));
    folders = bkData.folders || [];
    totalBookmarks = bkData.totalBookmarks || 0;
  } catch (e) {
    result = { tool: "enso_browser_data_browse", view: "bookmarks", totalBookmarks: 0, folders: [], error: "No bookmarks cached." };
    return;
  }

  if (params.folder) {
    var folderName = params.folder.toLowerCase();
    folders = folders.filter(function(f) { return f.folder.toLowerCase().indexOf(folderName) >= 0; });
  }
  if (params.query) {
    var q = params.query.toLowerCase();
    folders = folders.map(function(f) {
      var filtered = f.bookmarks.filter(function(b) {
        return (b.title && b.title.toLowerCase().indexOf(q) >= 0) || (b.url && b.url.toLowerCase().indexOf(q) >= 0);
      });
      return { folder: f.folder, count: filtered.length, bookmarks: filtered };
    }).filter(function(f) { return f.count > 0; });
  }

  result = { tool: "enso_browser_data_browse", view: "bookmarks", totalBookmarks: totalBookmarks, folder: params.folder || null, query: params.query || null, folders: folders };

} else {
  // ── History view (default) ──
  var histFile = path.join(cacheDir, "browser-history.json");
  var topDomains = [];
  var recentSearches = [];
  var recentPages = [];
  var totalEntries = 0;
  try {
    var histData = JSON.parse(fs.readFileSync(histFile, "utf-8"));
    topDomains = histData.topDomains || [];
    recentSearches = histData.recentSearches || [];
    recentPages = histData.recentPages || [];
    totalEntries = histData.totalEntries || 0;
  } catch (e) {
    result = { tool: "enso_browser_data_browse", view: "history", totalEntries: 0, topDomains: [], recentSearches: [], recentPages: [], error: "No browser history cached." };
    return;
  }

  if (params.query) {
    var q2 = params.query.toLowerCase();
    topDomains = topDomains.filter(function(d) { return d.domain.toLowerCase().indexOf(q2) >= 0; });
    recentSearches = recentSearches.filter(function(s) { return ((typeof s === "string") ? s : (s.query || "")).toLowerCase().indexOf(q2) >= 0; });
    recentPages = recentPages.filter(function(p) { return (p.title && p.title.toLowerCase().indexOf(q2) >= 0) || (p.domain && p.domain.toLowerCase().indexOf(q2) >= 0); });
  }

  var domainsWithWiki = topDomains.map(function(d) {
    var slug = slugify(d.domain);
    return { domain: d.domain, visits: d.visits, hasWikiPage: existingPages.has("entities/" + slug + ".md"), wikiPath: "entities/" + slug + ".md" };
  });

  result = { tool: "enso_browser_data_browse", view: "history", totalEntries: totalEntries, query: params.query || null, topDomains: domainsWithWiki, recentSearches: recentSearches, recentPages: recentPages };
}
