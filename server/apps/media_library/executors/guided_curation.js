var fs = require("fs");
var path = require("path");
var os = require("os");

// ── Paths ──
var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var dataDir = path.join(os.homedir(), ".enso", "data", "media-library");
var skipsPath = path.join(dataDir, "curation-skips.json");
var sessionsPath = path.join(dataDir, "curation-sessions.json");
var wikiPath = path.join(os.homedir(), ".enso", "wiki", "entities");

var action = (params.action || "start").trim();
var mediaType = (params.mediaType || "").trim();
var batchSize = params.batchSize || 10;
if (batchSize < 5) batchSize = 5;
if (batchSize > 20) batchSize = 20;

// ── 10-point half-star display helpers ──
function starsFromRating(r) { return r >= 1 && r <= 10 ? r / 2 : null; }
function starsDisplay(r) {
  var s = starsFromRating(r);
  if (s === null) return null;
  var full = Math.floor(s), half = s % 1 >= 0.25 ? 1 : 0;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - half);
}
function ratingLabel(r) {
  if (r >= 10) return "Masterpiece"; if (r >= 9) return "Excellent";
  if (r >= 8) return "Very Good"; if (r >= 7) return "Good";
  if (r >= 6) return "Above Average"; if (r >= 5) return "Average";
  if (r >= 4) return "Below Average"; if (r >= 3) return "Poor";
  return r >= 2 ? "Very Poor" : "Terrible";
}
function ratingDisplay(r) {
  if (r == null) return null;
  return { points: r, stars: starsFromRating(r), display: starsDisplay(r), label: ratingLabel(r) };
}

// ── Persistent data helpers ──
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJSON(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (e) { return fallback; }
}

function saveJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ── Media type helpers ──
var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "album", "artist", "song", "article"];

var typeFilterMap = {
  books: "book", movies: "movie", tv: "tv-series", documentaries: "documentary",
  games: "game", music: "album", articles: "article"
};

function matchesMediaType(entityType, filter) {
  if (!filter) return true;
  var mapped = typeFilterMap[filter] || filter;
  return entityType === mapped;
}

// ── Suggest rating from metadata ──
function suggestRating(entity) {
  // 1. Check metadata.rating (TMDB 1-10 for movies/TV, or direct)
  if (entity.metadata && entity.metadata.rating != null) {
    var r = entity.metadata.rating;
    if (typeof r === "number" && r > 0) {
      if (r <= 5) {
        // Amazon-style 1-5
        return { source: "Amazon", raw: r, scale: "1-5★", suggested: Math.round(r * 2) };
      } else if (r <= 10) {
        return { source: "TMDB", raw: r, scale: "1-10", suggested: Math.round(r) };
      }
    }
  }
  // 2. Check metadata.amazonRating
  if (entity.metadata && entity.metadata.amazonRating != null) {
    var ar = entity.metadata.amazonRating;
    if (typeof ar === "number" && ar > 0 && ar <= 5) {
      return { source: "Amazon", raw: ar, scale: "1-5★", suggested: Math.round(ar * 2) };
    }
  }
  // 3. Check metadata.metacritic
  if (entity.metadata && entity.metadata.metacritic != null) {
    var mc = entity.metadata.metacritic;
    if (typeof mc === "number" && mc > 0 && mc <= 100) {
      return { source: "Metacritic", raw: mc, scale: "0-100", suggested: Math.round(mc / 10) };
    }
  }
  // 4. Try wiki page for embedded ratings
  var wikiRating = extractWikiRating(entity);
  if (wikiRating) return wikiRating;

  return null;
}

