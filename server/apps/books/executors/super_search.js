// Books — Super Search: reads user's Kindle highlights + taste profile → targeted web search for personalized recommendations
var os = require("os");
var fs = require("fs");
var path = require("path");

var p = params || {};
var focusQuery = (p.query || "").trim(); // optional manual focus query
var refresh = p.refresh === true;

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}

var cacheKey = focusQuery ? "super-search-" + focusQuery.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 40) : "super-search-latest";
var cachePath = path.join(cacheDir, cacheKey + ".json");

// ── Check cache (1 hour TTL for default, 5 min for custom queries) ──
if (!refresh) {
  try {
    if (fs.existsSync(cachePath)) {
      var cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      var age = Date.now() - (cached._cachedAt || 0);
      var ttl = focusQuery ? 5 * 60 * 1000 : 60 * 60 * 1000;
      if (age < ttl) {
        cached.fromCache = true;
        return { content: [{ type: "text", text: JSON.stringify(cached) }] };
      }
    }
  } catch (e) {}
}

// ── Load Kindle library ──
var kindleBooks = [];
var kindlePath = path.join(cacheDir, "kindle-library.json");
try {
  if (fs.existsSync(kindlePath)) {
    var kData = JSON.parse(fs.readFileSync(kindlePath, "utf-8"));
    kindleBooks = Array.isArray(kData) ? kData : (kData.books || []);
  }
} catch (e) { ctx.log("Kindle library read error: " + (e.message || e)); }

// ── Load WeRead library ──
var wereadBooks = [];
var wereadPath = path.join(cacheDir, "weread-library.json");
try {
  if (fs.existsSync(wereadPath)) {
    var wData = JSON.parse(fs.readFileSync(wereadPath, "utf-8"));
    wereadBooks = Array.isArray(wData) ? wData : (wData.books || []);
  }
} catch (e) {}

var allLibraryBooks = kindleBooks.concat(wereadBooks);

// ── Load taste profile ──
var tastePath = path.join(cacheDir, "book-taste-profile.json");
var tasteProfile = { interactionCount: 0, genreWeights: {}, savedBooks: [], ratings: [], dismissedBooks: [], authorAffinities: {}, moodWeights: {}, streak: { current: 0, longest: 0 } };
try {
  if (fs.existsSync(tastePath)) tasteProfile = JSON.parse(fs.readFileSync(tastePath, "utf-8"));
} catch (e) {}

// ── Build reading preferences from library + taste ──
// Top genres from taste profile
var topGenres = Object.entries(tasteProfile.genreWeights || {})
  .sort(function(a, b) { return b[1] - a[1]; })
  .slice(0, 5)
  .map(function(e) { return e[0]; });

// Top authors from library (by frequency)
var authorCounts = {};
allLibraryBooks.forEach(function(b) {
  var auth = (b.author || b.authors || "").toString().split(/[,&]/).map(function(a) { return a.trim(); });
  auth.forEach(function(a) {
    if (a && a.length > 2) authorCounts[a] = (authorCounts[a] || 0) + 1;
  });
});
// Merge with taste profile author affinities
Object.entries(tasteProfile.authorAffinities || {}).forEach(function(e) {
  authorCounts[e[0]] = (authorCounts[e[0]] || 0) + Math.round(e[1] * 5);
});
var topAuthors = Object.entries(authorCounts)
  .sort(function(a, b) { return b[1] - a[1]; })
  .slice(0, 5)
  .map(function(e) { return e[0]; });

// Recent books (last 10 by date, or just last 10)
var recentBooks = allLibraryBooks
  .slice()
  .sort(function(a, b) {
    var da = a.lastReadTime || a.lastReadDate || a.purchaseDate || 0;
    var db = b.lastReadTime || b.lastReadDate || b.purchaseDate || 0;
    if (da && db) return String(db).localeCompare(String(da));
    return 0;
  })
  .slice(0, 10)
  .map(function(b) { return { title: b.title, author: b.author || b.authors || "" }; });

