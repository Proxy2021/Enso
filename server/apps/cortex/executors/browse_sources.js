var result = {};

// Read cache files from the data source directory
var cacheDir = require("os").homedir() + "/.enso/data/user-context/cache";
var fs = require("fs");

function readCacheFile(filename) {
  try {
    var path = cacheDir + "/" + filename;
    if (fs.existsSync(path)) return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch (e) { /* ignore */ }
  return null;
}

// Read wiki index to check which items have wiki pages
var wikiDir = require("os").homedir() + "/.enso/wiki";
var existingPages = new Set();
try {
  var indexPath = wikiDir + "/_index.md";
  if (fs.existsSync(indexPath)) {
    var idx = fs.readFileSync(indexPath, "utf-8");
    var matches = idx.matchAll(/^## (.+\.md)$/gm);
    for (var m of matches) existingPages.add(m[1]);
  }
} catch (e) { /* ignore */ }

function hasWikiPage(title) {
  var slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return existingPages.has("entities/" + slug + ".md");
}

function wikiPath(title) {
  var slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return "entities/" + slug + ".md";
}

var selectedSource = (params && params.source) || "kindleLibrary";
var filterCategory = (params && params.category) || null;
var searchQuery = (params && params.query) || "";

var sources = [];

// Kindle Library
var kindle = readCacheFile("kindle-library.json");
if (kindle && kindle.books && kindle.books.length > 0) {
  var books = kindle.books;
  // Extract unique categories with counts
  var catCounts = {};
  for (var b of books) {
    if (b.categories) {
      for (var c of b.categories) {
        catCounts[c] = (catCounts[c] || 0) + 1;
      }
    }
  }
  var categories = Object.entries(catCounts)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 20)
    .map(function(e) { return { name: e[0], count: e[1] }; });

  // Apply filters
  var filtered = books;
  if (filterCategory && selectedSource === "kindleLibrary") {
    filtered = books.filter(function(b) { return b.categories && b.categories.includes(filterCategory); });
  }
  if (searchQuery && selectedSource === "kindleLibrary") {
    var q = searchQuery.toLowerCase();
    filtered = filtered.filter(function(b) {
      return b.title.toLowerCase().includes(q) || (b.author && b.author.toLowerCase().includes(q));
    });
  }

  sources.push({
    id: "kindleLibrary",
    label: "Kindle Library",
    icon: "📚",
    totalItems: kindle.totalBooks || books.length,
    filteredCount: filtered.length,
    categories: categories,
    items: filtered.map(function(b) {
      return {
        title: b.title,
        subtitle: b.author,
        imageUrl: b.coverUrl,
        description: b.description,
        rating: b.rating,
        reviewCount: b.reviewCount,
        pageCount: b.pageCount,
        publisher: b.publisher,
        publicationDate: b.publicationDate,
        categories: b.categories,
        externalUrl: b.readerUrl,
        asin: b.asin,
        hasWikiPage: hasWikiPage(b.title),
        wikiPath: wikiPath(b.title),
      };
    }),
  });
}

// Bookmarks
var bookmarks = readCacheFile("bookmarks.json");
if (bookmarks && bookmarks.folders && bookmarks.folders.length > 0) {
  var allBookmarks = [];
  for (var folder of bookmarks.folders) {
    for (var bm of (folder.bookmarks || [])) {
      allBookmarks.push({
        title: bm.title,
        subtitle: folder.folder,
        externalUrl: bm.url,
        hasWikiPage: false,
        wikiPath: null,
      });
    }
  }
  sources.push({
    id: "bookmarks",
    label: "Bookmarks",
    icon: "🔖",
    totalItems: bookmarks.totalBookmarks || allBookmarks.length,
    filteredCount: allBookmarks.length,
    categories: bookmarks.folders.map(function(f) { return { name: f.folder, count: f.count || f.bookmarks.length }; }),
    items: allBookmarks,
  });
}

// Projects
var files = readCacheFile("file-index.json");
if (files && files.projects && files.projects.length > 0) {
  sources.push({
    id: "files",
    label: "Projects",
    icon: "📁",
    totalItems: files.projects.length,
    filteredCount: files.projects.length,
    categories: [],
    items: files.projects.map(function(p) {
      return {
        title: p.name,
        subtitle: p.technologies ? p.technologies.join(", ") : p.type,
        description: "Type: " + p.type + " | Path: " + p.path,
        hasWikiPage: hasWikiPage(p.name),
        wikiPath: wikiPath(p.name),
      };
    }),
  });
}

// Browser History
var browser = readCacheFile("browser-history.json");
if (browser && browser.topDomains && browser.topDomains.length > 0) {
  sources.push({
    id: "browserHistory",
    label: "Browser",
    icon: "🌐",
    totalItems: browser.topDomains.length,
    filteredCount: browser.topDomains.length,
    categories: [],
    items: browser.topDomains.map(function(d) {
      return {
        title: d.domain,
        subtitle: d.visits + " visits",
        externalUrl: "https://" + d.domain,
        hasWikiPage: hasWikiPage(d.domain),
        wikiPath: wikiPath(d.domain),
      };
    }),
  });
}

// Email
var email = readCacheFile("email-summary.json");
if (email && email.topSenders && email.topSenders.length > 0) {
  sources.push({
    id: "email",
    label: "Email",
    icon: "📧",
    totalItems: email.topSenders.length,
    filteredCount: email.topSenders.length,
    categories: [],
    items: email.topSenders.map(function(s) {
      return {
        title: s.from,
        subtitle: s.count + " messages",
        hasWikiPage: false,
        wikiPath: null,
      };
    }),
  });
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_browse_sources",
  sources: sources,
  selectedSource: selectedSource,
  selectedCategory: filterCategory,
  searchQuery: searchQuery,
  totalSources: sources.length,
}) }] };