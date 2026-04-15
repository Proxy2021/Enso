var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var wikiPath = path.join(os.homedir(), ".enso", "wiki", "entities");
var action = (params.action || "preview").trim();
var skipExisting = params.skipExisting !== false; // default true: don't overwrite existing ratings

// ── Load entity index ──
var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_media_library_batch_seed", action: action, error: "Could not load entity index: " + e.message })
    }]
  };
}

var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "song", "artist", "playlist", "article"];

// ── Wiki file resolution ──
function resolveWikiFile(entity) {
  // 1. Try cortexPath
  if (entity.cortexPath) {
    var cpFile = entity.cortexPath.replace("entities/", "");
    var fp = path.join(wikiPath, cpFile);
    if (fs.existsSync(fp)) return fp;
  }
  // 2. Fallback: type-prefixed slug without year suffix
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
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

// ── Rating extraction from wiki content ──
function extractRating(content, entityType) {
  // Books: ⭐ 4.5 (4,887 reviews) — Amazon 1-5 scale
  // Movies/TV/Docs: ⭐ 7.5/10 (144 votes) — TMDB 1-10 scale
  // Games: **Metacritic Score**: 86 — 0-100 scale

  if (entityType === "game") {
    var metaMatch = content.match(/[Mm]etacritic[^0-9]*(\d+)/);
    if (metaMatch) {
      var score = parseInt(metaMatch[1], 10);
      if (score >= 0 && score <= 100) return { raw: score, scale: "metacritic", converted: Math.round(score / 10) };
    }
    return null;
  }

  // Star emoji pattern: ⭐ N.N or ⭐ N.N/10
  var starMatch = content.match(/⭐\s*([\d.]+)(?:\s*\/\s*10)?/);
  if (starMatch) {
    var val = parseFloat(starMatch[1]);
    if (isNaN(val)) return null;

    // Detect if this is /10 format (TMDB) or /5 format (Amazon)
    var isTenScale = /⭐\s*[\d.]+\s*\/\s*10/.test(content);

    if (entityType === "book") {
      // Books use Amazon 1-5 scale unless explicitly /10
      if (isTenScale) {
        var converted = Math.round(val);
        if (converted < 1) converted = 1;
        if (converted > 10) converted = 10;
        return { raw: val, scale: "rating_10", converted: converted };
      }
      // Amazon style — multiply by 2
      if (val >= 0 && val <= 5) {
        var converted = Math.round(val * 2);
        if (converted < 1) converted = 1;
        if (converted > 10) converted = 10;
        return { raw: val, scale: "amazon", converted: converted };
      }
    }

    // Movies, TV, Documentaries — TMDB 1-10 scale
    if (isTenScale || val <= 10) {
      var converted = Math.round(val);
      if (converted < 1) converted = 1;
      if (converted > 10) converted = 10;
      return { raw: val, scale: "tmdb", converted: converted };
    }
  }

  return null;
}

// ── Determine consumption status ──
function inferConsumptionStatus(entity) {
  // Kindle books: user owns them → completed
  if (entity.type === "book" && (entity.source === "kindle" || entity.source === "weread")) return "completed";
  // Movies from movies_tv source (local collection): user has watched them
  if (entity.type === "movie" && entity.source === "movies_tv") return "completed";
  // TV from movies_tv: likely watched
  if (entity.type === "tv-series" && entity.source === "movies_tv") return "completed";
  // Documentaries from movies_tv: likely watched
  if (entity.type === "documentary" && entity.source === "movies_tv") return "completed";
  // Steam games: user owns them → at minimum started
  if (entity.type === "game" && entity.source === "steam") return "completed";
  return null;
}

// ══════════════════════════════════════════════
// STATUS ACTION — show current engagement coverage
// ══════════════════════════════════════════════
if (action === "status") {
  var allEntities = Object.values(index);
  var mediaEntities = [];
  for (var si = 0; si < allEntities.length; si++) {
    if (mediaEntityTypes.indexOf(allEntities[si].type) >= 0) mediaEntities.push(allEntities[si]);
  }

  var totalMedia = mediaEntities.length;
  var withRating = 0;
  var withFavorite = 0;
  var withStatus = 0;
  var byType = {};

  for (var sj = 0; sj < mediaEntities.length; sj++) {
    var ent = mediaEntities[sj];
    if (!byType[ent.type]) byType[ent.type] = { total: 0, rated: 0, favorited: 0, tracked: 0 };
    byType[ent.type].total++;
    if (ent.userRating) { withRating++; byType[ent.type].rated++; }
    if (ent.isFavorite) { withFavorite++; byType[ent.type].favorited++; }
    if (ent.consumptionStatus && ent.consumptionStatus !== "not_started") { withStatus++; byType[ent.type].tracked++; }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_batch_seed",
        action: "status",
        totalMedia: totalMedia,
        withRating: withRating,
        withFavorite: withFavorite,
        withStatus: withStatus,
        ratingCoverage: totalMedia > 0 ? Math.round((withRating / totalMedia) * 1000) / 10 : 0,
        favoriteCoverage: totalMedia > 0 ? Math.round((withFavorite / totalMedia) * 1000) / 10 : 0,
        statusCoverage: totalMedia > 0 ? Math.round((withStatus / totalMedia) * 1000) / 10 : 0,
        byType: byType
      })
    }]
  };
}