// Saved books from taste profile
var savedBooks = (tasteProfile.savedBooks || []).slice(-5).map(function(b) { return b.title; });

// Dismissed books to exclude
var dismissedTitles = (tasteProfile.dismissedBooks || []).map(function(b) { return (b.title || "").toLowerCase(); });
var ownedTitles = allLibraryBooks.map(function(b) { return (b.title || "").toLowerCase(); });

ctx.log("Preferences: genres=" + topGenres.join(",") + " authors=" + topAuthors.slice(0, 3).join(",") + " recentBooks=" + recentBooks.length);

// ── Build smart search queries ──
function buildSearchQueries() {
  var queries = [];

  if (focusQuery) {
    // User specified a focus — use it as primary
    queries.push({ q: focusQuery + " book recommendations", label: "focus" });
    queries.push({ q: "books like " + focusQuery, label: "similar" });
    return queries;
  }

  // Preference-based queries
  if (recentBooks.length > 0) {
    var pivot = recentBooks[0];
    queries.push({ q: "books similar to \"" + pivot.title + "\"", label: "similar" });
    if (recentBooks.length > 2) {
      queries.push({ q: "books like \"" + recentBooks[1].title + "\" \"" + recentBooks[2].title + "\"", label: "cluster" });
    }
  }

  if (topAuthors.length > 0) {
    queries.push({ q: "books by authors similar to " + topAuthors.slice(0, 2).join(" and "), label: "author" });
  }

  if (topGenres.length > 0) {
    var genreTerms = topGenres.slice(0, 2).join(" ").replace(/_/g, " ");
    queries.push({ q: "best " + genreTerms + " books 2024 2025 recommendations", label: "genre" });
  }

  // Fallback if no data
  if (queries.length === 0) {
    queries.push({ q: "best nonfiction books 2025 most influential", label: "general" });
    queries.push({ q: "must read books intelligent readers 2025", label: "general" });
  }

  return queries.slice(0, 4);
}

var searchQueries = buildSearchQueries();

// ── Source 1: Brave Web Search for each query ──
async function searchBraveWeb(query) {
  try {
    var result = await ctx.search(query, { count: 8 });
    if (!result.ok || !result.results) return [];
    return result.results.map(function(r) {
      return {
        title: (r.title || "").replace(/\s*[-|·]\s*.*$/, "").trim(),
        description: (r.description || "").slice(0, 300),
        url: r.url || "",
        source: "web",
        _query: query,
      };
    }).filter(function(r) { return r.title && r.title.length > 3; });
  } catch (e) {
    ctx.log("Brave search error: " + (e.message || e));
    return [];
  }
}

// ── Source 2: Google Books based on preferences ──
async function searchGoogleBooksPreference(terms) {
  try {
    var url = "https://www.googleapis.com/books/v1/volumes?q=" + encodeURIComponent(terms) + "&orderBy=relevance&maxResults=10";
    var response = await ctx.fetch(url);
    if (!response.ok && !response.data) return [];
    var data = response.data || response;
    var items = data.items || [];
    return items.map(function(item) {
      var vol = item.volumeInfo || {};
      var coverUrl = "";
      if (vol.imageLinks) {
        coverUrl = (vol.imageLinks.thumbnail || vol.imageLinks.smallThumbnail || "").replace("http://", "https://");
      }
      return {
        title: vol.title || "",
        author: (vol.authors || []).join(", "),
        coverUrl: coverUrl,
        description: (vol.description || "").replace(/<[^>]+>/g, "").slice(0, 400),
        rating: vol.averageRating || 0,
        ratingsCount: vol.ratingsCount || 0,
        categories: vol.categories || [],
        pageCount: vol.pageCount || 0,
        publishedDate: vol.publishedDate || "",
        source: "google",
        sourceUrl: "https://books.google.com/books?id=" + (item.id || ""),
      };
    }).filter(function(b) { return b.title; });
  } catch (e) {
    ctx.log("Google Books error: " + (e.message || e));
    return [];
  }
}

