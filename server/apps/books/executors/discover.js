// Books — Daily Discovery: themed recommendations from Open Library + Google Books + NYT Bestsellers
// Cached per day. LLM curation via ctx.ask() against user taste profile.
var os = require("os");
var fs = require("fs");
var path = require("path");

var p = params || {};
var today = new Date();
var dateStr = p.date || today.toISOString().slice(0, 10);
var forceRefresh = p.refresh === true;

// ── Cache paths ──
var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}
var cachePath = path.join(cacheDir, "daily-discovery-" + dateStr + ".json");
var tastePath = path.join(cacheDir, "book-taste-profile.json");

// ── Check cache first ──
if (!forceRefresh) {
  try {
    if (fs.existsSync(cachePath)) {
      var cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      // Load taste profile summary for the UI
      var tasteProfile = { interactionCount: 0, streak: { current: 0, longest: 0 } };
      try {
        if (fs.existsSync(tastePath)) {
          var tp = JSON.parse(fs.readFileSync(tastePath, "utf-8"));
          tasteProfile = { interactionCount: tp.interactionCount || 0, streak: tp.streak || { current: 0, longest: 0 }, topGenres: Object.entries(tp.genreWeights || {}).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3).map(function(e) { return e[0]; }) };
        }
      } catch (e2) {}
      cached.tasteProfile = tasteProfile;
      cached.fromCache = true;
      return { content: [{ type: "text", text: JSON.stringify(cached) }] };
    }
  } catch (e) {
    ctx.log("Cache read error: " + (e.message || e));
  }
}

// ── Theme Calendar ──
var THEMES = [
  { name: "Mind & Motivation", icon: "\u{1F9E0}", subjects: ["self_help", "psychology"], googleTerms: "motivation mindset habits", nytList: "combined-print-and-e-book-nonfiction", dayLabel: "Sunday" },
  { name: "Mind & Motivation", icon: "\u{1F9E0}", subjects: ["self_help", "psychology"], googleTerms: "motivation mindset habits", nytList: "combined-print-and-e-book-nonfiction", dayLabel: "Monday" },
  { name: "History & Biography", icon: "\u{1F4DC}", subjects: ["biography", "history"], googleTerms: "historical memoir true story", nytList: "combined-print-and-e-book-nonfiction", dayLabel: "Tuesday" },
  { name: "Science & Nature", icon: "\u{1F52C}", subjects: ["science", "nature"], googleTerms: "physics biology environment cosmos", nytList: "combined-print-and-e-book-nonfiction", dayLabel: "Wednesday" },
  { name: "Fiction Spotlight", icon: "\u{1F4D6}", subjects: ["fiction", "literary_fiction"], googleTerms: "novel contemporary literary fiction", nytList: "combined-print-and-e-book-fiction", dayLabel: "Thursday" },
  { name: "Mystery & Thriller", icon: "\u{1F50D}", subjects: ["mystery", "thriller"], googleTerms: "suspense detective crime thriller", nytList: "combined-print-and-e-book-fiction", dayLabel: "Friday" },
  { name: "Sci-Fi & Fantasy", icon: "\u{1F680}", subjects: ["science_fiction", "fantasy"], googleTerms: "space magic dystopia future", nytList: "combined-print-and-e-book-fiction", dayLabel: "Saturday" },
];

// Determine theme
var dateObj = new Date(dateStr + "T12:00:00Z");
var dayOfWeek = dateObj.getUTCDay(); // 0=Sun
var theme = THEMES[dayOfWeek];

// Override theme if param provided
if (p.theme) {
  var customTheme = THEMES.find(function(t) { return t.name.toLowerCase().replace(/\s+/g, "_") === p.theme.toLowerCase() || t.subjects.indexOf(p.theme.toLowerCase()) >= 0; });
  if (customTheme) theme = customTheme;
}

ctx.log("Discovery for " + dateStr + " (" + theme.dayLabel + "): " + theme.icon + " " + theme.name);

