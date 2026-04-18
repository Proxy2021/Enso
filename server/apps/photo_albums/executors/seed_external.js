// Seed an external photographer's album via web research + LLM synthesis.
// Pipeline: web search (ctx.search) → Wikipedia summary → LLM extracts bio/plates/style/cover
// → writes cache + Cortex page + entity index.
var os = require("os");
var fs = require("fs");
var path = require("path");

var p = params || {};
var photographer = String(p.photographer || "").trim();
var albumTitle = String(p.albumTitle || "").trim();
var styleHint = String(p.style || "").trim();
// When re-seeding an existing album, pass the existing entityId so the result
// replaces the record in place even if the LLM picks a slightly different title.
var refreshEntityId = String(p.refreshEntityId || "").trim();

if (!photographer && !albumTitle && !refreshEntityId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_photo_albums_seed_external",
    error: "Provide at least a photographer name, an albumTitle, or a refreshEntityId.",
  }) }] };
}

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80);
}

// File-based lock to serialize concurrent cache writes. Cross-process safe —
// uses O_EXCL via {flag:'wx'}. Async-sleep to avoid blocking the event loop.
async function withCacheLock(cachePath, fn, maxWaitMs) {
  var lockPath = cachePath + ".lock";
  var start = Date.now();
  var acquired = false;
  while (Date.now() - start < (maxWaitMs || 15000)) {
    try {
      fs.writeFileSync(lockPath, String(process.pid) + ":" + Date.now(), { flag: "wx" });
      acquired = true;
      break;
    } catch (e) {
      // Lock busy — if stale (>30s old), steal it
      try {
        var st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > 30000) { fs.unlinkSync(lockPath); continue; }
      } catch (e2) {}
      await new Promise(function(r) { setTimeout(r, 40 + Math.floor(Math.random() * 120)); });
    }
  }
  if (!acquired) throw new Error("cache lock timeout after " + (Date.now() - start) + "ms");
  try {
    return await fn();
  } finally {
    try { fs.unlinkSync(lockPath); } catch (e) {}
  }
}

// Read-modify-write cache with upsert. Holds the lock across the re-read so
// concurrent writers don't trample each other's albums.
async function upsertAlbum(cachePath, albumRecord) {
  return withCacheLock(cachePath, async function() {
    var fresh = { albums: [], tasteProfile: { interactionCount: 0 } };
    try { fresh = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch (e) {}
    if (!Array.isArray(fresh.albums)) fresh.albums = [];
    var idx = fresh.albums.findIndex(function(a) { return a.entityId === albumRecord.entityId || a.slug === albumRecord.slug; });
    if (idx >= 0) {
      albumRecord.addedAt = fresh.albums[idx].addedAt || albumRecord.addedAt;
      fresh.albums[idx] = albumRecord;
    } else {
      fresh.albums.push(albumRecord);
    }
    fresh.updatedAt = albumRecord.updatedAt;
    fs.writeFileSync(cachePath, JSON.stringify(fresh, null, 2), "utf-8");
    return fresh;
  });
}

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}
var cachePath = path.join(cacheDir, "photo-albums.json");

var cached = { albums: [], tasteProfile: { interactionCount: 0 } };
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch (e) {}
if (!Array.isArray(cached.albums)) cached.albums = [];

// Resolve refreshEntityId → hydrate photographer/albumTitle from the existing record.
var existingRecord = null;
if (refreshEntityId) {
  existingRecord = cached.albums.find(function(a) { return a.entityId === refreshEntityId; });
  if (existingRecord) {
    if (!photographer) photographer = existingRecord.photographer || "";
    if (!albumTitle) albumTitle = existingRecord.title || "";
    if (!styleHint) styleHint = existingRecord.style || "";
  }
}

// ── Image source helpers — broad coverage of fine-art + photography archives ──

// Wikimedia Commons Category API — e.g. "Photographs by Ansel Adams" or
// "Paintings by Vincent van Gogh" often have large public-domain galleries.
async function fetchCommonsCategory(categoryName) {
  try {
    var cat = categoryName.replace(/^Category:/i, "");
    var url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&list=categorymembers&cmtype=file&cmlimit=50&cmtitle=Category:" + encodeURIComponent(cat.replace(/ /g, "_"));
    var r = await ctx.fetch(url);
    var d = r && (r.data || r);
    var members = (d && d.query && d.query.categorymembers) || [];
    var files = members.filter(function(m) { return String(m.title || "").match(/^File:/); });
    // Convert File:Foo.jpg titles to direct commons upload URLs via the imageinfo API (batched).
    if (files.length === 0) return [];
    var titles = files.slice(0, 30).map(function(f) { return f.title; }).join("|");
    var iiUrl = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=" + encodeURIComponent(titles);
    var iiRes = await ctx.fetch(iiUrl);
    var iiData = iiRes && (iiRes.data || iiRes);
    var pages = (iiData && iiData.query && iiData.query.pages) || {};
    var results = [];
    Object.keys(pages).forEach(function(k) {
      var p = pages[k];
      var info = p.imageinfo && p.imageinfo[0];
      if (info && info.thumburl) {
        var meta = info.extmetadata || {};
        results.push({
          title: String(p.title || "").replace(/^File:/, "").replace(/\.\w+$/, "").replace(/_/g, " "),
          imageUrl: info.thumburl,
          fullUrl: info.url,
          sourceUrl: info.descriptionurl || "",
          caption: (meta.ImageDescription && meta.ImageDescription.value || "").replace(/<[^>]+>/g, "").slice(0, 300),
          source: "wikimedia-commons",
        });
      }
    });
    return results;
  } catch (e) { ctx.log("Commons category failed: " + (e.message || e)); return []; }
}