function extractWikiRating(entity) {
  var wp = null;
  if (entity.cortexPath) {
    var cpFile = entity.cortexPath.replace("entities/", "");
    var fp = path.join(wikiPath, cpFile);
    if (fs.existsSync(fp)) wp = fp;
  }
  if (!wp) {
    var slug = entity.slug || "";
    var slugNoYear = slug.replace(/-\d{4}$/, "");
    var prefixMap = { "movie": "movie-", "tv-series": "tv-", "documentary": "doc-", "game": "game-" };
    var prefix = prefixMap[entity.type] || "";
    var candidates = [];
    if (prefix) {
      candidates.push(path.join(wikiPath, prefix + slugNoYear + ".md"));
      candidates.push(path.join(wikiPath, prefix + slug + ".md"));
    }
    candidates.push(path.join(wikiPath, slugNoYear + ".md"));
    candidates.push(path.join(wikiPath, slug + ".md"));
    for (var c = 0; c < candidates.length; c++) {
      if (fs.existsSync(candidates[c])) { wp = candidates[c]; break; }
    }
  }
  if (!wp) return null;

  try {
    var content = fs.readFileSync(wp, "utf8");
    // ⭐ N.N or ⭐ N.N/10
    var starMatch = content.match(/⭐\s*([\d.]+)(?:\s*\/\s*10)?/);
    if (starMatch) {
      var val = parseFloat(starMatch[1]);
      if (isNaN(val)) return null;
      var isTenScale = /⭐\s*[\d.]+\s*\/\s*10/.test(content);
      if (entity.type === "book" && !isTenScale && val <= 5) {
        return { source: "Amazon", raw: val, scale: "1-5★", suggested: Math.round(val * 2) };
      }
      if (isTenScale || val <= 10) {
        return { source: "TMDB", raw: val, scale: "1-10", suggested: Math.round(val) };
      }
    }
    // Metacritic for games
    if (entity.type === "game") {
      var metaMatch = content.match(/[Mm]etacritic[^0-9]*(\d+)/);
      if (metaMatch) {
        var score = parseInt(metaMatch[1], 10);
        if (score >= 0 && score <= 100) {
          return { source: "Metacritic", raw: score, scale: "0-100", suggested: Math.round(score / 10) };
        }
      }
    }
  } catch (e) { /* skip */ }
  return null;
}

// ── Count cross-references for an entity ──
function crossRefCount(entity) {
  var count = 0;
  if (entity.crossReferences && Array.isArray(entity.crossReferences)) {
    count = entity.crossReferences.length;
  }
  return count;
}

// ── Load entity index ──
var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_guided_curation", action: action, error: "Could not load entity index: " + e.message })
    }]
  };
}

// ══════════════════════════════════════════════
// START ACTION — generate a smart curation batch
// ══════════════════════════════════════════════
if (action === "start") {
  var skipList = loadJSON(skipsPath, {});
  var allEntities = Object.values(index);
  var mediaEntities = [];
  for (var i = 0; i < allEntities.length; i++) {
    if (mediaEntityTypes.indexOf(allEntities[i].type) >= 0) mediaEntities.push(allEntities[i]);
  }

  // Count rated per type (to find underrepresented types)
  var ratedByType = {};
  var totalByType = {};
  var totalRated = 0;
  for (var j = 0; j < mediaEntities.length; j++) {
    var ent = mediaEntities[j];
    if (!totalByType[ent.type]) totalByType[ent.type] = 0;
    if (!ratedByType[ent.type]) ratedByType[ent.type] = 0;
    totalByType[ent.type]++;
    if (ent.userRating) { ratedByType[ent.type]++; totalRated++; }
  }

  // Build candidate pool: unrated entities, not skipped
  var pool = [];
  for (var k = 0; k < mediaEntities.length; k++) {
    var e = mediaEntities[k];
    if (e.userRating) continue; // already rated
    if (skipList[e.entityId]) continue; // skipped
    if (!matchesMediaType(e.type, mediaType)) continue; // type filter

    var suggestion = suggestRating(e);
    var priority = 0;

    // Priority 1: completed/in_progress but unrated (highest)
    if (e.consumptionStatus === "completed" || e.consumptionStatus === "in_progress") {
      priority += 100;
    }

    // Priority 2: has metadata suggestion (easy one-tap rating)
    if (suggestion) {
      priority += 50;
    }

    // Priority 3: underrepresented types (boost types with low rated%)
    var typeRatedPct = totalByType[e.type] > 0 ? (ratedByType[e.type] / totalByType[e.type]) * 100 : 0;
    if (typeRatedPct < 5) priority += 30;
    else if (typeRatedPct < 15) priority += 15;

    // Priority 4: well-connected items (cross-references)
    var xrefs = crossRefCount(e);
    if (xrefs >= 5) priority += 20;
    else if (xrefs >= 2) priority += 10;

    pool.push({
      entityId: e.entityId,
      type: e.type,
      source: e.source || null,
      title: e.title,
      imageUrl: e.imageUrl || null,
      tags: (e.tags || []).slice(0, 5),
      semanticTags: (e.semanticTags || []).slice(0, 5),
      consumptionStatus: e.consumptionStatus || null,
      isFavorite: e.isFavorite || false,
      suggestion: suggestion,
      crossRefCount: xrefs,
      priority: priority
    });
  }

  // Sort by priority descending, then by title for stability
  pool.sort(function (a, b) {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.title || "").localeCompare(b.title || "");
  });

  // Take top batch
  var batch = pool.slice(0, batchSize);

  // Compute suggestion summary
  var withSuggestion = 0;
  for (var bi = 0; bi < batch.length; bi++) {
    if (batch[bi].suggestion) withSuggestion++;
  }

  // Format items for display
  var items = [];
  for (var fi = 0; fi < batch.length; fi++) {
    var item = batch[fi];
    var formatted = {
      entityId: item.entityId,
      type: item.type,
      source: item.source,
      title: item.title,
      imageUrl: item.imageUrl,
      tags: item.tags,
      semanticTags: item.semanticTags,
      consumptionStatus: item.consumptionStatus,
      isFavorite: item.isFavorite,
      crossRefCount: item.crossRefCount
    };
    if (item.suggestion) {
      var sg = item.suggestion;
      // Clamp suggested to 1-10
      var sug = sg.suggested;
      if (sug < 1) sug = 1;
      if (sug > 10) sug = 10;
      formatted.suggestedRating = sug;
      formatted.suggestedDisplay = ratingDisplay(sug);
      formatted.suggestionSource = sg.source + ": " + sg.raw + (sg.scale === "1-5★" ? "★" : ("/" + sg.scale.replace("1-", "").replace("0-", ""))) + " → suggested " + sug + "/10";
    }
    items.push(formatted);
  }

  // Session metadata
  var sessions = loadJSON(sessionsPath, []);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_guided_curation",
        action: "start",
        batchSize: batch.length,
        totalPool: pool.length,
        withSuggestions: withSuggestion,
        mediaTypeFilter: mediaType || "all",
        libraryStats: {
          totalMedia: mediaEntities.length,
          totalRated: totalRated,
          ratedPercent: mediaEntities.length > 0 ? Math.round((totalRated / mediaEntities.length) * 1000) / 10 : 0,
          totalSkipped: Object.keys(skipList).length,
          ratedByType: ratedByType,
          totalByType: totalByType
        },
        items: items
      })
    }]
  };
}

