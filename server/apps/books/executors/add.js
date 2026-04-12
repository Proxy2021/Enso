// Books — Add Book: search 4 sources in parallel, merge and deduplicate results
var p = params || {};
var query = (p.query || "").trim();

if (!query) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_books_add",
    error: "Please provide a search query (book title, author, or ISBN).",
    results: [],
  }) }] };
}

ctx.log("Searching 4 sources for: " + query);

// ── Source 1: Google Books API ──

async function searchGoogleBooks(q) {
  try {
    var response = await ctx.fetch("https://www.googleapis.com/books/v1/volumes?q=" + encodeURIComponent(q) + "&maxResults=5");
    if (!response.ok && !response.data) return [];
    var data = response.data || response;
    var items = data.items || [];
    return items.map(function(item) {
      var vol = item.volumeInfo || {};
      var isbn13 = "", isbn10 = "";
      if (vol.industryIdentifiers) {
        vol.industryIdentifiers.forEach(function(id) {
          if (id.type === "ISBN_13") isbn13 = id.identifier;
          if (id.type === "ISBN_10") isbn10 = id.identifier;
        });
      }
      var coverUrl = "";
      if (vol.imageLinks) {
        coverUrl = (vol.imageLinks.thumbnail || vol.imageLinks.smallThumbnail || "").replace("http://", "https://");
      }
      return {
        title: vol.title || "",
        subtitle: vol.subtitle || "",
        author: (vol.authors || []).join(", "),
        publisher: vol.publisher || "",
        publishedDate: vol.publishedDate || "",
        description: (vol.description || "").replace(/<[^>]+>/g, "").slice(0, 500),
        pageCount: vol.pageCount || 0,
        categories: vol.categories || [],
        rating: vol.averageRating || 0,
        ratingsCount: vol.ratingsCount || 0,
        language: vol.language || "",
        isbn: isbn13 || isbn10,
        coverUrl: coverUrl,
        source: "google",
        sourceUrl: "https://books.google.com/books?id=" + (item.id || ""),
      };
    }).filter(function(r) { return r.title; });
  } catch (e) {
    ctx.log("Google Books error: " + (e.message || e));
    return [];
  }
}

// ── WeRead bookId encoder (reverse-engineered from WeRead frontend) ──
function encodeWereadBookId(bookId) {
  var crypto = require("crypto");
  var md5 = crypto.createHash("md5").update(String(bookId)).digest("hex");
  var result = md5.slice(0, 3);
  var bid = String(bookId);
  if (/^\d+$/.test(bid)) {
    result += "3";
    result += "2" + md5.slice(-2);
    var chunks = [];
    for (var i = 0; i < bid.length; i += 9) {
      chunks.push(parseInt(bid.slice(i, Math.min(i + 9, bid.length)), 10).toString(16));
    }
    for (var j = 0; j < chunks.length; j++) {
      var n = chunks[j].length.toString(16);
      if (n.length === 1) n = "0" + n;
      result += n + chunks[j];
      if (j < chunks.length - 1) result += "g";
    }
  } else {
    result += "4";
    result += "2" + md5.slice(-2);
    var hex = "";
    for (var i = 0; i < bid.length; i++) hex += bid.charCodeAt(i).toString(16);
    var n = hex.length.toString(16);
    if (n.length === 1) n = "0" + n;
    result += n + hex;
  }
  if (result.length < 20) result += md5.slice(0, 20 - result.length);
  result += crypto.createHash("md5").update(result).digest("hex").slice(0, 3);
  return result;
}

// ── Source 2: WeRead (微信读书) Public Search API ──

