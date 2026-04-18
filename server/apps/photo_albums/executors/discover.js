// Daily Photo Album Discovery — day-of-week themes. Pulls candidates from
// Wikipedia + Open Library + web search; LLM curates against taste profile.
// Cached per day.
var os = require("os");
var fs = require("fs");
var path = require("path");

var p = params || {};
var today = new Date();
var dateStr = p.date || today.toISOString().slice(0, 10);
var forceRefresh = p.refresh === true;

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}
var discoveryCachePath = path.join(cacheDir, "photo-album-discovery-" + dateStr + ".json");
var albumsCachePath = path.join(cacheDir, "photo-albums.json");

// ── Cache hit ──
if (!forceRefresh) {
  try {
    if (fs.existsSync(discoveryCachePath)) {
      var cached = JSON.parse(fs.readFileSync(discoveryCachePath, "utf-8"));
      cached.fromCache = true;
      return { content: [{ type: "text", text: JSON.stringify(cached) }] };
    }
  } catch (e) { ctx.log("Cache read error: " + (e.message || e)); }
}

// ── Theme calendar ──
var THEMES = [
  { key: "photojournalism", name: "Photojournalism", icon: "\u{1F4F0}", dayLabel: "Sunday", subjects: ["photojournalism", "documentary photography"], searchTerms: "iconic photojournalism photographer famous book" },
  { key: "documentary",    name: "Documentary",     icon: "\u{1F50D}", dayLabel: "Monday", subjects: ["documentary photography", "social documentary"], searchTerms: "documentary photographer monograph essential reading" },
  { key: "portrait",       name: "Portrait",        icon: "\u{1F464}", dayLabel: "Tuesday", subjects: ["portrait photography"], searchTerms: "master portrait photographer iconic book" },
  { key: "street",         name: "Street Photography", icon: "\u{1F6B6}", dayLabel: "Wednesday", subjects: ["street photography"], searchTerms: "legendary street photographer best book" },
  { key: "fine-art",       name: "Fine Art",        icon: "\u{1F3A8}", dayLabel: "Thursday", subjects: ["fine art photography", "art photography"], searchTerms: "fine art photographer monograph museum collection" },
  { key: "fashion",        name: "Fashion",         icon: "\u{1F484}", dayLabel: "Friday", subjects: ["fashion photography"], searchTerms: "legendary fashion photographer iconic book" },
  { key: "landscape",      name: "Landscape",       icon: "\u{1F30B}", dayLabel: "Saturday", subjects: ["landscape photography", "nature photography"], searchTerms: "master landscape photographer famous book" },
];

var dateObj = new Date(dateStr + "T12:00:00Z");
var dayOfWeek = dateObj.getUTCDay();
var theme = THEMES[dayOfWeek];
if (p.theme) {
  var custom = THEMES.find(function(t) { return t.key === String(p.theme).toLowerCase(); });
  if (custom) theme = custom;
}

ctx.log("Discovering " + theme.name + " photographers for " + dateStr);

// ── Source 1: Open Library — subject search for photography monographs ──
async function fetchOpenLibrary() {
  var results = [];
  for (var s = 0; s < theme.subjects.length; s++) {
    try {
      var subj = encodeURIComponent(theme.subjects[s].replace(/ /g, "_"));
      var url = "https://openlibrary.org/subjects/" + subj + ".json?limit=20";
      var res = await ctx.fetch(url);
      var data = res && (res.data || res);
      var works = (data && data.works) || [];
      for (var i = 0; i < works.length; i++) {
        var w = works[i];
        var coverUrl = w.cover_id ? "https://covers.openlibrary.org/b/id/" + w.cover_id + "-L.jpg" : "";
        var authors = (w.authors || []).map(function(a) { return a.name; });
        if (!authors.length) continue;
        results.push({
          title: w.title || "",
          photographer: authors[0],
          coverUrl: coverUrl,
          firstPublishYear: w.first_publish_year || 0,
          subjects: (w.subject || []).slice(0, 5),
          source: "openlibrary",
          sourceUrl: w.key ? "https://openlibrary.org" + w.key : "",
        });
      }
    } catch (e) { ctx.log("Open Library error: " + (e.message || e)); }
  }
  return results;
}

// ── Source 2: Wikipedia category — famous photographers by style ──
async function fetchWikipediaPhotographers() {
  var results = [];
  // Use Wikipedia OpenSearch for photographer names by theme
  try {
    var q = encodeURIComponent("List of " + theme.name.toLowerCase() + " photographers");
    var listRes = await ctx.fetch("https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=5&search=" + q);
    var listData = listRes && (listRes.data || listRes);
    // Also fetch a curated seed list via search
    var searchRes = await ctx.fetch("https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=" + encodeURIComponent("famous " + theme.name + " photographer") + "&srlimit=15");
    var searchData = searchRes && (searchRes.data || searchRes);
    var hits = (searchData && searchData.query && searchData.query.search) || [];
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      results.push({
        title: h.title,
        snippet: (h.snippet || "").replace(/<[^>]+>/g, "").slice(0, 300),
        source: "wikipedia",
        sourceUrl: "https://en.wikipedia.org/wiki/" + encodeURIComponent(h.title.replace(/ /g, "_")),
      });
    }
  } catch (e) { ctx.log("Wikipedia error: " + (e.message || e)); }
  return results;
}

