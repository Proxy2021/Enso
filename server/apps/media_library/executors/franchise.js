var fs = require("fs");
var path = require("path");
var os = require("os");

var dataDir = path.join(os.homedir(), ".enso", "data", "media-library");
var franchisePath = path.join(dataDir, "franchises.json");
var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var action = (params.action || "").trim() || "list";
var franchiseId = (params.franchiseId || "").trim();
var entityId = (params.entityId || "").trim();
var limit = params.limit || 20;

// Media entity types
var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "song", "artist", "playlist", "article"];

// Load entity index
var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_franchise",
        action: action,
        error: "Could not load entity index: " + e.message,
        franchises: []
      })
    }]
  };
}

// Load franchises
var franchiseData = { franchises: [], detectedAt: null };
try {
  var fRaw = fs.readFileSync(franchisePath, "utf8");
  franchiseData = JSON.parse(fRaw);
  if (!franchiseData.franchises) franchiseData.franchises = [];
} catch (e) {
  franchiseData = { franchises: [], detectedAt: null };
}

// Save franchises
var saveFranchises = function() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(franchisePath, JSON.stringify(franchiseData, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
};

// Slugify
var slugify = function(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
};

// Get media entities
var getMediaEntities = function() {
  var allEntities = Object.values(index);
  var entities = [];
  for (var i = 0; i < allEntities.length; i++) {
    if (mediaEntityTypes.indexOf(allEntities[i].type) !== -1) {
      entities.push(allEntities[i]);
    }
  }
  return entities;
};

// Stop words to ignore in title matching
var stopWords = { the: 1, a: 1, an: 1, and: 1, or: 1, of: 1, in: 1, to: 1, for: 1, with: 1, on: 1, at: 1, by: 1, from: 1, is: 1, it: 1, its: 1, that: 1, this: 1, how: 1, what: 1, when: 1, who: 1, all: 1, not: 1, no: 1, but: 1, if: 1, my: 1, your: 1, has: 1, was: 1, are: 1, were: 1, been: 1, be: 1, have: 1, had: 1, do: 1, did: 1, will: 1, can: 1, may: 1, about: 1, into: 1, over: 1, after: 1, before: 1, between: 1, under: 1, through: 1, just: 1, also: 1, than: 1, more: 1, most: 1, other: 1, some: 1, such: 1, each: 1, every: 1, new: 1, old: 1, hd: 1, dv: 1 };

// ── Title normalization for franchise matching ──
var normalizeTitle = function(title) {
  if (!title) return "";
  var t = title.toLowerCase();
  // Remove common prefixes/suffixes
  t = t.replace(/^(the|a|an)\s+/i, "");
  // Remove parenthetical content like (2024), (Kindle Edition)
  t = t.replace(/\s*\([^)]*\)\s*/g, " ");
  // Remove year suffixes
  t = t.replace(/\s+\d{4}$/, "");
  // Remove episode identifiers S01E01 patterns
  t = t.replace(/\s+s\d+e\d+\b.*$/i, "");
  // Remove trailing episode patterns like E01, E02
  t = t.replace(/\s+e\d+\b.*$/i, "");
  // Remove quality/codec tags
  t = t.replace(/\s+(hd|4k|1080p|720p|bluray|webrip|dsnp|smurf|blacktv|hbomax)\b.*$/i, "");
  // Remove Chinese subtitle markers
  t = t.replace(/\s*中英双字.*$/, "");
  t = t.replace(/\s*中字.*$/, "");
  // Replace colons with space (preserve for subtitle splitting in extractBaseName)
  t = t.replace(/:/g, " ");
  // Remove other punctuation except hyphens
  t = t.replace(/[^\w\s\u4e00-\u9fff-]/g, "");
  // Collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  return t;
};