async function searchWeRead(q) {
  try {
    var response = await ctx.fetch("https://weread.qq.com/web/search/global?keyword=" + encodeURIComponent(q) + "&maxIdx=0&count=5");
    if (!response.ok && !response.data) return [];
    var data = response.data || response;
    var books = (data.books || []);
    return books.slice(0, 5).map(function(entry) {
      var b = entry.bookInfo || entry;
      var ratingScore = 0;
      var rawRating = typeof b.newRating === "number" ? b.newRating : (b.newRating && b.newRating.score) ? b.newRating.score : 0;
      if (rawRating > 0) ratingScore = Math.round(rawRating / 10) / 10;
      var cover = b.cover || "";
      if (cover && cover.indexOf("http") !== 0) cover = "https:" + cover;
      return {
        title: (b.title || "").replace(/<[^>]+>/g, ""),
        subtitle: "",
        author: (b.author || "").replace(/<[^>]+>/g, ""),
        publisher: b.publisher || "",
        publishedDate: "",
        description: (b.intro || "").replace(/<[^>]+>/g, "").slice(0, 500),
        pageCount: 0,
        categories: b.category ? [b.category] : [],
        rating: ratingScore,
        ratingsCount: b.newRatingCount || 0,
        language: "zh",
        isbn: b.isbn || "",
        coverUrl: cover,
        source: "weread",
        sourceUrl: b.bookId ? "https://weread.qq.com/web/bookDetail/" + encodeWereadBookId(String(b.bookId)) : "",
        wereadBookId: b.bookId || "",
      };
    }).filter(function(r) { return r.title; });
  } catch (e) {
    ctx.log("WeRead search error: " + (e.message || e));
    return [];
  }
}

// ── Source 3: Douban (豆瓣) via Brave Search ──

async function searchDouban(q) {
  try {
    var searchResult = await ctx.search("site:book.douban.com " + q, { count: 5 });
    if (!searchResult.ok || !searchResult.results) return [];
    return searchResult.results.map(function(r) {
      if (!r.url || r.url.indexOf("book.douban.com") < 0) return null;
      // Douban titles come as "书名 (豆瓣)" or "书评 - 书名 - 豆瓣" etc.
      var title = (r.title || "")
        .replace(/\s*[\(（]豆瓣[\)）]\s*$/g, "")
        .replace(/\s*-\s*豆瓣读书\s*$/g, "")
        .replace(/\s*-\s*豆瓣\s*$/g, "")
        .replace(/^书评\s*-\s*/g, "")
        .replace(/^短评\s*-\s*/g, "")
        .trim();
      // Skip review/discussion pages that aren't actual book entries
      if (r.url.indexOf("/review/") >= 0 || r.url.indexOf("/discussion/") >= 0) return null;
      var desc = r.description || "";
      // Try to extract author and rating from the snippet
      var author = "";
      var rating = 0;
      // Douban snippets often have: "作者: XXX / 出版社: YYY / 评分: 8.5"
      var authorMatch = desc.match(/作者[:\s：]+([^/\/]+)/);
      if (authorMatch) author = authorMatch[1].trim();
      if (!author) {
        // English pattern: "Author / Publisher / Year"
        var parts = desc.split(/[/\/]/).map(function(s) { return s.trim(); });
        if (parts.length >= 2 && parts[0].length < 40) author = parts[0];
      }
      var ratingMatch = desc.match(/(\d+\.\d)\s*分/) || desc.match(/评分[:\s：]*(\d+\.?\d*)/);
      if (ratingMatch) rating = parseFloat(ratingMatch[1]);
      // Also check the title for rating patterns like "8.5分"
      var titleRating = (r.title || "").match(/(\d+\.\d)\s*分/);
      if (titleRating && !rating) rating = parseFloat(titleRating[1]);
      return {
        title: title,
        subtitle: "",
        author: author,
        publisher: "",
        publishedDate: "",
        description: desc.slice(0, 500),
        pageCount: 0,
        categories: [],
        rating: rating,
        ratingsCount: 0,
        language: "",
        isbn: "",
        coverUrl: "",
        source: "douban",
        sourceUrl: r.url,
      };
    }).filter(function(r) { return r && r.title; });
  } catch (e) {
    ctx.log("Douban search error: " + (e.message || e));
    return [];
  }
}

// ── Source 4: Amazon Kindle Store via Brave Search ──

