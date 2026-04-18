var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var colDir = path.join(os.homedir(), ".enso", "data", "media-library");
var colPath = path.join(colDir, "collections.json");
var mergeLogPath = path.join(colDir, "merge-log.json");

var action = (params.action || "scan").trim();
var mediaTypeFilter = (params.mediaType || "").trim();
var minConfidence = (params.minConfidence || "medium").trim();
var keepEntityId = (params.keepEntityId || "").trim();
var removeEntityId = (params.removeEntityId || "").trim();

// ── Levenshtein distance ──
function levenshtein(a, b) {
  var m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  var prev = [], curr = [];
  for (var j = 0; j <= n; j++) prev[j] = j;
  for (var i = 1; i <= m; i++) {
    curr[0] = i;
    for (var j2 = 1; j2 <= n; j2++) {
      var cost = a[i - 1] === b[j2 - 1] ? 0 : 1;
      curr[j2] = Math.min(prev[j2] + 1, curr[j2 - 1] + 1, prev[j2 - 1] + cost);
    }
    prev = curr.slice();
  }
  return prev[n];
}

// ── Title normalization ──
function normalizeTitle(title) {
  if (!title) return "";
  var t = title.toLowerCase().trim();
  // Strip parenthetical year suffixes like "(2010)", "(2024)", etc.
  t = t.replace(/\s*\(\d{4}\)\s*$/, "");
  // Strip leading articles
  t = t.replace(/^(the|a|an)\s+/i, "");
  return t.trim();
}

// ── Extract source from entityId ──
function getSource(entityId) {
  var parts = (entityId || "").split(":");
  return parts[0] || "";
}

// ── Media type mapping ──
var typeMap = {
  books: ["book"],
  movies: ["movie"],
  tv: ["tv-series"],
  documentaries: ["documentary"],
  games: ["game"],
  music: ["song", "artist", "playlist"],
  articles: ["article"]
};

// ── Resolvable entity types (types where dedup makes sense) ──
var resolvableTypes = ["book", "movie", "tv-series", "documentary", "game", "song", "album", "artist"];

// ── Extract metadata for confidence boosting ──
function extractAuthors(entity) {
  var authors = [];
  var tags = entity.tags || [];
  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    // Common patterns: "by Author Name" or known role tags
    if (tag.match && tag.match(/^by\s+/i)) {
      authors.push(tag.replace(/^by\s+/i, "").toLowerCase().trim());
    }
  }
  // Check crossReferences for author/creator patterns
  if (entity.author) authors.push(entity.author.toLowerCase().trim());
  if (entity.director) authors.push(entity.director.toLowerCase().trim());
  if (entity.creator) authors.push(entity.creator.toLowerCase().trim());
  return authors;
}

function extractYear(entity) {
  // Try to extract year from entityId (e.g., "movie:inception-2010")
  var yearMatch = (entity.entityId || "").match(/(\d{4})$/);
  if (yearMatch) return parseInt(yearMatch[1]);
  // Try from slug
  yearMatch = (entity.slug || "").match(/(\d{4})$/);
  if (yearMatch) return parseInt(yearMatch[1]);
  // Try from title
  var titleYear = (entity.title || "").match(/\((\d{4})\)\s*$/);
  if (titleYear) return parseInt(titleYear[1]);
  return null;
}

function getOverlappingTags(a, b) {
  var tagsA = (a.semanticTags || []).concat(a.tags || []);
  var tagsB = (b.semanticTags || []).concat(b.tags || []);
  var setB = {};
  for (var i = 0; i < tagsB.length; i++) setB[tagsB[i].toLowerCase()] = true;
  var overlap = [];
  for (var j = 0; j < tagsA.length; j++) {
    if (setB[tagsA[j].toLowerCase()]) overlap.push(tagsA[j]);
  }
  return overlap;
}

