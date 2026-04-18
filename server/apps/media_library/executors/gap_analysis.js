var fs = require("fs");
var path = require("path");
var os = require("os");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var colDir = path.join(os.homedir(), ".enso", "data", "media-library");
var colPath = path.join(colDir, "collections.json");
var action = (params.action || "overview").trim();

// ── Load entity index ──
var index = {};
try {
  var raw = fs.readFileSync(indexPath, "utf8");
  index = JSON.parse(raw);
} catch (e) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_gap_analysis",
        error: "Could not load entity index: " + e.message,
        action: action
      })
    }]
  };
}

// ── Load collections ──
var colData = { collections: [] };
try {
  var colRaw = fs.readFileSync(colPath, "utf8");
  colData = JSON.parse(colRaw);
  if (!colData.collections) colData.collections = [];
} catch (e) {
  colData = { collections: [] };
}

// ── Title normalization (matches entity_resolve.js) ──
function normalizeTitle(title) {
  if (!title) return "";
  var t = title.toLowerCase().trim();
  t = t.replace(/\s*\(\d{4}\)\s*$/, "");
  t = t.replace(/^(the|a|an)\s+/i, "");
  return t.trim();
}

// ── Filter media entities ──
var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "song", "artist", "playlist", "article"];
var allEntities = Object.values(index);
var entities = [];
for (var i = 0; i < allEntities.length; i++) {
  if (mediaEntityTypes.indexOf(allEntities[i].type) !== -1) {
    entities.push(allEntities[i]);
  }
}

var totalEntities = entities.length;
var now = Date.now();
var DAY_MS = 86400000;
var WEEK_MS = DAY_MS * 7;
var STALE_DAYS = 30;

// ══════════════════════════════════════════════
// COVERAGE GAPS
// ══════════════════════════════════════════════
var typeCounts = {};
var typeLabels = {
  "book": "Books", "movie": "Movies", "tv-series": "TV Series",
  "documentary": "Documentaries", "game": "Games",
  "song": "Songs", "artist": "Artists", "playlist": "Playlists",
  "article": "Articles"
};
var typeIcons = {
  "book": "BookOpen", "movie": "Film", "tv-series": "Tv",
  "documentary": "Video", "game": "Gamepad2",
  "song": "Music", "artist": "Music", "playlist": "ListMusic",
  "article": "FileText"
};

for (var tc = 0; tc < entities.length; tc++) {
  var t = entities[tc].type;
  typeCounts[t] = (typeCounts[t] || 0) + 1;
}

// Coverage analysis: count, share, has any ratings?
var coverageItems = [];
var typeKeys = Object.keys(typeCounts).sort(function(a, b) { return typeCounts[b] - typeCounts[a]; });
for (var ci = 0; ci < typeKeys.length; ci++) {
  var cType = typeKeys[ci];
  var cCount = typeCounts[cType];
  var cShare = totalEntities > 0 ? Math.round((cCount / totalEntities) * 1000) / 10 : 0;
  var cRated = 0;
  var cFav = 0;
  var cTracked = 0;
  for (var cj = 0; cj < entities.length; cj++) {
    if (entities[cj].type !== cType) continue;
    if (entities[cj].userRating && entities[cj].userRating > 0) cRated++;
    if (entities[cj].isFavorite) cFav++;
    if (entities[cj].consumptionStatus && entities[cj].consumptionStatus !== "not_started") cTracked++;
  }
  var severity = "green";
  if (cShare < 5) severity = "red";
  else if (cShare < 10) severity = "amber";

  coverageItems.push({
    type: cType,
    label: typeLabels[cType] || cType,
    icon: typeIcons[cType] || "FileText",
    count: cCount,
    share: cShare,
    rated: cRated,
    ratedPercent: cCount > 0 ? Math.round((cRated / cCount) * 1000) / 10 : 0,
    favorited: cFav,
    tracked: cTracked,
    hasNoRatings: cRated === 0,
    severity: severity
  });
}

// Identify missing major types
var expectedTypes = ["book", "movie", "tv-series", "game"];
var missingTypes = [];
for (var mt = 0; mt < expectedTypes.length; mt++) {
  if (!typeCounts[expectedTypes[mt]] || typeCounts[expectedTypes[mt]] === 0) {
    missingTypes.push(expectedTypes[mt]);
  }
}

var coverageGaps = {
  items: coverageItems,
  missingTypes: missingTypes,
  totalTypes: typeKeys.length,
  underrepresented: coverageItems.filter(function(c) { return c.share < 10; }),
  noRatingsTypes: coverageItems.filter(function(c) { return c.hasNoRatings && c.count > 0; })
};

// ══════════════════════════════════════════════
// ENGAGEMENT GAPS
// ══════════════════════════════════════════════
var untouched = [];        // no rating, no status, no favorite
var notStarted = [];       // status = not_started or null
var stalled = [];          // in_progress but not updated in 30+ days
var unrated = [];          // have status but no rating