// ── Source 1: Open Library Subjects API ──
async function fetchOpenLibrary(subject) {
  try {
    var url = "https://openlibrary.org/subjects/" + subject + ".json?limit=15&sort=rating";
    var response = await ctx.fetch(url);
    if (!response.ok && !response.data) return [];
    var data = response.data || response;
    var works = data.works || [];
    return works.map(function(w) {
      var coverUrl = w.cover_id ? "https://covers.openlibrary.org/b/id/" + w.cover_id + "-M.jpg" : "";
      var authors = (w.authors || []).map(function(a) { return a.name; }).join(", ");
      return {
        title: w.title || "",
        author: authors,
        coverUrl: coverUrl,
        description: "",
        rating: 0,
        categories: w.subject ? w.subject.slice(0, 3) : [subject],
        source: "openlibrary",
        sourceUrl: w.key ? "https://openlibrary.org" + w.key : "",
        firstPublishYear: w.first_publish_year || 0,
        editionCount: w.edition_count || 0,
      };
    }).filter(function(b) { return b.title; });
  } catch (e) {
    ctx.log("Open Library error (" + subject + "): " + (e.message || e));
    return [];
  }
}

// ── Source 2: Google Books API ──
async function fetchGoogleBooks(terms) {
  try {
    var url = "https://www.googleapis.com/books/v1/volumes?q=subject:" + encodeURIComponent(terms) + "&orderBy=relevance&maxResults=10";
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
        source: "google",
        sourceUrl: "https://books.google.com/books?id=" + (item.id || ""),
        publishedDate: vol.publishedDate || "",
      };
    }).filter(function(b) { return b.title; });
  } catch (e) {
    ctx.log("Google Books error: " + (e.message || e));
    return [];
  }
}

// ── Source 3: NYT Bestsellers API ──
async function fetchNYTBestsellers(listName) {
  try {
    // Check for NYT API key in env or store
    var apiKey = process.env.NYT_API_KEY || "";
    if (!apiKey) {
      try { apiKey = ctx.store.get("nyt_api_key") || ""; } catch (e) {}
    }
    if (!apiKey) {
      ctx.log("NYT API key not configured — skipping bestsellers");
      return [];
    }
    var url = "https://api.nytimes.com/svc/books/v3/lists/current/" + listName + ".json?api-key=" + apiKey;
    var response = await ctx.fetch(url);
    if (!response.ok && !response.data) return [];
    var data = response.data || response;
    var results = (data.results || {});
    var books = results.books || [];
    return books.map(function(b) {
      return {
        title: b.title || "",
        author: b.author || "",
        coverUrl: b.book_image || "",
        description: (b.description || "").slice(0, 400),
        rating: 0,
        categories: [],
        source: "nyt",
        sourceUrl: b.amazon_product_url || "",
        rank: b.rank || 0,
        weeksOnList: b.weeks_on_list || 0,
        nytListName: listName,
      };
    }).filter(function(b) { return b.title; });
  } catch (e) {
    ctx.log("NYT Bestsellers error: " + (e.message || e));
    return [];
  }
}

// ── Parallel fetch from all sources ──
var fetchPromises = [];
// Open Library — 2 subjects
for (var si = 0; si < theme.subjects.length; si++) {
  fetchPromises.push(fetchOpenLibrary(theme.subjects[si]));
}
// Google Books
fetchPromises.push(fetchGoogleBooks(theme.googleTerms));
// NYT Bestsellers
fetchPromises.push(fetchNYTBestsellers(theme.nytList));

var settled = await Promise.allSettled(fetchPromises);

var allCandidates = [];
var sourceCounts = { openlibrary: 0, google: 0, nyt: 0 };
for (var i = 0; i < settled.length; i++) {
  if (settled[i].status === "fulfilled" && Array.isArray(settled[i].value)) {
    var items = settled[i].value;
    for (var j = 0; j < items.length; j++) {
      sourceCounts[items[j].source] = (sourceCounts[items[j].source] || 0) + 1;
    }
    allCandidates = allCandidates.concat(items);
  }
}

ctx.log("Candidates: " + allCandidates.length + " (OL: " + sourceCounts.openlibrary + ", Google: " + sourceCounts.google + ", NYT: " + sourceCounts.nyt + ")");

// ── Deduplicate by normalized title ──
function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-z0-9]/g, "").trim();
}

function richness(r) {
  var score = 0;
  if (r.coverUrl) score += 3;
  if (r.rating > 0) score += 2;
  if (r.description && r.description.length > 20) score += 2;
  if (r.author) score += 1;
  if (r.categories && r.categories.length > 0) score += 1;
  return score;
}

