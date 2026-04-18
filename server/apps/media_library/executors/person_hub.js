var fs = require("fs");
var path = require("path");
var os = require("os");

var homedir = os.homedir();
var indexPath = path.join(homedir, ".enso", "data", "entity-index.json");
var kindleCachePath = path.join(homedir, ".enso", "data", "user-context", "cache", "kindle-library.json");
var moviesCachePath = path.join(homedir, ".enso", "data", "user-context", "cache", "movies-tv.json");
var steamCachePath = path.join(homedir, ".enso", "data", "user-context", "cache", "steam-games.json");
var wikiDir = path.join(homedir, ".enso", "wiki", "entities");
var personCachePath = path.join(homedir, ".enso", "data", "media-library", "person-index.json");

var action = (params.action || "").trim() || "list";
var personName = (params.name || "").trim();
var query = (params.query || "").trim();
var limit = params.limit || 50;
var sortBy = (params.sortBy || "").trim() || "works_count";

// Media entity types
var mediaEntityTypes = ["book", "movie", "tv-series", "documentary", "game", "song", "artist", "album", "article"];

// ── Helpers ──
var loadJSON = function(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (e) { return null; }
};

var result = function(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
};

// Title-case a name, handling special cases
var normalizeName = function(name) {
  if (!name) return "";
  var n = name.trim();
  if (!n) return "";
  // Handle "Last, First" format (common in Kindle)
  if (n.indexOf(",") >= 0) {
    var parts = n.split(",").map(function(p) { return p.trim(); }).filter(function(p) { return p; });
    if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0) {
      n = parts[1] + " " + parts[0];
    }
  }
  // Title-case each word
  n = n.replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  // Fix common casing issues
  n = n.replace(/\bMc(\w)/g, function(m, c) { return "Mc" + c.toUpperCase(); });
  n = n.replace(/\bO'(\w)/g, function(m, c) { return "O'" + c.toUpperCase(); });
  return n.trim();
};

// Create a lowercase key for deduplication
var nameKey = function(name) {
  return normalizeName(name).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\s]/g, "").replace(/\s+/g, " ").trim();
};

// ── Load entity index ──
var entityIndex = loadJSON(indexPath);
if (!entityIndex) {
  return result({
    tool: "enso_media_library_person_hub",
    action: action,
    error: "Could not load entity index",
    persons: []
  });
}

// ── Build person → works map ──
// personMap: { normalizedKey: { name, roles: { role: [entityWork] } } }
var personMap = {};

var addPersonWork = function(rawName, role, entity) {
  if (!rawName || !entity) return;
  var norm = normalizeName(rawName);
  var key = nameKey(rawName);
  if (!key || key.length < 2) return;

  if (!personMap[key]) {
    personMap[key] = { name: norm, roles: {} };
  }
  if (!personMap[key].roles[role]) {
    personMap[key].roles[role] = [];
  }
  // Avoid duplicate entities under same role
  var existing = personMap[key].roles[role];
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].entityId === entity.entityId) return;
  }
  personMap[key].roles[role].push({
    entityId: entity.entityId,
    title: entity.title,
    type: entity.type,
    source: entity.source || "",
    imageUrl: entity.imageUrl || null,
    userRating: entity.userRating || null,
    isFavorite: entity.isFavorite || false,
    consumptionStatus: entity.consumptionStatus || null,
    semanticTags: (entity.semanticTags || []).slice(0, 3)
  });
};

// ── Source 1: Kindle cache → book authors ──
var kindleCache = loadJSON(kindleCachePath);
if (kindleCache && kindleCache.books) {
  var kindleByTitle = {};
  for (var ki = 0; ki < kindleCache.books.length; ki++) {
    var kb = kindleCache.books[ki];
    if (kb.title) kindleByTitle[kb.title.toLowerCase()] = kb;
  }
  var allEntities = Object.values(entityIndex);
  for (var ei = 0; ei < allEntities.length; ei++) {
    var ent = allEntities[ei];
    if (ent.type !== "book") continue;
    var cached = kindleByTitle[(ent.title || "").toLowerCase()];
    if (cached && cached.author) {
      // Some authors have multiple names separated by semicolons or &
      var authorNames = cached.author.split(/[;&]/).map(function(a) { return a.trim(); }).filter(function(a) { return a; });
      for (var ai = 0; ai < authorNames.length; ai++) {
        addPersonWork(authorNames[ai], "author", ent);
      }
    }
  }
}