// Extract base franchise name from a title
var extractBaseName = function(title) {
  if (!title) return "";
  // First, split on colon/em-dash to get the main title before subtitle
  var mainTitle = title;
  var colonIdx = title.indexOf(":");
  var dashIdx = title.indexOf(" - ");
  var emIdx = title.indexOf("—");
  var splitIdx = -1;
  if (colonIdx > 2) splitIdx = colonIdx;
  if (dashIdx > 2 && (splitIdx === -1 || dashIdx < splitIdx)) splitIdx = dashIdx;
  if (emIdx > 2 && (splitIdx === -1 || emIdx < splitIdx)) splitIdx = emIdx;
  if (splitIdx > 2) mainTitle = title.substring(0, splitIdx);
  // Now normalize the main title
  var t = normalizeTitle(mainTitle);
  // Remove sequel indicators: Roman numerals, numbers, "Part N", "Vol N", "Book N", "Season N", "Episode N"
  t = t.replace(/\s+(part|vol|volume|book|season|episode|chapter)\s+\w+$/i, "");
  t = t.replace(/\s+(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/i, "");
  t = t.replace(/\s+\d+$/, "");
  // Remove common Chinese suffixes for sequels
  t = t.replace(/[（(].*[）)]/, "");
  t = t.replace(/\s*第[一二三四五六七八九十\d]+[部季集].*$/, "");
  t = t.trim();
  // Base name must be at least 3 chars to be meaningful
  if (t.length < 3) return "";
  return t;
};

// Get unique significant words from a base name (filtering stop words + deduplicating)
var getSignificantWords = function(base) {
  var words = base.split(/\s+/);
  var seen = {};
  var result = [];
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (w.length > 2 && !stopWords[w] && !seen[w]) {
      seen[w] = true;
      result.push(w);
    }
  }
  return result;
};

// Check if two base names are similar enough for franchise grouping
var isSimilarBase = function(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  // Significant word overlap (exclude stop words) — primary matching strategy
  var wordsA = getSignificantWords(a);
  var wordsB = getSignificantWords(b);
  if (wordsA.length < 1 || wordsB.length < 1) return false;
  var common = 0;
  for (var i = 0; i < wordsA.length; i++) {
    for (var j = 0; j < wordsB.length; j++) {
      if (wordsA[i] === wordsB[j]) common++;
    }
  }
  var minSig = Math.min(wordsA.length, wordsB.length);
  // For single-word titles: require exact match of that word (already handled by a===b)
  // For multi-word: need 80%+ overlap AND at least 2 common significant words
  if (minSig >= 2 && common >= 2 && common / minSig >= 0.8) return true;
  // Single significant word match: only if that word is highly specific (7+ chars)
  if (wordsA.length === 1 && wordsB.length === 1 && wordsA[0] === wordsB[0] && wordsA[0].length >= 7) return true;
  return false;
};

