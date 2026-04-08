var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");

// Load Kindle books
var kindleBooks = [];
var kindleCount = 0;
try {
  var kindleRaw = fs.readFileSync(path.join(cacheDir, "kindle-library.json"), "utf-8");
  var kindleData = JSON.parse(kindleRaw);
  kindleBooks = (kindleData.books || []).map(function(b) {
    return Object.assign({}, b, { source: "kindle" });
  });
  kindleCount = kindleBooks.length;
} catch (e) {}

// Load WeRead books
var wereadBooks = [];
var wereadCount = 0;
try {
  var wereadRaw = fs.readFileSync(path.join(cacheDir, "weread-library.json"), "utf-8");
  var wereadData = JSON.parse(wereadRaw);
  wereadBooks = (wereadData.books || []).map(function(b) {
    return Object.assign({}, b, { source: b.source || "weread" });
  });
  wereadCount = wereadBooks.length;
} catch (e) {}

var allBooks = kindleBooks.concat(wereadBooks);
var totalBooks = allBooks.length;

if (totalBooks === 0) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_books_browse", totalBooks: 0, kindleCount: 0, wereadCount: 0, filteredCount: 0, books: [], categories: [], tab: "all", error: "No books found. Run a Kindle or WeRead scan first." }) }] };
}

// Tab filter
var p = params || {};
var tab = p.tab || "all";
var filtered = allBooks;
if (tab === "kindle") filtered = kindleBooks;
else if (tab === "weread") filtered = wereadBooks;

// Build category index from the current tab's books
var catCounts = {};
for (var b of filtered) {
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
    var da = a.publicationDate ? new Date(a.publicationDate).getTime() : (a.publishTime ? new Date(a.publishTime).getTime() : 0);
    var db = b.publicationDate ? new Date(b.publicationDate).getTime() : (b.publishTime ? new Date(b.publishTime).getTime() : 0);
    if (isNaN(da)) da = 0;
    if (isNaN(db)) db = 0;
    if (da === 0 && db !== 0) return 1;
    if (db === 0 && da !== 0) return -1;
    return db - da;
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
var wikiIndexPath = path.join(wikiDir, "_index.md");
var existingPages = new Set();
try {
  if (fs.existsSync(wikiIndexPath)) {
    var idx = fs.readFileSync(wikiIndexPath, "utf-8");
    var matches = idx.matchAll(/^## (.+\.md)$/gm);
    for (var m of matches) existingPages.add(m[1]);
  }
} catch (e) {}

function slugify(title) {
  return title.toLowerCase().replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

// Check deep-processed books
var deepContentDir = path.join(os.homedir(), ".enso", "data", "deep-content");
var oldPodcastDir = path.join(os.homedir(), ".enso", "data", "kindle", "podcasts");
var processedSlugs = new Set();
var processedBooks = [];
try {
  [deepContentDir, oldPodcastDir].forEach(function(dir) {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(function(f) {
        if (f.endsWith(".json") && (f.startsWith("kindle_book_") || f.startsWith("weread_book_") || f.startsWith("research_book_"))) {
          var slug = f.replace(".json", "");
          if (!processedSlugs.has(slug)) {
            processedSlugs.add(slug);
            try {
              var meta = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
              // Find cover URL from entity index or book caches
              var pbCover = "";
              try {
                var eiPath2 = path.join(os.homedir(), ".enso", "data", "entity-index.json");
                if (fs.existsSync(eiPath2)) {
                  var idx2 = JSON.parse(fs.readFileSync(eiPath2, "utf-8"));
                  if (idx2[meta.entityId] && idx2[meta.entityId].imageUrl) pbCover = idx2[meta.entityId].imageUrl;
                }
              } catch(eIdx) {}
              if (!pbCover) {
                // Try finding from Kindle/WeRead cache
                var allCacheBooks = kindleBooks.concat(wereadBooks);
                var matchBook = allCacheBooks.find(function(cb) { return cb.title === meta.title; });
                if (matchBook && matchBook.coverUrl) pbCover = matchBook.coverUrl;
              }
              processedBooks.push({
                entityId: meta.entityId,
                title: meta.title,
                author: meta.author,
                coverUrl: pbCover,
                durationMinutes: meta.durationMinutes,
                processedAt: meta.processedAt,
                source: meta.entityId ? meta.entityId.split(":")[0] : "kindle",
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

// Research-discovered books (recommendations)
var recommendations = [];
try {
  var eiPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
  if (fs.existsSync(eiPath)) {
    var entityIndex = JSON.parse(fs.readFileSync(eiPath, "utf-8"));
    var entries = Object.values(entityIndex);
    for (var ei = 0; ei < entries.length; ei++) {
      var ent = entries[ei];
      if (ent.source === "research" && ent.type === "book") {
        recommendations.push({
          entityId: ent.entityId, title: ent.title, slug: ent.slug,
          cortexPath: ent.cortexPath, tags: ent.tags || [], updatedAt: ent.updatedAt,
        });
      }
    }
  }
} catch(e) {}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_books_browse",
  totalBooks: totalBooks,
  kindleCount: kindleCount,
  wereadCount: wereadCount,
  tab: tab,
  recommendations: recommendations,
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
    var src = b.source || "kindle";
    var prefix = src === "weread" ? "weread-" : "";
    return {
      entityId: src + ":book:" + slug,
      source: src,
      title: b.title,
      author: b.author,
      coverUrl: b.coverUrl,
      description: b.description,
      rating: b.rating,
      reviewCount: b.reviewCount,
      pageCount: b.pageCount,
      publisher: b.publisher,
      publicationDate: b.publicationDate || b.publishTime,
      categories: b.categories,
      readerUrl: b.readerUrl,
      asin: b.asin,
      wereadBookId: b.wereadBookId,
      readingProgress: b.readingProgress || b.percentageRead,
      noteCount: b.noteCount,
      hasWikiPage: existingPages.has("entities/" + prefix + slug + ".md") || existingPages.has("entities/" + slug + ".md"),
      wikiPath: "entities/" + prefix + slug + ".md",
      isProcessed: processedSlugs.has(src + "_book_" + slug),
    };
  }),
}) }] };