// ── Source 2: Entity index metadata.author ──
var allEntities2 = Object.values(entityIndex);
for (var mi2 = 0; mi2 < allEntities2.length; mi2++) {
  var ent2 = allEntities2[mi2];
  if (ent2.metadata && ent2.metadata.author) {
    var authorStr = ent2.metadata.author;
    var authors = authorStr.split(/[;&]/).map(function(a) { return a.trim(); }).filter(function(a) { return a; });
    for (var a2 = 0; a2 < authors.length; a2++) {
      addPersonWork(authors[a2], "author", ent2);
    }
  }
}

// ── Source 3: Movies/TV cache → directors & cast ──
var moviesCache = loadJSON(moviesCachePath);
if (moviesCache && moviesCache.items) {
  // Build title lookup from entity index
  var movieEntities = {};
  for (var me = 0; me < allEntities2.length; me++) {
    var ment = allEntities2[me];
    if (ment.type === "movie" || ment.type === "tv-series" || ment.type === "documentary") {
      movieEntities[(ment.title || "").toLowerCase()] = ment;
    }
  }
  for (var mc = 0; mc < moviesCache.items.length; mc++) {
    var movie = moviesCache.items[mc];
    var movieEnt = movieEntities[(movie.title || "").toLowerCase()];
    if (!movieEnt) continue;

    // Directors
    if (movie.directors && Array.isArray(movie.directors)) {
      for (var di = 0; di < movie.directors.length; di++) {
        addPersonWork(movie.directors[di], "director", movieEnt);
      }
    }
    // Cast (limit to top 10 to avoid noise)
    if (movie.cast && Array.isArray(movie.cast)) {
      var castLimit = Math.min(movie.cast.length, 10);
      for (var ci = 0; ci < castLimit; ci++) {
        addPersonWork(movie.cast[ci], "actor", movieEnt);
      }
    }
  }
}

// ── Source 4: Steam cache → developers & publishers ──
var steamCache = loadJSON(steamCachePath);
if (steamCache && steamCache.games) {
  var gameEntities = {};
  for (var ge = 0; ge < allEntities2.length; ge++) {
    var gent = allEntities2[ge];
    if (gent.type === "game") {
      gameEntities[(gent.title || "").toLowerCase()] = gent;
    }
  }
  for (var si = 0; si < steamCache.games.length; si++) {
    var game = steamCache.games[si];
    var gameEnt = gameEntities[(game.name || "").toLowerCase()];
    if (!gameEnt) continue;

    if (game.developers && Array.isArray(game.developers)) {
      for (var dv = 0; dv < game.developers.length; dv++) {
        addPersonWork(game.developers[dv], "developer", gameEnt);
      }
    }
    if (game.publishers && Array.isArray(game.publishers)) {
      for (var pb = 0; pb < game.publishers.length; pb++) {
        addPersonWork(game.publishers[pb], "publisher", gameEnt);
      }
    }
  }
}