// Determine entity role in franchise
var determineRole = function(entity, baseName, clusterEntities) {
  var rawTitle = entity.title || "";
  var t = normalizeTitle(rawTitle);
  // 1. Sequel indicators (check FIRST — Part II is always a sequel)
  if (/part\s+(two|three|four|five|six|ii|iii|iv|v|vi|\d+)/i.test(rawTitle)) return "sequel";
  if (/\s+(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\s*$/i.test(t)) return "sequel";
  if (/\b(sequel|2|3|4|5|6|7|8|9|10)\s*$/i.test(t)) return "sequel";
  if (/vol(ume)?\.?\s*\d/i.test(rawTitle)) return "sequel";
  if (/第[二三四五六七八九十]/.test(rawTitle)) return "sequel";
  if (/\bxxl\b/i.test(rawTitle)) return "sequel";
  // 2. Cross-media roles
  var hasBook = false;
  var hasNonBook = false;
  var isBookEntity = entity.type === "book";
  if (clusterEntities) {
    for (var ci = 0; ci < clusterEntities.length; ci++) {
      if (clusterEntities[ci].entityId === entity.entityId) continue;
      if (clusterEntities[ci].type === "book") hasBook = true;
      if (clusterEntities[ci].type !== "book") hasNonBook = true;
    }
  }
  // Movie/TV/documentary with a book in the cluster → adaptation
  if (hasBook && (entity.type === "movie" || entity.type === "tv-series" || entity.type === "documentary")) return "adaptation";
  // Book in a cluster with movies/shows → original source
  if (isBookEntity && hasNonBook) return "original";
  // 3. Base name match — if entity base matches cluster base exactly, it's the original
  var entBase = extractBaseName(rawTitle);
  if (entBase === baseName) return "original";
  // 4. Episode indicators for TV/docs
  if (/s\d+e\d+/i.test(rawTitle) || /\bE\d+\b/.test(rawTitle)) return "related";
  return "related";
};

// ══════════════════════════════════════════════
// ACTION: detect — Analyze entities and group into franchises
// ══════════════════════════════════════════════
if (action === "detect") {
  var entities = getMediaEntities();
  var entityLookup = {};
  for (var ei = 0; ei < entities.length; ei++) {
    entityLookup[entities[ei].entityId] = entities[ei];
  }

  // Step 1: Title clustering — group by normalized base name
  var baseClusters = {}; // baseName → [entityId]
  var entityToBase = {}; // entityId → baseName
  for (var ti = 0; ti < entities.length; ti++) {
    var ent = entities[ti];
    var base = extractBaseName(ent.title);
    if (!base || base.length < 3) continue;
    // Skip very generic bases that create false clusters
    var sigWords = getSignificantWords(base);
    if (sigWords.length === 0) continue;
    entityToBase[ent.entityId] = base;

    // Check if this base matches any existing cluster
    var matched = false;
    var clusterKeys = Object.keys(baseClusters);
    for (var ck = 0; ck < clusterKeys.length; ck++) {
      if (isSimilarBase(base, clusterKeys[ck])) {
        baseClusters[clusterKeys[ck]].push(ent.entityId);
        entityToBase[ent.entityId] = clusterKeys[ck];
        matched = true;
        break;
      }
    }
    if (!matched) {
      baseClusters[base] = [ent.entityId];
    }
  }

  // Step 2: Cross-reference enhancement — expand clusters
  var clusterKeys2 = Object.keys(baseClusters);
  for (var ci2 = 0; ci2 < clusterKeys2.length; ci2++) {
    var clusterName = clusterKeys2[ci2];
    var clusterIds = baseClusters[clusterName];
    var expanded = clusterIds.slice();

    for (var ce = 0; ce < clusterIds.length; ce++) {
      var centity = entityLookup[clusterIds[ce]];
      if (!centity) continue;
      var crefs = centity.crossReferences || [];
      for (var cr = 0; cr < crefs.length; cr++) {
        var refId = crefs[cr].entityId;
        var refEntity = entityLookup[refId];
        if (!refEntity) continue;
        if (mediaEntityTypes.indexOf(refEntity.type) === -1) continue;
        if (expanded.indexOf(refId) >= 0) continue;

        // Only add cross-refs if they share a very similar base name
        // (do NOT use reason text — too many false positives like "both deal with X")
        var refBase = extractBaseName(refEntity.title);
        if (isSimilarBase(clusterName, refBase)) {
          expanded.push(refId);
        }
      }
    }
    baseClusters[clusterName] = expanded;
  }

  // Step 3: Filter to clusters with 2+ entities (franchise needs at least 2)
  var franchises = [];
  var assignedEntities = {};
  var sortedClusters = Object.keys(baseClusters).sort(function(a, b) {
    return baseClusters[b].length - baseClusters[a].length;
  });

  for (var fc = 0; fc < sortedClusters.length; fc++) {
    var cName = sortedClusters[fc];
    var cIds = baseClusters[cName];

    // Dedupe and skip already assigned
    var uniqueIds = [];
    for (var ui = 0; ui < cIds.length; ui++) {
      if (!assignedEntities[cIds[ui]] && uniqueIds.indexOf(cIds[ui]) === -1) {
        uniqueIds.push(cIds[ui]);
      }
    }
    if (uniqueIds.length < 2) continue;

    // Mark as assigned
    for (var ai = 0; ai < uniqueIds.length; ai++) {
      assignedEntities[uniqueIds[ai]] = true;
    }

    // Build franchise object — collect entities first, then determine roles
    var mediaTypes = {};
    var clusterEnts = [];
    for (var fe = 0; fe < uniqueIds.length; fe++) {
      var fEnt = entityLookup[uniqueIds[fe]];
      if (!fEnt) continue;
      mediaTypes[fEnt.type] = (mediaTypes[fEnt.type] || 0) + 1;
      clusterEnts.push(fEnt);
    }
    var fEntities = [];
    for (var fe2 = 0; fe2 < clusterEnts.length; fe2++) {
      var fEnt2 = clusterEnts[fe2];
      fEntities.push({
        entityId: fEnt2.entityId,
        title: fEnt2.title,
        type: fEnt2.type,
        source: fEnt2.source || "",
        imageUrl: fEnt2.imageUrl || null,
        role: determineRole(fEnt2, cName, clusterEnts),
        tags: (fEnt2.semanticTags || []).slice(0, 3)
      });
    }

    // Sort entities: original first, then by type, then alphabetically
    var roleOrder = { original: 0, sequel: 1, adaptation: 2, spinoff: 3, related: 4 };
    fEntities.sort(function(a, b) {
      var ro = (roleOrder[a.role] || 5) - (roleOrder[b.role] || 5);
      if (ro !== 0) return ro;
      return (a.title || "").localeCompare(b.title || "");
    });

    // Pretty-print franchise name
    var franchiseName = cName.split(" ").map(function(w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(" ");

    var fId = "franchise:" + slugify(cName) + "-" + Date.now().toString(36);

    // Build description from media types
    var mtKeys = Object.keys(mediaTypes);
    var desc = uniqueIds.length + " items across " + mtKeys.map(function(t) {
      return mediaTypes[t] + " " + t.replace("-", " ") + (mediaTypes[t] > 1 ? "s" : "");
    }).join(", ");

    franchises.push({
      franchiseId: fId,
      name: franchiseName,
      description: desc,
      entities: fEntities,
      mediaTypes: mtKeys,
      entityCount: uniqueIds.length,
      crossMediaCount: mtKeys.length,
      detectedAt: new Date().toISOString()
    });
  }

  // Sort franchises by entity count desc, then by cross-media count desc
  franchises.sort(function(a, b) {
    var cd = b.crossMediaCount - a.crossMediaCount;
    if (cd !== 0) return cd;
    return b.entityCount - a.entityCount;
  });

  // Persist
  franchiseData.franchises = franchises;
  franchiseData.detectedAt = new Date().toISOString();
  franchiseData.totalEntitiesAnalyzed = entities.length;

  if (!saveFranchises()) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_franchise",
          action: "detect",
          error: "Failed to save franchises to disk",
          franchises: []
        })
      }]
    };
  }

  // Return top N
  var topFranchises = franchises.slice(0, limit).map(function(f) {
    return {
      franchiseId: f.franchiseId,
      name: f.name,
      description: f.description,
      entityCount: f.entityCount,
      mediaTypes: f.mediaTypes,
      crossMediaCount: f.crossMediaCount,
      sampleEntities: f.entities.slice(0, 5).map(function(e) {
        return { entityId: e.entityId, title: e.title, type: e.type, role: e.role, imageUrl: e.imageUrl };
      })
    };
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_franchise",
        action: "detect",
        totalEntitiesAnalyzed: entities.length,
        franchisesDetected: franchises.length,
        totalEntitiesGrouped: Object.keys(assignedEntities).length,
        coveragePercent: Math.round(Object.keys(assignedEntities).length / entities.length * 100),
        franchises: topFranchises
      })
    }]
  };
}