for (var ei = 0; ei < entities.length; ei++) {
  var ent = entities[ei];
  var hasRating = ent.userRating && ent.userRating > 0;
  var hasFav = ent.isFavorite === true;
  var hasStatus = ent.consumptionStatus && ent.consumptionStatus !== "not_started";

  // Completely untouched
  if (!hasRating && !hasFav && !hasStatus) {
    untouched.push({
      entityId: ent.entityId,
      title: ent.title,
      type: ent.type,
      imageUrl: ent.imageUrl || null,
      source: ent.source || null,
      addedAt: ent.createdAt || ent.updatedAt || null
    });
  }

  // Not started (explicitly or implicitly)
  if (!ent.consumptionStatus || ent.consumptionStatus === "not_started") {
    notStarted.push({
      entityId: ent.entityId,
      title: ent.title,
      type: ent.type,
      source: ent.source || null,
      addedAt: ent.createdAt || ent.updatedAt || null
    });
  }

  // Stalled: in_progress but not updated recently
  if (ent.consumptionStatus === "in_progress") {
    var lastUpdate = ent.updatedAt ? new Date(ent.updatedAt).getTime() : 0;
    var daysSinceUpdate = lastUpdate > 0 ? Math.floor((now - lastUpdate) / DAY_MS) : 999;
    if (daysSinceUpdate >= STALE_DAYS) {
      stalled.push({
        entityId: ent.entityId,
        title: ent.title,
        type: ent.type,
        imageUrl: ent.imageUrl || null,
        daysSinceUpdate: daysSinceUpdate,
        progress: ent.progress || null,
        updatedAt: ent.updatedAt || null
      });
    }
  }

  // Has engagement but no rating
  if (!hasRating && (hasStatus || hasFav)) {
    unrated.push({
      entityId: ent.entityId,
      title: ent.title,
      type: ent.type,
      consumptionStatus: ent.consumptionStatus,
      isFavorite: ent.isFavorite || false
    });
  }
}

// Group untouched by type
var untouchedByType = {};
for (var uti = 0; uti < untouched.length; uti++) {
  var uType = untouched[uti].type;
  untouchedByType[uType] = (untouchedByType[uType] || 0) + 1;
}

// Group not_started by type
var notStartedByType = {};
for (var nsi = 0; nsi < notStarted.length; nsi++) {
  var nsType = notStarted[nsi].type;
  notStartedByType[nsType] = (notStartedByType[nsType] || 0) + 1;
}

stalled.sort(function(a, b) { return b.daysSinceUpdate - a.daysSinceUpdate; });

var engagementGaps = {
  untouchedCount: untouched.length,
  untouchedPercent: totalEntities > 0 ? Math.round((untouched.length / totalEntities) * 1000) / 10 : 0,
  untouchedByType: untouchedByType,
  untouchedSample: untouched.slice(0, 10),
  notStartedCount: notStarted.length,
  notStartedByType: notStartedByType,
  stalledCount: stalled.length,
  stalledItems: stalled.slice(0, 10),
  unratedEngagedCount: unrated.length,
  unratedSample: unrated.slice(0, 10)
};

// ══════════════════════════════════════════════
// ENRICHMENT GAPS
// ══════════════════════════════════════════════
var noTags = [];
var noCrossRefs = [];
var missingMetadata = [];
var noImages = [];

for (var eni = 0; eni < entities.length; eni++) {
  var eEnt = entities[eni];
  var sTags = eEnt.semanticTags || [];
  var cRefs = eEnt.crossReferences || [];

  // No semantic tags
  if (sTags.length === 0) {
    noTags.push({
      entityId: eEnt.entityId,
      title: eEnt.title,
      type: eEnt.type
    });
  }

  // No cross-references (isolated)
  if (cRefs.length === 0) {
    noCrossRefs.push({
      entityId: eEnt.entityId,
      title: eEnt.title,
      type: eEnt.type
    });
  }

  // Missing key metadata
  var missingFields = [];
  if (eEnt.type === "book") {
    if (!eEnt.author && !eEnt.authors && !(eEnt.metadata && eEnt.metadata.author)) missingFields.push("author");
  }
  if (eEnt.type === "movie" || eEnt.type === "tv-series" || eEnt.type === "documentary") {
    if (!eEnt.director && !(eEnt.metadata && eEnt.metadata.director)) missingFields.push("director");
    if (!eEnt.year && !(eEnt.metadata && eEnt.metadata.year) && !(eEnt.metadata && eEnt.metadata.releaseDate)) missingFields.push("year");
  }
  if (eEnt.type === "game") {
    if (!eEnt.developer && !(eEnt.metadata && eEnt.metadata.developer)) missingFields.push("developer");
  }
  if (missingFields.length > 0) {
    missingMetadata.push({
      entityId: eEnt.entityId,
      title: eEnt.title,
      type: eEnt.type,
      missingFields: missingFields
    });
  }

  // No image
  if (!eEnt.imageUrl) {
    noImages.push({
      entityId: eEnt.entityId,
      title: eEnt.title,
      type: eEnt.type
    });
  }
}

