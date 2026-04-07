var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheFile = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "kindle-library.json");
var books = [];
var totalBooks = 0;

try {
  var raw = fs.readFileSync(cacheFile, "utf-8");
  var data = JSON.parse(raw);
  books = data.books || [];
  totalBooks = data.totalBooks || books.length;
} catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_kindle_browse", totalBooks: 0, filteredCount: 0, books: [], categories: [], error: "No Kindle library cached. Run a scan first." }) }] };
}

// Build category index
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
  .slice(0, 25)
  .map(function(e) { return { name: e[0], count: e[1] }; });

// Apply filters
var p = params || {};
var filtered = books;
if (p.category) {
  filtered = filtered.filter(function(b) { return b.categories && b.categories.indexOf(p.category) >= 0; });
}
if (p.query) {
  var q = p.query.toLowerCase();
  filtered = filtered.filter(function(b) {
    return b.title.toLowerCase().indexOf(q) >= 0 ||
      (b.author && b.author.toLowerCase().indexOf(q) >= 0) ||
      (b.description && b.description.toLowerCase().indexOf(q) >= 0);
  });
}

// Sort
var sortBy = p.sortBy || "title";
if (sortBy === "rating") {
  filtered.sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); });
} else if (sortBy === "pageCount") {
  filtered.sort(function(a, b) { return (b.pageCount || 0) - (a.pageCount || 0); });
} else if (sortBy === "author") {
  filtered.sort(function(a, b) { return (a.author || "").localeCompare(b.author || ""); });
} else {
  filtered.sort(function(a, b) { return (a.title || "").localeCompare(b.title || ""); });
}

// Check wiki pages
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

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_kindle_browse",
  totalBooks: totalBooks,
  filteredCount: filtered.length,
  category: p.category || null,
  query: p.query || null,
  sortBy: sortBy,
  categories: categories,
  books: filtered.slice(0, 200).map(function(b) {
    var slug = slugify(b.title);
    return {
      title: b.title,
      author: b.author,
      coverUrl: b.coverUrl,
      description: b.description,
      rating: b.rating,
      reviewCount: b.reviewCount,
      pageCount: b.pageCount,
      publisher: b.publisher,
      publicationDate: b.publicationDate,
      categories: b.categories,
      readerUrl: b.readerUrl,
      asin: b.asin,
      hasWikiPage: existingPages.has("entities/" + slug + ".md"),
      wikiPath: "entities/" + slug + ".md",
    };
  }),
}) }] };
