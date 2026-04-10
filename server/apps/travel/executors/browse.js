// Travel — Browse saved places from Cortex
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

function stripHtml(s) {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();
}

var places = [];
try {
  var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
  if (fs.existsSync(indexPath)) {
    var entityIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    var entries = Object.values(entityIndex);
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.type === "place") {
        var meta = e.metadata || {};
        var desc = meta.description || "";
        if (!desc && e.cortexPath) {
          try {
            var pagePath = path.join(os.homedir(), ".enso", "wiki", e.cortexPath);
            if (fs.existsSync(pagePath)) {
              var content = fs.readFileSync(pagePath, "utf-8");
              var descMatch = content.match(/## Overview\n\n([\s\S]*?)(?=\n## |\n\*Enriched)/);
              if (descMatch) desc = stripHtml(descMatch[1]).slice(0, 300);
            }
          } catch(ex) {}
        }
        places.push({
          entityId: e.entityId,
          title: e.title,
          tags: e.tags || [],
          updatedAt: e.updatedAt,
          description: desc,
          imageUrl: e.imageUrl || meta.imageUrl || "",
          country: meta.country || "",
          region: meta.region || "",
          enrichedAt: meta.enrichedAt || null,
          highlightCount: Array.isArray(meta.highlights) ? meta.highlights.length : 0,
        });
      }
    }
  }
} catch(e) {}

// Also check for photo albums with location info
try {
  var photoCachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "photo-library.json");
  if (fs.existsSync(photoCachePath)) {
    var photoData = JSON.parse(fs.readFileSync(photoCachePath, "utf-8"));
    if (photoData.albums) {
      var albumLocations = new Set();
      photoData.albums.forEach(function(album) {
        if (album.name && !albumLocations.has(album.name)) {
          // Check if album name looks like a location (contains city/country names)
          albumLocations.add(album.name);
        }
      });
    }
  }
} catch(e) {}

if (p.query) {
  var q = p.query.toLowerCase();
  places = places.filter(function(pl) {
    return pl.title.toLowerCase().indexOf(q) >= 0
      || (pl.description && pl.description.toLowerCase().indexOf(q) >= 0)
      || (pl.country && pl.country.toLowerCase().indexOf(q) >= 0)
      || (pl.region && pl.region.toLowerCase().indexOf(q) >= 0);
  });
}
if (p.region) {
  var rq = p.region.toLowerCase();
  places = places.filter(function(pl) {
    return (pl.country && pl.country.toLowerCase().indexOf(rq) >= 0) || (pl.region && pl.region.toLowerCase().indexOf(rq) >= 0);
  });
}

places.sort(function(a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_travel_browse",
  totalPlaces: places.length,
  query: p.query || null,
  places: places.slice(0, 50),
}) }] };