// ── SCAN action ──
function doScan(index) {
  var keys = Object.keys(index);
  var allowedTypes = null;
  if (mediaTypeFilter && typeMap[mediaTypeFilter]) {
    allowedTypes = typeMap[mediaTypeFilter];
  }

  // Build candidate list (resolvable types only)
  var candidates = [];
  for (var i = 0; i < keys.length; i++) {
    var e = index[keys[i]];
    if (resolvableTypes.indexOf(e.type) === -1) continue;
    if (allowedTypes && allowedTypes.indexOf(e.type) === -1) continue;
    candidates.push(e);
  }

  // Group by normalized title + type for efficient comparison
  var groups = {};
  for (var ci = 0; ci < candidates.length; ci++) {
    var c = candidates[ci];
    var normTitle = normalizeTitle(c.title);
    var groupKey = c.type + "::" + normTitle;
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(c);
  }

  var duplicateGroups = [];
  var processedPairs = {};

  // Phase 1: Exact title matches (cross-source, same type)
  var exactGroupKeys = Object.keys(groups);
  for (var gi = 0; gi < exactGroupKeys.length; gi++) {
    var group = groups[exactGroupKeys[gi]];
    if (group.length < 2) continue;

    // Find cross-source pairs
    for (var a = 0; a < group.length; a++) {
      for (var b = a + 1; b < group.length; b++) {
        var srcA = getSource(group[a].entityId);
        var srcB = getSource(group[b].entityId);
        if (srcA === srcB) continue; // same-source: skip

        var pairKey = [group[a].entityId, group[b].entityId].sort().join("||");
        if (processedPairs[pairKey]) continue;
        processedPairs[pairKey] = true;

        var confidence = "high";
        var signals = ["exact-title-match"];

        // Boost signals
        var authorsA = extractAuthors(group[a]);
        var authorsB = extractAuthors(group[b]);
        var authorMatch = false;
        for (var ai = 0; ai < authorsA.length; ai++) {
          for (var bi = 0; bi < authorsB.length; bi++) {
            if (authorsA[ai] === authorsB[bi]) { authorMatch = true; break; }
          }
          if (authorMatch) break;
        }
        if (authorMatch) signals.push("same-author/creator");

        var yearA = extractYear(group[a]);
        var yearB = extractYear(group[b]);
        if (yearA && yearB && yearA === yearB) signals.push("same-year");

        var overlap = getOverlappingTags(group[a], group[b]);
        if (overlap.length >= 2) signals.push("overlapping-tags(" + overlap.length + ")");

        duplicateGroups.push({
          confidence: confidence,
          signals: signals,
          entities: [
            { entityId: group[a].entityId, type: group[a].type, source: srcA, title: group[a].title, imageUrl: group[a].imageUrl || null, fieldCount: countFields(group[a]) },
            { entityId: group[b].entityId, type: group[b].type, source: srcB, title: group[b].title, imageUrl: group[b].imageUrl || null, fieldCount: countFields(group[b]) }
          ]
        });
      }
    }
  }

  // Phase 2: Fuzzy title matches (Levenshtein ≤ 2 for titles > 5 chars, or contained-in for short titles)
  // Compare across groups of same type
  var typeGroups = {};
  for (var tg = 0; tg < candidates.length; tg++) {
    var ent = candidates[tg];
    if (!typeGroups[ent.type]) typeGroups[ent.type] = [];
    typeGroups[ent.type].push(ent);
  }

  var typeKeys = Object.keys(typeGroups);
  for (var tk = 0; tk < typeKeys.length; tk++) {
    var typeCandidates = typeGroups[typeKeys[tk]];
    for (var fa = 0; fa < typeCandidates.length; fa++) {
      var eA = typeCandidates[fa];
      var normA = normalizeTitle(eA.title);
      if (!normA) continue;

      for (var fb = fa + 1; fb < typeCandidates.length; fb++) {
        var eB = typeCandidates[fb];
        var srcFA = getSource(eA.entityId);
        var srcFB = getSource(eB.entityId);
        if (srcFA === srcFB) continue; // same-source: skip

        var pairKeyF = [eA.entityId, eB.entityId].sort().join("||");
        if (processedPairs[pairKeyF]) continue;

        var normB = normalizeTitle(eB.title);
        if (!normB) continue;
        if (normA === normB) continue; // already handled in Phase 1

        var isFuzzyMatch = false;
        var matchType = "";

        // Levenshtein for titles > 5 chars
        if (normA.length > 5 && normB.length > 5) {
          var dist = levenshtein(normA, normB);
          if (dist <= 2) {
            isFuzzyMatch = true;
            matchType = "fuzzy-title(distance=" + dist + ")";
          }
        }

        // Contained-in for short titles (≤ 5 chars) — word-boundary match only
        if (!isFuzzyMatch && (normA.length <= 5 || normB.length <= 5)) {
          if (normA.length >= 3 && normB.length >= 3) {
            var shorter = normA.length <= normB.length ? normA : normB;
            var longer = normA.length <= normB.length ? normB : normA;
            // Require the shorter title to appear as a whole word (bounded by start/end/space/colon/dash)
            var wordBoundaryRe = new RegExp("(^|[\\s:\\-])" + shorter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[\\s:\\-])");
            if (wordBoundaryRe.test(longer)) {
              isFuzzyMatch = true;
              matchType = "contained-in";
            }
          }
        }

        if (!isFuzzyMatch) continue;
        processedPairs[pairKeyF] = true;

        var fSignals = [matchType];
        var fConfidence = "medium";

        // Boost
        var fAuthorsA = extractAuthors(eA);
        var fAuthorsB = extractAuthors(eB);
        var fAuthorMatch = false;
        for (var fai = 0; fai < fAuthorsA.length; fai++) {
          for (var fbi = 0; fbi < fAuthorsB.length; fbi++) {
            if (fAuthorsA[fai] === fAuthorsB[fbi]) { fAuthorMatch = true; break; }
          }
          if (fAuthorMatch) break;
        }
        if (fAuthorMatch) { fSignals.push("same-author/creator"); fConfidence = "high"; }

        var fYearA = extractYear(eA);
        var fYearB = extractYear(eB);
        if (fYearA && fYearB && fYearA === fYearB) { fSignals.push("same-year"); fConfidence = "high"; }

        var fOverlap = getOverlappingTags(eA, eB);
        if (fOverlap.length >= 2) fSignals.push("overlapping-tags(" + fOverlap.length + ")");

        duplicateGroups.push({
          confidence: fConfidence,
          signals: fSignals,
          entities: [
            { entityId: eA.entityId, type: eA.type, source: srcFA, title: eA.title, imageUrl: eA.imageUrl || null, fieldCount: countFields(eA) },
            { entityId: eB.entityId, type: eB.type, source: srcFB, title: eB.title, imageUrl: eB.imageUrl || null, fieldCount: countFields(eB) }
          ]
        });
      }
    }
  }

  // Filter by minConfidence
  var confOrder = { high: 3, medium: 2, low: 1 };
  var minConf = confOrder[minConfidence] || 2;
  var filtered = [];
  for (var fi = 0; fi < duplicateGroups.length; fi++) {
    if ((confOrder[duplicateGroups[fi].confidence] || 0) >= minConf) {
      filtered.push(duplicateGroups[fi]);
    }
  }

  // Sort: high first, then medium, then low
  filtered.sort(function(a, b) {
    return (confOrder[b.confidence] || 0) - (confOrder[a.confidence] || 0);
  });

  return {
    tool: "enso_media_library_entity_resolve",
    action: "scan",
    mediaType: mediaTypeFilter || "all",
    minConfidence: minConfidence,
    totalEntities: candidates.length,
    duplicateGroupsFound: filtered.length,
    byConfidence: {
      high: filtered.filter(function(g) { return g.confidence === "high"; }).length,
      medium: filtered.filter(function(g) { return g.confidence === "medium"; }).length,
      low: filtered.filter(function(g) { return g.confidence === "low"; }).length
    },
    groups: filtered
  };
}