async function searchAmazonKindle(q) {
  try {
    var searchResult = await ctx.search("site:amazon.com kindle " + q, { count: 5 });
    if (!searchResult.ok || !searchResult.results) return [];
    return searchResult.results.map(function(r) {
      if (!r.url || r.url.indexOf("amazon.com") < 0) return null;
      var title = (r.title || "")
        .replace(/\s*-\s*Kindle edition.*$/i, "")
        .replace(/\s*:\s*Kindle Store.*$/i, "")
        .replace(/\s*\|\s*Amazon\.com.*$/i, "")
        .replace(/Amazon\.com:\s*/i, "")
        .trim();
      var desc = r.description || "";
      var author = "";
      var authorMatch = desc.match(/by\s+([^.·\-\|]+)/i);
      if (authorMatch) author = authorMatch[1].trim();
      var rating = 0;
      var ratingMatch = desc.match(/(\d+\.?\d*)\s*out of\s*5/);
      if (ratingMatch) rating = parseFloat(ratingMatch[1]);
      var price = "";
      var priceMatch = desc.match(/\$[\d.]+/);
      if (priceMatch) price = priceMatch[0];
      return {
        title: title,
        subtitle: "",
        author: author,
        publisher: "",
        publishedDate: "",
        description: desc.slice(0, 500),
        pageCount: 0,
        categories: [],
        rating: rating,
        ratingsCount: 0,
        language: "en",
        isbn: "",
        coverUrl: "",
        source: "kindle",
        sourceUrl: r.url,
        price: price,
      };
    }).filter(function(r) { return r && r.title && r.title.length > 2; });
  } catch (e) {
    ctx.log("Amazon Kindle search error: " + (e.message || e));
    return [];
  }
}

// ── Run all 4 in parallel, merge results ──

var settled = await Promise.allSettled([
  searchGoogleBooks(query),
  searchWeRead(query),
  searchDouban(query),
  searchAmazonKindle(query),
]);

var allResults = [];
var sourceLabels = ["Google Books", "WeRead", "Douban", "Kindle"];
for (var i = 0; i < settled.length; i++) {
  if (settled[i].status === "fulfilled" && Array.isArray(settled[i].value)) {
    var items = settled[i].value;
    ctx.log(sourceLabels[i] + ": " + items.length + " results");
    allResults = allResults.concat(items);
  } else if (settled[i].status === "rejected") {
    ctx.log(sourceLabels[i] + " failed: " + (settled[i].reason || "unknown"));
  }
}

// ── Deduplicate by title similarity ──

function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-z0-9]/g, "").trim();
}

function metadataRichness(r) {
  var score = 0;
  if (r.coverUrl) score += 3;
  if (r.rating > 0) score += 2;
  if (r.description && r.description.length > 20) score += 2;
  if (r.author) score += 1;
  if (r.isbn) score += 1;
  if (r.pageCount > 0) score += 1;
  if (r.categories && r.categories.length > 0) score += 1;
  return score;
}

var seen = {};
var deduped = [];
for (var j = 0; j < allResults.length; j++) {
  var r = allResults[j];
  var norm = normalizeTitle(r.title);
  if (!norm) continue;
  if (seen[norm]) {
    // Keep the one with richer metadata
    var existing = seen[norm];
    if (metadataRichness(r) > metadataRichness(deduped[existing])) {
      deduped[existing] = r;
    }
  } else {
    seen[norm] = deduped.length;
    deduped.push(r);
  }
}

// ── Sort: exact title matches first, then by richness ──

var queryNorm = normalizeTitle(query);
deduped.sort(function(a, b) {
  var aExact = normalizeTitle(a.title) === queryNorm ? 1 : 0;
  var bExact = normalizeTitle(b.title) === queryNorm ? 1 : 0;
  if (aExact !== bExact) return bExact - aExact;
  return metadataRichness(b) - metadataRichness(a);
});

var finalResults = deduped.slice(0, 20);

ctx.log("Total: " + allResults.length + " raw, " + deduped.length + " after dedup, returning " + finalResults.length);

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_books_add",
  query: query,
  totalResults: finalResults.length,
  results: finalResults,
  sourceCounts: {
    google: settled[0].status === "fulfilled" ? (settled[0].value || []).length : 0,
    weread: settled[1].status === "fulfilled" ? (settled[1].value || []).length : 0,
    douban: settled[2].status === "fulfilled" ? (settled[2].value || []).length : 0,
    kindle: settled[3].status === "fulfilled" ? (settled[3].value || []).length : 0,
  },
}) }] };