// ── Source 3: Open Library subject search ──
async function searchOpenLibrary(subject) {
  try {
    var url = "https://openlibrary.org/search.json?subject=" + encodeURIComponent(subject) + "&sort=rating&limit=10&fields=title,author_name,cover_i,first_publish_year,subject,ratings_average,ratings_count,number_of_pages_median";
    var response = await ctx.fetch(url);
    if (!response.ok && !response.data) return [];
    var data = response.data || response;
    var docs = data.docs || [];
    return docs.map(function(d) {
      var coverUrl = d.cover_i ? "https://covers.openlibrary.org/b/id/" + d.cover_i + "-M.jpg" : "";
      return {
        title: d.title || "",
        author: (d.author_name || []).join(", "),
        coverUrl: coverUrl,
        description: "",
        rating: d.ratings_average ? Math.round(d.ratings_average * 10) / 10 : 0,
        ratingsCount: d.ratings_count || 0,
        categories: (d.subject || []).slice(0, 3),
        pageCount: d.number_of_pages_median || 0,
        publishedDate: d.first_publish_year ? String(d.first_publish_year) : "",
        source: "openlibrary",
        sourceUrl: "",
      };
    }).filter(function(b) { return b.title; });
  } catch (e) {
    ctx.log("Open Library error: " + (e.message || e));
    return [];
  }
}

// ── Run all searches in parallel ──
var searchPromises = searchQueries.map(function(q) { return searchBraveWeb(q.q); });

// Google Books — prioritize: focusQuery > genres > top author > "nonfiction"
var googleTerms = focusQuery
  || (topGenres.length > 0 ? topGenres.slice(0, 2).join(" ").replace(/_/g, " ") : null)
  || (topAuthors.length > 0 ? "inauthor:\"" + topAuthors[0] + "\" OR similar" : null)
  || "nonfiction";
searchPromises.push(searchGoogleBooksPreference(googleTerms));

// Google Books second pass by top author when no genres (gives more structured results)
if (!focusQuery && topGenres.length === 0 && topAuthors.length > 0) {
  searchPromises.push(searchGoogleBooksPreference(topAuthors[0]));
}

// Open Library — use top genre if available, fall back to top author
if (topGenres.length > 0) {
  searchPromises.push(searchOpenLibrary(topGenres[0].replace(/_/g, " ")));
} else if (topAuthors.length > 0) {
  searchPromises.push(searchOpenLibrary(topAuthors[0]));
}

var settled = await Promise.allSettled(searchPromises);

// ── Collect raw web snippets + structured book results ──
var webSnippets = [];
var structuredBooks = [];

for (var i = 0; i < settled.length; i++) {
  if (settled[i].status !== "fulfilled") continue;
  var items = settled[i].value || [];
  if (items.length === 0) continue;

  if (items[0] && items[0].source === "web") {
    webSnippets = webSnippets.concat(items);
  } else {
    structuredBooks = structuredBooks.concat(items);
  }
}

ctx.log("Web snippets: " + webSnippets.length + ", Structured: " + structuredBooks.length);

// ── Deduplicate structured books ──
function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-z0-9]/g, "").trim();
}

function metadataScore(b) {
  var s = 0;
  if (b.coverUrl) s += 3;
  if (b.rating > 0) s += 2;
  if (b.description && b.description.length > 20) s += 2;
  if (b.author) s += 1;
  if (b.pageCount > 0) s += 1;
  return s;
}

var seen = {};
var deduped = [];
for (var j = 0; j < structuredBooks.length; j++) {
  var b = structuredBooks[j];
  if (!b.title) continue;
  var key = normalizeTitle(b.title);
  if (!key) continue;
  if (seen[key] !== undefined) {
    if (metadataScore(b) > metadataScore(deduped[seen[key]])) {
      deduped[seen[key]] = b;
    }
  } else {
    seen[key] = deduped.length;
    deduped.push(b);
  }
}

