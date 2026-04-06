var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheFile = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "kindle-library.json");
var books = [];

try {
  var data = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
  books = data.books || [];
} catch (e) {
  result = { tool: "enso_kindle_search", query: params.query, results: [], error: "No Kindle library cached." };
  return;
}

var q = (params.query || "").toLowerCase();
if (!q) {
  result = { tool: "enso_kindle_search", query: "", results: [], error: "Please provide a search query." };
  return;
}

var matches = books.filter(function(b) {
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

result = {
  tool: "enso_kindle_search",
  query: params.query,
  totalResults: matches.length,
  results: matches.slice(0, 50).map(function(b) {
    return {
      title: b.title,
      author: b.author,
      coverUrl: b.coverUrl,
      description: b.description,
      rating: b.rating,
      reviewCount: b.reviewCount,
      pageCount: b.pageCount,
      categories: b.categories,
      readerUrl: b.readerUrl,
    };
  }),
};