// ══════════════════════════════════════════════
// RATE ACTION — quick-rate or skip an item
// ══════════════════════════════════════════════
if (action === "rate") {
  var entityId = (params.entityId || "").trim();
  var rating = params.rating;
  var skip = params.skip === true;
  var notes = (params.notes || "").trim();

  if (!entityId) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_media_library_guided_curation", action: "rate", error: "entityId is required", success: false })
      }]
    };
  }

  // Handle skip
  if (skip) {
    var skipList = loadJSON(skipsPath, {});
    skipList[entityId] = { skippedAt: new Date().toISOString() };
    saveJSON(skipsPath, skipList);

    // Record in session stats
    var sessions = loadJSON(sessionsPath, []);
    var today = new Date().toISOString().slice(0, 10);
    var currentSession = null;
    for (var si = sessions.length - 1; si >= 0; si--) {
      if (sessions[si].date === today) { currentSession = sessions[si]; break; }
    }
    if (!currentSession) {
      currentSession = { date: today, rated: 0, skipped: 0, items: [] };
      sessions.push(currentSession);
    }
    currentSession.skipped++;
    currentSession.items.push({ entityId: entityId, action: "skipped", at: new Date().toISOString() });
    saveJSON(sessionsPath, sessions);

    var entity = index[entityId];
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_guided_curation",
          action: "rate",
          entityId: entityId,
          title: entity ? entity.title : entityId,
          skipped: true,
          success: true
        })
      }]
    };
  }

  // Validate rating
  if (rating === undefined || rating === null) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_media_library_guided_curation", action: "rate", error: "rating is required (1-10), or set skip=true", success: false })
      }]
    };
  }

  // Convert star notation (0.5–5.0) to 10-point scale
  if (rating > 0 && rating <= 5 && (rating * 2) === Math.round(rating * 2) && rating !== Math.floor(rating)) {
    rating = Math.round(rating * 2);
  }

  if (rating < 1 || rating > 10 || !Number.isInteger(rating)) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_media_library_guided_curation", action: "rate", error: "rating must be 1-10 integer", success: false })
      }]
    };
  }

  if (!index[entityId]) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_media_library_guided_curation", action: "rate", error: "Entity not found: " + entityId, success: false })
      }]
    };
  }

  // Apply rating
  var entity = index[entityId];
  entity.userRating = rating;
  if (notes) entity.userNotes = notes;
  entity.updatedAt = new Date().toISOString();

  // Save entity index
  try {
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 0), "utf8");
  } catch (e) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_media_library_guided_curation", action: "rate", error: "Failed to save: " + e.message, success: false })
      }]
    };
  }

  // Record in session stats
  var sessions = loadJSON(sessionsPath, []);
  var today = new Date().toISOString().slice(0, 10);
  var currentSession = null;
  for (var si = sessions.length - 1; si >= 0; si--) {
    if (sessions[si].date === today) { currentSession = sessions[si]; break; }
  }
  if (!currentSession) {
    currentSession = { date: today, rated: 0, skipped: 0, items: [] };
    sessions.push(currentSession);
  }
  currentSession.rated++;
  currentSession.items.push({ entityId: entityId, action: "rated", rating: rating, at: new Date().toISOString() });
  saveJSON(sessionsPath, sessions);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_guided_curation",
        action: "rate",
        entityId: entityId,
        title: entity.title,
        type: entity.type,
        userRating: rating,
        ratingDisplay: ratingDisplay(rating),
        skipped: false,
        success: true
      })
    }]
  };
}