// Filter out already-owned books
var candidates = deduped.filter(function(b) {
  var norm = normalizeTitle(b.title);
  return ownedTitles.indexOf(norm) < 0 && dismissedTitles.indexOf(norm) < 0;
}).slice(0, 50);

ctx.log("After dedup+filter: " + candidates.length + " candidates");

// ── If structured sources returned nothing, extract books from web snippets ──
if (candidates.length === 0 && webSnippets.length > 0) {
  ctx.log("No structured candidates — attempting extraction from " + webSnippets.length + " web snippets");
  try {
    var extractPrompt = "From these web search snippets about book recommendations, extract specific book titles and authors mentioned.\n";
    extractPrompt += "User reading profile: " + (topAuthors.length > 0 ? "Reads " + topAuthors.slice(0, 3).join(", ") : "") + "\n\n";
    extractPrompt += "Snippets:\n";
    webSnippets.slice(0, 25).forEach(function(s, i) {
      extractPrompt += (i + 1) + ". " + s.title + " — " + s.description.slice(0, 200) + "\n";
    });
    extractPrompt += "\nReturn ONLY valid JSON (no markdown):\n";
    extractPrompt += '{ "books": [{ "title": "...", "author": "...", "description": "...", "whyRecommended": "..." }] }\n';
    extractPrompt += "Rules: extract 10-15 distinct books actually mentioned. Skip generic list headings. Include only real book titles.";

    var extractResult = await ctx.ask(extractPrompt, { temperature: 0.3 });
    if (extractResult && extractResult.ok && extractResult.text) {
      var extractText = extractResult.text.trim().replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      var extractJson = JSON.parse(extractText);
      if (extractJson.books && Array.isArray(extractJson.books)) {
        candidates = extractJson.books
          .filter(function(b) { return b.title && b.title.length > 2; })
          .filter(function(b) {
            var norm = normalizeTitle(b.title);
            return ownedTitles.indexOf(norm) < 0 && dismissedTitles.indexOf(norm) < 0;
          })
          .slice(0, 20)
          .map(function(b) {
            return {
              title: b.title,
              author: b.author || "",
              coverUrl: "",
              description: b.description || "",
              rating: 0,
              ratingsCount: 0,
              categories: [],
              pageCount: 0,
              publishedDate: "",
              source: "web",
              sourceUrl: "",
              whyRecommended: b.whyRecommended || "",
              matchScore: 0.5,
              tags: [],
            };
          });
        ctx.log("Extracted " + candidates.length + " books from web snippets");
      }
    }
  } catch (e) {
    ctx.log("Snippet extraction error: " + (e.message || e));
  }
}

// ── LLM curation: rank candidates + explain recommendations ──
var preferenceContext = "";
if (recentBooks.length > 0) {
  preferenceContext += "Recently read: " + recentBooks.slice(0, 5).map(function(b) { return "\"" + b.title + "\"" + (b.author ? " by " + b.author : ""); }).join(", ") + "\n";
}
if (topAuthors.length > 0) preferenceContext += "Favorite authors: " + topAuthors.join(", ") + "\n";
if (topGenres.length > 0) preferenceContext += "Top genres: " + topGenres.join(", ") + "\n";
if (savedBooks.length > 0) preferenceContext += "Recently saved: " + savedBooks.join(", ") + "\n";
if (focusQuery) preferenceContext += "User focus: " + focusQuery + "\n";

var webContext = "";
if (webSnippets.length > 0) {
  webContext = "\nWeb search snippets (may contain book titles/recommendations):\n";
  webSnippets.slice(0, 20).forEach(function(s, i) {
    webContext += (i + 1) + ". " + s.title + ": " + s.description.slice(0, 100) + "\n";
  });
}

