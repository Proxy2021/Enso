// Expand an existing album with exhaustive image retrieval across ALL available
// sources: Wikimedia Commons (categories + search), MET Open Access, Smithsonian
// Open Access, Europeana, Art Institute of Chicago. Appends new works to the
// album's plates array, deduped by imageUrl, capped at 100 total plates.
var os = require("os");
var fs = require("fs");
var path = require("path");

var p = params || {};
var entityId = String(p.entityId || "").trim();
var capTotal = Math.min(Math.max(Number(p.cap) || 100, 1), 100);

if (!entityId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_photo_albums_expand",
    error: "entityId is required",
  }) }] };
}

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80);
}

// File-based lock to serialize concurrent cache writes. Cross-process safe.
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
      try {
        var st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > 30000) { fs.unlinkSync(lockPath); continue; }
      } catch (e2) {}
      await new Promise(function(r) { setTimeout(r, 40 + Math.floor(Math.random() * 120)); });
    }
  }
  if (!acquired) throw new Error("cache lock timeout");
  try { return await fn(); }
  finally { try { fs.unlinkSync(lockPath); } catch (e) {} }
}

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
var cachePath = path.join(cacheDir, "photo-albums.json");
var cached = { albums: [] };
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch (e) {}
if (!Array.isArray(cached.albums)) cached.albums = [];

var album = cached.albums.find(function(a) { return a.entityId === entityId; });
if (!album) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_photo_albums_expand",
    error: "Album not found: " + entityId,
  }) }] };
}

var artist = album.photographer || "";
var title = album.title || "";
var themes = Array.isArray(album.themes) ? album.themes : [];
var medium = album.medium || "photography";

// ─── Source helpers (stand-alone within this executor) ──────────────────────