// ── Source 3: Web search (Brave) ──
async function fetchWebSearch() {
  try {
    var res = await ctx.search(theme.searchTerms, { count: 10 });
    if (res && Array.isArray(res.results)) {
      return res.results.map(function(r) {
        return {
          title: r.title || "",
          snippet: (r.description || r.snippet || "").slice(0, 300),
          source: "web",
          sourceUrl: r.url || "",
        };
      });
    }
  } catch (e) { ctx.log("Web search failed: " + (e.message || e)); }
  return [];
}

var settled = await Promise.allSettled([fetchOpenLibrary(), fetchWikipediaPhotographers(), fetchWebSearch()]);
var olCandidates = settled[0].status === "fulfilled" ? settled[0].value : [];
var wikiCandidates = settled[1].status === "fulfilled" ? settled[1].value : [];
var webCandidates = settled[2].status === "fulfilled" ? settled[2].value : [];

ctx.log("Candidates — OL: " + olCandidates.length + ", Wiki: " + wikiCandidates.length + ", Web: " + webCandidates.length);

// ── Load taste profile + existing library ──
var library = { albums: [], tasteProfile: { interactionCount: 0 } };
try { library = JSON.parse(fs.readFileSync(albumsCachePath, "utf-8")); } catch (e) {}
if (!library.tasteProfile) library.tasteProfile = { interactionCount: 0 };
var tp = library.tasteProfile;
var existingPhotographers = {};
(library.albums || []).forEach(function(a) { if (a.photographer) existingPhotographers[a.photographer.toLowerCase()] = true; });

// ── Build candidate list for LLM ──
var allCandidates = [];
for (var i = 0; i < olCandidates.length && i < 15; i++) {
  allCandidates.push({
    idx: allCandidates.length,
    type: "monograph",
    title: olCandidates[i].title,
    photographer: olCandidates[i].photographer,
    year: olCandidates[i].firstPublishYear || null,
    coverUrl: olCandidates[i].coverUrl,
    source: olCandidates[i].source,
    sourceUrl: olCandidates[i].sourceUrl,
    subjects: olCandidates[i].subjects || [],
    alreadyInLibrary: existingPhotographers[(olCandidates[i].photographer || "").toLowerCase()] || false,
  });
}
for (var j = 0; j < wikiCandidates.length && j < 10; j++) {
  allCandidates.push({
    idx: allCandidates.length,
    type: "photographer-page",
    title: wikiCandidates[j].title,
    snippet: wikiCandidates[j].snippet,
    source: wikiCandidates[j].source,
    sourceUrl: wikiCandidates[j].sourceUrl,
  });
}
for (var k = 0; k < webCandidates.length && k < 10; k++) {
  allCandidates.push({
    idx: allCandidates.length,
    type: "web-article",
    title: webCandidates[k].title,
    snippet: webCandidates[k].snippet,
    source: webCandidates[k].source,
    sourceUrl: webCandidates[k].sourceUrl,
  });
}

if (allCandidates.length === 0) {
  var emptyResult = {
    tool: "enso_photo_albums_discover",
    date: dateStr,
    theme: theme,
    generatedAt: new Date().toISOString(),
    error: "No candidates found — check network + Brave Search API key.",
    albumOfTheDay: null,
    themePicks: [],
    masterPhotographers: [],
    emergingVoices: [],
  };
  return { content: [{ type: "text", text: JSON.stringify(emptyResult) }] };
}

// ── LLM curation ──
var topPhotographers = Object.entries(tp.photographerAffinities || {}).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5).map(function(e) { return e[0]; });
var topStyles = Object.entries(tp.styleWeights || {}).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3).map(function(e) { return e[0]; });
var topThemes = Object.entries(tp.themeWeights || {}).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5).map(function(e) { return e[0]; });

var prompt = "You are a photography curator building today's photo album discovery board.\n\n";
prompt += "Today's theme: " + theme.name + " " + theme.icon + "\n";
if (topPhotographers.length > 0 || topStyles.length > 0) {
  prompt += "\nUser taste profile:\n";
  if (topPhotographers.length > 0) prompt += "- Photographers they love: " + topPhotographers.join(", ") + "\n";
  if (topStyles.length > 0) prompt += "- Preferred styles: " + topStyles.join(", ") + "\n";
  if (topThemes.length > 0) prompt += "- Recurring themes: " + topThemes.join(", ") + "\n";
} else {
  prompt += "\n(New user — no taste profile yet. Favor canonical, highly-influential photographers.)\n";
}

