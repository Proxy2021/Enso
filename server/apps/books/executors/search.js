var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");

// Load both sources
var allBooks = [];
try {
  var kindleData = JSON.parse(fs.readFileSync(path.join(cacheDir, "kindle-library.json"), "utf-8"));
  allBooks = allBooks.concat((kindleData.books || []).map(function(b) { return Object.assign({}, b, { source: "kindle" }); }));
} catch (e) {}
try {
  var wereadData = JSON.parse(fs.readFileSync(path.join(cacheDir, "weread-library.json"), "utf-8"));
  allBooks = allBooks.concat((wereadData.books || []).map(function(b) { return Object.assign({}, b, { source: b.source || "weread" }); }));
} catch (e) {}

if (allBooks.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_books_search", query: p.query, results: [], error: "No books cached. Run a Kindle or WeRead scan first." }) }] };
}

var q = (p.query || "").toLowerCase();
if (!q) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_books_search", query: "", results: [], error: "Please provide a search query." }) }] };
}

var matches = allBooks.filter(function(b) {
  return b.title.toLowerCase().indexOf(q) >= 0 ||
    (b.author && b.author.toLowerCase().indexOf(q) >= 0) ||
    (b.description && b.description.toLowerCase().indexOf(q) >= 0) ||
    (b.categories && b.categories.some(function(c) { return c.toLowerCase().indexOf(q) >= 0; }));
});

// Score results by relevance
matches.sort(function(a, b) {
  var scoreA = a.title.toLowerCase().indexOf(q) >= 0 ? 10 : 0;
  scoreA += (a.author && a.author.toLowerCase().indexOf(q) >= 0) ? 5 : 0;
  scoreA += (a.rating || 0);
  var scoreB = b.title.toLowerCase().indexOf(q) >= 0 ? 10 : 0;
  scoreB += (b.author && b.author.toLowerCase().indexOf(q) >= 0) ? 5 : 0;
  scoreB += (b.rating || 0);
  return scoreB - scoreA;
});

function slugify(title) {
  return title.toLowerCase().replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_books_search",
  query: p.query,
  totalResults: matches.length,
  results: matches.slice(0, 50).map(function(b) {
    var slug = slugify(b.title);
    var src = b.source || "kindle";
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
      categories: b.categories,
      readerUrl: b.readerUrl,
      wereadBookId: b.wereadBookId,
    };
  }),
}) }] };