// Group enrichment gaps by type
var noTagsByType = {};
for (var nti = 0; nti < noTags.length; nti++) {
  var ntType = noTags[nti].type;
  noTagsByType[ntType] = (noTagsByType[ntType] || 0) + 1;
}
var noImagesByType = {};
for (var nii = 0; nii < noImages.length; nii++) {
  var niType = noImages[nii].type;
  noImagesByType[niType] = (noImagesByType[niType] || 0) + 1;
}

// Per-type enrichment progress
var enrichmentByType = [];
for (var eti = 0; eti < typeKeys.length; eti++) {
  var eType = typeKeys[eti];
  var eTotal = typeCounts[eType] || 0;
  var eTagged = eTotal - (noTagsByType[eType] || 0);
  var eWithImage = eTotal - (noImagesByType[eType] || 0);
  enrichmentByType.push({
    type: eType,
    label: typeLabels[eType] || eType,
    total: eTotal,
    tagged: eTagged,
    taggedPercent: eTotal > 0 ? Math.round((eTagged / eTotal) * 1000) / 10 : 0,
    withImage: eWithImage,
    imagePercent: eTotal > 0 ? Math.round((eWithImage / eTotal) * 1000) / 10 : 0
  });
}

var enrichmentGaps = {
  noTagsCount: noTags.length,
  noTagsPercent: totalEntities > 0 ? Math.round((noTags.length / totalEntities) * 1000) / 10 : 0,
  noTagsByType: noTagsByType,
  noCrossRefsCount: noCrossRefs.length,
  noCrossRefsPercent: totalEntities > 0 ? Math.round((noCrossRefs.length / totalEntities) * 1000) / 10 : 0,
  missingMetadataCount: missingMetadata.length,
  missingMetadataSample: missingMetadata.slice(0, 10),
  noImagesCount: noImages.length,
  noImagesByType: noImagesByType,
  enrichmentByType: enrichmentByType
};

// ══════════════════════════════════════════════
// TASTE PROFILE GAPS
// ══════════════════════════════════════════════

// Build tag → rating/count map from rated entities
var tagRatings = {};       // tag -> { sum, count, types: Set }
var typeAvgRating = {};    // type -> { sum, count }

for (var tpi = 0; tpi < entities.length; tpi++) {
  var tEnt = entities[tpi];
  if (!tEnt.userRating || tEnt.userRating <= 0) continue;

  // Accumulate type rating
  if (!typeAvgRating[tEnt.type]) typeAvgRating[tEnt.type] = { sum: 0, count: 0 };
  typeAvgRating[tEnt.type].sum += tEnt.userRating;
  typeAvgRating[tEnt.type].count++;

  // Accumulate tag ratings
  var tTags = tEnt.semanticTags || [];
  for (var ttj = 0; ttj < tTags.length; ttj++) {
    var tTag = tTags[ttj];
    if (!tagRatings[tTag]) tagRatings[tTag] = { sum: 0, count: 0, types: {} };
    tagRatings[tTag].sum += tEnt.userRating;
    tagRatings[tTag].count++;
    tagRatings[tTag].types[tEnt.type] = true;
  }
}

// Under-explored: tags with high avg rating but few entities
var underExplored = [];
var tagKeys = Object.keys(tagRatings);
for (var uei = 0; uei < tagKeys.length; uei++) {
  var uTag = tagKeys[uei];
  var uData = tagRatings[uTag];
  var uAvg = uData.count > 0 ? Math.round((uData.sum / uData.count) * 10) / 10 : 0;
  // Count total entities with this tag (not just rated ones)
  var totalWithTag = 0;
  for (var uwi = 0; uwi < entities.length; uwi++) {
    if ((entities[uwi].semanticTags || []).indexOf(uTag) !== -1) totalWithTag++;
  }
  if (uAvg >= 7 && totalWithTag <= 10 && uData.count >= 2) {
    underExplored.push({
      tag: uTag,
      avgRating: uAvg,
      ratedCount: uData.count,
      totalCount: totalWithTag,
      mediaTypes: Object.keys(uData.types)
    });
  }
}
underExplored.sort(function(a, b) { return b.avgRating - a.avgRating; });

// Types where user rates highly but has few items
var highRatingLowCount = [];
var trKeys = Object.keys(typeAvgRating);
for (var hri = 0; hri < trKeys.length; hri++) {
  var hrType = trKeys[hri];
  var hrData = typeAvgRating[hrType];
  var hrAvg = hrData.count > 0 ? Math.round((hrData.sum / hrData.count) * 10) / 10 : 0;
  var hrTotal = typeCounts[hrType] || 0;
  if (hrAvg >= 7 && hrTotal < 30 && hrData.count >= 2) {
    highRatingLowCount.push({
      type: hrType,
      label: typeLabels[hrType] || hrType,
      avgRating: hrAvg,
      ratedCount: hrData.count,
      totalCount: hrTotal
    });
  }
}
highRatingLowCount.sort(function(a, b) { return b.avgRating - a.avgRating; });