// ── Count non-null metadata fields (for deciding which entity is "richer") ──
function countFields(entity) {
  var count = 0;
  var checkKeys = ["title", "imageUrl", "cortexPath", "userRating", "consumptionStatus",
    "isFavorite", "dateStarted", "dateCompleted", "userNotes", "author", "director",
    "creator", "year", "description", "summary"];
  for (var i = 0; i < checkKeys.length; i++) {
    if (entity[checkKeys[i]] != null && entity[checkKeys[i]] !== "" && entity[checkKeys[i]] !== false) count++;
  }
  var tags = entity.tags || [];
  var semTags = entity.semanticTags || [];
  var crossRefs = entity.crossReferences || [];
  count += Math.min(tags.length, 5);
  count += Math.min(semTags.length, 5);
  count += Math.min(crossRefs.length, 3);
  return count;
}

// ── Deduplicate an array of strings ──
function dedupeArray(arr) {
  var seen = {};
  var result = [];
  for (var i = 0; i < arr.length; i++) {
    var key = (arr[i] || "").toLowerCase();
    if (!seen[key] && arr[i]) {
      seen[key] = true;
      result.push(arr[i]);
    }
  }
  return result;
}

// ── MERGE action ──
function doMerge(index) {
  if (!keepEntityId || !removeEntityId) {
    return { tool: "enso_media_library_entity_resolve", action: "merge", error: "Both keepEntityId and removeEntityId are required", success: false };
  }
  if (keepEntityId === removeEntityId) {
    return { tool: "enso_media_library_entity_resolve", action: "merge", error: "keepEntityId and removeEntityId must be different", success: false };
  }

  var keepEntity = index[keepEntityId];
  var removeEntity = index[removeEntityId];
  if (!keepEntity) {
    return { tool: "enso_media_library_entity_resolve", action: "merge", error: "Keep entity not found: " + keepEntityId, success: false };
  }
  if (!removeEntity) {
    return { tool: "enso_media_library_entity_resolve", action: "merge", error: "Remove entity not found: " + removeEntityId, success: false };
  }

  // Merge fields into keepEntity
  // Tags: combine and deduplicate
  var mergedTags = (keepEntity.tags || []).concat(removeEntity.tags || []);
  keepEntity.tags = dedupeArray(mergedTags);

  var mergedSemTags = (keepEntity.semanticTags || []).concat(removeEntity.semanticTags || []);
  keepEntity.semanticTags = dedupeArray(mergedSemTags);

  // Rating: keep highest
  var keepRating = keepEntity.userRating || 0;
  var removeRating = removeEntity.userRating || 0;
  if (removeRating > keepRating) {
    keepEntity.userRating = removeRating;
    if (removeEntity.userNotes) keepEntity.userNotes = removeEntity.userNotes;
  }

  // Keep non-null values from removeEntity where keepEntity is missing
  var fillKeys = ["imageUrl", "cortexPath", "consumptionStatus", "consumptionProgress",
    "dateStarted", "dateCompleted", "author", "director", "creator", "year",
    "description", "summary", "slug"];
  for (var fi = 0; fi < fillKeys.length; fi++) {
    var key = fillKeys[fi];
    if ((keepEntity[key] == null || keepEntity[key] === "") && removeEntity[key] != null && removeEntity[key] !== "") {
      keepEntity[key] = removeEntity[key];
    }
  }

  // Favorite: keep true if either is favorited
  if (removeEntity.isFavorite) keepEntity.isFavorite = true;

  // CrossReferences: merge and deduplicate by entityId, update references pointing to removeEntityId
  var keepCrossRefs = keepEntity.crossReferences || [];
  var removeCrossRefs = removeEntity.crossReferences || [];
  var crossRefMap = {};
  for (var cr = 0; cr < keepCrossRefs.length; cr++) {
    crossRefMap[keepCrossRefs[cr].entityId] = keepCrossRefs[cr];
  }
  for (var cr2 = 0; cr2 < removeCrossRefs.length; cr2++) {
    var ref = removeCrossRefs[cr2];
    if (ref.entityId !== keepEntityId && !crossRefMap[ref.entityId]) {
      crossRefMap[ref.entityId] = ref;
    }
  }
  keepEntity.crossReferences = Object.keys(crossRefMap).map(function(k) { return crossRefMap[k]; });

  // RecommendedVideos: merge and deduplicate by videoId
  var keepVideos = keepEntity.recommendedVideos || [];
  var removeVideos = removeEntity.recommendedVideos || [];
  var videoMap = {};
  for (var v = 0; v < keepVideos.length; v++) {
    if (keepVideos[v].videoId) videoMap[keepVideos[v].videoId] = keepVideos[v];
  }
  for (var v2 = 0; v2 < removeVideos.length; v2++) {
    if (removeVideos[v2].videoId && !videoMap[removeVideos[v2].videoId]) {
      videoMap[removeVideos[v2].videoId] = removeVideos[v2];
    }
  }
  keepEntity.recommendedVideos = Object.keys(videoMap).map(function(k) { return videoMap[k]; });

  // Record merged sources
  var mergedSources = keepEntity.mergedSources || [keepEntity.source];
  if (mergedSources.indexOf(removeEntity.source) === -1) {
    mergedSources.push(removeEntity.source);
  }
  keepEntity.mergedSources = mergedSources;
  keepEntity.updatedAt = new Date().toISOString();

  // Update crossReferences across ALL entities that point to removeEntityId → keepEntityId
  var allKeys = Object.keys(index);
  var refsUpdated = 0;
  for (var ak = 0; ak < allKeys.length; ak++) {
    var ent = index[allKeys[ak]];
    var refs = ent.crossReferences || [];
    var changed = false;
    for (var r = 0; r < refs.length; r++) {
      if (refs[r].entityId === removeEntityId) {
        refs[r].entityId = keepEntityId;
        changed = true;
        refsUpdated++;
      }
    }
    if (changed) ent.crossReferences = refs;
  }

  // Delete the removed entity
  delete index[removeEntityId];

  // Save entity index
  try {
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 0), "utf8");
  } catch (e) {
    return { tool: "enso_media_library_entity_resolve", action: "merge", error: "Failed to save entity index: " + e.message, success: false };
  }

  // Update collections that contain removeEntityId
  var collectionsUpdated = 0;
  try {
    var colData = { collections: [] };
    try {
      var colRaw = fs.readFileSync(colPath, "utf8");
      colData = JSON.parse(colRaw);
      if (!colData.collections) colData.collections = [];
    } catch (e) { /* no collections file */ }

    for (var ci = 0; ci < colData.collections.length; ci++) {
      var col = colData.collections[ci];
      var eids = col.entityIds || [];
      var removeIdx = eids.indexOf(removeEntityId);
      if (removeIdx !== -1) {
        eids.splice(removeIdx, 1);
        if (eids.indexOf(keepEntityId) === -1) {
          eids.push(keepEntityId);
        }
        col.entityIds = eids;
        collectionsUpdated++;
      }
    }

    if (collectionsUpdated > 0) {
      fs.writeFileSync(colPath, JSON.stringify(colData, null, 2), "utf8");
    }
  } catch (e) { /* collection update failed, non-fatal */ }

  // Log the merge
  var logEntry = {
    timestamp: new Date().toISOString(),
    keepEntityId: keepEntityId,
    removeEntityId: removeEntityId,
    keepTitle: keepEntity.title,
    removeTitle: removeEntity.title,
    keepSource: keepEntity.source,
    removeSource: removeEntity.source,
    type: keepEntity.type,
    refsUpdated: refsUpdated,
    collectionsUpdated: collectionsUpdated
  };

  try {
    var mergeLog = [];
    try {
      var logRaw = fs.readFileSync(mergeLogPath, "utf8");
      mergeLog = JSON.parse(logRaw);
      if (!Array.isArray(mergeLog)) mergeLog = [];
    } catch (e) { /* no log file yet */ }
    mergeLog.push(logEntry);
    fs.mkdirSync(colDir, { recursive: true });
    fs.writeFileSync(mergeLogPath, JSON.stringify(mergeLog, null, 2), "utf8");
  } catch (e) { /* log write failed, non-fatal */ }

  return {
    tool: "enso_media_library_entity_resolve",
    action: "merge",
    success: true,
    kept: { entityId: keepEntityId, title: keepEntity.title, source: keepEntity.source, type: keepEntity.type, fieldCount: countFields(keepEntity) },
    removed: { entityId: removeEntityId, title: removeEntity.title, source: removeEntity.source },
    mergeDetails: {
      tagsCount: keepEntity.tags.length,
      semanticTagsCount: keepEntity.semanticTags.length,
      crossRefsCount: keepEntity.crossReferences.length,
      userRating: keepEntity.userRating || null,
      isFavorite: keepEntity.isFavorite || false,
      mergedSources: keepEntity.mergedSources,
      refsUpdated: refsUpdated,
      collectionsUpdated: collectionsUpdated
    }
  };
}

