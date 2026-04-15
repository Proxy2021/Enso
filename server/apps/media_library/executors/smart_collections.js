var fs = require("fs");
var path = require("path");
var os = require("os");

var colDir = path.join(os.homedir(), ".enso", "data", "media-library");
var colPath = path.join(colDir, "collections.json");
var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var action = (params.action || "").trim() || "generate";
var proposalId = (params.proposalId || "").trim();
var proposalIds = params.proposalIds || [];

// Media entity types (same filter as browse.js)
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
        tool: "enso_media_library_smart_collections",
        action: action,
        error: "Could not load entity index: " + e.message,
        proposals: [],
        collections: []
      })
    }]
  };
}

// Load collections
var colData = { collections: [] };
try {
  var colRaw = fs.readFileSync(colPath, "utf8");
  colData = JSON.parse(colRaw);
  if (!colData.collections) colData.collections = [];
} catch (e) {
  colData = { collections: [] };
}

// Helper to save collections
var saveCollections = function() {
  try {
    fs.mkdirSync(colDir, { recursive: true });
    fs.writeFileSync(colPath, JSON.stringify(colData, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
};

// Helper: slugify for IDs
var slugify = function(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
};

// Helper: get all media entities
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

// Helper: compute cross-media diversity score (1.0 base + 0.3 per additional media type)
var diversityScore = function(typeBreakdown) {
  var types = Object.keys(typeBreakdown);
  var count = 0;
  for (var i = 0; i < types.length; i++) {
    if (typeBreakdown[types[i]] > 0) count++;
  }
  return count <= 1 ? 1.0 : 1.0 + (count - 1) * 0.3;
};

// Helper: pretty-print a tag into a collection name
var tagToName = function(tag) {
  var words = tag.replace(/-/g, " ").split(" ");
  var result = [];
  for (var i = 0; i < words.length; i++) {
    if (words[i].length > 0) {
      result.push(words[i].charAt(0).toUpperCase() + words[i].slice(1));
    }
  }
  return result.join(" ");
};

// ══════════════════════════════════════════════
// ACTION: generate — Analyze tags, find clusters, propose collections
// ══════════════════════════════════════════════
if (action === "generate") {
  var entities = getMediaEntities();

  // Step 1: Build tag frequency map — tag → [entityId]
  var tagEntities = {};
  for (var ei = 0; ei < entities.length; ei++) {
    var ent = entities[ei];
    var stags = ent.semanticTags || [];
    var tags = ent.tags || [];
    var allTags = stags.concat(tags);
    for (var ti = 0; ti < allTags.length; ti++) {
      var tag = (allTags[ti] || "").toLowerCase().trim();
      if (!tag || tag.length < 2) continue;
      if (!tagEntities[tag]) tagEntities[tag] = [];
      if (tagEntities[tag].indexOf(ent.entityId) === -1) {
        tagEntities[tag].push(ent.entityId);
      }
    }
  }

  // Step 2: Create candidate collections for tags with 5+ entities
  var candidates = [];
  var tagKeys = Object.keys(tagEntities);
  for (var ci = 0; ci < tagKeys.length; ci++) {
    var tagName = tagKeys[ci];
    var entityIds = tagEntities[tagName];
    if (entityIds.length < 5) continue;
    candidates.push({
      tags: [tagName],
      entityIds: entityIds.slice(),
      name: tagToName(tagName)
    });
  }

  // Sort candidates by entity count descending for merge priority
  candidates.sort(function(a, b) { return b.entityIds.length - a.entityIds.length; });

  // Step 3: Merge overlapping candidates (70%+ entity overlap → combine)
  var merged = [];
  var usedCandidates = {};
  for (var mi = 0; mi < candidates.length; mi++) {
    if (usedCandidates[mi]) continue;
    var current = {
      tags: candidates[mi].tags.slice(),
      entityIds: candidates[mi].entityIds.slice(),
      name: candidates[mi].name
    };

    for (var mj = mi + 1; mj < candidates.length; mj++) {
      if (usedCandidates[mj]) continue;
      var other = candidates[mj];

      // Compute overlap
      var overlapCount = 0;
      for (var oi = 0; oi < other.entityIds.length; oi++) {
        if (current.entityIds.indexOf(other.entityIds[oi]) !== -1) {
          overlapCount++;
        }
      }

      var smallerSize = Math.min(current.entityIds.length, other.entityIds.length);
      if (smallerSize > 0 && (overlapCount / smallerSize) >= 0.7) {
        // Merge: combine entity sets and tags
        usedCandidates[mj] = true;
        for (var ai = 0; ai < other.tags.length; ai++) {
          if (current.tags.indexOf(other.tags[ai]) === -1) {
            current.tags.push(other.tags[ai]);
          }
        }
        for (var bi = 0; bi < other.entityIds.length; bi++) {
          if (current.entityIds.indexOf(other.entityIds[bi]) === -1) {
            current.entityIds.push(other.entityIds[bi]);
          }
        }
        // Update name if merged tag is more descriptive
        if (current.tags.length <= 3) {
          current.name = current.tags.map(tagToName).join(" & ");
        }
      }
    }
    merged.push(current);
  }

  // Step 4: Score and rank candidates
  var entityLookup = {};
  for (var li = 0; li < entities.length; li++) {
    entityLookup[entities[li].entityId] = entities[li];
  }

  var scored = [];
  for (var si = 0; si < merged.length; si++) {
    var cand = merged[si];
    var typeBreakdown = {};
    var sampleEntities = [];

    for (var se = 0; se < cand.entityIds.length; se++) {
      var sEnt = entityLookup[cand.entityIds[se]];
      if (sEnt) {
        typeBreakdown[sEnt.type] = (typeBreakdown[sEnt.type] || 0) + 1;
        if (sampleEntities.length < 5) {
          sampleEntities.push({
            entityId: sEnt.entityId,
            type: sEnt.type,
            title: sEnt.title,
            imageUrl: sEnt.imageUrl || null
          });
        }
      }
    }

    var dScore = diversityScore(typeBreakdown);
    var rankScore = cand.entityIds.length * dScore;

    // Build description from tags
    var desc = "A collection of " + cand.entityIds.length + " items exploring themes of " + cand.tags.slice(0, 4).map(tagToName).join(", ");
    var typeNames = Object.keys(typeBreakdown);
    if (typeNames.length > 1) {
      desc += " — spanning " + typeNames.map(function(t) { return t.replace("-", " "); }).join(", ");
    }

    scored.push({
      proposalId: "smart:" + slugify(cand.tags[0]) + "-" + Date.now().toString(36),
      name: cand.name,
      description: desc,
      tags: cand.tags,
      entityCount: cand.entityIds.length,
      entityIds: cand.entityIds,
      typeBreakdown: typeBreakdown,
      diversityScore: Math.round(dScore * 100) / 100,
      rankScore: Math.round(rankScore * 100) / 100,
      sampleEntities: sampleEntities
    });
  }

  // Sort by rank score descending
  scored.sort(function(a, b) { return b.rankScore - a.rankScore; });

  // Return top 15 proposals
  var proposals = scored.slice(0, 15);

  // Summary stats
  var totalTagsCovered = 0;
  var totalEntitiesCovered = {};
  for (var pi = 0; pi < proposals.length; pi++) {
    totalTagsCovered += proposals[pi].tags.length;
    for (var pj = 0; pj < proposals[pi].entityIds.length; pj++) {
      totalEntitiesCovered[proposals[pi].entityIds[pj]] = true;
    }
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_smart_collections",
        action: "generate",
        proposalCount: proposals.length,
        totalEntitiesAnalyzed: entities.length,
        uniqueEntitiesCovered: Object.keys(totalEntitiesCovered).length,
        uniqueTagsFound: tagKeys.length,
        qualifyingTags: candidates.length,
        proposals: proposals.map(function(p) {
          return {
            proposalId: p.proposalId,
            name: p.name,
            description: p.description,
            tags: p.tags,
            entityCount: p.entityCount,
            typeBreakdown: p.typeBreakdown,
            diversityScore: p.diversityScore,
            rankScore: p.rankScore,
            sampleEntities: p.sampleEntities
          };
        })
      })
    }]
  };
}