// Metropolitan Museum of Art Open Access — massive public-domain collection
// covering paintings, photography, sculpture, prints, drawings. Free API.
async function fetchMET(artistName) {
  try {
    var searchUrl = "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&artistOrCulture=true&q=" + encodeURIComponent(artistName);
    var r = await ctx.fetch(searchUrl);
    var d = r && (r.data || r);
    var ids = (d && d.objectIDs) || [];
    if (!ids.length) return [];
    // Fetch up to 15 objects in parallel
    var results = await Promise.all(ids.slice(0, 15).map(async function(id) {
      try {
        var or = await ctx.fetch("https://collectionapi.metmuseum.org/public/collection/v1/objects/" + id);
        var o = or && (or.data || or);
        if (!o || !o.primaryImage) return null;
        return {
          title: o.title || "(untitled)",
          year: o.objectDate || null,
          imageUrl: o.primaryImageSmall || o.primaryImage,
          fullUrl: o.primaryImage,
          sourceUrl: o.objectURL || "",
          caption: (o.medium || "") + (o.dimensions ? " · " + o.dimensions : ""),
          artist: o.artistDisplayName || artistName,
          source: "met",
        };
      } catch (e) { return null; }
    }));
    return results.filter(Boolean);
  } catch (e) { ctx.log("MET failed: " + (e.message || e)); return []; }
}

// Smithsonian Open Access — American art, Asian art, portrait gallery, photography.
// Requires no key (uses the Edan search endpoint).
async function fetchSmithsonian(artistName) {
  try {
    var url = "https://api.si.edu/openaccess/api/v1.0/search?q=" + encodeURIComponent('online_media_type:"Images" AND name:"' + artistName + '"') + "&rows=15&api_key=";
    // Public key-less search is rate-limited; use proxy-like endpoint
    var r = await ctx.fetch("https://api.si.edu/openaccess/api/v1.0/category/art_design/search?q=" + encodeURIComponent(artistName) + "&rows=15");
    var d = r && (r.data || r);
    var rows = (d && d.response && d.response.rows) || [];
    return rows.map(function(row) {
      var content = row.content || {};
      var desc = content.descriptiveNonRepeating || {};
      var media = (desc.online_media && desc.online_media.media) || [];
      var firstMedia = media.find(function(m) { return m.type === "Images"; }) || media[0];
      if (!firstMedia || !firstMedia.thumbnail) return null;
      return {
        title: desc.title && desc.title.content || row.title || "(untitled)",
        year: (content.freetext && content.freetext.date && content.freetext.date[0] && content.freetext.date[0].content) || null,
        imageUrl: firstMedia.thumbnail,
        fullUrl: firstMedia.content || firstMedia.thumbnail,
        sourceUrl: desc.record_link || "",
        caption: (content.freetext && content.freetext.physicalDescription && content.freetext.physicalDescription[0] && content.freetext.physicalDescription[0].content) || "",
        source: "smithsonian",
      };
    }).filter(Boolean);
  } catch (e) { ctx.log("Smithsonian failed: " + (e.message || e)); return []; }
}

// Europeana — aggregates 2000+ European museums, rich in art + photography.
async function fetchEuropeana(artistName) {
  try {
    var url = "https://api.europeana.eu/record/v2/search.json?wskey=api2demo&query=" + encodeURIComponent('who:"' + artistName + '"') + "&qf=TYPE:IMAGE&rows=15&profile=standard";
    var r = await ctx.fetch(url);
    var d = r && (r.data || r);
    var items = (d && d.items) || [];
    return items.map(function(it) {
      if (!it.edmPreview || !it.edmPreview[0]) return null;
      return {
        title: (it.title && it.title[0]) || "(untitled)",
        year: (it.year && it.year[0]) || null,
        imageUrl: it.edmPreview[0],
        fullUrl: (it.edmIsShownBy && it.edmIsShownBy[0]) || it.edmPreview[0],
        sourceUrl: it.guid || "",
        caption: (it.dcCreator && it.dcCreator[0]) || "",
        source: "europeana",
      };
    }).filter(Boolean);
  } catch (e) { ctx.log("Europeana failed: " + (e.message || e)); return []; }
}

