/**
 * nl_search.js — Natural Language Hybrid Search Prototype
 *
 * Combines SQLite FTS5 (keyword/BM25) with semantic tag similarity (TF-IDF vector)
 * using Reciprocal Rank Fusion (RRF) for hybrid scoring.
 *
 * Architecture:
 *   - SQLite FTS5 virtual table for full-text keyword search
 *   - Entity tag vectors (semantic tags + title tokens) for concept matching
 *   - RRF fusion of keyword + semantic ranked lists
 *   - LLM query expansion (via ctx.ask) when query is ambiguous
 *
 * Upgrade path to sqlite-vec:
 *   The semantic search currently uses JS cosine similarity on stored tag vectors.
 *   To upgrade: npm install sqlite-vec, load extension with db.loadExtension(),
 *   store embeddings as BLOB, and replace JS cosine with vec_distance_cosine().
 *
 * Actions:
 *   search  — NL query → FTS5 + semantic hybrid → ranked results
 *   rebuild — Sync entity-index.json → FTS5 + recompute tag vectors
 *   status  — Show index stats and staleness
 */

var Database = require("better-sqlite3");
var fs = require("fs");
var path = require("path");
var os = require("os");

var homedir = os.homedir();
var dbPath = path.join(homedir, ".enso", "data", "media-search.db");
var indexPath = path.join(homedir, ".enso", "data", "entity-index.json");

var action = (params.action || "search").trim();
var query = (params.query || "").trim();
var mediaType = (params.mediaType || "").trim();
var limit = Math.min(params.limit || 20, 100);
var useExpansion = params.expand !== false; // LLM query expansion (default: on)

// ── Type map ──
var TYPE_MAP = {
  books: ["book"],
  movies: ["movie"],
  tv: ["tv-series"],
  documentaries: ["documentary"],
  games: ["game"],
  music: ["song", "artist", "playlist", "album"],
  articles: ["article"]
};
var ENRICHABLE_TYPES = ["book", "movie", "tv-series", "documentary", "game", "song", "artist", "playlist", "album", "article"];

function getTypeFilter() {
  if (!mediaType || mediaType === "all") return null;
  return TYPE_MAP[mediaType] || [mediaType];
}

// ── DB init ──
var dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