// ══════════════════════════════════════════════
// ACTION: list — Show all detected franchises
// ══════════════════════════════════════════════
if (action === "list") {
  var allFranchises = franchiseData.franchises || [];

  // If entityId is provided, find which franchise it belongs to
  if (entityId) {
    var found = null;
    for (var fi = 0; fi < allFranchises.length; fi++) {
      var fEnts = allFranchises[fi].entities || [];
      for (var fei = 0; fei < fEnts.length; fei++) {
        if (fEnts[fei].entityId === entityId) {
          found = allFranchises[fi];
          break;
        }
      }
      if (found) break;
    }

    if (found) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            tool: "enso_media_library_franchise",
            action: "view",
            franchise: found,
            lookupEntityId: entityId
          })
        }]
      };
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_franchise",
          action: "list",
          message: "No franchise found for entity: " + entityId,
          franchises: [],
          totalFranchises: 0
        })
      }]
    };
  }

  // Show all franchises sorted by entity count
  var listed = allFranchises.slice(0, limit).map(function(f) {
    return {
      franchiseId: f.franchiseId,
      name: f.name,
      description: f.description,
      entityCount: f.entityCount,
      mediaTypes: f.mediaTypes,
      crossMediaCount: f.crossMediaCount,
      sampleEntities: (f.entities || []).slice(0, 4).map(function(e) {
        return { entityId: e.entityId, title: e.title, type: e.type, role: e.role, imageUrl: e.imageUrl };
      })
    };
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_franchise",
        action: "list",
        totalFranchises: allFranchises.length,
        detectedAt: franchiseData.detectedAt || null,
        franchises: listed
      })
    }]
  };
}