// Wikimedia Commons free-text file search — broader net than category listing.
// Works for books/series (e.g., "The Yosemite book illustrations") when the artist
// has no dedicated works category.
async function fetchCommonsSearch(query, limit) {
  try {
    var url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=" + (limit || 15) + "&srsearch=" + encodeURIComponent(query);
    var r = await ctx.fetch(url);
    var d = r && (r.data || r);
    var hits = (d && d.query && d.query.search) || [];
    var titles = hits.map(function(h) { return h.title; }).filter(function(t) { return /^File:.*\.(jpe?g|png|tif|tiff|webp)$/i.test(t); });
    if (titles.length === 0) return [];
    var iiUrl = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=" + encodeURIComponent(titles.join("|"));
    var iiRes = await ctx.fetch(iiUrl);
    var iiData = iiRes && (iiRes.data || iiRes);
    var pages = (iiData && iiData.query && iiData.query.pages) || {};
    var results = [];
    Object.keys(pages).forEach(function(k) {
      var p = pages[k];
      var info = p.imageinfo && p.imageinfo[0];
      if (info && info.thumburl) {
        var meta = info.extmetadata || {};
        results.push({
          title: String(p.title || "").replace(/^File:/, "").replace(/\.\w+$/, "").replace(/_/g, " "),
          imageUrl: info.thumburl,
          fullUrl: info.url,
          sourceUrl: info.descriptionurl || "",
          caption: (meta.ImageDescription && meta.ImageDescription.value || "").replace(/<[^>]+>/g, "").slice(0, 300),
          source: "wikimedia-search",
        });
      }
    });
    return results;
  } catch (e) { ctx.log("Commons search failed: " + (e.message || e)); return []; }
}

// Combined artist image search — calls all sources in parallel and merges.
// Tries many Commons category patterns to handle photographers, painters,
// sculptors, AND authors/naturalists whose books are illustrated by others.
async function searchArtistImages(artistName, albumTitle, themes) {
  if (!artistName) return [];
  var calls = [];
  // Artist-centric categories
  calls.push(fetchCommonsCategory("Photographs by " + artistName));
  calls.push(fetchCommonsCategory("Paintings by " + artistName));
  calls.push(fetchCommonsCategory("Works by " + artistName));
  calls.push(fetchCommonsCategory(artistName));
  // Album-title categories for illustrated books / series
  if (albumTitle) {
    calls.push(fetchCommonsCategory(albumTitle));
    calls.push(fetchCommonsCategory("Illustrations from " + albumTitle));
  }
  // Museum archives
  calls.push(fetchMET(artistName));
  calls.push(fetchSmithsonian(artistName));
  calls.push(fetchEuropeana(artistName));
  // Free-text Commons search as a broad fallback
  var searchQuery = artistName + (albumTitle ? " " + albumTitle : "");
  calls.push(fetchCommonsSearch(searchQuery, 20));
  // Per-theme free-text Commons search (surfaces subject-matter images)
  if (Array.isArray(themes) && themes.length > 0) {
    for (var ti = 0; ti < Math.min(themes.length, 3); ti++) {
      calls.push(fetchCommonsSearch(artistName + " " + String(themes[ti]).replace(/-/g, " "), 10));
    }
  }
  var settled = await Promise.allSettled(calls);
  var combined = [];
  for (var i = 0; i < settled.length; i++) {
    if (settled[i].status === "fulfilled" && Array.isArray(settled[i].value)) {
      combined = combined.concat(settled[i].value);
    }
  }
  // Dedupe by imageUrl
  var seen = {};
  var deduped = [];
  for (var j = 0; j < combined.length; j++) {
    var u = combined[j].imageUrl;
    if (!u || seen[u]) continue;
    seen[u] = true;
    deduped.push(combined[j]);
  }
  return deduped;
}

async function fetchWikiSummary(title) {
  if (!title) return null;
  try {
    var wTitle = encodeURIComponent(String(title).replace(/ /g, "_"));
    var r = await ctx.fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + wTitle);
    var d = r && (r.data || r);
    if (d && d.extract && d.type !== "disambiguation") {
      var img = (d.originalimage && d.originalimage.source) || (d.thumbnail && d.thumbnail.source) || "";
      return {
        extract: d.extract,
        imageUrl: img,
        pageUrl: d.content_urls && d.content_urls.desktop ? d.content_urls.desktop.page : "",
      };
    }
  } catch (e) { /* caller handles */ }
  return null;
}

async function searchWikiTitle(query) {
  try {
    var r = await ctx.fetch("https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&search=" + encodeURIComponent(query));
    var d = r && (r.data || r);
    if (Array.isArray(d) && Array.isArray(d[1]) && d[1][0]) return d[1][0];
  } catch (e) { /* caller handles */ }
  return null;
}

