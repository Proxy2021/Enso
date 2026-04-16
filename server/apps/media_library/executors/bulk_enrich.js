var os = require("os");
var path = require("path");
var fs = require("fs");

// ── Paths ──
var homedir = os.homedir();
var indexPath = path.join(homedir, ".enso", "data", "entity-index.json");
var moviesCachePath = path.join(homedir, ".enso", "data", "user-context", "cache", "movies-tv.json");
var steamCachePath = path.join(homedir, ".enso", "data", "user-context", "cache", "steam-games.json");
var kindleCachePath = path.join(homedir, ".enso", "data", "user-context", "cache", "kindle-library.json");
var keysPath = path.join(homedir, ".enso", "api-keys.json");

// ── Parameters ──
var action = (params.action || "status").trim();
var mediaType = (params.mediaType || "all").trim();
var enrichLimit = params.limit || 50;

// ── Helpers ──
function loadJSON(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch (e) { return null; }
}

function saveJSON(filePath, data) {
  var dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function result(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

// ── Load all data ──
var entityIndex = loadJSON(indexPath) || {};
var moviesCache = loadJSON(moviesCachePath);
var steamCache = loadJSON(steamCachePath);
var kindleCache = loadJSON(kindleCachePath);
var apiKeys = loadJSON(keysPath) || {};

var tmdbKey = apiKeys.tmdb || process.env.TMDB_API_KEY || "";

// ── Build lookup maps: title (lowercase) → cache item ──
var kindleByTitle = {};
if (kindleCache && kindleCache.books) {
  for (var ki = 0; ki < kindleCache.books.length; ki++) {
    var kb = kindleCache.books[ki];
    if (kb.title) kindleByTitle[kb.title.toLowerCase()] = kb;
  }
}

var moviesByTitle = {};
if (moviesCache && moviesCache.items) {
  for (var mi = 0; mi < moviesCache.items.length; mi++) {
    var mb = moviesCache.items[mi];
    if (mb.title) moviesByTitle[mb.title.toLowerCase()] = mb;
  }
}

var steamByName = {};
if (steamCache && steamCache.games) {
  for (var si = 0; si < steamCache.games.length; si++) {
    var sg = steamCache.games[si];
    if (sg.name) steamByName[sg.name.toLowerCase()] = sg;
  }
}

// ── Enrichment detection ──
var ENRICHABLE_TYPES = ["book", "movie", "tv-series", "documentary", "game"];

function hasEntityMetadata(entity) {
  var m = entity.metadata;
  if (!m) return false;
  if (m.enrichedAt) return true;
  if (m.description && m.description.length > 20) return true;
  if (m.overview && m.overview.length > 20) return true;
  return false;
}

function hasCacheEnrichment(entity) {
  var titleLower = entity.title.toLowerCase();
  if (entity.source === "kindle") {
    var kItem = kindleByTitle[titleLower];
    return !!(kItem && kItem.enrichedAt);
  }
  if (entity.source === "movies_tv") {
    var mItem = moviesByTitle[titleLower];
    return !!(mItem && mItem.enrichedAt);
  }
  if (entity.source === "steam") {
    var sItem = steamByName[titleLower];
    return !!(sItem && sItem.enrichedAt);
  }
  if (entity.source === "weread") {
    return hasEntityMetadata(entity);
  }
  return false;
}

function needsPropagation(entity) {
  return !hasEntityMetadata(entity) && hasCacheEnrichment(entity);
}

function needsApiEnrichment(entity) {
  return !hasEntityMetadata(entity) && !hasCacheEnrichment(entity);
}

// ── Type filtering ──
var typeFilter = null;
if (mediaType === "movies") typeFilter = ["movie"];
else if (mediaType === "tv") typeFilter = ["tv-series", "documentary"];
else if (mediaType === "books") typeFilter = ["book"];
else if (mediaType === "games") typeFilter = ["game"];

function matchesFilter(entity) {
  if (ENRICHABLE_TYPES.indexOf(entity.type) === -1) return false;
  if (typeFilter && typeFilter.indexOf(entity.type) === -1) return false;
  return true;
}

// ── Gather all enrichable entities ──
var allEntities = Object.values(entityIndex);

// ═════════════════════════════════════════════════
// STATUS ACTION
// ═════════════════════════════════════════════════
if (action === "status") {
  var byType = {};
  var oTotal = 0, oEnriched = 0, oPropagatable = 0, oNeedsApi = 0;

  for (var sti = 0; sti < ENRICHABLE_TYPES.length; sti++) {
    var mtype = ENRICHABLE_TYPES[sti];
    if (typeFilter && typeFilter.indexOf(mtype) === -1) continue;

    var total = 0, enriched = 0, propagatable = 0, apiNeeded = 0;
    for (var ej = 0; ej < allEntities.length; ej++) {
      var e = allEntities[ej];
      if (e.type !== mtype) continue;
      total++;
      if (hasEntityMetadata(e)) enriched++;
      else if (hasCacheEnrichment(e)) propagatable++;
      else apiNeeded++;
    }

    // Estimate time: movies 600ms (2 calls × 300ms), games 1000ms, books 200ms
    var rateMs = (mtype === "game") ? 1000 : (mtype === "book") ? 200 : 600;
    var estMin = Math.round((apiNeeded * rateMs / 60000) * 10) / 10;

    byType[mtype] = {
      total: total, enriched: enriched, propagatable: propagatable,
      needsApi: apiNeeded,
      percent: total > 0 ? Math.round((enriched / total) * 100) : 100,
      estimateMinutes: estMin
    };

    oTotal += total;
    oEnriched += enriched;
    oPropagatable += propagatable;
    oNeedsApi += apiNeeded;
  }

  return result({
    tool: "enso_media_library_bulk_enrich",
    action: "status",
    totalEntities: oTotal,
    coverage: {
      overall: {
        total: oTotal, enriched: oEnriched, propagatable: oPropagatable,
        needsApi: oNeedsApi,
        percent: oTotal > 0 ? Math.round((oEnriched / oTotal) * 100) : 100
      },
      byType: byType
    },
    apiStatus: {
      tmdb: { configured: !!tmdbKey },
      steam: { configured: true, note: "No key required" },
      googleBooks: { configured: true, note: "Free API" }
    },
    caches: {
      kindle: {
        total: kindleCache && kindleCache.books ? kindleCache.books.length : 0,
        enriched: kindleCache && kindleCache.books ? kindleCache.books.filter(function (b) { return b.enrichedAt; }).length : 0
      },
      moviesTv: {
        total: moviesCache && moviesCache.items ? moviesCache.items.length : 0,
        enriched: moviesCache && moviesCache.items ? moviesCache.items.filter(function (m) { return m.enrichedAt; }).length : 0
      },
      steam: {
        total: steamCache && steamCache.games ? steamCache.games.length : 0,
        enriched: steamCache && steamCache.games ? steamCache.games.filter(function (g) { return g.enrichedAt; }).length : 0
      }
    }
  });
}

// ═════════════════════════════════════════════════
// PREVIEW ACTION
// ═════════════════════════════════════════════════
if (action === "preview") {
  var previewItems = [];
  var previewLimit = Math.min(enrichLimit, 30);

  for (var pi = 0; pi < allEntities.length && previewItems.length < previewLimit; pi++) {
    var pe = allEntities[pi];
    if (!matchesFilter(pe)) continue;
    if (hasEntityMetadata(pe)) continue;

    var enrichSource = "none";
    var cacheFields = [];
    if (needsPropagation(pe)) {
      enrichSource = "cache_propagation";
      var titleLow = pe.title.toLowerCase();
      var cItem = null;
      if (pe.source === "kindle") cItem = kindleByTitle[titleLow];
      else if (pe.source === "movies_tv") cItem = moviesByTitle[titleLow];
      else if (pe.source === "steam") cItem = steamByName[titleLow];
      if (cItem) {
        var ck = Object.keys(cItem);
        for (var ci = 0; ci < ck.length; ci++) {
          if (cItem[ck[ci]] && ck[ci] !== "title" && ck[ci] !== "fileName" && ck[ci] !== "filePath") {
            cacheFields.push(ck[ci]);
          }
        }
      }
    } else {
      enrichSource = pe.type === "book" ? "google_books" : pe.type === "game" ? "steam_api" : "tmdb";
    }

    previewItems.push({
      entityId: pe.entityId,
      title: pe.title,
      type: pe.type,
      source: pe.source,
      enrichSource: enrichSource,
      currentMetadata: pe.metadata ? Object.keys(pe.metadata) : [],
      cacheHas: cacheFields.slice(0, 10)
    });
  }

  return result({
    tool: "enso_media_library_bulk_enrich",
    action: "preview",
    mediaType: mediaType,
    previewCount: previewItems.length,
    items: previewItems
  });
}

// ═════════════════════════════════════════════════
// ENRICH ACTION
// ═════════════════════════════════════════════════
if (action === "enrich") {
  var res = {
    propagated: 0,
    apiEnriched: 0,
    failed: 0,
    byType: {},
    samples: []
  };

  var enrichedEntityIds = [];
  var apiProcessed = 0;
  var indexDirty = false;

  function addSample(entityId, title, type, method, fields) {
    if (res.samples.length < 10) {
      res.samples.push({ entityId: entityId, title: title, type: type, method: method, fieldsAdded: fields });
    }
  }

  function ensureByType(type) {
    if (!res.byType[type]) res.byType[type] = { propagated: 0, apiEnriched: 0, failed: 0 };
  }

  // ── Phase 1: Cache Propagation (unlimited — no API calls) ──
  ctx.log("Phase 1: Propagating cache enrichment to entity index...");

  for (var p1 = 0; p1 < allEntities.length; p1++) {
    var ent1 = allEntities[p1];
    if (!matchesFilter(ent1)) continue;
    if (!needsPropagation(ent1)) continue;

    var titleLow1 = ent1.title.toLowerCase();
    var cache1 = null;
    if (ent1.source === "kindle") cache1 = kindleByTitle[titleLow1];
    else if (ent1.source === "movies_tv") cache1 = moviesByTitle[titleLow1];
    else if (ent1.source === "steam") cache1 = steamByName[titleLow1];
    if (!cache1) continue;

    var meta = entityIndex[ent1.entityId].metadata || {};
    var addedFields = [];

    if (ent1.source === "kindle") {
      if (cache1.description) { meta.description = cache1.description; addedFields.push("description"); }
      if (cache1.author) { meta.author = cache1.author; addedFields.push("author"); }
      if (cache1.publisher) { meta.publisher = cache1.publisher; addedFields.push("publisher"); }
      if (cache1.publicationDate) { meta.publicationDate = cache1.publicationDate; addedFields.push("publicationDate"); }
      if (cache1.pageCount) { meta.pageCount = cache1.pageCount; addedFields.push("pageCount"); }
      if (cache1.rating) { meta.rating = cache1.rating; addedFields.push("rating"); }
      if (cache1.reviewCount) { meta.reviewCount = cache1.reviewCount; addedFields.push("reviewCount"); }
      if (cache1.categories && cache1.categories.length > 0) { meta.categories = cache1.categories; addedFields.push("categories"); }
      if (cache1.language) { meta.language = cache1.language; addedFields.push("language"); }
      if (cache1.isbn) { meta.isbn = cache1.isbn; addedFields.push("isbn"); }
      if (cache1.asin) { meta.asin = cache1.asin; addedFields.push("asin"); }
      meta.enrichedAt = cache1.enrichedAt || Date.now();
      meta.enrichedBy = "kindle_cache";
    } else if (ent1.source === "movies_tv") {
      if (cache1.overview) { meta.overview = cache1.overview; addedFields.push("overview"); }
      if (cache1.tmdbId) { meta.tmdbId = cache1.tmdbId; addedFields.push("tmdbId"); }
      if (cache1.rating) { meta.rating = cache1.rating; addedFields.push("rating"); }
      if (cache1.voteCount) { meta.voteCount = cache1.voteCount; addedFields.push("voteCount"); }
      if (cache1.genres) { meta.genres = cache1.genres; addedFields.push("genres"); }
      if (cache1.cast) { meta.cast = cache1.cast; addedFields.push("cast"); }
      if (cache1.directors) { meta.directors = cache1.directors; addedFields.push("directors"); }
      if (cache1.runtime) { meta.runtime = cache1.runtime; addedFields.push("runtime"); }
      if (cache1.imdbId) { meta.imdbId = cache1.imdbId; addedFields.push("imdbId"); }
      if (cache1.tagline) { meta.tagline = cache1.tagline; addedFields.push("tagline"); }
      if (cache1.releaseDate) { meta.releaseDate = cache1.releaseDate; addedFields.push("releaseDate"); }
      if (cache1.numberOfSeasons) { meta.numberOfSeasons = cache1.numberOfSeasons; addedFields.push("numberOfSeasons"); }
      meta.enrichedAt = cache1.enrichedAt || Date.now();
      meta.enrichedBy = "tmdb_cache";
      if (!entityIndex[ent1.entityId].imageUrl && cache1.posterPath) {
        entityIndex[ent1.entityId].imageUrl = cache1.posterPath;
      }
    } else if (ent1.source === "steam") {
      if (cache1.description) { meta.description = cache1.description; addedFields.push("description"); }
      if (cache1.genres) { meta.genres = cache1.genres; addedFields.push("genres"); }
      if (cache1.categories) { meta.categories = cache1.categories; addedFields.push("categories"); }
      if (cache1.metacritic) { meta.metacritic = cache1.metacritic; addedFields.push("metacritic"); }
      if (cache1.developers) { meta.developers = cache1.developers; addedFields.push("developers"); }
      if (cache1.publishers) { meta.publishers = cache1.publishers; addedFields.push("publishers"); }
      if (cache1.releaseDate) { meta.releaseDate = cache1.releaseDate; addedFields.push("releaseDate"); }
      if (cache1.screenshots) { meta.screenshots = cache1.screenshots; addedFields.push("screenshots"); }
      meta.enrichedAt = cache1.enrichedAt || Date.now();
      meta.enrichedBy = "steam_cache";
      if (!entityIndex[ent1.entityId].imageUrl && cache1.headerImage) {
        entityIndex[ent1.entityId].imageUrl = cache1.headerImage;
      }
    }

    entityIndex[ent1.entityId].metadata = meta;
    enrichedEntityIds.push(ent1.entityId);
    res.propagated++;
    indexDirty = true;
    ensureByType(ent1.type);
    res.byType[ent1.type].propagated++;
    addSample(ent1.entityId, ent1.title, ent1.type, "cache_propagation", addedFields);

    // Save every 50 propagations
    if (res.propagated % 50 === 0) {
      saveJSON(indexPath, entityIndex);
      ctx.log("Propagated: " + res.propagated + " entities...");
    }
  }

  if (indexDirty) {
    saveJSON(indexPath, entityIndex);
    ctx.log("Phase 1 complete: " + res.propagated + " entities propagated from cache");
  }

  // ── Phase 2: API Enrichment (limited by enrichLimit) ──
  ctx.log("Phase 2: API enrichment for uncached entities (limit: " + enrichLimit + ")...");

  for (var p2 = 0; p2 < allEntities.length && apiProcessed < enrichLimit; p2++) {
    var ent2 = allEntities[p2];
    if (!matchesFilter(ent2)) continue;
    if (hasEntityMetadata(ent2) || hasCacheEnrichment(ent2)) continue;

    var meta2 = entityIndex[ent2.entityId].metadata || {};
    var success = false;
    var addedFields2 = [];
    var enrichMethod = "";

    try {
      // ── TMDB: Movies / TV / Documentaries ──
      if ((ent2.type === "movie" || ent2.type === "tv-series" || ent2.type === "documentary") && tmdbKey) {
        var searchType = (ent2.type === "tv-series") ? "tv" : "movie";
        var searchUrl = "https://api.themoviedb.org/3/search/" + searchType + "?api_key=" + tmdbKey + "&query=" + encodeURIComponent(ent2.title);

        var searchResp = await ctx.fetch(searchUrl);
        var searchData = JSON.parse(searchResp);

        if (searchData.results && searchData.results.length > 0) {
          var match = searchData.results[0];
          meta2.tmdbId = match.id; addedFields2.push("tmdbId");
          meta2.overview = match.overview || ""; addedFields2.push("overview");
          meta2.rating = match.vote_average || null; addedFields2.push("rating");
          meta2.voteCount = match.vote_count || 0;
          meta2.releaseDate = match.release_date || match.first_air_date || null;

          if (match.poster_path) {
            entityIndex[ent2.entityId].imageUrl = "https://image.tmdb.org/t/p/w342" + match.poster_path;
          }

          // Fetch details with credits
          try {
            var detailUrl = "https://api.themoviedb.org/3/" + searchType + "/" + match.id + "?api_key=" + tmdbKey + "&append_to_response=credits";
            var detailResp = await ctx.fetch(detailUrl);
            var detail = JSON.parse(detailResp);

            meta2.genres = (detail.genres || []).map(function (g) { return g.name; }); addedFields2.push("genres");
            meta2.runtime = detail.runtime || null;
            meta2.imdbId = detail.imdb_id || null;
            meta2.tagline = detail.tagline || null;
            meta2.numberOfSeasons = detail.number_of_seasons || null;

            if (detail.credits) {
              meta2.cast = (detail.credits.cast || []).slice(0, 8).map(function (c) { return c.name; }); addedFields2.push("cast");
              meta2.directors = (detail.credits.crew || []).filter(function (c) { return c.job === "Director"; }).map(function (c) { return c.name; }); addedFields2.push("directors");
            }
          } catch (detailErr) {
            ctx.log("TMDB detail fetch failed for " + ent2.title + ": " + detailErr.message);
          }

          meta2.enrichedAt = Date.now();
          meta2.enrichedBy = "tmdb_api";
          enrichMethod = "tmdb_api";
          success = true;

          // Also update source cache if item exists
          var cacheItem2 = moviesByTitle[ent2.title.toLowerCase()];
          if (cacheItem2) {
            cacheItem2.tmdbId = meta2.tmdbId;
            cacheItem2.overview = meta2.overview;
            cacheItem2.rating = meta2.rating;
            cacheItem2.voteCount = meta2.voteCount;
            if (match.poster_path) cacheItem2.posterPath = "https://image.tmdb.org/t/p/w342" + match.poster_path;
            if (match.backdrop_path) cacheItem2.backdropPath = "https://image.tmdb.org/t/p/w780" + match.backdrop_path;
            cacheItem2.genres = meta2.genres;
            cacheItem2.runtime = meta2.runtime;
            cacheItem2.cast = meta2.cast;
            cacheItem2.directors = meta2.directors;
            cacheItem2.enrichedAt = meta2.enrichedAt;
          }
        }

        // Rate limit: 300ms between TMDB requests
        await new Promise(function (r) { setTimeout(r, 300); });

      // ── Steam Store: Games ──
      } else if (ent2.type === "game") {
        var steamItem = steamByName[ent2.title.toLowerCase()];
        if (steamItem && steamItem.appId) {
          var steamUrl = "https://store.steampowered.com/api/appdetails?appids=" + steamItem.appId;
          var steamResp = await ctx.fetch(steamUrl);
          var steamData = JSON.parse(steamResp);
          var steamDetail = steamData[steamItem.appId];

          if (steamDetail && steamDetail.success && steamDetail.data) {
            var sd = steamDetail.data;
            meta2.description = sd.short_description || ""; addedFields2.push("description");
            meta2.genres = (sd.genres || []).map(function (g) { return g.description; }); addedFields2.push("genres");
            meta2.categories = (sd.categories || []).map(function (c) { return c.description; });
            meta2.metacritic = sd.metacritic ? sd.metacritic.score : null; addedFields2.push("metacritic");
            meta2.developers = sd.developers || []; addedFields2.push("developers");
            meta2.publishers = sd.publishers || [];
            meta2.releaseDate = sd.release_date ? sd.release_date.date : null;
            meta2.enrichedAt = Date.now();
            meta2.enrichedBy = "steam_api";
            enrichMethod = "steam_api";
            success = true;

            // Update cache
            steamItem.description = meta2.description;
            steamItem.genres = meta2.genres;
            steamItem.categories = meta2.categories;
            steamItem.metacritic = meta2.metacritic;
            steamItem.developers = meta2.developers;
            steamItem.publishers = meta2.publishers;
            steamItem.releaseDate = meta2.releaseDate;
            steamItem.enrichedAt = meta2.enrichedAt;
            if (sd.header_image) {
              steamItem.headerImage = sd.header_image;
              entityIndex[ent2.entityId].imageUrl = sd.header_image;
            }
          }
        }

        // Rate limit: 1000ms between Steam requests
        await new Promise(function (r) { setTimeout(r, 1000); });

      // ── Google Books: Books ──
      } else if (ent2.type === "book") {
        var bookTitle = ent2.title;
        var bookAuthor = "";
        var kindleItem = kindleByTitle[bookTitle.toLowerCase()];
        if (kindleItem && kindleItem.author) bookAuthor = kindleItem.author;

        var gbUrl = "https://www.googleapis.com/books/v1/volumes?q=";
        gbUrl += "intitle:" + encodeURIComponent(bookTitle);
        if (bookAuthor) gbUrl += "+inauthor:" + encodeURIComponent(bookAuthor.split(",")[0].trim());
        gbUrl += "&maxResults=1";

        var gbResp = await ctx.fetch(gbUrl);
        var gbData = JSON.parse(gbResp);

        if (gbData.items && gbData.items.length > 0) {
          var vol = gbData.items[0].volumeInfo || {};
          if (vol.description) { meta2.description = vol.description; addedFields2.push("description"); }
          if (vol.pageCount) { meta2.pageCount = vol.pageCount; addedFields2.push("pageCount"); }
          if (vol.categories) { meta2.categories = vol.categories; addedFields2.push("categories"); }
          if (vol.publisher) { meta2.publisher = vol.publisher; addedFields2.push("publisher"); }
          if (vol.publishedDate) { meta2.publishedDate = vol.publishedDate; addedFields2.push("publishedDate"); }
          if (vol.authors) { meta2.authors = vol.authors; addedFields2.push("authors"); }
          if (vol.industryIdentifiers) { meta2.industryIdentifiers = vol.industryIdentifiers; }
          if (vol.averageRating) { meta2.googleRating = vol.averageRating; }
          if (vol.imageLinks && vol.imageLinks.thumbnail && !entityIndex[ent2.entityId].imageUrl) {
            entityIndex[ent2.entityId].imageUrl = vol.imageLinks.thumbnail.replace("http://", "https://");
          }
          meta2.enrichedAt = Date.now();
          meta2.enrichedBy = "google_books_api";
          enrichMethod = "google_books_api";
          success = true;
        }
        // Google Books: no rate limit needed (generous quota)
      }
    } catch (apiErr) {
      ctx.log("API error for " + ent2.title + " (" + ent2.type + "): " + (apiErr.message || apiErr));
      ensureByType(ent2.type);
      res.byType[ent2.type].failed++;
      res.failed++;
    }

    if (success) {
      entityIndex[ent2.entityId].metadata = meta2;
      enrichedEntityIds.push(ent2.entityId);
      res.apiEnriched++;
      indexDirty = true;
      ensureByType(ent2.type);
      res.byType[ent2.type].apiEnriched++;
      addSample(ent2.entityId, ent2.title, ent2.type, enrichMethod, addedFields2);
    }

    apiProcessed++;

    // Incremental save every 10 API-enriched entities
    if (apiProcessed % 10 === 0) {
      saveJSON(indexPath, entityIndex);
      if (moviesCache) saveJSON(moviesCachePath, moviesCache);
      if (steamCache) saveJSON(steamCachePath, steamCache);
      ctx.log("API enrichment progress: " + apiProcessed + "/" + enrichLimit);
    }
  }

  // Final save
  saveJSON(indexPath, entityIndex);
  if (moviesCache) saveJSON(moviesCachePath, moviesCache);
  if (steamCache) saveJSON(steamCachePath, steamCache);
  ctx.log("Phase 2 complete: " + res.apiEnriched + " entities enriched via API, " + res.failed + " failed");

  // ── Phase 3: Semantic tag enrichment ──
  var semanticEnriched = 0;
  if (enrichedEntityIds.length > 0) {
    try {
      var cortexMod = await import("../../../../server/src/cortex-enrichment.js");
      if (cortexMod.enrichNewEntities) {
        ctx.log("Phase 3: Semantic tagging " + enrichedEntityIds.length + " entities...");
        var semResult = await cortexMod.enrichNewEntities(enrichedEntityIds);
        semanticEnriched = semResult.enriched || 0;
        ctx.log("Semantic enrichment: " + semanticEnriched + " entities tagged");
      }
    } catch (semErr) {
      ctx.log("Semantic enrichment skipped: " + (semErr.message || semErr));
    }
  }

  // Count remaining unenriched
  var remainingByType = {};
  var finalIndex = loadJSON(indexPath) || entityIndex;
  var finalEntities = Object.values(finalIndex);
  for (var rt = 0; rt < ENRICHABLE_TYPES.length; rt++) {
    var rtype = ENRICHABLE_TYPES[rt];
    var remaining = 0;
    for (var re = 0; re < finalEntities.length; re++) {
      if (finalEntities[re].type !== rtype) continue;
      var rm = finalEntities[re].metadata;
      if (!rm || !rm.enrichedAt) remaining++;
    }
    remainingByType[rtype] = remaining;
  }

  return result({
    tool: "enso_media_library_bulk_enrich",
    action: "enrich",
    results: {
      totalProcessed: res.propagated + apiProcessed,
      propagated: res.propagated,
      apiEnriched: res.apiEnriched,
      failed: res.failed,
      semanticTagsApplied: semanticEnriched,
      byType: res.byType,
      remaining: remainingByType,
      samples: res.samples
    }
  });
}

// ── Fallback ──
return result({
  tool: "enso_media_library_bulk_enrich",
  error: "Unknown action: " + action + ". Use: status, preview, or enrich"
});
