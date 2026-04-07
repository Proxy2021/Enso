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

// Sort — default to publication date (newest first)
var sortBy = p.sortBy || "publicationDate";
if (sortBy === "publicationDate") {
  filtered.sort(function(a, b) {
    var da = a.publicationDate ? new Date(a.publicationDate).getTime() : 0;
    var db = b.publicationDate ? new Date(b.publicationDate).getTime() : 0;
    return db - da; // newest first
  });
} else if (sortBy === "rating") {
  filtered.sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); });
} else if (sortBy === "pageCount") {
  filtered.sort(function(a, b) { return (b.pageCount || 0) - (a.pageCount || 0); });
} else if (sortBy === "author") {
  filtered.sort(function(a, b) { return (a.author || "").localeCompare(b.author || ""); });
} else if (sortBy === "title") {
  filtered.sort(function(a, b) { return (a.title || "").localeCompare(b.title || ""); });
} else if (sortBy === "reviewCount") {
  filtered.sort(function(a, b) { return (b.reviewCount || 0) - (a.reviewCount || 0); });
}

// Pagination
var pageSize = p.pageSize || 20;
var page = p.page || 1;
var totalPages = Math.ceil(filtered.length / pageSize);
var startIdx = (page - 1) * pageSize;
var pageBooks = filtered.slice(startIdx, startIdx + pageSize);

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

// Check which books have been deep-processed (podcast generated)
var deepContentDir = path.join(os.homedir(), ".enso", "data", "deep-content");
var oldPodcastDir = path.join(os.homedir(), ".enso", "data", "kindle", "podcasts");
var processedSlugs = new Set();
var processedBooks = [];
try {
  var dirs = [deepContentDir, oldPodcastDir];
  dirs.forEach(function(dir) {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(function(f) {
        if (f.endsWith(".json") && f.startsWith("kindle_book_")) {
          var slug = f.replace(".json", "");
          if (!processedSlugs.has(slug)) {
            processedSlugs.add(slug);
            try {
              var meta = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
              processedBooks.push({
                entityId: meta.entityId,
                title: meta.title,
                author: meta.author,
                durationMinutes: meta.durationMinutes,
                processedAt: meta.processedAt,
                audioSizeBytes: meta.audioSizeBytes,
                depth: meta.research ? meta.research.estimatedDepth : "unknown",
                chapters: meta.research ? meta.research.chapterSummaries.length : 0,
                insights: meta.research ? meta.research.keyInsights.length : 0,
              });
            } catch (e2) {}
          }
        }
      });
    }
  });
} catch (e) {}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_kindle_browse",
  totalBooks: totalBooks,
  processedBooks: processedBooks,
  totalProcessed: processedBooks.length,
  filteredCount: filtered.length,
  page: page,
  pageSize: pageSize,
  totalPages: totalPages,
  category: p.category || null,
  query: p.query || null,
  sortBy: sortBy,
  categories: categories,
  books: pageBooks.map(function(b) {
    var slug = slugify(b.title);
    return {
      entityId: "kindle:book:" + slug,
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
      isProcessed: processedSlugs.has("kindle_book_" + slug),
    };
  }),
}) }] };