async function run() {
  // ── 1. Wikipedia fetch for photographer (authoritative bio + image) ──
  // Two-pass: try the raw input (handles English names directly), then fall back
  // to an OpenSearch query that resolves non-English names to the English article
  // (e.g., "森山大道" → "Daido Moriyama").
  var wikiSummary = null;
  var wikiImageUrl = null;
  var wikiPhotographerPageUrl = null;
  if (photographer) {
    var res1 = await fetchWikiSummary(photographer);
    if (res1 && res1.extract) {
      wikiSummary = res1.extract;
      wikiImageUrl = res1.imageUrl || null;
      wikiPhotographerPageUrl = res1.pageUrl || null;
    } else {
      // Resolve via OpenSearch (Japanese/Chinese name → English title)
      var resolved = await searchWikiTitle(photographer + " photographer");
      if (resolved) {
        var res2 = await fetchWikiSummary(resolved);
        if (res2 && res2.extract) {
          wikiSummary = res2.extract;
          wikiImageUrl = res2.imageUrl || null;
          wikiPhotographerPageUrl = res2.pageUrl || null;
        }
      }
    }
  }

  // ── 2. Web search for the work (ctx.search uses Brave) ──
  var searchResults = [];
  try {
    var query = albumTitle
      ? (photographer ? photographer + " " + albumTitle + " body of work catalog" : albumTitle + " monograph")
      : photographer + " most famous body of work";
    var searchRes = await ctx.search(query, { count: 8 });
    if (searchRes && Array.isArray(searchRes.results)) {
      searchResults = searchRes.results.slice(0, 8).map(function(r) {
        return { title: r.title || "", url: r.url || "", snippet: (r.description || r.snippet || "").slice(0, 400) };
      });
    }
  } catch (e) { ctx.log("Web search failed: " + (e.message || e)); }

  // ── 3. Open Library search for monographs (art books of all mediums) ──
  var openLibResults = [];
  if (photographer) {
    try {
      var olUrl = "https://openlibrary.org/search.json?author=" + encodeURIComponent(photographer) + "&limit=5";
      var olRes = await ctx.fetch(olUrl);
      var olData = olRes && (olRes.data || olRes);
      var docs = olData && olData.docs ? olData.docs : [];
      openLibResults = docs.slice(0, 5).map(function(d) {
        var cover = d.cover_i ? "https://covers.openlibrary.org/b/id/" + d.cover_i + "-L.jpg" : "";
        return {
          title: d.title || "",
          firstPublishYear: d.first_publish_year || 0,
          publisher: (d.publisher && d.publisher[0]) || "",
          coverUrl: cover,
          editionKey: (d.edition_key && d.edition_key[0]) || "",
        };
      });
    } catch (e) { ctx.log("Open Library failed: " + (e.message || e)); }
  }

  // ── 3b. Art-archive image pool (Wikimedia Commons, MET, Smithsonian, Europeana) ──
  // Used for: cover fallback, plate enrichment, and extra works to show the user.
  // We don't know the album title or themes yet (LLM hasn't run), so pass what the
  // user provided and let the per-plate fallback fill gaps after synthesis.
  var archiveImages = await searchArtistImages(photographer, albumTitle, []);
  ctx.log("Art archive pool: " + archiveImages.length + " images for " + photographer);

  // ── 4. LLM synthesis: identify the canonical body of work across any medium ──
  var prompt = "You are an art curator building a single authoritative Album entry for a personal knowledge base.\n";
  prompt += "An 'Album' here is a curated body of work by an artist — a photo monograph, a painting series, a sculpture catalog, a print portfolio, a drawing collection, a film retrospective, etc. The concept is medium-agnostic.\n\n";
  prompt += "Input target:\n";
  if (photographer) prompt += "- Artist: " + photographer + "\n";
  if (albumTitle) prompt += "- Album/series title: " + albumTitle + "\n";
  if (styleHint) prompt += "- Style/genre hint: " + styleHint + "\n";
  prompt += "\n";
  if (wikiSummary) {
    prompt += "Wikipedia bio (artist):\n" + wikiSummary + "\n\n";
  }
  if (openLibResults.length > 0) {
    prompt += "Open Library monographs by this artist:\n" + JSON.stringify(openLibResults, null, 1) + "\n\n";
  }
  if (archiveImages.length > 0) {
    prompt += "Real works from museum archives (use these for plate imageUrls — they are verified, high-quality, and rights-cleared):\n";
    prompt += JSON.stringify(archiveImages.slice(0, 20).map(function(a) { return { title: a.title, year: a.year, imageUrl: a.imageUrl, source: a.source }; }), null, 1) + "\n\n";
  }
  if (searchResults.length > 0) {
    prompt += "Web search results:\n" + JSON.stringify(searchResults, null, 1) + "\n\n";
  }
  prompt += "Task: Return ONE authoritative album as a JSON object. If no albumTitle was given, pick the artist's most iconic series, monograph, or body of work.\n";
  prompt += "Return ONLY valid JSON (no markdown fence, no explanation) with this exact shape:\n";
  prompt += "{\n";
  prompt += '  "title": "<album/series/monograph title>",\n';
  prompt += '  "photographer": "<artist full name — canonical English/romanized>",\n';
  prompt += '  "medium": "<one of: photography, painting, sculpture, drawing, printmaking, mixed-media, digital, installation, collage, illustration>",\n';
  prompt += '  "yearPublished": <year or null>,\n';
  prompt += '  "publisher": "<publisher, gallery, or museum or empty string>",\n';
  prompt += '  "style": "<movement or genre: e.g. street, documentary, portrait, landscape, fine-art, impressionism, surrealism, cubism, abstract-expressionism, minimalism, pop-art, contemporary, classical, baroque, realism>",\n';
  prompt += '  "themes": ["<3-6 thematic tags, lowercase-hyphen>"],\n';
  prompt += '  "description": "<150-300 word description covering the work\'s significance, subject matter, context, and the artist\'s approach>",\n';
  prompt += '  "plates": [ { "title": "<work title>", "year": <year or null>, "caption": "<1-2 sentence caption about what it shows or why it matters>", "imageUrl": "<URL from the museum archives above if matched, else empty string>" } ],\n';
  prompt += '  "coverUrl": "<best cover image URL — prefer Open Library monograph cover, else a signature work from the archive pool>",\n';
  prompt += '  "sourceUrl": "<primary reference URL (Wikipedia, museum, publisher, or authoritative source)>",\n';
  prompt += '  "photographerBio": "<2-3 sentence bio of the artist focused on their contribution to their medium>"\n';
  prompt += "}\n\n";
  prompt += "Rules:\n";
  prompt += "- Include 8-15 plates covering the body of work's most iconic or representative pieces.\n";
  prompt += "- WHEN A MATCHING IMAGE EXISTS IN THE ARCHIVES ABOVE, use its exact imageUrl — this gives the user a real, verified photograph of the work.\n";
  prompt += "- Only list plates with REAL, verifiable titles. If the works are untitled (as in Moriyama's Shashin yo Sayonara, or many contemporary pieces), use the form 'Untitled — <brief subject>' and set year to the work's year. Never invent fake-sounding titles.\n";
  prompt += "- For the 'photographer' field, return ONLY the canonical English/romanized name (e.g., 'Daido Moriyama', not 'Daido Moriyama (森山大道)'; 'Vincent van Gogh', not 'Vincent van Gogh (1853-1890)'). No parentheticals, no native-script annotations, no dates.\n";
  prompt += "- themes are lowercase hyphen-separated (e.g., 'post-war', 'street-life', 'impressionist-landscapes').\n";
  prompt += "- The field is named 'photographer' for legacy reasons but applies to any artist.\n";

  var extracted = null;
  try {
    var llm = await ctx.ask(prompt, { temperature: 0.4 });
    if (llm && llm.ok && llm.text) {
      var txt = String(llm.text).trim();
      if (txt.indexOf("```") >= 0) txt = txt.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      extracted = JSON.parse(txt);
    }
  } catch (e) { ctx.log("LLM synthesis failed: " + (e.message || e)); }

  if (!extracted || !extracted.title) {
    return { content: [{ type: "text", text: JSON.stringify({
      tool: "enso_photo_albums_seed_external",
      error: "Unable to synthesize album data. Check network + LLM availability.",
      photographer: photographer,
      albumTitle: albumTitle,
      wikiFound: !!wikiSummary,
      searchHits: searchResults.length,
      openLibraryHits: openLibResults.length,
    }) }] };
  }

  // ── 4a. Backfill Wikipedia using the LLM-extracted English photographer name.
  // If the input was non-English (e.g. 森山大道), the LLM returns something like
  // "Daido Moriyama (森山大道)". Strip parentheticals before the Wikipedia lookup
  // so the canonical English title matches.
  function stripParentheticals(name) {
    return String(name || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  }
  if (!wikiSummary && extracted.photographer) {
    var canonicalName = stripParentheticals(extracted.photographer);
    if (canonicalName && canonicalName !== photographer) {
      var resEn = await fetchWikiSummary(canonicalName);
      if (resEn && resEn.extract) {
        wikiSummary = resEn.extract;
        wikiImageUrl = resEn.imageUrl || null;
        wikiPhotographerPageUrl = resEn.pageUrl || null;
      }
    }
  }

  // ── 4a'. Expand the archive pool with album-title + theme searches now that
  // we know the LLM's extracted title and themes (which may be more accurate
  // than the user's raw input).
  if (archiveImages.length < 25) {
    try {
      var extraPool = await searchArtistImages(
        stripParentheticals(extracted.photographer || photographer),
        extracted.title || albumTitle,
        Array.isArray(extracted.themes) ? extracted.themes : []
      );
      // Merge, dedupe
      var seenUrls = {};
      archiveImages.forEach(function(img) { seenUrls[img.imageUrl] = true; });
      for (var ei = 0; ei < extraPool.length; ei++) {
        if (!seenUrls[extraPool[ei].imageUrl]) {
          seenUrls[extraPool[ei].imageUrl] = true;
          archiveImages.push(extraPool[ei]);
        }
      }
      ctx.log("Expanded archive pool to " + archiveImages.length + " images after post-LLM search");
    } catch (e) { ctx.log("Post-LLM pool expansion failed: " + (e.message || e)); }
  }

  // ── 4b. Enrich plate images via Wikipedia (parallel, best-effort) ──
  // Must disambiguate by photographer name, otherwise random Wikipedia articles
  // (e.g. "Ocean Waves" Studio Ghibli anime) match on plate title alone.
  var platesIn = Array.isArray(extracted.plates) ? extracted.plates : [];
  var photographerName = stripParentheticals(extracted.photographer || photographer || "");
  // Tokens used to validate Wikipedia matches — must appear in the extract to accept.
  // Filter alphanumeric-only so we ignore non-Latin annotations from LLM output.
  var nameTokens = photographerName.split(/\s+/).filter(function(s) { return s.length >= 3 && /^[A-Za-z]/.test(s); }).map(function(s) { return s.toLowerCase(); });
  var validateTokens = nameTokens.concat(["photograph", "photographer"]);

  function extractMatchesPhotographer(extract) {
    if (!extract) return false;
    var low = String(extract).toLowerCase();
    // Must contain at least one name token (strong signal this is the right photographer)
    for (var i = 0; i < nameTokens.length; i++) {
      if (low.indexOf(nameTokens[i]) >= 0) return true;
    }
    return false;
  }

  if (platesIn.length > 0) {
    // Normalize title for fuzzy matching across archive sources
    function normTitle(s) {
      return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    }
    function titleOverlap(a, b) {
      var na = normTitle(a), nb = normTitle(b);
      if (!na || !nb) return 0;
      if (na === nb) return 1;
      if (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0) return 0.85;
      var wordsA = na.split(" ").filter(function(w) { return w.length >= 3; });
      var wordsB = new Set(nb.split(" ").filter(function(w) { return w.length >= 3; }));
      var hits = 0;
      for (var i = 0; i < wordsA.length; i++) if (wordsB.has(wordsA[i])) hits++;
      return wordsA.length ? hits / wordsA.length : 0;
    }

    // Infer imageSource from URL pattern when LLM supplies imageUrl without source.
    function inferSource(url) {
      if (!url) return null;
      if (/upload\.wikimedia\.org\/wikipedia\/en\//.test(url)) return "wikipedia";
      if (/upload\.wikimedia\.org\/wikipedia\/commons\//.test(url)) return "wikimedia-commons";
      if (/europeana\.eu/.test(url)) return "europeana";
      if (/metmuseum\.org/.test(url)) return "met";
      if (/si\.edu|smithsonian/.test(url)) return "smithsonian";
      if (/clevelandart\.org/.test(url)) return "cleveland-museum";
      return "external";
    }

    async function enrichPlate(plate) {
      // LLM-supplied URLs arrive without imageSource — infer it before returning.
      if (plate.imageUrl) {
        if (!plate.imageSource) plate.imageSource = inferSource(plate.imageUrl);
        return plate;
      }
      var baseTitle = String(plate.title || "").trim();
      if (!baseTitle) return plate;

      // Untitled works: no Wikipedia page exists, and pulling an arbitrary
      // archive image creates misleading attribution (e.g., Cindy Sherman's
      // "Untitled Film Still #3" captioning a photo of her in Amsterdam).
      // Leave these plates unillustrated — Expand will later surface real
      // related content as separate plates with honest titles.
      if (/^untitled/i.test(baseTitle)) {
        return plate;
      }

      // Art-archive first — highest signal for named works. Best fuzzy match ≥ 0.5.
      var best = null;
      var bestScore = 0;
      for (var i = 0; i < archiveImages.length; i++) {
        var score = titleOverlap(baseTitle, archiveImages[i].title);
        if (score > bestScore) { bestScore = score; best = archiveImages[i]; }
      }
      if (best && bestScore >= 0.5) {
        best._used = true;
        plate.imageUrl = best.imageUrl;
        plate.imageSource = best.source;
        plate.imageSourceUrl = best.sourceUrl;
        return plate;
      }

      // Title variants — prioritize disambiguated variants that include the photographer name.
      var tries = [];
      tries.push(baseTitle + " (" + photographerName + ")");
      tries.push(baseTitle + " (photograph)");
      tries.push(baseTitle + " (" + photographerName + " photograph)");
      tries.push(baseTitle);

      for (var i = 0; i < tries.length; i++) {
        var res = await fetchWikiSummary(tries[i]);
        if (res && res.imageUrl && extractMatchesPhotographer(res.extract)) {
          plate.imageUrl = res.imageUrl;
          plate.imageSource = "wikipedia";
          plate.imageSourceUrl = res.pageUrl;
          return plate;
        }
      }

      // OpenSearch fallback — find the closest Wikipedia title, then validate.
      try {
        var guess = await searchWikiTitle(baseTitle + " " + photographerName);
        if (guess) {
          var res2 = await fetchWikiSummary(guess);
          if (res2 && res2.imageUrl && extractMatchesPhotographer(res2.extract)) {
            plate.imageUrl = res2.imageUrl;
            plate.imageSource = "wikipedia";
            plate.imageSourceUrl = res2.pageUrl;
            return plate;
          }
        }
      } catch (e) { /* best-effort */ }

      // Per-plate Wikimedia Commons free-text search — essential for illustrated
      // books where the artist isn't a visual artist (e.g., John Muir's "The
      // Yosemite" plates are location photos, not works-by-Muir).
      try {
        var cq = baseTitle + " " + (extracted.title || albumTitle || "") + " " + photographerName;
        var cr = await fetchCommonsSearch(cq, 5);
        if (cr && cr.length > 0) {
          // Prefer the best title-overlap match
          var bestC = null, bestCScore = 0;
          for (var ci = 0; ci < cr.length; ci++) {
            var sc = titleOverlap(baseTitle, cr[ci].title);
            if (sc > bestCScore) { bestCScore = sc; bestC = cr[ci]; }
          }
          if (bestC) {
            plate.imageUrl = bestC.imageUrl;
            plate.imageSource = bestC.source;
            plate.imageSourceUrl = bestC.sourceUrl;
            return plate;
          }
        }
      } catch (e) { /* best-effort */ }

      // Final fallback: web image search (strict .jpg/.png URL match)
      try {
        var sq = photographerName + " " + baseTitle + " photograph";
        var sr = await ctx.search(sq, { count: 3 });
        if (sr && Array.isArray(sr.results)) {
          for (var j = 0; j < sr.results.length; j++) {
            var u = sr.results[j].url || "";
            if (u.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)) {
              plate.imageUrl = u;
              plate.imageSource = "web";
              break;
            }
          }
        }
      } catch (e) { /* best-effort */ }
      return plate;
    }
    try {
      var enriched = await Promise.allSettled(platesIn.map(enrichPlate));
      extracted.plates = enriched.map(function(r, idx) { return r.status === "fulfilled" ? r.value : platesIn[idx]; });
      var imageCount = extracted.plates.filter(function(p) { return p.imageUrl; }).length;
      ctx.log("Plate image enrichment: " + imageCount + "/" + extracted.plates.length + " plates got images");
    } catch (e) { ctx.log("Plate enrichment failed: " + (e.message || e)); }
  }

  var finalTitle = extracted.title;
  var finalPhotographer = extracted.photographer || photographer;
  // If refreshing, preserve the existing slug/entityId so the record replaces
  // in place even if the LLM picked a slightly different title on this run.
  var slug = existingRecord ? existingRecord.slug : slugify(finalTitle);
  var entityId = existingRecord ? existingRecord.entityId : ("research:photo-album:" + slug);

  // Prefer Open Library cover if LLM didn't pick one. Then fall back to Wikipedia
  // portrait, then a signature work from the archive pool.
  var coverUrl = extracted.coverUrl || "";
  if (!coverUrl && openLibResults.length > 0 && openLibResults[0].coverUrl) coverUrl = openLibResults[0].coverUrl;
  if (!coverUrl && wikiImageUrl) coverUrl = wikiImageUrl;
  if (!coverUrl && archiveImages.length > 0) coverUrl = archiveImages[0].imageUrl;

  var nowIso = new Date().toISOString();
  var albumRecord = {
    entityId: entityId,
    slug: slug,
    title: finalTitle,
    kind: "external",
    photographer: finalPhotographer,
    photographerBio: extracted.photographerBio || wikiSummary || "",
    yearPublished: extracted.yearPublished || null,
    publisher: extracted.publisher || "",
    medium: extracted.medium || "photography",
    style: extracted.style || styleHint || "",
    themes: Array.isArray(extracted.themes) ? extracted.themes : [],
    description: extracted.description || "",
    plates: Array.isArray(extracted.plates) ? extracted.plates : [],
    plateCount: Array.isArray(extracted.plates) ? extracted.plates.length : 0,
    coverUrl: coverUrl,
    source: "research",
    sourceUrl: extracted.sourceUrl || (searchResults[0] ? searchResults[0].url : ""),
    addedAt: nowIso,
    updatedAt: nowIso,
    archiveSources: {
      wikimediaCommons: archiveImages.filter(function(a) { return a.source === "wikimedia-commons"; }).length,
      met: archiveImages.filter(function(a) { return a.source === "met"; }).length,
      smithsonian: archiveImages.filter(function(a) { return a.source === "smithsonian"; }).length,
      europeana: archiveImages.filter(function(a) { return a.source === "europeana"; }).length,
    },
  };

  // Upsert into cache — locked read-modify-write so concurrent seeds don't trample each other.
  try { await upsertAlbum(cachePath, albumRecord); } catch (e) { ctx.log("Cache write failed: " + (e.message || e)); }

  // Write Cortex page
  var wikiDir = path.join(os.homedir(), ".enso", "wiki", "entities");
  try { if (!fs.existsSync(wikiDir)) fs.mkdirSync(wikiDir, { recursive: true }); } catch (e) {}
  var wikiPath = path.join(wikiDir, "album-" + slug + ".md");
  var md = ["# " + finalTitle + "\n"];
  md.push("By **" + finalPhotographer + "**." + (albumRecord.yearPublished ? " Published " + albumRecord.yearPublished : "") + (albumRecord.publisher ? " by " + albumRecord.publisher : "") + ".\n");
  if (albumRecord.description) md.push(albumRecord.description + "\n");
  if (coverUrl) md.push("![cover](" + coverUrl + ")\n");
  md.push("## Details");
  md.push("- **Kind**: Artist album (external)");
  md.push("- **Artist**: [[" + slugify(finalPhotographer) + "]]");
  if (albumRecord.medium) md.push("- **Medium**: " + albumRecord.medium);
  if (albumRecord.yearPublished) md.push("- **Year**: " + albumRecord.yearPublished);
  if (albumRecord.publisher) md.push("- **Publisher**: " + albumRecord.publisher);
  if (albumRecord.style) md.push("- **Style**: " + albumRecord.style);
  if (albumRecord.plateCount) md.push("- **Works**: " + albumRecord.plateCount);
  if (albumRecord.sourceUrl) md.push("- **Source**: [" + albumRecord.sourceUrl + "](" + albumRecord.sourceUrl + ")");
  if (albumRecord.themes.length) {
    md.push("\n## Themes");
    for (var ti = 0; ti < albumRecord.themes.length; ti++) md.push("- [[" + slugify(albumRecord.themes[ti]) + "]]");
  }
  if (albumRecord.plates.length) {
    md.push("\n## Plates");
    for (var pi = 0; pi < albumRecord.plates.length; pi++) {
      var pl = albumRecord.plates[pi];
      var line = "- **" + (pl.title || "(untitled)") + "**";
      if (pl.year) line += " (" + pl.year + ")";
      if (pl.caption) line += " — " + pl.caption;
      md.push(line);
      if (pl.imageUrl) md.push("  ![" + (pl.title || "plate") + "](" + pl.imageUrl + ")");
    }
  }
  if (albumRecord.photographerBio) {
    md.push("\n## Photographer");
    md.push(albumRecord.photographerBio);
  }
  try { fs.writeFileSync(wikiPath, md.join("\n"), "utf-8"); } catch (e) { ctx.log("Cortex page write failed: " + (e.message || e)); }

  // Update wiki _index.md
  try {
    var indexPath = path.join(os.homedir(), ".enso", "wiki", "_index.md");
    var indexContent = "";
    try { indexContent = fs.readFileSync(indexPath, "utf-8"); } catch (e) { indexContent = "# Wiki Index\n\n"; }
    var pageKey = "entities/album-" + slug + ".md";
    var entryBlock = "## " + pageKey + "\nTitle: " + finalTitle + "\nEntityId: " + entityId + "\nSummary: " + (albumRecord.description || "").slice(0, 200) + "\n";
    if (indexContent.indexOf("## " + pageKey) >= 0) {
      indexContent = indexContent.replace(new RegExp("## " + pageKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?(?=\\n## |$)", "g"), entryBlock);
    } else {
      indexContent += "\n" + entryBlock;
    }
    fs.writeFileSync(indexPath, indexContent, "utf-8");
  } catch (e) { ctx.log("Wiki index update failed: " + (e.message || e)); }

  // Update entity index so browse shows the album even before server restart
  try {
    var eiPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
    var ei = {};
    try { ei = JSON.parse(fs.readFileSync(eiPath, "utf-8")); } catch (e) {}
    ei[entityId] = {
      entityId: entityId,
      type: "photo-album",
      source: "research",
      title: finalTitle,
      slug: slug,
      imageUrl: coverUrl,
      cortexPath: "entities/album-" + slug + ".md",
      tags: ["photo-album", "album-external"].concat(finalPhotographer ? [finalPhotographer.toLowerCase()] : []).concat(albumRecord.style ? [albumRecord.style.toLowerCase()] : []).concat(albumRecord.themes.map(function(t) { return String(t).toLowerCase(); })),
      updatedAt: nowIso,
    };
    fs.writeFileSync(eiPath, JSON.stringify(ei), "utf-8");
  } catch (e) { ctx.log("Entity index update failed: " + (e.message || e)); }

  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_photo_albums_seed_external",
    success: true,
    entityId: entityId,
    album: albumRecord,
    sources: {
      wikipedia: !!wikiSummary,
      openLibrary: openLibResults.length,
      webSearch: searchResults.length,
    },
    wikiPath: "entities/album-" + slug + ".md",
    message: "Added '" + finalTitle + "'" + (finalPhotographer ? " by " + finalPhotographer : "") + " to your photo album library.",
  }) }] };
}

return run();