// Filter out non-artwork files from Wikimedia Commons. Rejects obvious noise
// (telephone cards, stamps, tombstones, maps, plaques) and non-image formats.
// In strict mode (used for free-text search where noise leaks in heavily),
// also requires the artist's name to appear in the file title or extmetadata.
var NOISE_TITLE_RE = /(telephone|telefon[_ -]?karte|postcard|\bstamp\b|\bplaque\b|commemorative|\bmemorial\b|funeral|deplacements?|itineraire|itinerary|autograph|handwriting|birthplace|\bmonument\b|statue[_ ]of|bust[_ ]of|street[_ ]sign|newspaper|magazine[_ ]cover|book[_ ]cover|dust[_ ]jacket|banknote|currency|medal[_ ]of|reproductie|reproducties|reproduction[_ ]of|\(reproduction\)|\(replica\)|bestanddeelnr|tentoonstelling|\bexhibition\b|elsevier|bouwploeg|last[_ ]home|bibel|\bbible\b|formal[_ ]deed|geïllustreerd|geillustreerd|\bkapaku\b|\bafsb\b|signboard|wayside[_ ]shrine|taught[_ ]here|\bimitator\b|imitation[_ ]of|zhizn|[' ’]s[_ ]palette|[' ’]s[_ ]bibel|[' ’]s[_ ]pipe|'s[_ ]house|'s[_ ]room|\.pdf|\.svg|\.djvu|\.ogv|\.webm|\.ogg|\.mp3|\.mp4)/i;
var MAP_TITLE_RE = /(\bmap[_ ]of|^map[_ ]|[_ ]map[_ ]\w|world[_ ]map|plan[_ ]de[_ ])/i;
var IMAGE_EXT_RE = /\.(jpe?g|png|tiff?|webp)$/i;

function passesArtworkFilter(fileTitle, metadata, artistName, strict) {
  if (!fileTitle) return false;
  if (!IMAGE_EXT_RE.test(fileTitle)) return false;
  if (NOISE_TITLE_RE.test(fileTitle)) return false;
  if (MAP_TITLE_RE.test(fileTitle)) return false;

  if (strict && artistName) {
    var artistLower = String(artistName).toLowerCase();
    var tokens = artistLower.split(/[\s,.-]+/).filter(function(t) { return t.length >= 4; });
    if (!tokens.length) return true;
    var titleLower = fileTitle.toLowerCase();
    if (tokens.some(function(tok) { return titleLower.indexOf(tok) !== -1; })) return true;
    var meta = metadata || {};
    var artistMeta = (meta.Artist && meta.Artist.value) || "";
    var objectName = (meta.ObjectName && meta.ObjectName.value) || "";
    var credit = (meta.Credit && meta.Credit.value) || "";
    var combined = (artistMeta + " " + objectName + " " + credit).toLowerCase().replace(/<[^>]+>/g, "");
    return tokens.some(function(tok) { return combined.indexOf(tok) !== -1; });
  }
  return true;
}

async function fetchCommonsCategory(categoryName, limit, artistName) {
  try {
    var cat = String(categoryName).replace(/^Category:/i, "");
    var url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&list=categorymembers&cmtype=file&cmlimit=" + (limit || 40) + "&cmtitle=Category:" + encodeURIComponent(cat.replace(/ /g, "_"));
    var r = await ctx.fetch(url);
    var d = r && (r.data || r);
    var members = (d && d.query && d.query.categorymembers) || [];
    var files = members.filter(function(m) { return /^File:/.test(String(m.title || "")); });
    if (!files.length) return [];
    var batches = [];
    for (var i = 0; i < files.length; i += 30) batches.push(files.slice(i, i + 30));
    var results = [];
    for (var bi = 0; bi < batches.length; bi++) {
      var titles = batches[bi].map(function(f) { return f.title; }).join("|");
      var iiUrl = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=" + encodeURIComponent(titles);
      var iiRes = await ctx.fetch(iiUrl);
      var iiData = iiRes && (iiRes.data || iiRes);
      var pages = (iiData && iiData.query && iiData.query.pages) || {};
      Object.keys(pages).forEach(function(k) {
        var pg = pages[k];
        var info = pg.imageinfo && pg.imageinfo[0];
        if (info && info.thumburl) {
          var meta = info.extmetadata || {};
          if (!passesArtworkFilter(pg.title, meta, artistName, true)) return;
          results.push({
            title: String(pg.title || "").replace(/^File:/, "").replace(/\.\w+$/, "").replace(/_/g, " "),
            imageUrl: info.thumburl,
            fullUrl: info.url,
            sourceUrl: info.descriptionurl || "",
            caption: (meta.ImageDescription && meta.ImageDescription.value || "").replace(/<[^>]+>/g, "").slice(0, 300),
            year: (meta.DateTimeOriginal && meta.DateTimeOriginal.value || "").slice(0, 4) || null,
            source: "wikimedia-commons",
          });
        }
      });
    }
    return results;
  } catch (e) { ctx.log("Commons cat failed: " + (e.message || e)); return []; }
}

async function fetchCommonsSearch(query, limit, artistName) {
  try {
    var url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=" + (limit || 30) + "&srsearch=" + encodeURIComponent(query);
    var r = await ctx.fetch(url);
    var d = r && (r.data || r);
    var hits = (d && d.query && d.query.search) || [];
    var titles = hits.map(function(h) { return h.title; }).filter(function(t) { return /^File:.*\.(jpe?g|png|tif|tiff|webp)$/i.test(t); });
    if (!titles.length) return [];
    var iiUrl = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&titles=" + encodeURIComponent(titles.join("|"));
    var iiRes = await ctx.fetch(iiUrl);
    var iiData = iiRes && (iiRes.data || iiRes);
    var pages = (iiData && iiData.query && iiData.query.pages) || {};
    var results = [];
    Object.keys(pages).forEach(function(k) {
      var pg = pages[k];
      var info = pg.imageinfo && pg.imageinfo[0];
      if (info && info.thumburl) {
        var meta = info.extmetadata || {};
        if (!passesArtworkFilter(pg.title, meta, artistName, true)) return;
        results.push({
          title: String(pg.title || "").replace(/^File:/, "").replace(/\.\w+$/, "").replace(/_/g, " "),
          imageUrl: info.thumburl,
          fullUrl: info.url,
          sourceUrl: info.descriptionurl || "",
          caption: (meta.ImageDescription && meta.ImageDescription.value || "").replace(/<[^>]+>/g, "").slice(0, 300),
          year: (meta.DateTimeOriginal && meta.DateTimeOriginal.value || "").slice(0, 4) || null,
          source: "wikimedia-search",
        });
      }
    });
    return results;
  } catch (e) { ctx.log("Commons search failed: " + (e.message || e)); return []; }
}

async function fetchMET(artistName) {
  try {
    var searchUrl = "https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&artistOrCulture=true&q=" + encodeURIComponent(artistName);
    var r = await ctx.fetch(searchUrl);
    var d = r && (r.data || r);
    var ids = (d && d.objectIDs) || [];
    if (!ids.length) return [];
    var results = await Promise.all(ids.slice(0, 40).map(async function(id) {
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
          source: "met",
        };
      } catch (e) { return null; }
    }));
    return results.filter(Boolean);
  } catch (e) { ctx.log("MET failed: " + (e.message || e)); return []; }
}