// ══════════════════════════════════════════════
// ACTION: view — Detailed franchise view
// ══════════════════════════════════════════════
if (action === "view") {
  if (!franchiseId) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_franchise",
          action: "view",
          error: "franchiseId is required for view action"
        })
      }]
    };
  }

  var targetFranchise = null;
  for (var vi = 0; vi < franchiseData.franchises.length; vi++) {
    if (franchiseData.franchises[vi].franchiseId === franchiseId) {
      targetFranchise = franchiseData.franchises[vi];
      break;
    }
  }

  if (!targetFranchise) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_franchise",
          action: "view",
          error: "Franchise not found: " + franchiseId
        })
      }]
    };
  }

  // Enrich entities with current data from index
  var enrichedEntities = [];
  var byType = {};
  for (var ve = 0; ve < targetFranchise.entities.length; ve++) {
    var fEntity = targetFranchise.entities[ve];
    var current = index[fEntity.entityId];
    var enriched = {
      entityId: fEntity.entityId,
      title: current ? current.title : fEntity.title,
      type: current ? current.type : fEntity.type,
      source: current ? (current.source || "") : (fEntity.source || ""),
      imageUrl: current ? (current.imageUrl || null) : (fEntity.imageUrl || null),
      role: fEntity.role,
      tags: current ? (current.semanticTags || []).slice(0, 5) : (fEntity.tags || []),
      crossRefCount: current ? (current.crossReferences || []).length : 0
    };

    // Read engagement data if available
    if (current) {
      enriched.userRating = current.userRating || null;
      enriched.isFavorite = current.isFavorite || false;
      enriched.consumptionStatus = current.consumptionStatus || null;
    }

    enrichedEntities.push(enriched);

    var etype = enriched.type;
    if (!byType[etype]) byType[etype] = [];
    byType[etype].push(enriched);
  }

  // Build grouped view by media type
  var typeGroups = Object.keys(byType).map(function(t) {
    return {
      mediaType: t,
      count: byType[t].length,
      entities: byType[t]
    };
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_franchise",
        action: "view",
        franchise: {
          franchiseId: targetFranchise.franchiseId,
          name: targetFranchise.name,
          description: targetFranchise.description,
          entityCount: targetFranchise.entityCount,
          mediaTypes: targetFranchise.mediaTypes,
          crossMediaCount: targetFranchise.crossMediaCount,
          detectedAt: targetFranchise.detectedAt
        },
        typeGroups: typeGroups,
        entities: enrichedEntities
      })
    }]
  };
}