// Cross-media opportunities: tags with high ratings in one type but absent in another
var crossMediaOpps = [];
for (var cmi = 0; cmi < underExplored.length; cmi++) {
  var cmTag = underExplored[cmi];
  if (cmTag.mediaTypes.length === 1) {
    // Present in only one type — opportunity to explore in others
    var presentType = cmTag.mediaTypes[0];
    var otherTypes = [];
    for (var cmj = 0; cmj < expectedTypes.length; cmj++) {
      if (expectedTypes[cmj] !== presentType) otherTypes.push(expectedTypes[cmj]);
    }
    if (otherTypes.length > 0) {
      crossMediaOpps.push({
        tag: cmTag.tag,
        strongIn: presentType,
        avgRating: cmTag.avgRating,
        explorableTypes: otherTypes
      });
    }
  }
}

var tasteGaps = {
  underExplored: underExplored.slice(0, 10),
  highRatingLowCount: highRatingLowCount,
  crossMediaOpportunities: crossMediaOpps.slice(0, 8)
};

// ══════════════════════════════════════════════
// INTELLIGENCE: ENTITY RESOLUTION SCORE
// ══════════════════════════════════════════════

// Group entities by normalized title + type to find duplicate candidates
var resolvableTypes = ["book", "movie", "tv-series", "documentary", "game", "song", "artist"];
var titleGroups = {};
var resolvableCount = 0;
for (var ri = 0; ri < entities.length; ri++) {
  var rEnt = entities[ri];
  if (resolvableTypes.indexOf(rEnt.type) === -1) continue;
  resolvableCount++;
  var normKey = rEnt.type + "::" + normalizeTitle(rEnt.title);
  if (!titleGroups[normKey]) titleGroups[normKey] = [];
  titleGroups[normKey].push(rEnt);
}

// Find groups with potential duplicates (same normalized title, different sources)
var duplicateCandidates = [];
var duplicateEntityCount = 0;
var titleGroupKeys = Object.keys(titleGroups);
for (var tgi = 0; tgi < titleGroupKeys.length; tgi++) {
  var tGroup = titleGroups[titleGroupKeys[tgi]];
  if (tGroup.length < 2) continue;

  // Check if there are cross-source entries
  var sources = {};
  for (var tgj = 0; tgj < tGroup.length; tgj++) {
    sources[tGroup[tgj].source || "unknown"] = true;
  }
  if (Object.keys(sources).length < 2) continue;

  duplicateEntityCount += tGroup.length;
  duplicateCandidates.push({
    title: tGroup[0].title,
    type: tGroup[0].type,
    count: tGroup.length,
    sources: Object.keys(sources),
    entityIds: tGroup.map(function(e) { return e.entityId; })
  });
}

// Sort by count descending
duplicateCandidates.sort(function(a, b) { return b.count - a.count; });

var uniqueEntities = resolvableCount - duplicateEntityCount + duplicateCandidates.length;
var resolutionRate = resolvableCount > 0
  ? Math.round((uniqueEntities / resolvableCount) * 1000) / 10
  : 100;

var entityResolution = {
  resolvableEntities: resolvableCount,
  uniqueEntities: uniqueEntities,
  resolutionRate: resolutionRate,
  duplicateGroupCount: duplicateCandidates.length,
  duplicateEntityCount: duplicateEntityCount,
  topDuplicates: duplicateCandidates.slice(0, 10)
};

// ══════════════════════════════════════════════
// INTELLIGENCE: CROSS-REFERENCE DENSITY
// ══════════════════════════════════════════════

var totalCrossRefs = 0;
var islandEntities = [];   // 0 cross-references
var hubEntities = [];      // 5+ cross-references
var crossRefCounts = {};   // entityId -> crossRef count

for (var cri = 0; cri < entities.length; cri++) {
  var crEnt = entities[cri];
  var crCount = (crEnt.crossReferences || []).length;
  totalCrossRefs += crCount;
  crossRefCounts[crEnt.entityId] = crCount;

  if (crCount === 0) {
    islandEntities.push({
      entityId: crEnt.entityId,
      title: crEnt.title,
      type: crEnt.type
    });
  } else if (crCount >= 5) {
    hubEntities.push({
      entityId: crEnt.entityId,
      title: crEnt.title,
      type: crEnt.type,
      crossRefCount: crCount
    });
  }
}

hubEntities.sort(function(a, b) { return b.crossRefCount - a.crossRefCount; });

var avgCrossRefs = totalEntities > 0
  ? Math.round((totalCrossRefs / totalEntities) * 100) / 100
  : 0;