var candidateList = candidates.slice(0, 30).map(function(c, idx) {
  return {
    index: idx,
    title: c.title,
    author: c.author || "",
    rating: c.rating || 0,
    categories: (c.categories || []).slice(0, 3),
    description: (c.description || "").slice(0, 100),
    hasCover: !!c.coverUrl,
    source: c.source,
  };
});

var llmPrompt = "You are a book recommendation curator. Based on the user's reading preferences, select the best books from the candidate pool.\n\n";
llmPrompt += "User reading preferences:\n" + (preferenceContext || "No specific preferences yet.\n") + "\n";
llmPrompt += webContext + "\n";
llmPrompt += "Candidate books (" + candidateList.length + "):\n" + JSON.stringify(candidateList, null, 1) + "\n\n";
llmPrompt += "Return ONLY a valid JSON object (no markdown):\n";
llmPrompt += '{\n';
llmPrompt += '  "picks": [\n';
llmPrompt += '    { "index": <number>, "whyRecommended": "<1-2 sentences connecting to user preferences>", "matchScore": <0.0-1.0>, "tags": ["<tag1>", "<tag2>"] }\n';
llmPrompt += '  ],\n';
llmPrompt += '  "searchInsight": "<1 sentence summarizing what drove these recommendations>"\n';
llmPrompt += '}\n\n';
llmPrompt += "Rules:\n";
llmPrompt += "- Select 10-15 most relevant picks\n";
llmPrompt += "- Sort by matchScore descending\n";
llmPrompt += "- whyRecommended must reference specific preference signals (recent books, authors, genres)\n";
llmPrompt += "- Prefer books with hasCover=true and rating > 3.5\n";
llmPrompt += "- Avoid generic recommendations — be specific about why this book fits this reader\n";
llmPrompt += "- tags: 1-3 short labels (e.g. 'psychology', 'fast-paced', 'similar to X')\n";

var curation = null;
try {
  var llmResult = await ctx.ask(llmPrompt, { temperature: 0.5 });
  if (llmResult && llmResult.ok && llmResult.text) {
    var jsonText = llmResult.text.trim();
    if (jsonText.indexOf("```") >= 0) {
      jsonText = jsonText.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    }
    curation = JSON.parse(jsonText);
  }
} catch (e) {
  ctx.log("LLM curation error: " + (e.message || e));
}

// ── Build final results ──
var finalPicks = [];

if (curation && Array.isArray(curation.picks)) {
  for (var pi = 0; pi < curation.picks.length; pi++) {
    var pick = curation.picks[pi];
    var book = candidates[pick.index];
    if (!book) continue;
    finalPicks.push(Object.assign({}, book, {
      whyRecommended: pick.whyRecommended || "",
      matchScore: pick.matchScore || 0,
      tags: pick.tags || [],
    }));
  }
}

// Fallback: use top-rated candidates if LLM curation failed or returned no valid picks
if (finalPicks.length === 0 && candidates.length > 0) {
  finalPicks = candidates
    .slice()
    .sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); })
    .slice(0, 12)
    .map(function(b) { return Object.assign({}, b, { whyRecommended: "Highly rated in your preferred genres.", matchScore: 0.5, tags: [] }); });
}

var result = {
  tool: "enso_books_super_search",
  query: focusQuery || null,
  totalResults: finalPicks.length,
  results: finalPicks,
  searchInsight: (curation && curation.searchInsight) || null,
  preferences: {
    topGenres: topGenres,
    topAuthors: topAuthors.slice(0, 5),
    recentBooks: recentBooks.slice(0, 5),
    librarySize: allLibraryBooks.length,
  },
  generatedAt: new Date().toISOString(),
  _cachedAt: Date.now(),
};

// Save to cache
try { fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), "utf-8"); } catch (e) {}

return { content: [{ type: "text", text: JSON.stringify(result) }] };