// ── STATS action ──
function doStats(index) {
  var keys = Object.keys(index);
  var totalEntities = 0;
  var byType = {};
  var bySource = {};

  for (var i = 0; i < keys.length; i++) {
    var e = index[keys[i]];
    if (resolvableTypes.indexOf(e.type) === -1) continue;
    totalEntities++;
    byType[e.type] = (byType[e.type] || 0) + 1;
    var src = e.source || "unknown";
    bySource[src] = (bySource[src] || 0) + 1;
  }

  // Count entities with mergedSources (previously merged)
  var mergedEntityCount = 0;
  for (var mi = 0; mi < keys.length; mi++) {
    var me = index[keys[mi]];
    if (me.mergedSources && me.mergedSources.length > 1) mergedEntityCount++;
  }

  // Read merge log
  var mergeLog = [];
  try {
    var logRaw = fs.readFileSync(mergeLogPath, "utf8");
    mergeLog = JSON.parse(logRaw);
    if (!Array.isArray(mergeLog)) mergeLog = [];
  } catch (e) { /* no log */ }

  // Run a quick scan to count current duplicates
  var scanResult = doScan(index);

  return {
    tool: "enso_media_library_entity_resolve",
    action: "stats",
    totalResolvableEntities: totalEntities,
    byType: byType,
    bySource: bySource,
    mergedEntityCount: mergedEntityCount,
    totalMergesPerformed: mergeLog.length,
    currentDuplicates: {
      total: scanResult.duplicateGroupsFound,
      high: scanResult.byConfidence.high,
      medium: scanResult.byConfidence.medium,
      low: scanResult.byConfidence.low
    },
    recentMerges: mergeLog.slice(-5).reverse()
  };
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
      text: JSON.stringify({ tool: "enso_media_library_entity_resolve", error: "Could not load entity index", success: false })
    }]
  };
}

// ── Dispatch ──
var result;
if (action === "scan") {
  result = doScan(index);
} else if (action === "merge") {
  result = doMerge(index);
} else if (action === "stats") {
  result = doStats(index);
} else {
  result = { tool: "enso_media_library_entity_resolve", error: "Unknown action: " + action + ". Use: scan, merge, stats", success: false };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify(result)
  }]
};
