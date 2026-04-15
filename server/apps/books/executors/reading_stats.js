// Books — Reading Stats: aggregate library data for the stats dashboard
var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");

// Load Kindle books
var kindleBooks = [];
try {
  var kindleRaw = fs.readFileSync(path.join(cacheDir, "kindle-library.json"), "utf-8");
  var kindleData = JSON.parse(kindleRaw);
  kindleBooks = (kindleData.books || []).map(function(b) {
    return Object.assign({}, b, { source: "kindle" });
  });
} catch (e) {}

// Load WeRead books
var wereadBooks = [];
try {
  var wereadRaw = fs.readFileSync(path.join(cacheDir, "weread-library.json"), "utf-8");
  var wereadData = JSON.parse(wereadRaw);
  wereadBooks = (wereadData.books || []).map(function(b) {
    return Object.assign({}, b, { source: b.source || "weread" });
  });
} catch (e) {}

var allBooks = kindleBooks.concat(wereadBooks);
var totalBooks = allBooks.length;

if (totalBooks === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_books_reading_stats",
        totalBooks: 0,
        error: "No books found. Run a Kindle or WeRead scan first."
      })
    }]
  };
}

// ── Category distribution (top 15) ──
var catCounts = {};
allBooks.forEach(function(b) {
  if (b.categories) {
    b.categories.forEach(function(c) {
      if (c) catCounts[c] = (catCounts[c] || 0) + 1;
    });
  }
});
var categoryCounts = Object.entries(catCounts)
  .sort(function(a, b) { return b[1] - a[1]; })
  .slice(0, 15)
  .map(function(e) { return { name: e[0], count: e[1] }; });

// ── Publication year distribution ──
var yearCounts = {};
var currentYear = new Date().getFullYear();
allBooks.forEach(function(b) {
  var dateStr = b.publicationDate || b.publishTime || "";
  if (dateStr) {
    var year = String(dateStr).slice(0, 4);
    var y = parseInt(year);
    if (!isNaN(y) && y >= 1970 && y <= currentYear) {
      yearCounts[year] = (yearCounts[year] || 0) + 1;
    }
  }
});
var yearDistribution = Object.entries(yearCounts)
  .sort(function(a, b) { return parseInt(a[0]) - parseInt(b[0]); })
  .map(function(e) { return { year: e[0], count: e[1] }; });

// ── Author distribution (authors with 2+ books, top 15) ──
var authorCounts = {};
allBooks.forEach(function(b) {
  if (b.author) {
    var a = b.author.trim();
    if (a) authorCounts[a] = (authorCounts[a] || 0) + 1;
  }
});
var authorDistribution = Object.entries(authorCounts)
  .filter(function(e) { return e[1] >= 2; })
  .sort(function(a, b) { return b[1] - a[1]; })
  .slice(0, 15)
  .map(function(e) { return { author: e[0], count: e[1] }; });

// ── Reading progress buckets ──
var notStarted = 0, inProgress = 0, completed = 0;
allBooks.forEach(function(b) {
  var pct = b.percentageRead || 0;
  if (pct >= 95) completed++;
  else if (pct > 0) inProgress++;
  else notStarted++;
});
var progressBuckets = [
  { label: "Not Started", count: notStarted },
  { label: "In Progress", count: inProgress },
  { label: "Completed", count: completed },
];

// ── Page count buckets ──
var pageCountBuckets = [
  { label: "< 200pp", count: 0 },
  { label: "200–300pp", count: 0 },
  { label: "300–500pp", count: 0 },
  { label: "500+pp", count: 0 },
];
allBooks.forEach(function(b) {
  var pp = b.pageCount || 0;
  if (pp <= 0) return;
  if (pp < 200) pageCountBuckets[0].count++;
  else if (pp < 300) pageCountBuckets[1].count++;
  else if (pp < 500) pageCountBuckets[2].count++;
  else pageCountBuckets[3].count++;
});

// ── Rating stats ──
var ratedBooks = allBooks.filter(function(b) { return b.rating > 0; });
var avgRating = null;
if (ratedBooks.length > 0) {
  var sum = ratedBooks.reduce(function(s, b) { return s + b.rating; }, 0);
  avgRating = parseFloat((sum / ratedBooks.length).toFixed(2));
}
var ratingBuckets = [
  { label: "1–2", count: 0 },
  { label: "2–3", count: 0 },
  { label: "3–4", count: 0 },
  { label: "4–4.5", count: 0 },
  { label: "4.5–5", count: 0 },
];
ratedBooks.forEach(function(b) {
  var r = b.rating;
  if (r < 2) ratingBuckets[0].count++;
  else if (r < 3) ratingBuckets[1].count++;
  else if (r < 4) ratingBuckets[2].count++;
  else if (r < 4.5) ratingBuckets[3].count++;
  else ratingBuckets[4].count++;
});

// ── Language distribution (top 8) ──
var langCounts = {};
allBooks.forEach(function(b) {
  var lang = b.language || "unknown";
  langCounts[lang] = (langCounts[lang] || 0) + 1;
});
var languageDistribution = Object.entries(langCounts)
  .sort(function(a, b) { return b[1] - a[1]; })
  .slice(0, 8)
  .map(function(e) { return { language: e[0], count: e[1] }; });

// ── Page totals ──
var booksWithPages = allBooks.filter(function(b) { return b.pageCount > 0; });
var totalPages = booksWithPages.reduce(function(s, b) { return s + b.pageCount; }, 0);
var avgPageCount = booksWithPages.length > 0 ? Math.round(totalPages / booksWithPages.length) : 0;

// ── Source distribution ──
var sourceDistribution = [
  { source: "Kindle", count: kindleBooks.length },
  { source: "WeRead", count: wereadBooks.length },
];

// ── Taste profile top genres (optional) ──
var tasteProfile = null;
try {
  var tastePath = path.join(cacheDir, "book-taste-profile.json");
  if (fs.existsSync(tastePath)) {
    var tp = JSON.parse(fs.readFileSync(tastePath, "utf-8"));
    tasteProfile = {
      interactionCount: tp.interactionCount || 0,
      topGenres: Object.entries(tp.genreWeights || {})
        .sort(function(a, b) { return b[1] - a[1]; })
        .slice(0, 8)
        .map(function(e) { return { genre: e[0].replace(/_/g, " "), weight: parseFloat(e[1].toFixed(2)) }; }),
    };
  }
} catch (e) {}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_books_reading_stats",
      totalBooks: totalBooks,
      kindleCount: kindleBooks.length,
      wereadCount: wereadBooks.length,
      avgRating: avgRating,
      avgPageCount: avgPageCount,
      totalPages: totalPages,
      booksRead: completed,
      booksInProgress: inProgress,
      booksNotStarted: notStarted,
      categoryCounts: categoryCounts,
      yearDistribution: yearDistribution,
      authorDistribution: authorDistribution,
      progressBuckets: progressBuckets,
      pageCountBuckets: pageCountBuckets,
      ratingDistribution: ratingBuckets,
      languageDistribution: languageDistribution,
      sourceDistribution: sourceDistribution,
      tasteProfile: tasteProfile,
    })
  }]
};