// ══════════════════════════════════════════════
// ACTION: merge — Merge franchises or add entity to franchise
// ══════════════════════════════════════════════
if (action === "merge") {
  var mergeTargetId = (params.franchiseId || "").trim();
  var mergeEntityId = (params.entityId || "").trim();
  var mergeSourceId = (params.sourceFranchiseId || "").trim();

  if (!mergeTargetId) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_franchise",
          action: "merge",
          error: "franchiseId (target) is required for merge action"
        })
      }]
    };
  }

  // Find target franchise
  var mergeTarget = null;
  var mergeTargetIdx = -1;
  for (var mi = 0; mi < franchiseData.franchises.length; mi++) {
    if (franchiseData.franchises[mi].franchiseId === mergeTargetId) {
      mergeTarget = franchiseData.franchises[mi];
      mergeTargetIdx = mi;
      break;
    }
  }

  if (!mergeTarget) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_franchise",
          action: "merge",
          error: "Target franchise not found: " + mergeTargetId
        })
      }]
    };
  }

  // Case 1: Add a single entity to the franchise
  if (mergeEntityId) {
    var addEntity = index[mergeEntityId];
    if (!addEntity) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            tool: "enso_media_library_franchise",
            action: "merge",
            error: "Entity not found: " + mergeEntityId
          })
        }]
      };
    }

    // Check not already in franchise
    var alreadyIn = false;
    for (var ae = 0; ae < mergeTarget.entities.length; ae++) {
      if (mergeTarget.entities[ae].entityId === mergeEntityId) {
        alreadyIn = true;
        break;
      }
    }

    if (!alreadyIn) {
      mergeTarget.entities.push({
        entityId: addEntity.entityId,
        title: addEntity.title,
        type: addEntity.type,
        source: addEntity.source || "",
        imageUrl: addEntity.imageUrl || null,
        role: "related",
        tags: (addEntity.semanticTags || []).slice(0, 3)
      });
      mergeTarget.entityCount = mergeTarget.entities.length;

      // Update media types
      var mtypes = {};
      for (var mt = 0; mt < mergeTarget.entities.length; mt++) {
        mtypes[mergeTarget.entities[mt].type] = true;
      }
      mergeTarget.mediaTypes = Object.keys(mtypes);
      mergeTarget.crossMediaCount = mergeTarget.mediaTypes.length;
    }

    if (!saveFranchises()) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            tool: "enso_media_library_franchise",
            action: "merge",
            error: "Failed to save",
            success: false
          })
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_franchise",
          action: "merge",
          success: true,
          mergeType: "add_entity",
          franchiseName: mergeTarget.name,
          addedEntity: addEntity.title,
          newEntityCount: mergeTarget.entityCount
        })
      }]
    };
  }

  // Case 2: Merge two franchises
  if (mergeSourceId) {
    var mergeSource = null;
    var mergeSourceIdx = -1;
    for (var ms = 0; ms < franchiseData.franchises.length; ms++) {
      if (franchiseData.franchises[ms].franchiseId === mergeSourceId) {
        mergeSource = franchiseData.franchises[ms];
        mergeSourceIdx = ms;
        break;
      }
    }

    if (!mergeSource) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            tool: "enso_media_library_franchise",
            action: "merge",
            error: "Source franchise not found: " + mergeSourceId
          })
        }]
      };
    }

    // Merge source entities into target
    var existingIds = {};
    for (var ex = 0; ex < mergeTarget.entities.length; ex++) {
      existingIds[mergeTarget.entities[ex].entityId] = true;
    }

    var added = 0;
    for (var sa = 0; sa < mergeSource.entities.length; sa++) {
      if (!existingIds[mergeSource.entities[sa].entityId]) {
        mergeTarget.entities.push(mergeSource.entities[sa]);
        added++;
      }
    }

    mergeTarget.entityCount = mergeTarget.entities.length;

    // Update media types
    var mtypes2 = {};
    for (var mt2 = 0; mt2 < mergeTarget.entities.length; mt2++) {
      mtypes2[mergeTarget.entities[mt2].type] = true;
    }
    mergeTarget.mediaTypes = Object.keys(mtypes2);
    mergeTarget.crossMediaCount = mergeTarget.mediaTypes.length;

    // Remove source franchise
    if (mergeSourceIdx >= 0) {
      franchiseData.franchises.splice(mergeSourceIdx, 1);
    }

    if (!saveFranchises()) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            tool: "enso_media_library_franchise",
            action: "merge",
            error: "Failed to save",
            success: false
          })
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_franchise",
          action: "merge",
          success: true,
          mergeType: "merge_franchises",
          targetFranchise: mergeTarget.name,
          sourceFranchise: mergeSource.name,
          entitiesAdded: added,
          newEntityCount: mergeTarget.entityCount
        })
      }]
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_franchise",
        action: "merge",
        error: "Provide entityId (to add entity) or sourceFranchiseId (to merge franchises)"
      })
    }]
  };
}

// Unknown action
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_franchise",
      action: action,
      error: "Unknown action. Use: detect, list, view, merge",
      franchises: []
    })
  }]
};