var db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// Create schema
db.exec(`
  CREATE TABLE IF NOT EXISTS entities (
    entityId TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    semanticTagsJson TEXT,
    tagsJson TEXT,
    userRating REAL,
    isFavorite INTEGER DEFAULT 0,
    consumptionStatus TEXT,
    imageUrl TEXT,
    indexedAt INTEGER NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
    entityId UNINDEXED,
    title,
    description,
    semanticTags,
    tags,
    tokenize = 'porter ascii'
  );

  CREATE TABLE IF NOT EXISTS tag_vectors (
    entityId TEXT PRIMARY KEY,
    vectorJson TEXT NOT NULL,
    computedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ── Helpers ──
function loadEntityIndex() {
  try { return JSON.parse(fs.readFileSync(indexPath, "utf-8")); }
  catch (e) { return {}; }
}

function getMeta(key) {
  var row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, String(value));
}

function getIndexCount() {
  var row = db.prepare("SELECT COUNT(*) as c FROM entities").get();
  return row ? row.c : 0;
}

// ── Tag vector computation ──
// Builds a TF-IDF-like sparse vector from an entity's tags
function buildTagVector(entity) {
  var vec = {};
  var tags = entity.semanticTags || [];
  var baseTags = entity.tags || [];
  var titleTokens = (entity.title || "").toLowerCase().split(/\s+/).filter(function (t) { return t.length > 2; });

  // Semantic tags: highest weight
  for (var i = 0; i < tags.length; i++) {
    var t = tags[i].toLowerCase();
    vec[t] = (vec[t] || 0) + 3;
  }
  // Base tags: medium weight
  for (var j = 0; j < baseTags.length; j++) {
    var bt = baseTags[j].toLowerCase();
    if (bt !== entity.type && bt !== entity.source) {
      vec[bt] = (vec[bt] || 0) + 1.5;
    }
  }
  // Title tokens: low weight (for exact name matching in semantic context)
  for (var k = 0; k < titleTokens.length; k++) {
    var tk = titleTokens[k];
    vec[tk] = (vec[tk] || 0) + 0.5;
  }
  // Type and genre metadata
  if (entity.metadata) {
    var genreList = entity.metadata.genres || entity.metadata.categories || [];
    if (Array.isArray(genreList)) {
      for (var g = 0; g < genreList.length; g++) {
        var gn = String(genreList[g]).toLowerCase();
        vec[gn] = (vec[gn] || 0) + 2;
      }
    }
  }
  return vec;
}

// Cosine similarity between two sparse vectors
function cosineSim(vecA, vecB) {
  var dot = 0, normA = 0, normB = 0;
  var keys = Object.keys(vecA);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    normA += vecA[k] * vecA[k];
    if (vecB[k]) dot += vecA[k] * vecB[k];
  }
  var keysB = Object.keys(vecB);
  for (var j = 0; j < keysB.length; j++) {
    normB += vecB[keysB[j]] * vecB[keysB[j]];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Build query vector from NL query ──
function buildQueryVector(queryTerms) {
  var vec = {};
  for (var i = 0; i < queryTerms.length; i++) {
    var t = queryTerms[i].toLowerCase();
    if (t.length > 1) vec[t] = (vec[t] || 0) + 1;
  }
  return vec;
}

// ── LLM Query Router ──
// Uses ctx.ask() to intelligently expand queries beyond the hardcoded dictionary
async function llmExpandQuery(query, ctx) {
  try {
    var prompt = [
      "You are a media library search query analyzer. Given a user's natural language search query,",
      "analyze their intent and expand the query for better search results across books, movies, TV shows, games, and music.",
      "",
      "User query: \"" + query.replace(/"/g, '\\"') + "\"",
      "",
      "Return a JSON object with exactly these fields:",
      "- expandedTerms: string[] — 5-15 additional search terms (synonyms, related concepts, sub-genres, themes, moods) that would help find relevant media. Be specific and diverse.",
      "- mediaTypeHint: string|null — if the query strongly implies a specific media type, return one of: book, movie, tv-series, game, song. Return null if ambiguous.",
      "- intentType: \"specific\" | \"exploratory\" — \"specific\" if looking for a known item by name/title, \"exploratory\" if browsing by theme/mood/genre.",
      "",
      "Examples:",
      "- \"page-turner thrillers\" → { \"expandedTerms\": [\"suspense\", \"thriller\", \"gripping\", \"fast-paced\", \"crime\", \"mystery\", \"detective\", \"psychological-thriller\", \"action\", \"plot-twist\"], \"mediaTypeHint\": \"book\", \"intentType\": \"exploratory\" }",
      "- \"Inception\" → { \"expandedTerms\": [\"christopher-nolan\", \"dream\", \"sci-fi\", \"mind-bending\", \"heist\", \"surreal\", \"leonardo-dicaprio\"], \"mediaTypeHint\": \"movie\", \"intentType\": \"specific\" }",
      "- \"something about consciousness\" → { \"expandedTerms\": [\"mind\", \"awareness\", \"neuroscience\", \"philosophy\", \"psychology\", \"cognition\", \"perception\", \"brain\", \"self\", \"qualia\", \"phenomenology\"], \"mediaTypeHint\": null, \"intentType\": \"exploratory\" }",
      "",
      "Return ONLY the JSON object, no other text."
    ].join("\n");

    var result = await ctx.ask(prompt, { temperature: 0.3 });

    if (!result || !result.ok || !result.text) {
      return null;
    }

    var text = result.text.trim();
    // Extract JSON from potential markdown wrapping
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    var parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!parsed.expandedTerms || !Array.isArray(parsed.expandedTerms)) return null;
    if (!parsed.intentType || (parsed.intentType !== "specific" && parsed.intentType !== "exploratory")) {
      parsed.intentType = "exploratory";
    }
    if (parsed.mediaTypeHint && ["book", "movie", "tv-series", "game", "song", "documentary", "artist", "album"].indexOf(parsed.mediaTypeHint) === -1) {
      parsed.mediaTypeHint = null;
    }

    // Sanitize terms: lowercase, filter empties
    parsed.expandedTerms = parsed.expandedTerms
      .map(function (t) { return String(t).toLowerCase().trim(); })
      .filter(function (t) { return t.length > 1; });

    return parsed;
  } catch (e) {
    ctx.log("LLM query expansion failed: " + e.message + " — falling back to dictionary");
    return null;
  }
}

// ── RRF (Reciprocal Rank Fusion) ──
// Combines ranked lists into a single ranking
function rrfScore(rank, k) {
  k = k || 60;
  return 1.0 / (k + rank + 1);
}

function fuseRankings(lists, weights) {
  var scores = {};
  for (var li = 0; li < lists.length; li++) {
    var list = lists[li];
    var w = weights ? (weights[li] || 1) : 1;
    for (var i = 0; i < list.length; i++) {
      var entityId = list[i];
      scores[entityId] = (scores[entityId] || 0) + w * rrfScore(i);
    }
  }
  var entries = Object.keys(scores).map(function (id) {
    return { entityId: id, score: scores[id] };
  });
  entries.sort(function (a, b) { return b.score - a.score; });
  return entries;
}

// ════════════════════════════════════════
// REBUILD ACTION
// ════════════════════════════════════════
if (action === "rebuild") {
  ctx.log("Rebuilding FTS5 index from entity-index.json...");
  var entityIndex = loadEntityIndex();
  var entities = Object.values(entityIndex);

  var mediaEntities = entities.filter(function (e) {
    return ENRICHABLE_TYPES.indexOf(e.type) !== -1;
  });

  ctx.log("Indexing " + mediaEntities.length + " media entities...");

  var insertEntity = db.prepare(`
    INSERT OR REPLACE INTO entities
      (entityId, type, source, title, description, semanticTagsJson, tagsJson, userRating, isFavorite, consumptionStatus, imageUrl, indexedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  var deleteFts = db.prepare("DELETE FROM entities_fts WHERE entityId = ?");
  var insertFts = db.prepare("INSERT INTO entities_fts (entityId, title, description, semanticTags, tags) VALUES (?, ?, ?, ?, ?)");
  var insertVec = db.prepare("INSERT OR REPLACE INTO tag_vectors (entityId, vectorJson, computedAt) VALUES (?, ?, ?)");

  var rebuildAll = db.transaction(function () {
    // Clear existing
    db.exec("DELETE FROM entities");
    db.exec("DELETE FROM entities_fts");
    db.exec("DELETE FROM tag_vectors");

    for (var i = 0; i < mediaEntities.length; i++) {
      var e = mediaEntities[i];
      var desc = "";
      if (e.metadata) {
        desc = e.metadata.description || e.metadata.overview || e.metadata.summary || "";
        if (typeof desc !== "string") desc = String(desc);
        desc = desc.replace(/<[^>]+>/g, "").slice(0, 500);
      }

      insertEntity.run(
        e.entityId, e.type, e.source, e.title,
        desc,
        JSON.stringify(e.semanticTags || []),
        JSON.stringify(e.tags || []),
        e.userRating || null,
        e.isFavorite ? 1 : 0,
        e.consumptionStatus || null,
        e.imageUrl || null,
        Date.now()
      );

      insertFts.run(
        e.entityId,
        e.title,
        desc,
        (e.semanticTags || []).join(" "),
        (e.tags || []).filter(function (t) { return t !== e.type && t !== e.source; }).join(" ")
      );

      var vec = buildTagVector(e);
      insertVec.run(e.entityId, JSON.stringify(vec), Date.now());
    }
  });

  rebuildAll();

  setMeta("indexedAt", String(Date.now()));
  setMeta("entityCount", String(mediaEntities.length));
  setMeta("version", "2");

  ctx.log("Rebuild complete: " + mediaEntities.length + " entities indexed");

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_nl_search",
        action: "rebuild",
        indexed: mediaEntities.length,
        indexedAt: new Date().toISOString(),
        success: true
      })
    }]
  };
}