prompt += "\nCandidate pool (" + allCandidates.length + " items):\n" + JSON.stringify(allCandidates, null, 1) + "\n\n";
prompt += "Return ONLY valid JSON (no markdown fence, no commentary):\n";
prompt += "{\n";
prompt += '  "albumOfTheDay": { "photographer": "<name>", "title": "<album title>", "year": <year or null>, "whyThisAlbum": "<2-3 sentences on why this is THE pick for " + theme.name + ">", "style": "' + theme.key + '", "themes": ["<3-5 lowercase tags>"], "coverCandidate": "<URL from candidates or empty>", "sourceUrl": "<URL>" },\n';
prompt += '  "themePicks": [ { "photographer": "<name>", "title": "<album title>", "year": <year or null>, "oneLinePitch": "<1 sentence>", "coverCandidate": "<URL or empty>", "sourceUrl": "<URL>" } ],\n';
prompt += '  "masterPhotographers": [ { "name": "<name>", "knownFor": "<brief>", "era": "<e.g., 1930s-1970s>", "iconicWork": "<title>", "sourceUrl": "<URL>" } ],\n';
prompt += '  "emergingVoices": [ { "name": "<contemporary photographer name>", "knownFor": "<brief>", "whyFresh": "<why they matter today>", "sourceUrl": "<URL>" } ]\n';
prompt += "}\n\n";
prompt += "Rules:\n";
prompt += "- albumOfTheDay: the single most iconic match for " + theme.name + ". Prefer photographers NOT already in the user's library (flag alreadyInLibrary in candidates).\n";
prompt += "- themePicks: 3-5 diverse albums in the theme. Do NOT repeat albumOfTheDay.\n";
prompt += "- masterPhotographers: 3-4 historically important figures in this style.\n";
prompt += "- emergingVoices: 2-3 contemporary photographers to watch.\n";
prompt += "- Use REAL album/book titles — check the Open Library candidates for publisher-verified titles.\n";
prompt += "- Use REAL photographer names — don't invent. If unsure, omit rather than hallucinate.\n";

var curation = null;
try {
  var llm = await ctx.ask(prompt, { temperature: 0.6 });
  if (llm && llm.ok && llm.text) {
    var txt = String(llm.text).trim();
    if (txt.indexOf("```") >= 0) txt = txt.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    curation = JSON.parse(txt);
  }
} catch (e) { ctx.log("LLM curation error: " + (e.message || e)); }

var result = {
  tool: "enso_photo_albums_discover",
  date: dateStr,
  theme: theme,
  generatedAt: new Date().toISOString(),
  candidateCounts: { openLibrary: olCandidates.length, wikipedia: wikiCandidates.length, web: webCandidates.length },
  albumOfTheDay: null,
  themePicks: [],
  masterPhotographers: [],
  emergingVoices: [],
  tasteProfile: {
    interactionCount: tp.interactionCount || 0,
    topPhotographers: topPhotographers,
    topStyles: topStyles,
    topThemes: topThemes,
  },
};

if (curation) {
  result.albumOfTheDay = curation.albumOfTheDay || null;
  result.themePicks = Array.isArray(curation.themePicks) ? curation.themePicks : [];
  result.masterPhotographers = Array.isArray(curation.masterPhotographers) ? curation.masterPhotographers : [];
  result.emergingVoices = Array.isArray(curation.emergingVoices) ? curation.emergingVoices : [];
} else {
  // Fallback: use the richest Open Library candidate
  var rich = olCandidates.filter(function(c) { return c.coverUrl && c.photographer; }).slice(0, 6);
  if (rich.length > 0) {
    var first = rich[0];
    result.albumOfTheDay = {
      photographer: first.photographer,
      title: first.title,
      year: first.firstPublishYear || null,
      whyThisAlbum: "A canonical monograph in the " + theme.name.toLowerCase() + " tradition.",
      style: theme.key,
      themes: theme.subjects,
      coverCandidate: first.coverUrl,
      sourceUrl: first.sourceUrl,
    };
    result.themePicks = rich.slice(1, 5).map(function(c) {
      return {
        photographer: c.photographer,
        title: c.title,
        year: c.firstPublishYear || null,
        oneLinePitch: (c.subjects || []).slice(0, 2).join(", ") || theme.name,
        coverCandidate: c.coverUrl,
        sourceUrl: c.sourceUrl,
      };
    });
  }
  result.fallback = true;
}

try { fs.writeFileSync(discoveryCachePath, JSON.stringify(result, null, 2), "utf-8"); } catch (e) { ctx.log("Cache write failed: " + (e.message || e)); }

return { content: [{ type: "text", text: JSON.stringify(result) }] };