// Graph connectivity: BFS from most-connected entity, count reachable within 2 hops
var connectedPercent = 0;
if (hubEntities.length > 0 && totalEntities > 0) {
  var startId = hubEntities[0].entityId;
  var visited = {};
  visited[startId] = true;

  // Build adjacency from crossReferences
  var adjacency = {};
  for (var adi = 0; adi < entities.length; adi++) {
    var adEnt = entities[adi];
    var adRefs = adEnt.crossReferences || [];
    if (!adjacency[adEnt.entityId]) adjacency[adEnt.entityId] = [];
    for (var adj = 0; adj < adRefs.length; adj++) {
      adjacency[adEnt.entityId].push(adRefs[adj].entityId);
    }
  }

  // BFS — hop 1
  var hop1 = adjacency[startId] || [];
  for (var h1 = 0; h1 < hop1.length; h1++) {
    visited[hop1[h1]] = true;
  }

  // BFS — hop 2
  for (var h1b = 0; h1b < hop1.length; h1b++) {
    var hop2 = adjacency[hop1[h1b]] || [];
    for (var h2 = 0; h2 < hop2.length; h2++) {
      visited[hop2[h2]] = true;
    }
  }

  var reachable = Object.keys(visited).length;
  connectedPercent = Math.round((reachable / totalEntities) * 1000) / 10;
}

var crossRefDensity = {
  avgCrossRefsPerEntity: avgCrossRefs,
  totalCrossRefs: totalCrossRefs,
  islandCount: islandEntities.length,
  islandPercent: totalEntities > 0 ? Math.round((islandEntities.length / totalEntities) * 1000) / 10 : 0,
  hubCount: hubEntities.length,
  topHubs: hubEntities.slice(0, 10),
  graphConnectivity: connectedPercent
};

// ══════════════════════════════════════════════
// INTELLIGENCE: SEMANTIC RICHNESS SCORE
// ══════════════════════════════════════════════

var totalTagAssignments = 0;
var uniqueTagSet = {};
var tagDesertEntities = [];   // have metadata but no semantic tags

for (var sri = 0; sri < entities.length; sri++) {
  var srEnt = entities[sri];
  var srTags = srEnt.semanticTags || [];
  totalTagAssignments += srTags.length;

  for (var stj = 0; stj < srTags.length; stj++) {
    uniqueTagSet[srTags[stj].toLowerCase()] = true;
  }

  // Tag desert: has metadata (imageUrl or description or author) but no semantic tags
  var hasMetadata = srEnt.imageUrl || srEnt.description ||
    srEnt.author || srEnt.director || srEnt.developer ||
    (srEnt.metadata && (srEnt.metadata.description || srEnt.metadata.author || srEnt.metadata.director));
  if (hasMetadata && srTags.length === 0) {
    tagDesertEntities.push({
      entityId: srEnt.entityId,
      title: srEnt.title,
      type: srEnt.type
    });
  }
}

var uniqueTagCount = Object.keys(uniqueTagSet).length;
var avgTagsPerEntity = totalEntities > 0
  ? Math.round((totalTagAssignments / totalEntities) * 100) / 100
  : 0;
var tagDiversity = totalTagAssignments > 0
  ? Math.round((uniqueTagCount / totalTagAssignments) * 1000) / 10
  : 0;

// Group tag deserts by type
var tagDesertsByType = {};
for (var tdi = 0; tdi < tagDesertEntities.length; tdi++) {
  var tdType = tagDesertEntities[tdi].type;
  tagDesertsByType[tdType] = (tagDesertsByType[tdType] || 0) + 1;
}

var semanticRichness = {
  avgTagsPerEntity: avgTagsPerEntity,
  totalTagAssignments: totalTagAssignments,
  uniqueTagCount: uniqueTagCount,
  tagDiversity: tagDiversity,
  tagDesertCount: tagDesertEntities.length,
  tagDesertPercent: totalEntities > 0 ? Math.round((tagDesertEntities.length / totalEntities) * 1000) / 10 : 0,
  tagDesertsByType: tagDesertsByType,
  tagDesertSample: tagDesertEntities.slice(0, 10)
};

// ══════════════════════════════════════════════
// INTELLIGENCE: ENGAGEMENT VELOCITY
// ══════════════════════════════════════════════

// Collect timestamps of rated entities to measure velocity
var ratedTimestamps = [];
for (var evi = 0; evi < entities.length; evi++) {
  var evEnt = entities[evi];
  if (!evEnt.userRating || evEnt.userRating <= 0) continue;
  var evTime = evEnt.updatedAt ? new Date(evEnt.updatedAt).getTime() : 0;
  if (evTime > 0) {
    ratedTimestamps.push(evTime);
  }
}

ratedTimestamps.sort(function(a, b) { return a - b; });