var seen = {};
var deduped = [];
for (var k = 0; k < allCandidates.length; k++) {
  var c = allCandidates[k];
  var norm = normalizeTitle(c.title);
  if (!norm) continue;
  if (seen[norm] !== undefined) {
    if (richness(c) > richness(deduped[seen[norm]])) {
      deduped[seen[norm]] = c;
    }
  } else {
    seen[norm] = deduped.length;
    deduped.push(c);
  }
}

ctx.log("After dedup: " + deduped.length + " unique candidates");

// ── Load taste profile for LLM context ──
var tasteProfile = { version: 1, interactionCount: 0, genreWeights: {}, savedBooks: [], ratings: [], dismissedBooks: [], authorAffinities: {}, streak: { current: 0, longest: 0 } };
try {
  if (fs.existsSync(tastePath)) {
    tasteProfile = JSON.parse(fs.readFileSync(tastePath, "utf-8"));
  }
} catch (e) {}

// ── Build candidate list for LLM ──
var candidateList = deduped.slice(0, 40).map(function(c, idx) {
  return {
    index: idx,
    title: c.title,
    author: c.author,
    description: (c.description || "").slice(0, 150),
    rating: c.rating || 0,
    categories: (c.categories || []).slice(0, 3),
    source: c.source,
    hasCover: !!c.coverUrl,
    rank: c.rank || 0,
    weeksOnList: c.weeksOnList || 0,
  };
});

// ── LLM Curation ──
var topGenres = Object.entries(tasteProfile.genreWeights || {}).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5);
var recentSaved = (tasteProfile.savedBooks || []).slice(-5).map(function(b) { return b.title; });
var recentDismissed = (tasteProfile.dismissedBooks || []).slice(-5).map(function(b) { return b.title; });
var topAuthors = Object.entries(tasteProfile.authorAffinities || {}).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3);

var curationPrompt = "You are a book curator for a daily discovery feature. Today's theme: " + theme.name + " (" + theme.icon + ").\n\n";

if (tasteProfile.interactionCount > 0) {
  curationPrompt += "User taste profile:\n";
  curationPrompt += "- Top genres: " + (topGenres.length > 0 ? topGenres.map(function(g) { return g[0] + " (" + g[1].toFixed(2) + ")"; }).join(", ") : "none yet") + "\n";
  curationPrompt += "- Recently saved: " + (recentSaved.length > 0 ? recentSaved.join(", ") : "none") + "\n";
  curationPrompt += "- Recently dismissed: " + (recentDismissed.length > 0 ? recentDismissed.join(", ") : "none") + "\n";
  curationPrompt += "- Author affinities: " + (topAuthors.length > 0 ? topAuthors.map(function(a) { return a[0]; }).join(", ") : "none") + "\n\n";
} else {
  curationPrompt += "This is a new user with no taste data yet. Focus on popular, highly-rated, well-known books.\n\n";
}

curationPrompt += "Candidate pool (" + candidateList.length + " books):\n";
curationPrompt += JSON.stringify(candidateList, null, 1) + "\n\n";
curationPrompt += "Select and return ONLY a valid JSON object (no markdown, no explanation):\n";
curationPrompt += '{\n';
curationPrompt += '  "bookOfTheDay": { "index": <number>, "whyThisBook": "<1-2 sentences>", "whoItsFor": "<1 sentence>" },\n';
curationPrompt += '  "themePicks": [ { "index": <number>, "oneLinePitch": "<compelling pitch>" } ],\n';
curationPrompt += '  "bestsellerSpotlight": { "index": <number or -1 if no NYT books>, "rankingContext": "<context>" },\n';
curationPrompt += '  "serendipityPick": { "index": <number>, "whyUnexpected": "<why this might surprise>" }\n';
curationPrompt += '}\n\n';
curationPrompt += "Rules:\n";
curationPrompt += "- bookOfTheDay: highest quality match for the theme. MUST have hasCover=true. Write engaging whyThisBook.\n";
curationPrompt += "- themePicks: 3-5 diverse books from the theme. Do not duplicate BOTD. Prefer rated > 3.5.\n";
curationPrompt += "- bestsellerSpotlight: pick from source='nyt' candidates only. If no NYT books, set index to -1.\n";
curationPrompt += "- serendipityPick: deliberately outside user's top genres. Explain why it might delight.\n";
curationPrompt += "- Never pick dismissed books. Return only valid candidate indices.\n";