// ════════════════════════════════════════
// STATUS ACTION
// ════════════════════════════════════════
if (action === "status") {
  var count = getIndexCount();
  var indexedAt = getMeta("indexedAt");
  var version = getMeta("version");

  var entityIndex2 = loadEntityIndex();
  var liveCount = Object.values(entityIndex2).filter(function (e) {
    return ENRICHABLE_TYPES.indexOf(e.type) !== -1;
  }).length;

  var stale = Math.abs(liveCount - count) > 50;

  var typeCounts = {};
  var typeRows = db.prepare("SELECT type, COUNT(*) as c FROM entities GROUP BY type").all();
  for (var tr = 0; tr < typeRows.length; tr++) {
    typeCounts[typeRows[tr].type] = typeRows[tr].c;
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_media_library_nl_search",
        action: "status",
        indexedEntities: count,
        liveEntities: liveCount,
        stale: stale,
        staleness: stale ? "Index is >50 entities behind live data. Run action=rebuild to sync." : "Index is current",
        indexedAt: indexedAt ? new Date(parseInt(indexedAt)).toISOString() : null,
        version: version || "1",
        typeCounts: typeCounts,
        features: {
          fts5: "enabled",
          tagVectors: "enabled",
          sqiteVec: "not_installed (prototype uses JS cosine similarity — install sqlite-vec for production)"
        }
      })
    }]
  };
}