var ratedCount = ratedTimestamps.length;
var ratingsPerWeek = 0;
var projectedWeeksTo20Pct = null;
var velocityTrend = "unknown";

if (ratedCount >= 2) {
  var oldestRating = ratedTimestamps[0];
  var newestRating = ratedTimestamps[ratedTimestamps.length - 1];
  var spanMs = newestRating - oldestRating;
  var spanWeeks = spanMs / WEEK_MS;

  if (spanWeeks > 0) {
    ratingsPerWeek = Math.round((ratedCount / spanWeeks) * 100) / 100;

    // Projection: how many weeks to reach 20% engagement
    var targetRated = Math.ceil(totalEntities * 0.2);
    var remaining = targetRated - ratedCount;
    if (remaining > 0 && ratingsPerWeek > 0) {
      projectedWeeksTo20Pct = Math.ceil(remaining / ratingsPerWeek);
    } else if (remaining <= 0) {
      projectedWeeksTo20Pct = 0;
    }

    // Acceleration: compare first half vs second half rate
    var midIdx = Math.floor(ratedCount / 2);
    if (midIdx > 0 && ratedCount > 3) {
      var firstHalfSpan = ratedTimestamps[midIdx] - ratedTimestamps[0];
      var secondHalfSpan = ratedTimestamps[ratedCount - 1] - ratedTimestamps[midIdx];
      var firstHalfCount = midIdx;
      var secondHalfCount = ratedCount - midIdx;

      var firstRate = firstHalfSpan > 0 ? firstHalfCount / (firstHalfSpan / WEEK_MS) : 0;
      var secondRate = secondHalfSpan > 0 ? secondHalfCount / (secondHalfSpan / WEEK_MS) : 0;

      if (secondRate > firstRate * 1.2) {
        velocityTrend = "accelerating";
      } else if (secondRate < firstRate * 0.8) {
        velocityTrend = "decelerating";
      } else {
        velocityTrend = "steady";
      }
    }
  }
} else if (ratedCount === 1) {
  ratingsPerWeek = 0;
  velocityTrend = "insufficient_data";
} else {
  velocityTrend = "no_ratings";
}

// Ratings in last 4 weeks
var fourWeeksAgo = now - (WEEK_MS * 4);
var recentRatings = 0;
for (var rri = 0; rri < ratedTimestamps.length; rri++) {
  if (ratedTimestamps[rri] >= fourWeeksAgo) recentRatings++;
}
var recentRatingsPerWeek = Math.round((recentRatings / 4) * 100) / 100;

var engagementVelocity = {
  totalRated: ratedCount,
  ratingsPerWeek: ratingsPerWeek,
  recentRatingsPerWeek: recentRatingsPerWeek,
  velocityTrend: velocityTrend,
  targetPercent: 20,
  targetCount: Math.ceil(totalEntities * 0.2),
  remaining: Math.max(0, Math.ceil(totalEntities * 0.2) - ratedCount),
  projectedWeeksTo20Pct: projectedWeeksTo20Pct,
  projectionNote: projectedWeeksTo20Pct === 0
    ? "Already at 20%+ engagement!"
    : projectedWeeksTo20Pct !== null
      ? "At current pace: " + projectedWeeksTo20Pct + " weeks to 20% engagement | Accelerate with Guided Curation"
      : "No rating velocity detected — start rating to project timeline"
};

// ══════════════════════════════════════════════
// RECOMMENDATIONS
// ══════════════════════════════════════════════
var recommendations = [];

// Coverage recommendations
if (missingTypes.length > 0) {
  recommendations.push({
    id: "missing_types",
    icon: "AlertTriangle",
    severity: "red",
    category: "coverage",
    title: "Missing media types",
    description: "Your library has no " + missingTypes.join(", ") + " — add items to broaden your collection.",
    actionLabel: "Add Media",
    actionTool: "add",
    actionParams: {}
  });
}

// Engagement recommendations
if (untouched.length > 50) {
  recommendations.push({
    id: "untouched_items",
    icon: "Eye",
    severity: "amber",
    category: "engagement",
    title: untouched.length + " completely untouched items",
    description: "These items have no rating, status, or favorite flag. Start by rating your top picks to improve discovery.",
    actionLabel: "Auto-Seed Ratings",
    actionTool: "batch_seed",
    actionParams: { action: "preview" }
  });
}

if (stalled.length > 0) {
  recommendations.push({
    id: "stalled_items",
    icon: "Clock",
    severity: "amber",
    category: "engagement",
    title: stalled.length + " stalled in-progress item" + (stalled.length > 1 ? "s" : ""),
    description: "These items were marked in-progress but haven't been updated in 30+ days. Consider finishing or dropping them.",
    actionLabel: "Browse In-Progress",
    actionTool: "browse",
    actionParams: { status: "in_progress" }
  });
}