// ══════════════════════════════════════════════
// ACTION: apply — Save approved proposals to collections.json
// ══════════════════════════════════════════════
if (action === "apply") {
  // Accept either single proposalId or batch proposalIds
  var idsToApply = [];
  if (proposalIds.length > 0) {
    idsToApply = proposalIds;
  } else if (proposalId) {
    idsToApply = [proposalId];
  }

  if (idsToApply.length === 0) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_smart_collections",
          action: "apply",
          error: "proposalId or proposalIds required",
          success: false
        })
      }]
    };
  }

  // We need to re-generate to get the entity lists for the proposals
  // (proposals are ephemeral — stored by ID pattern matching)
  var entities = getMediaEntities();
  var tagEntities2 = {};
  for (var e2i = 0; e2i < entities.length; e2i++) {
    var ent2 = entities[e2i];
    var allTags2 = (ent2.semanticTags || []).concat(ent2.tags || []);
    for (var t2i = 0; t2i < allTags2.length; t2i++) {
      var tag2 = (allTags2[t2i] || "").toLowerCase().trim();
      if (!tag2 || tag2.length < 2) continue;
      if (!tagEntities2[tag2]) tagEntities2[tag2] = [];
      if (tagEntities2[tag2].indexOf(ent2.entityId) === -1) {
        tagEntities2[tag2].push(ent2.entityId);
      }
    }
  }

  // For apply, we need the proposal params passed in
  var name2 = (params.name || "").trim();
  var description2 = (params.description || "").trim();
  var entityIds2 = params.entityIds || [];
  var tags2 = params.tags || [];

  if (!name2) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_smart_collections",
          action: "apply",
          error: "name is required when applying a smart collection",
          success: false
        })
      }]
    };
  }

  // Build the collection ID with smart: prefix
  var smartId = "smart:" + slugify(name2) + "-" + Date.now().toString(36);

  // Check for existing smart collection with same base tag
  var existingIdx = -1;
  for (var exi = 0; exi < colData.collections.length; exi++) {
    if (colData.collections[exi].id === proposalId) {
      existingIdx = exi;
      break;
    }
  }

  var newSmartCol = {
    id: proposalId || smartId,
    name: name2,
    description: description2,
    tags: tags2,
    createdAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    entityIds: entityIds2,
    isSmartCollection: true
  };

  if (existingIdx >= 0) {
    // Update existing
    colData.collections[existingIdx] = newSmartCol;
  } else {
    colData.collections.push(newSmartCol);
  }

  if (!saveCollections()) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_smart_collections",
          action: "apply",
          error: "Failed to save collections",
          success: false
        })
      }]
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_smart_collections",
        action: "apply",
        collectionId: newSmartCol.id,
        name: newSmartCol.name,
        entityCount: newSmartCol.entityIds.length,
        success: true
      })
    }]
  };
}

