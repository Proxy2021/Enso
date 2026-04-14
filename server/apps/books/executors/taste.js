// Books — Taste Profile: save/rate/dismiss books, view profile, update genre weights
var os = require("os");
var fs = require("fs");
var path = require("path");

var p = params || {};
var action = (p.action || "view").toLowerCase();

// ── Profile path ──
var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}
var tastePath = path.join(cacheDir, "book-taste-profile.json");

// ── Load or initialize profile ──
var profile = {
  version: 2,
  updatedAt: new Date().toISOString(),
  interactionCount: 0,
  genreWeights: {},
  savedBooks: [],
  ratings: [],
  dismissedBooks: [],
  authorAffinities: {},
  streak: { current: 0, longest: 0, lastDate: "" },
  moodWeights: {},
  lengthPreference: 0,
  recentMoods: [],
};

try {
  if (fs.existsSync(tastePath)) {
    profile = JSON.parse(fs.readFileSync(tastePath, "utf-8"));
  }
} catch (e) {
  ctx.log("Taste profile read error: " + (e.message || e));
}

// ── Helper: update genre weights ──
function updateGenreWeights(categories, delta) {
  if (!categories || !Array.isArray(categories)) return;
  for (var i = 0; i < categories.length; i++) {
    var cat = categories[i].toLowerCase().replace(/\s+/g, "_");
    if (!cat) continue;
    var current = profile.genreWeights[cat] || 0.5;
    profile.genreWeights[cat] = Math.max(0, Math.min(1, current + delta));
  }
}

// ── Helper: update author affinity ──
function updateAuthorAffinity(author, delta) {
  if (!author) return;
  var current = profile.authorAffinities[author] || 0.5;
  profile.authorAffinities[author] = Math.max(0, Math.min(1, current + delta));
}

// ── Helper: update mood weights ──
function updateMoodWeights(moodTags, delta) {
  if (!moodTags || !Array.isArray(moodTags)) return;
  if (!profile.moodWeights) profile.moodWeights = {};
  for (var i = 0; i < moodTags.length; i++) {
    var mood = moodTags[i].toLowerCase();
    var current = profile.moodWeights[mood] || 0.5;
    profile.moodWeights[mood] = Math.max(0, Math.min(1, current + delta));
  }
  if (!profile.recentMoods) profile.recentMoods = [];
  profile.recentMoods = profile.recentMoods.concat(moodTags).slice(-20);
}

// ── Helper: update length preference ──
function updateLengthPreference(pageCount, isPositive) {
  if (!pageCount || pageCount <= 0) return;
  var signal = pageCount > 400 ? 0.1 : pageCount < 200 ? -0.1 : 0;
  if (!isPositive) signal = -signal;
  profile.lengthPreference = Math.max(-1, Math.min(1, (profile.lengthPreference || 0) + signal));
}

// ── Helper: update streak ──
function updateStreak() {
  var todayStr = new Date().toISOString().slice(0, 10);
  if (!profile.streak) profile.streak = { current: 0, longest: 0, lastDate: "" };
  if (profile.streak.lastDate === todayStr) return; // Already counted today
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = yesterday.toISOString().slice(0, 10);
  if (profile.streak.lastDate === yesterdayStr) {
    profile.streak.current = (profile.streak.current || 0) + 1;
  } else if (profile.streak.lastDate !== todayStr) {
    profile.streak.current = 1;
  }
  if (profile.streak.current > (profile.streak.longest || 0)) {
    profile.streak.longest = profile.streak.current;
  }
  profile.streak.lastDate = todayStr;
}