// ══════════════════════════════════════════════
// PROGRESS ACTION — session stats & engagement tracking
// ══════════════════════════════════════════════
if (action === "progress") {
  var sessions = loadJSON(sessionsPath, []);
  var skipList = loadJSON(skipsPath, {});

  // Count current library engagement
  var allEntities = Object.values(index);
  var mediaEntities = [];
  for (var i = 0; i < allEntities.length; i++) {
    if (mediaEntityTypes.indexOf(allEntities[i].type) >= 0) mediaEntities.push(allEntities[i]);
  }

  var totalMedia = mediaEntities.length;
  var totalRated = 0;
  var ratedByType = {};
  var totalByType = {};
  for (var j = 0; j < mediaEntities.length; j++) {
    var e = mediaEntities[j];
    if (!totalByType[e.type]) totalByType[e.type] = 0;
    if (!ratedByType[e.type]) ratedByType[e.type] = 0;
    totalByType[e.type]++;
    if (e.userRating) { totalRated++; ratedByType[e.type]++; }
  }

  var currentRatedPct = totalMedia > 0 ? Math.round((totalRated / totalMedia) * 1000) / 10 : 0;

  // Today's session
  var today = new Date().toISOString().slice(0, 10);
  var todaySession = null;
  for (var si = sessions.length - 1; si >= 0; si--) {
    if (sessions[si].date === today) { todaySession = sessions[si]; break; }
  }

  var todayRated = todaySession ? todaySession.rated : 0;
  var todaySkipped = todaySession ? todaySession.skipped : 0;

  // All-time session stats
  var allTimeRated = 0;
  var allTimeSkipped = 0;
  var sessionDays = sessions.length;
  for (var as = 0; as < sessions.length; as++) {
    allTimeRated += sessions[as].rated || 0;
    allTimeSkipped += sessions[as].skipped || 0;
  }

  // Projection: if user continues at today's pace, how many sessions to reach 20%?
  var target20Pct = Math.ceil(totalMedia * 0.2);
  var remaining = target20Pct - totalRated;
  var avgPerSession = sessionDays > 0 ? Math.round(allTimeRated / sessionDays) : todayRated;
  var sessionsToTarget = remaining > 0 && avgPerSession > 0 ? Math.ceil(remaining / avgPerSession) : 0;

  // Rating distribution
  var ratingDist = {};
  for (var rd = 0; rd < mediaEntities.length; rd++) {
    if (mediaEntities[rd].userRating) {
      var rk = String(mediaEntities[rd].userRating);
      ratingDist[rk] = (ratingDist[rk] || 0) + 1;
    }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_guided_curation",
        action: "progress",
        today: {
          date: today,
          rated: todayRated,
          skipped: todaySkipped,
          total: todayRated + todaySkipped
        },
        allTime: {
          sessionDays: sessionDays,
          totalRated: allTimeRated,
          totalSkipped: allTimeSkipped,
          avgPerSession: avgPerSession
        },
        library: {
          totalMedia: totalMedia,
          totalRated: totalRated,
          ratedPercent: currentRatedPct,
          totalSkipped: Object.keys(skipList).length,
          ratedByType: ratedByType,
          totalByType: totalByType,
          ratingDistribution: ratingDist
        },
        projection: {
          targetPercent: 20,
          targetCount: target20Pct,
          remaining: remaining > 0 ? remaining : 0,
          avgPerSession: avgPerSession,
          sessionsToTarget: sessionsToTarget,
          message: remaining <= 0
            ? "Target reached! " + currentRatedPct + "% engagement."
            : "At " + avgPerSession + " ratings/session, " + sessionsToTarget + " more session(s) to reach 20% engagement."
        }
      })
    }]
  };
}

// Unknown action
return {
  content: [{
    type: "text",
    text: JSON.stringify({ tool: "enso_media_library_guided_curation", action: action, error: "Unknown action: " + action + ". Use start, rate, or progress." })
  }]
};