if (unrated.length > 5) {
  recommendations.push({
    id: "unrated_engaged",
    icon: "Star",
    severity: "amber",
    category: "engagement",
    title: unrated.length + " engaged items without ratings",
    description: "You've interacted with these items but haven't rated them. Ratings improve recommendation accuracy.",
    actionLabel: null,
    actionTool: null,
    actionParams: null
  });
}

// Enrichment recommendations
if (noTags.length > 20) {
  recommendations.push({
    id: "missing_tags",
    icon: "Tags",
    severity: "amber",
    category: "enrichment",
    title: noTags.length + " entities without semantic tags",
    description: "Run bulk enrichment to add semantic tags — this unlocks NL search and smart collections.",
    actionLabel: "Bulk Enrich",
    actionTool: "bulk_enrich",
    actionParams: { action: "preview" }
  });
}

if (noImages.length > 20) {
  recommendations.push({
    id: "missing_images",
    icon: "Image",
    severity: "low",
    category: "enrichment",
    title: noImages.length + " entities without cover images",
    description: "Run bulk enrichment to fetch cover art from TMDB, Google Books, and Steam.",
    actionLabel: "Bulk Enrich",
    actionTool: "bulk_enrich",
    actionParams: { action: "preview" }
  });
}

if (noCrossRefs.length > totalEntities * 0.5) {
  recommendations.push({
    id: "isolated_nodes",
    icon: "GitBranch",
    severity: "low",
    category: "enrichment",
    title: noCrossRefs.length + " isolated entities (no cross-references)",
    description: "Over half your library has no cross-references. Run franchise detection to link related items.",
    actionLabel: "Detect Franchises",
    actionTool: "franchise",
    actionParams: { action: "detect" }
  });
}

// Taste profile recommendations
if (underExplored.length > 0) {
  var topUE = underExplored[0];
  recommendations.push({
    id: "under_explored",
    icon: "Compass",
    severity: "green",
    category: "taste",
    title: "Under-explored interest: " + topUE.tag,
    description: "You rate '" + topUE.tag + "' highly (avg " + topUE.avgRating + "/10) but only have " + topUE.totalCount + " items. Explore more!",
    actionLabel: "Search",
    actionTool: "nl_search",
    actionParams: { query: topUE.tag }
  });
}

if (crossMediaOpps.length > 0) {
  var topCM = crossMediaOpps[0];
  recommendations.push({
    id: "cross_media",
    icon: "Shuffle",
    severity: "green",
    category: "taste",
    title: "Cross-media opportunity: " + topCM.tag,
    description: "Your '" + topCM.tag + "' collection is strong in " + (typeLabels[topCM.strongIn] || topCM.strongIn) + " — explore it in " + topCM.explorableTypes.map(function(t) { return typeLabels[t] || t; }).join(", ") + " too.",
    actionLabel: "Search",
    actionTool: "nl_search",
    actionParams: { query: topCM.tag }
  });
}

// Intelligence recommendations (new)
if (duplicateCandidates.length > 0) {
  recommendations.push({
    id: "duplicate_candidates",
    icon: "Copy",
    severity: "amber",
    category: "intelligence",
    title: duplicateCandidates.length + " potential duplicate" + (duplicateCandidates.length > 1 ? "s" : "") + " detected",
    description: duplicateEntityCount + " entities may be duplicates across sources — use Entity Resolve tool to merge them.",
    actionLabel: "Scan Duplicates",
    actionTool: "entity_resolve",
    actionParams: { action: "scan" }
  });
}

if (islandEntities.length > totalEntities * 0.3) {
  recommendations.push({
    id: "low_connectivity",
    icon: "Network",
    severity: "amber",
    category: "intelligence",
    title: crossRefDensity.islandPercent + "% of your library is isolated",
    description: islandEntities.length + " entities have zero cross-references — use Franchise Detection or Wikidata Linking to build connections.",
    actionLabel: "Detect Franchises",
    actionTool: "franchise",
    actionParams: { action: "detect" }
  });
}

if (tagDesertEntities.length > 20) {
  recommendations.push({
    id: "tag_deserts",
    icon: "Tag",
    severity: "amber",
    category: "intelligence",
    title: tagDesertEntities.length + " items have metadata but no semantic tags",
    description: "These entities have images or descriptions but enrichment missed their tags — re-run Bulk Enrich to fill the gaps.",
    actionLabel: "Bulk Enrich",
    actionTool: "bulk_enrich",
    actionParams: { action: "preview" }
  });
}

if (velocityTrend === "decelerating" || velocityTrend === "no_ratings") {
  recommendations.push({
    id: "engagement_velocity",
    icon: "TrendingDown",
    severity: "amber",
    category: "intelligence",
    title: velocityTrend === "no_ratings"
      ? "No rating activity detected"
      : "Rating velocity is slowing down",
    description: engagementVelocity.projectionNote,
    actionLabel: "Guided Curation",
    actionTool: "guided_curation",
    actionParams: { action: "start" }
  });
}