// ══════════════════════════════════════════════
// PREVIEW & SEED — scan entities and optionally apply
// ══════════════════════════════════════════════
var allEntities = Object.values(index);
var candidates = [];
var skippedExisting = 0;
var noWikiPage = 0;
var noRatingFound = 0;

var byTypePreview = {};
var samplesByType = {};

for (var pi = 0; pi < allEntities.length; pi++) {
  var entity = allEntities[pi];
  if (mediaEntityTypes.indexOf(entity.type) === -1) continue;

  // Skip if already has user rating and skipExisting is true
  if (skipExisting && entity.userRating) {
    skippedExisting++;
    continue;
  }

  // Try to find wiki page and extract rating
  var wikiFile = resolveWikiFile(entity);
  var ratingInfo = null;

  if (wikiFile) {
    try {
      var wikiContent = fs.readFileSync(wikiFile, "utf8");
      ratingInfo = extractRating(wikiContent, entity.type);
    } catch (e) { /* skip unreadable files */ }
  } else {
    noWikiPage++;
  }

  // Also check entity-level metadata.rating as fallback
  if (!ratingInfo && entity.metadata && entity.metadata.rating !== undefined && entity.metadata.rating !== null) {
    var metaRating = entity.metadata.rating;
    if (typeof metaRating === "number" && metaRating > 0) {
      // WeRead/research books use 1-10 scale
      if (metaRating <= 5) {
        ratingInfo = { raw: metaRating, scale: "amazon", converted: Math.round(metaRating * 2) };
      } else if (metaRating <= 10) {
        ratingInfo = { raw: metaRating, scale: "rating_10", converted: Math.round(metaRating) };
      }
    }
  }

  var inferredStatus = inferConsumptionStatus(entity);

  // Skip if nothing to seed
  if (!ratingInfo && !inferredStatus) {
    if (wikiFile) noRatingFound++;
    continue;
  }

  var candidate = {
    entityId: entity.entityId,
    title: entity.title,
    type: entity.type,
    source: entity.source
  };

  if (ratingInfo) {
    candidate.sourceRating = ratingInfo.raw;
    candidate.sourceScale = ratingInfo.scale;
    candidate.convertedRating = ratingInfo.converted;
    candidate.wouldFavorite = ratingInfo.converted >= 8;
  }

  if (inferredStatus) {
    candidate.inferredStatus = inferredStatus;
  }

  candidates.push(candidate);

  // Track by type
  if (!byTypePreview[entity.type]) byTypePreview[entity.type] = { ratable: 0, statusable: 0, favoritable: 0 };
  if (ratingInfo) byTypePreview[entity.type].ratable++;
  if (inferredStatus) byTypePreview[entity.type].statusable++;
  if (ratingInfo && ratingInfo.converted >= 8) byTypePreview[entity.type].favoritable++;

  // Collect samples (top-rated per type)
  if (ratingInfo && (!samplesByType[entity.type] || samplesByType[entity.type].length < 5)) {
    if (!samplesByType[entity.type]) samplesByType[entity.type] = [];
    samplesByType[entity.type].push({
      title: entity.title,
      sourceRating: ratingInfo.raw,
      sourceScale: ratingInfo.scale,
      convertedRating: ratingInfo.converted
    });
  }
}