// ══════════════════════════════════════════════
// ACTION: refresh — Update existing smart collections with current data
// ══════════════════════════════════════════════
if (action === "refresh") {
  var entities = getMediaEntities();

  // Build tag→entity mapping
  var tagEntities3 = {};
  for (var e3i = 0; e3i < entities.length; e3i++) {
    var ent3 = entities[e3i];
    var allTags3 = (ent3.semanticTags || []).concat(ent3.tags || []);
    for (var t3i = 0; t3i < allTags3.length; t3i++) {
      var tag3 = (allTags3[t3i] || "").toLowerCase().trim();
      if (!tag3 || tag3.length < 2) continue;
      if (!tagEntities3[tag3]) tagEntities3[tag3] = [];
      if (tagEntities3[tag3].indexOf(ent3.entityId) === -1) {
        tagEntities3[tag3].push(ent3.entityId);
      }
    }
  }

  var refreshed = [];
  var smartCollections = [];
  for (var ri = 0; ri < colData.collections.length; ri++) {
    var col = colData.collections[ri];
    if (col.isSmartCollection || (col.id && col.id.indexOf("smart:") === 0)) {
      smartCollections.push(col);
    }
  }

  if (smartCollections.length === 0) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_smart_collections",
          action: "refresh",
          message: "No smart collections found to refresh",
          refreshed: [],
          refreshedCount: 0
        })
      }]
    };
  }

  for (var rfi = 0; rfi < smartCollections.length; rfi++) {
    var sc = smartCollections[rfi];
    var scTags = sc.tags || [];
    var oldCount = (sc.entityIds || []).length;

    // Re-compute entity list from tags
    var newEntityIds = {};
    for (var rti = 0; rti < scTags.length; rti++) {
      var rtag = scTags[rti].toLowerCase().trim();
      var matching = tagEntities3[rtag] || [];
      for (var rmi = 0; rmi < matching.length; rmi++) {
        newEntityIds[matching[rmi]] = true;
      }
    }

    var updatedIds = Object.keys(newEntityIds);
    sc.entityIds = updatedIds;
    sc.generatedAt = new Date().toISOString();

    var added = updatedIds.length - oldCount;
    refreshed.push({
      collectionId: sc.id,
      name: sc.name,
      oldCount: oldCount,
      newCount: updatedIds.length,
      added: added > 0 ? added : 0,
      removed: added < 0 ? Math.abs(added) : 0
    });
  }

  if (!saveCollections()) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_smart_collections",
          action: "refresh",
          error: "Failed to save updated collections",
          success: false
        })
      }]
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_smart_collections",
        action: "refresh",
        refreshedCount: refreshed.length,
        refreshed: refreshed,
        success: true
      })
    }]
  };
}