var curation = null;
try {
  var llmResult = await ctx.ask(curationPrompt, { temperature: 0.7 });
  if (llmResult && llmResult.ok && llmResult.text) {
    // Extract JSON from response (handle potential markdown wrapping)
    var jsonText = llmResult.text.trim();
    if (jsonText.indexOf("```") >= 0) {
      jsonText = jsonText.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    }
    curation = JSON.parse(jsonText);
  }
} catch (e) {
  ctx.log("LLM curation error: " + (e.message || e));
}

// ── Build result card ──
function resolveBook(idx) {
  if (idx === undefined || idx === null || idx < 0 || idx >= deduped.length) return null;
  return deduped[idx];
}

var result = {
  tool: "enso_books_discover",
  date: dateStr,
  theme: { name: theme.name, icon: theme.icon, dayLabel: theme.dayLabel, subjects: theme.subjects },
  generatedAt: new Date().toISOString(),
  candidateCount: deduped.length,
  sourceCounts: sourceCounts,
};

if (curation) {
  // Book of the Day
  if (curation.bookOfTheDay) {
    var botd = resolveBook(curation.bookOfTheDay.index);
    if (botd) {
      result.bookOfTheDay = Object.assign({}, botd, {
        whyThisBook: curation.bookOfTheDay.whyThisBook || "",
        whoItsFor: curation.bookOfTheDay.whoItsFor || "",
      });
    }
  }

  // Theme Picks
  result.themePicks = [];
  if (curation.themePicks && Array.isArray(curation.themePicks)) {
    for (var ti = 0; ti < curation.themePicks.length; ti++) {
      var tp = curation.themePicks[ti];
      var tBook = resolveBook(tp.index);
      if (tBook) {
        result.themePicks.push(Object.assign({}, tBook, { oneLinePitch: tp.oneLinePitch || "" }));
      }
    }
  }

  // Bestseller Spotlight
  if (curation.bestsellerSpotlight && curation.bestsellerSpotlight.index >= 0) {
    var bsBook = resolveBook(curation.bestsellerSpotlight.index);
    if (bsBook) {
      result.bestsellerSpotlight = Object.assign({}, bsBook, {
        rankingContext: curation.bestsellerSpotlight.rankingContext || "",
      });
    }
  }

  // Serendipity Pick
  if (curation.serendipityPick) {
    var spBook = resolveBook(curation.serendipityPick.index);
    if (spBook) {
      result.serendipityPick = Object.assign({}, spBook, {
        whyUnexpected: curation.serendipityPick.whyUnexpected || "",
      });
    }
  }
} else {
  // Fallback without LLM: pick top candidates by richness
  ctx.log("Using fallback selection (no LLM curation)");
  var sorted = deduped.slice().sort(function(a, b) { return richness(b) - richness(a); });
  var withCover = sorted.filter(function(b) { return b.coverUrl; });
  if (withCover.length > 0) {
    result.bookOfTheDay = Object.assign({}, withCover[0], {
      whyThisBook: "Top pick for today's " + theme.name + " theme.",
      whoItsFor: "Readers interested in " + theme.name.toLowerCase() + ".",
    });
  }
  result.themePicks = withCover.slice(1, 5).map(function(b) {
    return Object.assign({}, b, { oneLinePitch: b.description ? b.description.slice(0, 80) : b.title });
  });
  var nytBooks = sorted.filter(function(b) { return b.source === "nyt"; });
  if (nytBooks.length > 0) {
    result.bestsellerSpotlight = Object.assign({}, nytBooks[0], {
      rankingContext: nytBooks[0].rank ? "#" + nytBooks[0].rank + " NYT, " + (nytBooks[0].weeksOnList || 0) + " weeks" : "NYT Bestseller",
    });
  }
  // Serendipity: pick the last unique one
  if (sorted.length > 5) {
    result.serendipityPick = Object.assign({}, sorted[sorted.length - 1], {
      whyUnexpected: "Something different from today's main theme.",
    });
  }
}

// ── Attach taste profile summary ──
result.tasteProfile = {
  interactionCount: tasteProfile.interactionCount || 0,
  streak: tasteProfile.streak || { current: 0, longest: 0 },
  topGenres: Object.entries(tasteProfile.genreWeights || {}).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3).map(function(e) { return e[0]; }),
};

// ── Save to cache ──
try {
  fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), "utf-8");
  ctx.log("Cached discovery to " + cachePath);
} catch (e) {
  ctx.log("Cache write error: " + (e.message || e));
}

return { content: [{ type: "text", text: JSON.stringify(result) }] };
