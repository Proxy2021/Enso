// Travel — Add Place: search for destinations
var p = params || {};
var query = p.query || "";

if (!query) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_travel_add", error: "Please provide a place or destination name.", results: [] }) }] };
}

function stripHtml(s) {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();
}

function cleanTitle(raw, query) {
  var clean = raw
    .replace(/ - .*$/, "").replace(/ \| .*$/, "").trim()
    .replace(/\s*[:：]\s*Travel Guide.*$/i, "")
    .replace(/\s*Travel Guide\s*(Resources\s*(&|and)\s*Trip\s*Planning\s*Info\s*)?.*$/i, "")
    .replace(/\s*Travel Guide\s*(&|and)\s*Tips\s*$/i, "")
    .replace(/\s*Travel Guide$/i, "")
    .replace(/\s*City Guide$/i, "")
    .replace(/\s*Visitor('s)?\s*Guide$/i, "")
    .replace(/\s*Tourism\s*(Guide|Info(rmation)?|Board|Website|Portal)$/i, "")
    .replace(/\s*travel\s*$/i, "")
    .replace(/^(Best|Top|Ultimate|Visit|Explore|Discover)\s+(Things to Do|Places to Visit|Guide to|Attractions|in|to)\s*/i, "")
    .replace(/^Visit\s+/i, "")
    .replace(/\s*\d{4}(\s*[-–]\s*\d{4})?\s*$/i, "")
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/^Things to Do in\s+/i, "")
    .replace(/^Guide to\s+/i, "")
    .replace(/\s+by\s+.*$/i, "")
    .replace(/^(A |An |The )(Complete|Essential|Ultimate|Best|Perfect)\s+.*(Guide|Weekend|Trip|Visit).*$/i, "")
    .trim();
  if (!clean || clean.length < 3) clean = query;
  return clean;
}

ctx.log("Searching for destination: " + query);

var results = [];
try {
  var searchResult = await ctx.search(query + " travel guide destination", { count: 8 });
  if (searchResult && searchResult.results) {
    var seen = {};
    results = searchResult.results.map(function(r) {
      var title = cleanTitle(r.title, query);
      var key = title.toLowerCase();
      if (seen[key]) return null;
      seen[key] = true;
      return {
        title: title,
        url: r.url,
        description: stripHtml((r.description || "").slice(0, 300)),
        source: r.url ? r.url.replace(/https?:\/\/(www\.)?/, "").split("/")[0] : "",
      };
    }).filter(function(r) { return r && r.title; });
  }
} catch (e) {
  ctx.log("Search error: " + (e.message || e));
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_travel_add",
  query: query,
  locationName: query,
  totalResults: results.length,
  results: results.slice(0, 6),
}) }] };