// ══════════════════════════════════════════════
// ACTION: list — Show all smart collections with stats
// ══════════════════════════════════════════════
if (action === "list") {
  var smartCols = [];
  var entityLookup2 = {};
  var allEnts = Object.values(index);
  for (var l2i = 0; l2i < allEnts.length; l2i++) {
    entityLookup2[allEnts[l2i].entityId] = allEnts[l2i];
  }

  for (var li = 0; li < colData.collections.length; li++) {
    var col2 = colData.collections[li];
    if (!col2.isSmartCollection && (!col2.id || col2.id.indexOf("smart:") !== 0)) continue;

    // Compute type breakdown for this collection
    var tb = {};
    var sampleItems = [];
    var eids = col2.entityIds || [];
    for (var tbi = 0; tbi < eids.length; tbi++) {
      var ent4 = entityLookup2[eids[tbi]];
      if (ent4) {
        tb[ent4.type] = (tb[ent4.type] || 0) + 1;
        if (sampleItems.length < 3) {
          sampleItems.push({
            entityId: ent4.entityId,
            type: ent4.type,
            title: ent4.title,
            imageUrl: ent4.imageUrl || null
          });
        }
      }
    }

    // Compute freshness
    var freshness = "unknown";
    if (col2.generatedAt) {
      var ageMs = Date.now() - new Date(col2.generatedAt).getTime();
      var ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours < 1) freshness = "just now";
      else if (ageHours < 24) freshness = Math.floor(ageHours) + "h ago";
      else if (ageHours < 168) freshness = Math.floor(ageHours / 24) + "d ago";
      else freshness = Math.floor(ageHours / 168) + "w ago";
    }

    smartCols.push({
      id: col2.id,
      name: col2.name,
      description: col2.description || "",
      tags: col2.tags || [],
      entityCount: eids.length,
      typeBreakdown: tb,
      diversityScore: diversityScore(tb),
      freshness: freshness,
      generatedAt: col2.generatedAt || col2.createdAt,
      sampleEntities: sampleItems
    });
  }

  // Sort by entity count descending
  smartCols.sort(function(a, b) { return b.entityCount - a.entityCount; });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_smart_collections",
        action: "list",
        totalSmartCollections: smartCols.length,
        collections: smartCols
      })
    }]
  };
}

// Unknown action
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_smart_collections",
      action: action,
      error: "Unknown action. Use: generate, apply, refresh, list",
      success: false
    })
  }]
};