async function fetchSmithsonian(artistName) {
  try {
    var r = await ctx.fetch("https://api.si.edu/openaccess/api/v1.0/category/art_design/search?q=" + encodeURIComponent(artistName) + "&rows=30");
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

async function fetchEuropeana(artistName) {
  try {
    var url = "https://api.europeana.eu/record/v2/search.json?wskey=api2demo&query=" + encodeURIComponent('who:"' + artistName + '"') + "&qf=TYPE:IMAGE&rows=40&profile=standard";
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

// Cleveland Museum of Art Open Access — no key needed, no CF protection, images
// are directly embeddable. Rich catalog of classical + modern art + photography.
async function fetchCleveland(artistName) {
  try {
    var q = encodeURIComponent(artistName);
    var url = "https://openaccess-api.clevelandart.org/api/artworks/?artists=" + q + "&has_image=1&limit=40";
    var r = await ctx.fetch(url);
    var d = r && (r.data || r);
    var data = (d && d.data) || [];
    return data.map(function(o) {
      var img = o.images && (o.images.web || o.images.print || o.images.full);
      if (!img || !img.url) return null;
      return {
        title: o.title || "(untitled)",
        year: o.creation_date || null,
        imageUrl: img.url,
        fullUrl: (o.images.print && o.images.print.url) || img.url,
        sourceUrl: o.url || "",
        caption: (o.creators && o.creators[0] && o.creators[0].description) || (o.technique || ""),
        source: "cleveland-museum",
      };
    }).filter(Boolean);
  } catch (e) { ctx.log("Cleveland Museum failed: " + (e.message || e)); return []; }
}

// ─── Wikipedia per-plate enrichment ─────────────────────────────────────────
// For existing plates (LLM-named works) that lack imageUrl, look them up on
// Wikipedia. Many famous copyrighted artworks (Kahlo paintings, Arbus photos,
// Picasso works) have dedicated Wikipedia articles hosting fair-use thumbnails
// under en.wikipedia.org/wiki/en/ — embeddable like any other image URL.

async function fetchWikiSummary(plateTitle) {
  if (!plateTitle) return null;
  try {
    var wTitle = encodeURIComponent(String(plateTitle).replace(/ /g, "_"));
    var r = await ctx.fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + wTitle);
    var d = r && (r.data || r);
    if (d && d.extract && d.type !== "disambiguation") {
      var img = (d.originalimage && d.originalimage.source) || (d.thumbnail && d.thumbnail.source) || "";
      return { extract: d.extract, imageUrl: img, pageUrl: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || "" };
    }
  } catch (e) {}
  return null;
}

async function searchWikiTitle(query) {
  try {
    var r = await ctx.fetch("https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&search=" + encodeURIComponent(query));
    var d = r && (r.data || r);
    if (Array.isArray(d) && Array.isArray(d[1]) && d[1][0]) return d[1][0];
  } catch (e) {}
  return null;
}

function extractMentionsArtist(extract, artistName) {
  if (!extract || !artistName) return false;
  var low = String(extract).toLowerCase();
  var tokens = String(artistName).split(/\s+/).filter(function(s) { return s.length >= 3 && /^[A-Za-z]/.test(s); });
  for (var i = 0; i < tokens.length; i++) {
    if (low.indexOf(tokens[i].toLowerCase()) >= 0) return true;
  }
  return false;
}

async function enrichPlateFromWiki(plate, artistName) {
  if (plate.imageUrl) return { plate: plate, enriched: false };
  var baseTitle = String(plate.title || "").trim();
  if (!baseTitle) return { plate: plate, enriched: false };
  // Untitled plates never resolve — skip
  if (/^untitled/i.test(baseTitle)) return { plate: plate, enriched: false };

  // Build title variants to try. LLM often emits descriptive suffixes (", New
  // York City, 1967") that don't match Wikipedia's canonical title — strip
  // progressively from the right to widen the match surface.
  var tries = [];
  tries.push(baseTitle + " (" + artistName + ")");
  tries.push(baseTitle + " (painting)");
  tries.push(baseTitle + " (photograph)");
  tries.push(baseTitle);
  // Strip trailing parentheticals: "Roots (The Bed)" → "Roots"
  var noParen = baseTitle.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  if (noParen && noParen !== baseTitle) tries.push(noParen);
  // Truncate at first comma: "Child with Toy Hand Grenade in Central Park, New York City" → "Child with Toy Hand Grenade in Central Park"
  var commaIdx = baseTitle.indexOf(",");
  if (commaIdx > 10) tries.push(baseTitle.slice(0, commaIdx).trim());
  // Strip trailing year: "A Jewish Giant ..., 1970" already covered by comma strip, but handle " 1970" too
  var noYear = baseTitle.replace(/[,\s]+\d{4}$/, "").trim();
  if (noYear && noYear !== baseTitle && !tries.includes(noYear)) tries.push(noYear);
  for (var i = 0; i < tries.length; i++) {
    var res = await fetchWikiSummary(tries[i]);
    if (res && res.imageUrl && extractMentionsArtist(res.extract, artistName)) {
      plate.imageUrl = res.imageUrl;
      plate.imageSource = "wikipedia";
      plate.imageSourceUrl = res.pageUrl;
      return { plate: plate, enriched: true };
    }
  }
  // OpenSearch fallback — resolve to closest Wikipedia title then validate
  try {
    var guess = await searchWikiTitle(baseTitle + " " + artistName);
    if (guess) {
      var res2 = await fetchWikiSummary(guess);
      if (res2 && res2.imageUrl && extractMentionsArtist(res2.extract, artistName)) {
        plate.imageUrl = res2.imageUrl;
        plate.imageSource = "wikipedia";
        plate.imageSourceUrl = res2.pageUrl;
        return { plate: plate, enriched: true };
      }
    }
  } catch (e) {}
  return { plate: plate, enriched: false };
}

async function enrichExistingPlates(plates, artistName) {
  var gap = plates.filter(function(p) { return !p.imageUrl; });
  if (!gap.length) return 0;
  ctx.log("Wikipedia enrich: attempting " + gap.length + " missing-image plates");
  var results = await Promise.allSettled(gap.map(function(p) { return enrichPlateFromWiki(p, artistName); }));
  var enrichedCount = 0;
  results.forEach(function(r) { if (r.status === "fulfilled" && r.value.enriched) enrichedCount++; });
  ctx.log("Wikipedia enrich: filled " + enrichedCount + "/" + gap.length + " plates");
  return enrichedCount;
}

// ─── Run exhaustive pull ────────────────────────────────────────────────────

async function run() {
  // First pass: fill in any existing missing-image plates via Wikipedia fair-use
  // per-artwork lookups. This is the last-mile enrichment for LLM-named works
  // (e.g., "The Two Fridas", "Sunflowers", "Identical Twins") that have dedicated
  // Wikipedia pages with fair-use thumbnails.
  var wikiEnrichedCount = 0;
  try {
    wikiEnrichedCount = await enrichExistingPlates(album.plates || [], artist);
  } catch (e) { ctx.log("Wikipedia enrich failed: " + (e.message || e)); }

  var calls = [];
  // Artist-centric (category-curated — loose filter, since category pages pre-filter)
  calls.push(fetchCommonsCategory("Photographs by " + artist, 50, artist));
  calls.push(fetchCommonsCategory("Paintings by " + artist, 50, artist));
  calls.push(fetchCommonsCategory("Works by " + artist, 50, artist));
  calls.push(fetchCommonsCategory(artist, 50, artist));
  // Album / body of work
  if (title) {
    calls.push(fetchCommonsCategory(title, 50, artist));
    calls.push(fetchCommonsCategory("Illustrations from " + title, 30, artist));
  }
  // Free-text searches (strict filter — requires artist name in title or metadata)
  calls.push(fetchCommonsSearch(artist, 40, artist)); // broad artist-only search — important for niche artists
  calls.push(fetchCommonsSearch(artist + (title ? " " + title : ""), 40, artist));
  if (title) calls.push(fetchCommonsSearch(title, 30, artist));
  for (var ti = 0; ti < Math.min(themes.length, 5); ti++) {
    calls.push(fetchCommonsSearch(artist + " " + String(themes[ti]).replace(/-/g, " "), 15, artist));
  }
  // Museum APIs
  calls.push(fetchMET(artist));
  calls.push(fetchSmithsonian(artist));
  calls.push(fetchEuropeana(artist));
  calls.push(fetchCleveland(artist));

  var settled = await Promise.allSettled(calls);
  var bySource = {};
  var combined = [];
  for (var si = 0; si < settled.length; si++) {
    if (settled[si].status === "fulfilled" && Array.isArray(settled[si].value)) {
      var batch = settled[si].value;
      batch.forEach(function(item) {
        bySource[item.source] = (bySource[item.source] || 0) + 1;
      });
      combined = combined.concat(batch);
    }
  }

  ctx.log("Expand pool raw: " + combined.length + " items across " + Object.keys(bySource).length + " sources");

  // Dedupe by imageUrl (normalized — strip trailing thumb size variants)
  function normUrl(u) {
    return String(u || "").split("?")[0].replace(/\/\d+px-[^/]+$/, "/");
  }
  var seen = {};
  var deduped = [];
  for (var i = 0; i < combined.length; i++) {
    var item = combined[i];
    if (!item.imageUrl) continue;
    var key = normUrl(item.imageUrl);
    if (seen[key]) continue;
    seen[key] = true;
    deduped.push(item);
  }

  // Quality score: prefer museum sources (better metadata), items with captions,
  // items with a year.
  function score(item) {
    var s = 0;
    if (item.source === "met" || item.source === "cleveland-museum") s += 3;
    if (item.source === "smithsonian" || item.source === "europeana") s += 2;
    if (item.source === "wikimedia-commons") s += 1;
    if (item.caption && item.caption.length > 20) s += 1;
    if (item.year) s += 1;
    return s;
  }
  deduped.sort(function(a, b) { return score(b) - score(a); });

  // Filter out items already in the album (dedupe against existing plate imageUrls).
  var existingUrls = {};
  (album.plates || []).forEach(function(p) {
    if (p.imageUrl) existingUrls[normUrl(p.imageUrl)] = true;
  });
  var newItems = deduped.filter(function(item) { return !existingUrls[normUrl(item.imageUrl)]; });

  // Cap total (existing + new) at capTotal.
  var existingCount = (album.plates || []).length;
  var room = Math.max(0, capTotal - existingCount);
  var toAdd = newItems.slice(0, room);

  // Convert to plate shape and append.
  var newPlates = toAdd.map(function(item) {
    return {
      title: item.title,
      year: item.year,
      caption: item.caption || "",
      imageUrl: item.imageUrl,
      imageSource: item.source,
      imageSourceUrl: item.sourceUrl,
      fullUrl: item.fullUrl,
    };
  });
  album.plates = (album.plates || []).concat(newPlates);
  album.plateCount = album.plates.length;
  album.updatedAt = new Date().toISOString();
  album.archiveSources = Object.assign({}, album.archiveSources || {}, bySource);
  album.lastExpandAt = new Date().toISOString();
  album.lastExpandAdded = newPlates.length;

  // Save cache — locked read-modify-write so concurrent ops don't overwrite other albums.
  try {
    await withCacheLock(cachePath, async function() {
      var fresh = { albums: [] };
      try { fresh = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch (e) {}
      if (!Array.isArray(fresh.albums)) fresh.albums = [];
      var idx = fresh.albums.findIndex(function(a) { return a.entityId === album.entityId; });
      if (idx >= 0) fresh.albums[idx] = album; else fresh.albums.push(album);
      fresh.updatedAt = album.updatedAt;
      fs.writeFileSync(cachePath, JSON.stringify(fresh, null, 2), "utf-8");
    });
  } catch (e) { ctx.log("Cache write failed: " + (e.message || e)); }

  // Regenerate Cortex page with the new plates.
  var slug = album.slug;
  var wikiDir = path.join(os.homedir(), ".enso", "wiki", "entities");
  try { if (!fs.existsSync(wikiDir)) fs.mkdirSync(wikiDir, { recursive: true }); } catch (e) {}
  var wikiPath = path.join(wikiDir, "album-" + slug + ".md");
  var md = ["# " + album.title + "\n"];
  md.push("By **" + (album.photographer || "Unknown") + "**." + (album.yearPublished ? " Published " + album.yearPublished : "") + (album.publisher ? " by " + album.publisher : "") + ".\n");
  if (album.description) md.push(album.description + "\n");
  if (album.coverUrl) md.push("![cover](" + album.coverUrl + ")\n");
  md.push("## Details");
  md.push("- **Kind**: Artist album (external)");
  md.push("- **Artist**: [[" + slugify(album.photographer) + "]]");
  if (album.medium) md.push("- **Medium**: " + album.medium);
  if (album.yearPublished) md.push("- **Year**: " + album.yearPublished);
  if (album.publisher) md.push("- **Publisher**: " + album.publisher);
  if (album.style) md.push("- **Style**: " + album.style);
  if (album.plateCount) md.push("- **Works**: " + album.plateCount);
  if (album.sourceUrl) md.push("- **Source**: [" + album.sourceUrl + "](" + album.sourceUrl + ")");
  if (Array.isArray(album.themes) && album.themes.length) {
    md.push("\n## Themes");
    for (var ti2 = 0; ti2 < album.themes.length; ti2++) md.push("- [[" + slugify(album.themes[ti2]) + "]]");
  }
  if (Array.isArray(album.plates) && album.plates.length) {
    md.push("\n## Works (" + album.plates.length + ")");
    for (var pi = 0; pi < album.plates.length; pi++) {
      var pl = album.plates[pi];
      var line = "- **" + (pl.title || "(untitled)") + "**";
      if (pl.year) line += " (" + pl.year + ")";
      if (pl.caption) line += " — " + String(pl.caption).slice(0, 200);
      if (pl.imageSource) line += " [" + pl.imageSource + "]";
      md.push(line);
      if (pl.imageUrl) md.push("  ![" + (pl.title || "work") + "](" + pl.imageUrl + ")");
    }
  }
  if (album.photographerBio) {
    md.push("\n## Artist");
    md.push(album.photographerBio);
  }
  try { fs.writeFileSync(wikiPath, md.join("\n"), "utf-8"); } catch (e) { ctx.log("Cortex page write failed: " + (e.message || e)); }

  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_photo_albums_expand",
    success: true,
    entityId: entityId,
    albumTitle: album.title,
    addedCount: newPlates.length,
    totalPlates: album.plates.length,
    capTotal: capTotal,
    rawPoolSize: combined.length,
    dedupedPoolSize: deduped.length,
    bySource: bySource,
    wikiEnrichedCount: wikiEnrichedCount,
    message: "Expanded '" + album.title + "' with " + newPlates.length + " new works (" + album.plates.length + "/" + capTotal + " total)" + (wikiEnrichedCount ? " + " + wikiEnrichedCount + " seed plates filled via Wikipedia" : "") + ". Sources: " + Object.keys(bySource).map(function(k) { return k + " (" + bySource[k] + ")"; }).join(", "),
  }) }] };
}

return run();