// ════════════════════════════════════════
// SEARCH ACTION
// ════════════════════════════════════════
if (action === "search" || !action) {
  if (!query) {
    // Return a valid search response (not error) so template shows the search prompt
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_nl_search",
          action: "search",
          query: "",
          total: 0,
          results: []
        })
      }]
    };
  }

  // Auto-rebuild if index is empty
  var indexCount = getIndexCount();
  if (indexCount === 0) {
    ctx.log("Index empty — running auto-rebuild...");
    var autoEntities = Object.values(loadEntityIndex()).filter(function (e) {
      return ENRICHABLE_TYPES.indexOf(e.type) !== -1;
    });

    var insertEntityAuto = db.prepare(`
      INSERT OR REPLACE INTO entities
        (entityId, type, source, title, description, semanticTagsJson, tagsJson, userRating, isFavorite, consumptionStatus, imageUrl, indexedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    var insertFtsAuto = db.prepare("INSERT INTO entities_fts (entityId, title, description, semanticTags, tags) VALUES (?, ?, ?, ?, ?)");
    var insertVecAuto = db.prepare("INSERT OR REPLACE INTO tag_vectors (entityId, vectorJson, computedAt) VALUES (?, ?, ?)");

    var autoRebuild = db.transaction(function () {
      for (var ai = 0; ai < autoEntities.length; ai++) {
        var ae = autoEntities[ai];
        var adesc = "";
        if (ae.metadata) {
          adesc = ae.metadata.description || ae.metadata.overview || "";
          if (typeof adesc !== "string") adesc = String(adesc);
          adesc = adesc.replace(/<[^>]+>/g, "").slice(0, 500);
        }
        insertEntityAuto.run(ae.entityId, ae.type, ae.source, ae.title, adesc,
          JSON.stringify(ae.semanticTags || []), JSON.stringify(ae.tags || []),
          ae.userRating || null, ae.isFavorite ? 1 : 0, ae.consumptionStatus || null,
          ae.imageUrl || null, Date.now());
        insertFtsAuto.run(ae.entityId, ae.title, adesc,
          (ae.semanticTags || []).join(" "),
          (ae.tags || []).filter(function (t) { return t !== ae.type && t !== ae.source; }).join(" "));
        var avec = buildTagVector(ae);
        insertVecAuto.run(ae.entityId, JSON.stringify(avec), Date.now());
      }
    });
    autoRebuild();
    setMeta("indexedAt", String(Date.now()));
    setMeta("entityCount", String(autoEntities.length));
    indexCount = autoEntities.length;
    ctx.log("Auto-rebuild complete: " + indexCount + " entities");
  }

  // ── Step 0: LLM Query Router ──
  // Fire LLM expansion BEFORE pipeline to understand intent + expand terms
  var llmExpansion = null;
  var usedLlm = false;
  if (useExpansion) {
    llmExpansion = await llmExpandQuery(query, ctx);
    if (llmExpansion) usedLlm = true;
  }

  // ── Step 1: Parse query intent ──
  var queryLower = query.toLowerCase();
  var typeFilter = getTypeFilter();

  // Simple intent detection from query keywords (fallback when LLM unavailable)
  var intentTypeHints = [];
  if (/\bbook|novel|read\b/i.test(query)) intentTypeHints.push("book");
  if (/\bmovie|film|watch\b/i.test(query)) intentTypeHints.push("movie");
  if (/\bgame|play\b/i.test(query)) intentTypeHints.push("game");
  if (/\bshow|series|episode|tv\b/i.test(query)) intentTypeHints.push("tv-series");

  // LLM mediaTypeHint: use when user didn't explicitly set mediaType
  var llmMediaTypeHint = null;
  if (llmExpansion && llmExpansion.mediaTypeHint && !mediaType) {
    llmMediaTypeHint = llmExpansion.mediaTypeHint;
  }

  // Effective type filter: explicit param overrides intent detection
  // Note: LLM mediaTypeHint is NOT a hard filter — it's applied as a soft boost later
  var effectiveTypes = typeFilter || (intentTypeHints.length > 0 ? intentTypeHints : null);

  // ── Step 2: FTS5 keyword search ──
  // Build FTS5 query: quote multi-word phrases, use OR for individual terms
  // Sanitize: strip FTS5 special chars to prevent syntax errors / injection
  var sanitized = query.replace(/["\*\(\)\-\+\^:{}~<>\[\]\\|!]/g, " ").trim();
  var FTS5_KEYWORDS = { "AND": 1, "OR": 1, "NOT": 1, "NEAR": 1 };
  var queryTerms = sanitized.split(/\s+/).filter(function (t) { return t.length > 1 && !FTS5_KEYWORDS[t]; });
  var ftsQuery = queryTerms.length > 0 ? queryTerms.join(" OR ") : null;

  // Also try exact phrase match for boost (only meaningful with 2+ words)
  var ftsExact = queryTerms.length > 1 ? '"' + sanitized.replace(/"/g, " ").trim() + '"' : null;

  var ftsResults = [];
  var ftsExactRows = [];
  if (ftsQuery) {
    try {
      try {
        var ftsStmt = effectiveTypes
          ? db.prepare("SELECT entityId, type, bm25(entities_fts) AS score FROM entities_fts WHERE entities_fts MATCH ? AND entityId IN (SELECT entityId FROM entities WHERE type IN (" + effectiveTypes.map(function () { return "?"; }).join(",") + ")) ORDER BY score LIMIT ?")
          : db.prepare("SELECT entityId, type, bm25(entities_fts) AS score FROM entities_fts WHERE entities_fts MATCH ? ORDER BY score LIMIT ?");

        var ftsArgs = effectiveTypes
          ? [ftsQuery].concat(effectiveTypes).concat([limit * 3])
          : [ftsQuery, limit * 3];

        ftsResults = ftsStmt.all.apply(ftsStmt, ftsArgs) || [];

        // Run exact phrase match query for boost (only if multi-word)
        if (ftsExact) {
          try {
            var exactStmt = effectiveTypes
              ? db.prepare("SELECT entityId, type, bm25(entities_fts) AS score FROM entities_fts WHERE entities_fts MATCH ? AND entityId IN (SELECT entityId FROM entities WHERE type IN (" + effectiveTypes.map(function () { return "?"; }).join(",") + ")) ORDER BY score LIMIT ?")
              : db.prepare("SELECT entityId, type, bm25(entities_fts) AS score FROM entities_fts WHERE entities_fts MATCH ? ORDER BY score LIMIT ?");

            var exactArgs = effectiveTypes
              ? [ftsExact].concat(effectiveTypes).concat([limit * 2])
              : [ftsExact, limit * 2];

            ftsExactRows = exactStmt.all.apply(exactStmt, exactArgs) || [];
          } catch (exactErr) {
            // Exact phrase match is optional — if it fails, OR results still work
            ctx.log("FTS5 exact phrase query skipped: " + exactErr.message);
          }
        }
      } catch (ftsErr) {
        ctx.log("FTS5 query error: " + ftsErr.message + " — falling back to title LIKE");
        // Fallback: simple LIKE title search
        var likeStmt = effectiveTypes
          ? db.prepare("SELECT entityId, type, -1 as score FROM entities WHERE lower(title) LIKE ? AND type IN (" + effectiveTypes.map(function () { return "?"; }).join(",") + ") LIMIT ?")
          : db.prepare("SELECT entityId, type, -1 as score FROM entities WHERE lower(title) LIKE ? LIMIT ?");
        var likeArgs = effectiveTypes
          ? ["%" + queryLower + "%"].concat(effectiveTypes).concat([limit * 3])
          : ["%" + queryLower + "%", limit * 3];
        ftsResults = likeStmt.all.apply(likeStmt, likeArgs) || [];
      }
    } catch (e) {
      ctx.log("FTS search failed: " + e.message);
      ftsResults = [];
    }
  }

  // ── Step 3: Semantic tag search ──
  // Build query vector from query terms + intent hints
  var expandedTerms = queryTerms.slice();
  // Add type-specific semantic expansions
  var SEMANTIC_EXPANSIONS = {
    "dystopia": ["dystopian", "totalitarian", "surveillance", "post-apocalyptic"],
    "space": ["sci-fi", "science-fiction", "interstellar", "astronaut", "galaxy"],
    "war": ["military", "combat", "battle", "conflict", "soldier"],
    "love": ["romance", "relationship", "drama", "emotional"],
    "mystery": ["thriller", "detective", "crime", "suspense"],
    "fantasy": ["magic", "dragons", "epic", "swords", "wizards"],
    "comedy": ["humor", "funny", "satire", "lighthearted"],
    "horror": ["scary", "supernatural", "terror", "dark"],
    "history": ["historical", "period", "ancient", "medieval", "biography"],
    "psychology": ["mind", "mental", "behavior", "philosophical", "consciousness"],
    "strategy": ["tactics", "planning", "chess", "game-theory", "leadership"],
    "finance": ["investing", "trading", "quantitative", "markets", "portfolio", "economics", "stocks"],
    "investing": ["finance", "trading", "portfolio", "stocks", "markets", "wealth", "value-investing"],
    "photography": ["camera", "lens", "leica", "sony", "landscape", "portrait", "composition", "visual"],
    "evolution": ["biology", "genetics", "darwin", "natural-selection", "adaptation", "species"],
    "biology": ["evolution", "genetics", "molecular", "ecology", "organisms", "life-science"],
    "science": ["physics", "chemistry", "biology", "research", "scientific", "experiments", "discovery"],
    "technology": ["software", "programming", "engineering", "ai", "machine-learning", "computing"],
    "ai": ["artificial-intelligence", "machine-learning", "deep-learning", "neural-network", "llm"],
    "philosophy": ["ethics", "existential", "metaphysics", "epistemology", "wisdom", "logic"],
    "adventure": ["exploration", "journey", "quest", "survival", "expedition", "travel"],
    "travel": ["adventure", "exploration", "journey", "destination", "wanderlust", "landscape"],
    "action": ["combat", "fighting", "martial-arts", "explosive", "adrenaline"],
    "drama": ["emotional", "character-driven", "interpersonal", "conflict", "tragedy"],
    "crime": ["detective", "mystery", "noir", "heist", "criminal", "police"],
    "nature": ["wildlife", "documentary", "environment", "ecology", "landscape", "earth"]
  };

  // Dictionary-based expansion (fast fallback, always runs)
  for (var si = 0; si < queryTerms.length; si++) {
    var qt = queryTerms[si].toLowerCase();
    var expansions = SEMANTIC_EXPANSIONS[qt];
    if (expansions) {
      for (var ei = 0; ei < expansions.length; ei++) {
        if (expandedTerms.indexOf(expansions[ei]) === -1) expandedTerms.push(expansions[ei]);
      }
    }
  }

  // Merge LLM expanded terms on top of dictionary expansion
  if (llmExpansion && llmExpansion.expandedTerms) {
    for (var li = 0; li < llmExpansion.expandedTerms.length; li++) {
      var llmTerm = llmExpansion.expandedTerms[li];
      if (expandedTerms.indexOf(llmTerm) === -1) expandedTerms.push(llmTerm);
    }
  }

  var queryVec = buildQueryVector(expandedTerms);

  // Load all tag vectors for comparison
  var vecRows = effectiveTypes
    ? db.prepare("SELECT tv.entityId, tv.vectorJson FROM tag_vectors tv JOIN entities e ON tv.entityId = e.entityId WHERE e.type IN (" + effectiveTypes.map(function () { return "?"; }).join(",") + ")").all(effectiveTypes)
    : db.prepare("SELECT entityId, vectorJson FROM tag_vectors").all();

  var semanticScores = [];
  for (var vi = 0; vi < vecRows.length; vi++) {
    try {
      var vec = JSON.parse(vecRows[vi].vectorJson);
      var sim = cosineSim(queryVec, vec);
      if (sim > 0.05) {
        semanticScores.push({ entityId: vecRows[vi].entityId, similarity: sim });
      }
    } catch (ve) { /* skip malformed vectors */ }
  }
  semanticScores.sort(function (a, b) { return b.similarity - a.similarity; });
  var semanticRanking = semanticScores.map(function (s) { return s.entityId; });

  // ── Step 4: RRF Hybrid Fusion ──
  var ftsRanking = ftsResults.map(function (r) { return r.entityId; });
  var exactRanking = ftsExactRows.map(function (r) { return r.entityId; });

  // Weight: FTS (keyword) slightly higher for precise queries; semantic equal for vague queries
  var keywordWeight = 1.2;
  var semanticWeight = 1.0;
  var exactWeight = 1.5; // Exact phrase matches get a strong boost

  // LLM intent-based weight adjustment
  var llmIntentType = llmExpansion ? llmExpansion.intentType : null;
  if (llmIntentType === "specific") {
    // Looking for a known item — boost keyword/exact match weight
    keywordWeight = 1.8;
    exactWeight = 2.0;
    semanticWeight = 0.6;
  } else if (llmIntentType === "exploratory") {
    // Browsing themes — boost semantic weight
    keywordWeight = 0.8;
    semanticWeight = 1.8;
  } else {
    // Fallback: original heuristic for non-LLM path
    if (queryTerms.length <= 2 || /\blike|similar|theme|vibe|genre\b/i.test(query)) {
      semanticWeight = 1.5;
    }
  }

  // Include exact phrase ranking as a third signal (empty list is harmless in RRF)
  var rankingLists = [ftsRanking, semanticRanking];
  var rankingWeights = [keywordWeight, semanticWeight];
  if (exactRanking.length > 0) {
    rankingLists.push(exactRanking);
    rankingWeights.push(exactWeight);
  }

  var fused = fuseRankings(rankingLists, rankingWeights);

  // ── LLM mediaTypeHint soft-filter ──
  // Boost results matching the LLM-suggested media type by 1.3x (not hard filter)
  if (llmMediaTypeHint) {
    // Look up types from entities table for the fused results
    var hintIds = fused.map(function (e) { return e.entityId; });
    if (hintIds.length > 0) {
      var hintPlaceholders = hintIds.map(function () { return "?"; }).join(",");
      var hintRows = db.prepare("SELECT entityId, type FROM entities WHERE entityId IN (" + hintPlaceholders + ")").all(hintIds);
      var hintTypeMap = {};
      for (var hi = 0; hi < hintRows.length; hi++) {
        hintTypeMap[hintRows[hi].entityId] = hintRows[hi].type;
      }
      for (var fi = 0; fi < fused.length; fi++) {
        if (hintTypeMap[fused[fi].entityId] === llmMediaTypeHint) {
          fused[fi].score *= 1.3;
        }
      }
      // Re-sort after boost
      fused.sort(function (a, b) { return b.score - a.score; });
    }
  }

  var topIds = fused.slice(0, limit).map(function (e) { return e.entityId; });

  // ── Step 5: Load full entity data for results ──
  if (topIds.length === 0) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_media_library_nl_search",
          action: "search",
          query: query,
          total: 0,
          results: [],
          note: "No matches found. Try broader terms or run action=rebuild to sync index."
        })
      }]
    };
  }

  var placeholders = topIds.map(function () { return "?"; }).join(",");
  var entityRows = db.prepare("SELECT * FROM entities WHERE entityId IN (" + placeholders + ")").all(topIds);

  // Map to object for fast lookup
  var entityMap = {};
  for (var em = 0; em < entityRows.length; em++) {
    entityMap[entityRows[em].entityId] = entityRows[em];
  }

  // Score breakdown for result annotation
  var ftsScoreMap = {};
  for (var fs2 = 0; fs2 < ftsResults.length; fs2++) {
    ftsScoreMap[ftsResults[fs2].entityId] = ftsResults[fs2].score;
  }
  var semScoreMap = {};
  for (var ss2 = 0; ss2 < semanticScores.length; ss2++) {
    semScoreMap[semanticScores[ss2].entityId] = semanticScores[ss2].similarity;
  }
  var exactMatchSet = {};
  for (var ex2 = 0; ex2 < ftsExactRows.length; ex2++) {
    exactMatchSet[ftsExactRows[ex2].entityId] = true;
  }

  var results = [];
  for (var ri = 0; ri < topIds.length; ri++) {
    var id = topIds[ri];
    var row = entityMap[id];
    if (!row) continue;

    var matchReasons = [];
    if (exactMatchSet[id]) matchReasons.push("exact-phrase");
    if (ftsScoreMap[id]) matchReasons.push("keyword");
    if (semScoreMap[id] && semScoreMap[id] > 0.1) matchReasons.push("semantic");
    if (semScoreMap[id] && semScoreMap[id] > 0.3) matchReasons.push("strong-semantic");

    var semTags = [];
    try { semTags = JSON.parse(row.semanticTagsJson || "[]"); } catch (e) { /* ignore */ }
    var tags = [];
    try { tags = JSON.parse(row.tagsJson || "[]"); } catch (e2) { /* ignore */ }

    results.push({
      entityId: row.entityId,
      type: row.type,
      source: row.source,
      title: row.title,
      imageUrl: row.imageUrl || null,
      semanticTags: semTags.slice(0, 6),
      tags: tags.slice(0, 4),
      userRating: row.userRating || null,
      ratingDisplay: row.userRating ? {
        points: row.userRating,
        stars: row.userRating / 2,
        display: "★".repeat(Math.floor(row.userRating / 2)) + (row.userRating % 2 ? "½" : "") + "☆".repeat(5 - Math.ceil(row.userRating / 2))
      } : null,
      isFavorite: !!row.isFavorite,
      consumptionStatus: row.consumptionStatus || null,
      hybridScore: Math.round((fused[ri] ? fused[ri].score : 0) * 10000) / 10000,
      ftsScore: ftsScoreMap[id] ? Math.round(Math.abs(ftsScoreMap[id]) * 100) / 100 : 0,
      semanticSimilarity: semScoreMap[id] ? Math.round(semScoreMap[id] * 100) : 0,
      matchReasons: matchReasons
    });
  }

  var searchMethod = usedLlm ? "hybrid-fts5+semantic+llm-rrf" : "hybrid-fts5+semantic-rrf";

  var responsePayload = {
    tool: "enso_media_library_nl_search",
    action: "search",
    query: query,
    expandedTerms: expandedTerms.length > queryTerms.length ? expandedTerms : undefined,
    mediaType: mediaType || "all",
    effectiveTypes: effectiveTypes || "all",
    total: results.length,
    indexSize: indexCount,
    searchMethod: searchMethod,
    results: results
  };

  // Include LLM routing metadata when active
  if (usedLlm && llmExpansion) {
    responsePayload.llmRouter = {
      intentType: llmExpansion.intentType,
      mediaTypeHint: llmExpansion.mediaTypeHint || null,
      llmTermCount: llmExpansion.expandedTerms.length
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify(responsePayload)
    }]
  };
}

// ── Fallback ──
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_media_library_nl_search",
      error: "Unknown action: " + action + ". Use: search, rebuild, or status"
    })
  }]
};