// ── PREVIEW response ──
if (action === "preview") {
  // Build conversion formulas
  var formulas = [
    { source: "Amazon (books)", scale: "1-5 stars", formula: "rating × 2", example: "4.5 stars → 9/10" },
    { source: "TMDB (movies/TV)", scale: "1-10", formula: "use directly (round)", example: "7.5/10 → 8/10" },
    { source: "Metacritic (games)", scale: "0-100", formula: "score ÷ 10 (round)", example: "86 → 9/10" },
    { source: "WeRead/Research", scale: "1-10", formula: "use directly (round)", example: "8.6 → 9/10" }
  ];

  var totalRatable = 0;
  var totalStatusable = 0;
  var totalFavoritable = 0;
  var typeKeys = Object.keys(byTypePreview);
  for (var tk = 0; tk < typeKeys.length; tk++) {
    totalRatable += byTypePreview[typeKeys[tk]].ratable;
    totalStatusable += byTypePreview[typeKeys[tk]].statusable;
    totalFavoritable += byTypePreview[typeKeys[tk]].favoritable;
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_batch_seed",
        action: "preview",
        totalCandidates: candidates.length,
        wouldRate: totalRatable,
        wouldFavorite: totalFavoritable,
        wouldTrack: totalStatusable,
        skippedExisting: skippedExisting,
        noWikiPage: noWikiPage,
        noRatingFound: noRatingFound,
        byType: byTypePreview,
        formulas: formulas,
        samples: samplesByType
      })
    }]
  };
}

// ── SEED — apply changes ──
if (action === "seed") {
  var seededRatings = 0;
  var seededFavorites = 0;
  var seededStatus = 0;
  var now = new Date().toISOString();

  for (var si = 0; si < candidates.length; si++) {
    var c = candidates[si];
    var entity = index[c.entityId];
    if (!entity) continue;

    if (c.convertedRating && (!entity.userRating || !skipExisting)) {
      entity.userRating = c.convertedRating;
      entity.userNotes = "Auto-seeded from " + c.sourceScale + " (" + c.sourceRating + ")";
      seededRatings++;
    }

    if (c.wouldFavorite && !entity.isFavorite) {
      entity.isFavorite = true;
      seededFavorites++;
    }

    if (c.inferredStatus && (!entity.consumptionStatus || entity.consumptionStatus === "not_started")) {
      entity.consumptionStatus = c.inferredStatus;
      if (c.inferredStatus === "completed") {
        entity.dateCompleted = entity.dateCompleted || now;
      }
      seededStatus++;
    }

    entity.updatedAt = now;
  }

  // Save
  try {
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 0), "utf8");
  } catch (e) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_media_library_batch_seed", action: "seed", error: "Failed to save: " + e.message })
      }]
    };
  }

  // Compute rating distribution of seeded items
  var ratingDist = {};
  for (var rd = 0; rd < candidates.length; rd++) {
    if (candidates[rd].convertedRating) {
      var rk = String(candidates[rd].convertedRating);
      ratingDist[rk] = (ratingDist[rk] || 0) + 1;
    }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_batch_seed",
        action: "seed",
        success: true,
        seededRatings: seededRatings,
        seededFavorites: seededFavorites,
        seededStatus: seededStatus,
        totalProcessed: candidates.length,
        skippedExisting: skippedExisting,
        ratingDistribution: ratingDist,
        byType: byTypePreview
      })
    }]
  };
}

// Unknown action
return {
  content: [{
    type: "text",
    text: JSON.stringify({ tool: "enso_media_library_batch_seed", error: "Unknown action: " + action + ". Use preview, seed, or status." })
  }]
};