// ── Helper: create book slug ──
function slugify(title) {
  return (title || "").toLowerCase().replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

// ── Process actions ──
var responseMessage = "";

if (action === "save") {
  var bookData = p.bookData || {};
  var title = bookData.title || p.bookId || "";
  if (!title) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_books_taste", action: "save", error: "Missing book title or bookData" }) }] };
  }
  // Check if already saved
  var alreadySaved = profile.savedBooks.some(function(b) { return slugify(b.title) === slugify(title); });
  if (!alreadySaved) {
    profile.savedBooks.push({
      title: title,
      author: bookData.author || "",
      slug: slugify(title),
      savedAt: new Date().toISOString(),
      categories: bookData.categories || [],
      coverUrl: bookData.coverUrl || "",
    });
    // Update weights: save = +0.15 per category
    updateGenreWeights(bookData.categories, 0.15);
    updateAuthorAffinity(bookData.author, 0.15);
    updateMoodWeights(bookData.moodTags, 0.15);
    updateLengthPreference(bookData.pageCount, true);
    profile.interactionCount = (profile.interactionCount || 0) + 1;
    updateStreak();
    responseMessage = "Saved \"" + title + "\" to your taste profile.";
  } else {
    responseMessage = "\"" + title + "\" is already in your saved books.";
  }

} else if (action === "rate") {
  var bookData = p.bookData || {};
  var title = bookData.title || p.bookId || "";
  var rating = p.rating || 0;
  if (!title || rating < 1 || rating > 5) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_books_taste", action: "rate", error: "Need bookId/bookData and rating (1-5)" }) }] };
  }
  // Update or add rating
  var existingIdx = -1;
  for (var ri = 0; ri < profile.ratings.length; ri++) {
    if (slugify(profile.ratings[ri].title) === slugify(title)) { existingIdx = ri; break; }
  }
  var ratingEntry = {
    title: title,
    author: bookData.author || "",
    slug: slugify(title),
    rating: rating,
    ratedAt: new Date().toISOString(),
    categories: bookData.categories || [],
  };
  if (existingIdx >= 0) {
    profile.ratings[existingIdx] = ratingEntry;
  } else {
    profile.ratings.push(ratingEntry);
  }
  // Update weights: 5-star = +0.2, 4-star = +0.1, 3-star = 0, 2-star = -0.05, 1-star = -0.1
  var weightDelta = (rating - 3) * 0.05 + (rating >= 4 ? 0.05 : 0);
  updateGenreWeights(bookData.categories, weightDelta);
  updateAuthorAffinity(bookData.author, weightDelta);
  updateMoodWeights(bookData.moodTags, weightDelta);
  updateLengthPreference(bookData.pageCount, rating >= 3);
  profile.interactionCount = (profile.interactionCount || 0) + 1;
  updateStreak();
  responseMessage = "Rated \"" + title + "\" " + rating + "/5.";

} else if (action === "dismiss") {
  var bookData = p.bookData || {};
  var title = bookData.title || p.bookId || "";
  if (!title) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_books_taste", action: "dismiss", error: "Missing book title or bookData" }) }] };
  }
  var alreadyDismissed = profile.dismissedBooks.some(function(b) { return slugify(b.title) === slugify(title); });
  if (!alreadyDismissed) {
    profile.dismissedBooks.push({
      title: title,
      slug: slugify(title),
      dismissedAt: new Date().toISOString(),
      categories: bookData.categories || [],
    });
    // Dismiss = -0.1 per category
    updateGenreWeights(bookData.categories, -0.1);
    updateMoodWeights(bookData.moodTags, -0.1);
    profile.interactionCount = (profile.interactionCount || 0) + 1;
    updateStreak();
    responseMessage = "Dismissed \"" + title + "\". It won't appear in future picks.";
  } else {
    responseMessage = "\"" + title + "\" was already dismissed.";
  }

} else if (action === "view") {
  // Just return profile, no modifications
  responseMessage = "Your taste profile (" + (profile.interactionCount || 0) + " interactions).";
}

// ── Apply weekly decay (5% toward 0.5 baseline) ──
// Only apply once per day
var todayStr = new Date().toISOString().slice(0, 10);
if (profile.updatedAt && profile.updatedAt.slice(0, 10) !== todayStr && action !== "view") {
  var lastUpdate = new Date(profile.updatedAt);
  var daysSince = Math.floor((Date.now() - lastUpdate.getTime()) / 86400000);
  if (daysSince >= 7) {
    var decayRounds = Math.floor(daysSince / 7);
    var decayFactor = Math.pow(0.95, decayRounds);
    var genreKeys = Object.keys(profile.genreWeights || {});
    for (var gi = 0; gi < genreKeys.length; gi++) {
      var gk = genreKeys[gi];
      var val = profile.genreWeights[gk];
      // Decay toward 0.5 baseline
      profile.genreWeights[gk] = 0.5 + (val - 0.5) * decayFactor;
    }
    var authorKeys = Object.keys(profile.authorAffinities || {});
    for (var ai = 0; ai < authorKeys.length; ai++) {
      var ak = authorKeys[ai];
      var aval = profile.authorAffinities[ak];
      profile.authorAffinities[ak] = 0.5 + (aval - 0.5) * decayFactor;
    }
    // Decay mood weights toward 0.5 baseline
    var moodKeys = Object.keys(profile.moodWeights || {});
    for (var mi = 0; mi < moodKeys.length; mi++) {
      var mk = moodKeys[mi];
      var mval = profile.moodWeights[mk];
      profile.moodWeights[mk] = 0.5 + (mval - 0.5) * decayFactor;
    }
  }
}

// ── Trim to keep profile manageable ──
if (profile.savedBooks.length > 100) profile.savedBooks = profile.savedBooks.slice(-100);
if (profile.ratings.length > 100) profile.ratings = profile.ratings.slice(-100);
if (profile.dismissedBooks.length > 200) profile.dismissedBooks = profile.dismissedBooks.slice(-200);

// ── Save profile ──
profile.updatedAt = new Date().toISOString();
try {
  fs.writeFileSync(tastePath, JSON.stringify(profile, null, 2), "utf-8");
} catch (e) {
  ctx.log("Taste profile write error: " + (e.message || e));
}

// ── Build response ──
var topGenres = Object.entries(profile.genreWeights || {}).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5);

var result = {
  tool: "enso_books_taste",
  action: action,
  message: responseMessage,
  profile: {
    interactionCount: profile.interactionCount || 0,
    genreWeights: profile.genreWeights || {},
    topGenres: topGenres.map(function(e) { return { genre: e[0], weight: Math.round(e[1] * 100) / 100 }; }),
    savedCount: profile.savedBooks.length,
    ratedCount: profile.ratings.length,
    dismissedCount: profile.dismissedBooks.length,
    savedBooks: profile.savedBooks.slice(-10),
    ratings: profile.ratings.slice(-10),
    streak: profile.streak || { current: 0, longest: 0 },
    topAuthors: Object.entries(profile.authorAffinities || {}).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5).map(function(e) { return { author: e[0], affinity: Math.round(e[1] * 100) / 100 }; }),
    topMoods: Object.entries(profile.moodWeights || {}).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5).map(function(e) { return { mood: e[0], weight: Math.round(e[1] * 100) / 100 }; }),
    lengthPreference: (profile.lengthPreference || 0) > 0.3 ? "long" : (profile.lengthPreference || 0) < -0.3 ? "short" : "balanced",
  },
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