// Sort recommendations by severity
var sevOrder = { red: 0, amber: 1, green: 2, low: 3 };
recommendations.sort(function(a, b) {
  return (sevOrder[a.severity] || 4) - (sevOrder[b.severity] || 4);
});

// ══════════════════════════════════════════════
// OVERALL SCORE (6-component: 100 points total)
// ══════════════════════════════════════════════
var engagedCount = 0;
for (var sci = 0; sci < entities.length; sci++) {
  var sEnt = entities[sci];
  if ((sEnt.userRating && sEnt.userRating > 0) || sEnt.isFavorite || (sEnt.consumptionStatus && sEnt.consumptionStatus !== "not_started")) {
    engagedCount++;
  }
}

var ratedEntities = 0;
for (var rci = 0; rci < entities.length; rci++) {
  if (entities[rci].userRating && entities[rci].userRating > 0) ratedEntities++;
}

var completenessScore = 0;

// Coverage: 15 points (based on type diversity)
var typeDiv = Math.min(1, typeKeys.length / 5);
var coverageScore = Math.round(typeDiv * 15);
completenessScore += coverageScore;

// Engagement: 20 points
var engPct = totalEntities > 0 ? engagedCount / totalEntities : 0;
var engagementScore = Math.round(Math.min(1, engPct * 5) * 20);
completenessScore += engagementScore;

// Enrichment: 15 points (based on tag coverage)
var tagCov = totalEntities > 0 ? (totalEntities - noTags.length) / totalEntities : 0;
var enrichmentScore = Math.round(tagCov * 15);
completenessScore += enrichmentScore;

// Taste Profile: 15 points (based on rated count toward 50 goal)
var tastePct = Math.min(1, ratedEntities / 50);
var tasteScore = Math.round(tastePct * 15);
completenessScore += tasteScore;

// Cross-References: 15 points (based on connected %)
var crossRefPct = totalEntities > 0 ? (totalEntities - islandEntities.length) / totalEntities : 0;
var crossRefScore = Math.round(crossRefPct * 15);
completenessScore += crossRefScore;

// Semantic Richness: 20 points (combo of avg tags and diversity)
var tagCovNorm = Math.min(1, avgTagsPerEntity / 5);   // 5 avg tags = perfect
var diversityNorm = Math.min(1, tagDiversity / 30);     // 30% diversity = perfect
var semanticScore = Math.round(((tagCovNorm * 0.6) + (diversityNorm * 0.4)) * 20);
completenessScore += semanticScore;

completenessScore = Math.max(0, Math.min(100, completenessScore));
var completenessColor = completenessScore < 30 ? "red" : (completenessScore < 60 ? "amber" : "emerald");

var scoreBreakdown = [
  { label: "Coverage", maxPoints: 15, score: coverageScore, detail: typeKeys.length + " media types" },
  { label: "Engagement", maxPoints: 20, score: engagementScore, detail: engagedCount + " / " + totalEntities + " engaged" },
  { label: "Enrichment", maxPoints: 15, score: enrichmentScore, detail: Math.round(tagCov * 100) + "% tagged" },
  { label: "Taste Profile", maxPoints: 15, score: tasteScore, detail: ratedEntities + " / 50 ratings goal" },
  { label: "Cross-References", maxPoints: 15, score: crossRefScore, detail: (totalEntities - islandEntities.length) + " / " + totalEntities + " connected" },
  { label: "Semantic Richness", maxPoints: 20, score: semanticScore, detail: avgTagsPerEntity + " avg tags, " + tagDiversity + "% diversity" }
];

// ══════════════════════════════════════════════
// BUILD RESPONSE
// ══════════════════════════════════════════════
var result = {
  tool: "enso_media_library_gap_analysis",
  action: action,
  totalEntities: totalEntities,
  completenessScore: completenessScore,
  completenessColor: completenessColor,
  scoreBreakdown: scoreBreakdown,
  generatedAt: new Date().toISOString()
};

if (action === "overview" || action === "coverage") {
  result.coverage = coverageGaps;
}
if (action === "overview" || action === "engagement") {
  result.engagement = engagementGaps;
}
if (action === "overview" || action === "coverage" || action === "engagement") {
  result.enrichment = enrichmentGaps;
}
if (action === "overview" || action === "recommendations") {
  result.taste = tasteGaps;
  result.recommendations = recommendations;
}

// Include intelligence metrics in overview
if (action === "overview") {
  result.intelligence = {
    entityResolution: entityResolution,
    crossRefDensity: crossRefDensity,
    semanticRichness: semanticRichness,
    engagementVelocity: engagementVelocity
  };
}

// Dedicated intelligence action — returns ONLY the new metrics
if (action === "intelligence") {
  result.intelligence = {
    entityResolution: entityResolution,
    crossRefDensity: crossRefDensity,
    semanticRichness: semanticRichness,
    engagementVelocity: engagementVelocity
  };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify(result)
  }]
};