// ── Source 5: Wiki pages for entities not yet covered ──
// Parse Director/Cast/Author from wiki markdown for entities without cache matches
try {
  var wikiFiles = fs.readdirSync(wikiDir);
  var coveredEntities = {};
  // Build set of already-covered entity titles
  var personKeys = Object.keys(personMap);
  for (var pk = 0; pk < personKeys.length; pk++) {
    var roles = personMap[personKeys[pk]].roles;
    var roleKeys = Object.keys(roles);
    for (var rk = 0; rk < roleKeys.length; rk++) {
      var works = roles[roleKeys[rk]];
      for (var w = 0; w < works.length; w++) {
        coveredEntities[works[w].entityId] = true;
      }
    }
  }

  // Only process movie- wiki files not already covered
  var movieWikiFiles = wikiFiles.filter(function(f) { return f.startsWith("movie-") && f.endsWith(".md"); });
  for (var wf = 0; wf < movieWikiFiles.length; wf++) {
    try {
      var wikiContent = fs.readFileSync(path.join(wikiDir, movieWikiFiles[wf]), "utf8");
      // Extract title from first heading
      var titleMatch = wikiContent.match(/^# (.+?)(\s*\(\d{4}\))?\s*$/m);
      var wikiTitle = titleMatch ? titleMatch[1].trim() : "";
      if (!wikiTitle) continue;

      // Find matching entity
      var wikiEnt = null;
      var allEnts = Object.values(entityIndex);
      for (var we = 0; we < allEnts.length; we++) {
        if ((allEnts[we].title || "").toLowerCase() === wikiTitle.toLowerCase() ||
            (allEnts[we].title || "").toLowerCase().indexOf(wikiTitle.toLowerCase()) === 0) {
          wikiEnt = allEnts[we];
          break;
        }
      }
      if (!wikiEnt || coveredEntities[wikiEnt.entityId]) continue;

      // Parse Director
      var dirMatch = wikiContent.match(/\*\*Director\*\*:\s*(.+)/);
      if (dirMatch) {
        var dirs = dirMatch[1].split(/[,;&]/).map(function(d) { return d.trim(); }).filter(function(d) { return d; });
        for (var wd = 0; wd < dirs.length; wd++) {
          addPersonWork(dirs[wd], "director", wikiEnt);
        }
      }
      // Parse Cast
      var castMatch = wikiContent.match(/\*\*Cast\*\*:\s*(.+)/);
      if (castMatch) {
        var castNames = castMatch[1].split(/,/).map(function(c) { return c.trim(); }).filter(function(c) { return c; });
        var castMax = Math.min(castNames.length, 10);
        for (var wc = 0; wc < castMax; wc++) {
          addPersonWork(castNames[wc], "actor", wikiEnt);
        }
      }
    } catch (e) { /* skip unreadable wiki files */ }
  }

  // Process book-related wiki files for authors not in Kindle cache
  var nonMovieFiles = wikiFiles.filter(function(f) {
    return !f.startsWith("movie-") && !f.startsWith("artist-") && !f.startsWith("synthesis-") && f.endsWith(".md");
  });
  for (var nf = 0; nf < nonMovieFiles.length; nf++) {
    try {
      var bookContent = fs.readFileSync(path.join(wikiDir, nonMovieFiles[nf]), "utf8");
      var authorMatch = bookContent.match(/\*\*Author\*\*:\s*(.+)/);
      if (!authorMatch) continue;

      var bookTitleMatch = bookContent.match(/^# (.+)$/m);
      var bookTitle = bookTitleMatch ? bookTitleMatch[1].trim() : "";
      if (!bookTitle) continue;

      // Find matching entity
      var bookEnt = null;
      var allEnts3 = Object.values(entityIndex);
      for (var be = 0; be < allEnts3.length; be++) {
        if ((allEnts3[be].title || "").toLowerCase() === bookTitle.toLowerCase()) {
          bookEnt = allEnts3[be];
          break;
        }
      }
      if (!bookEnt || coveredEntities[bookEnt.entityId]) continue;

      var bookAuthors = authorMatch[1].split(/[;&]/).map(function(a) { return a.trim(); }).filter(function(a) { return a; });
      for (var ba = 0; ba < bookAuthors.length; ba++) {
        addPersonWork(bookAuthors[ba], "author", bookEnt);
      }
    } catch (e) { /* skip */ }
  }
} catch (e) { /* wiki dir not available */ }

// ── Build flat persons array from personMap ──
var persons = [];
var mapKeys = Object.keys(personMap);
for (var pi = 0; pi < mapKeys.length; pi++) {
  var pKey = mapKeys[pi];
  var pEntry = personMap[pKey];
  var totalWorks = 0;
  var totalRating = 0;
  var ratedCount = 0;
  var favoriteCount = 0;
  var mediaTypeCounts = {};
  var roleList = [];
  var topRatedWork = null;
  var topRating = 0;

  var pRoleKeys = Object.keys(pEntry.roles);
  for (var ri = 0; ri < pRoleKeys.length; ri++) {
    var roleName = pRoleKeys[ri];
    var roleWorks = pEntry.roles[roleName];
    totalWorks += roleWorks.length;
    roleList.push(roleName);

    for (var rw = 0; rw < roleWorks.length; rw++) {
      var work = roleWorks[rw];
      var mtype = work.type;
      mediaTypeCounts[mtype] = (mediaTypeCounts[mtype] || 0) + 1;
      if (work.userRating) {
        totalRating += work.userRating;
        ratedCount++;
        if (work.userRating > topRating) {
          topRating = work.userRating;
          topRatedWork = { title: work.title, type: work.type, rating: work.userRating };
        }
      }
      if (work.isFavorite) favoriteCount++;
    }
  }

  persons.push({
    key: pKey,
    name: pEntry.name,
    totalWorks: totalWorks,
    roles: roleList,
    mediaTypes: Object.keys(mediaTypeCounts),
    mediaTypeCounts: mediaTypeCounts,
    avgRating: ratedCount > 0 ? Math.round(totalRating / ratedCount * 10) / 10 : null,
    ratedCount: ratedCount,
    favoriteCount: favoriteCount,
    topRatedWork: topRatedWork
  });
}

// ══════════════════════════════════════════════
// ACTION: list — Top persons sorted by work count
// ══════════════════════════════════════════════
if (action === "list") {
  // Sort
  if (sortBy === "name") {
    persons.sort(function(a, b) { return a.name.localeCompare(b.name); });
  } else if (sortBy === "rating_avg") {
    persons.sort(function(a, b) { return (b.avgRating || 0) - (a.avgRating || 0); });
  } else {
    // works_count (default)
    persons.sort(function(a, b) { return b.totalWorks - a.totalWorks; });
  }

  var listed = persons.slice(0, limit);

  // Aggregate stats
  var totalPersons = persons.length;
  var roleCounts = {};
  for (var rc = 0; rc < persons.length; rc++) {
    for (var rr = 0; rr < persons[rc].roles.length; rr++) {
      var rName = persons[rc].roles[rr];
      roleCounts[rName] = (roleCounts[rName] || 0) + 1;
    }
  }

  return result({
    tool: "enso_media_library_person_hub",
    action: "list",
    totalPersons: totalPersons,
    showing: listed.length,
    sortBy: sortBy,
    roleCounts: roleCounts,
    persons: listed
  });
}

// ══════════════════════════════════════════════
// ACTION: detail — All works by a specific person
// ══════════════════════════════════════════════
if (action === "detail") {
  if (!personName) {
    return result({
      tool: "enso_media_library_person_hub",
      action: "detail",
      error: "name parameter is required for detail action"
    });
  }

  var detailKey = nameKey(personName);
  var personEntry = personMap[detailKey];

  // Fuzzy fallback: try partial match
  if (!personEntry) {
    var allKeys = Object.keys(personMap);
    for (var dk = 0; dk < allKeys.length; dk++) {
      if (allKeys[dk].indexOf(detailKey) >= 0 || detailKey.indexOf(allKeys[dk]) >= 0) {
        personEntry = personMap[allKeys[dk]];
        detailKey = allKeys[dk];
        break;
      }
    }
  }

  if (!personEntry) {
    return result({
      tool: "enso_media_library_person_hub",
      action: "detail",
      error: "Person not found: " + personName,
      suggestion: "Try the search action to find similar names"
    });
  }

  // Build role-grouped works
  var roleGroups = [];
  var detailRoleKeys = Object.keys(personEntry.roles);
  var detailTotalWorks = 0;
  var detailTotalRating = 0;
  var detailRatedCount = 0;
  var detailFavCount = 0;
  var detailMediaTypeCounts = {};

  for (var dri = 0; dri < detailRoleKeys.length; dri++) {
    var dRole = detailRoleKeys[dri];
    var dWorks = personEntry.roles[dRole];
    detailTotalWorks += dWorks.length;

    // Sort works by rating desc, then title
    var sorted = dWorks.slice().sort(function(a, b) {
      var rd = (b.userRating || 0) - (a.userRating || 0);
      if (rd !== 0) return rd;
      return (a.title || "").localeCompare(b.title || "");
    });

    for (var dw = 0; dw < sorted.length; dw++) {
      var sw = sorted[dw];
      detailMediaTypeCounts[sw.type] = (detailMediaTypeCounts[sw.type] || 0) + 1;
      if (sw.userRating) { detailTotalRating += sw.userRating; detailRatedCount++; }
      if (sw.isFavorite) detailFavCount++;
    }

    var roleLabel = dRole.charAt(0).toUpperCase() + dRole.slice(1);
    var roleLabelMap = {
      author: "Wrote",
      director: "Directed",
      actor: "Acted In",
      developer: "Developed",
      publisher: "Published"
    };

    roleGroups.push({
      role: dRole,
      label: roleLabelMap[dRole] || roleLabel,
      count: sorted.length,
      works: sorted
    });
  }

  return result({
    tool: "enso_media_library_person_hub",
    action: "detail",
    person: {
      name: personEntry.name,
      totalWorks: detailTotalWorks,
      roles: detailRoleKeys,
      avgRating: detailRatedCount > 0 ? Math.round(detailTotalRating / detailRatedCount * 10) / 10 : null,
      ratedCount: detailRatedCount,
      favoriteCount: detailFavCount,
      mediaTypeCounts: detailMediaTypeCounts
    },
    roleGroups: roleGroups
  });
}

// ══════════════════════════════════════════════
// ACTION: search — Fuzzy-match person names
// ══════════════════════════════════════════════
if (action === "search") {
  if (!query) {
    return result({
      tool: "enso_media_library_person_hub",
      action: "search",
      error: "query parameter is required for search action"
    });
  }

  var q = query.toLowerCase();
  var matches = [];
  for (var si2 = 0; si2 < persons.length; si2++) {
    var p = persons[si2];
    var pLower = p.name.toLowerCase();
    // Exact substring match
    if (pLower.indexOf(q) >= 0) {
      matches.push({ person: p, score: pLower === q ? 100 : 80 });
      continue;
    }
    // Word-level match
    var qWords = q.split(/\s+/);
    var nameWords = pLower.split(/\s+/);
    var wordMatches = 0;
    for (var qw = 0; qw < qWords.length; qw++) {
      for (var nw = 0; nw < nameWords.length; nw++) {
        if (nameWords[nw].indexOf(qWords[qw]) >= 0) {
          wordMatches++;
          break;
        }
      }
    }
    if (wordMatches > 0 && wordMatches >= Math.ceil(qWords.length * 0.5)) {
      matches.push({ person: p, score: Math.round(wordMatches / qWords.length * 60) });
    }
  }

  // Sort by score desc, then works count desc
  matches.sort(function(a, b) {
    var sd = b.score - a.score;
    if (sd !== 0) return sd;
    return b.person.totalWorks - a.person.totalWorks;
  });

  var searchResults = matches.slice(0, limit).map(function(m) {
    return {
      name: m.person.name,
      totalWorks: m.person.totalWorks,
      roles: m.person.roles,
      mediaTypes: m.person.mediaTypes,
      mediaTypeCounts: m.person.mediaTypeCounts,
      avgRating: m.person.avgRating,
      favoriteCount: m.person.favoriteCount,
      topRatedWork: m.person.topRatedWork,
      matchScore: m.score
    };
  });

  return result({
    tool: "enso_media_library_person_hub",
    action: "search",
    query: query,
    total: matches.length,
    results: searchResults
  });
}

// Unknown action
return result({
  tool: "enso_media_library_person_hub",
  action: action,
  error: "Unknown action. Use: list, detail, search"
});
