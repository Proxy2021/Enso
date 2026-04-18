// Create a personal themed album from the user's photos.
// Accepts photoEntityIds (from photos:photo:* index) and/or photoPaths (raw file paths).
var os = require("os");
var fs = require("fs");
var path = require("path");

var p = params || {};
var title = String(p.title || "").trim();
if (!title) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_photo_albums_curate_personal",
    error: "title is required.",
  }) }] };
}

var theme = String(p.theme || "").trim();
var description = String(p.description || "").trim();
var photoEntityIds = Array.isArray(p.photoEntityIds) ? p.photoEntityIds : [];
var photoPaths = Array.isArray(p.photoPaths) ? p.photoPaths : [];
var coverPath = String(p.coverPath || "").trim();

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80);
}

var slug = slugify(title);
var entityId = "manual:photo-album:" + slug;

// Resolve photo entity IDs to file paths via entity index + photo-library cache
var resolvedPlates = [];
var photoLibraryCache = null;
try {
  var plPath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "photo-library.json");
  photoLibraryCache = JSON.parse(fs.readFileSync(plPath, "utf-8"));
} catch (e) {}

function findPhotoFilePath(entityIdOrPath) {
  if (!entityIdOrPath) return null;
  // If it's a file path, use directly
  if (entityIdOrPath.indexOf(":") < 0 || entityIdOrPath.indexOf("\\") >= 0 || entityIdOrPath.indexOf("/") === 0) {
    return entityIdOrPath;
  }
  // Try photo-library cache: look in album photos by a matching slug
  if (photoLibraryCache && Array.isArray(photoLibraryCache.albums)) {
    for (var i = 0; i < photoLibraryCache.albums.length; i++) {
      var alb = photoLibraryCache.albums[i];
      var photos = alb.photos || alb.photoSamples || [];
      for (var j = 0; j < photos.length; j++) {
        var ph = photos[j];
        if (ph.entityId === entityIdOrPath || ph.id === entityIdOrPath) return ph.path || ph.filePath;
      }
    }
  }
  return null;
}

photoEntityIds.forEach(function(eid) {
  var fp = findPhotoFilePath(eid);
  if (fp) resolvedPlates.push({ photoEntityId: eid, filePath: fp, title: path.basename(fp) });
  else resolvedPlates.push({ photoEntityId: eid, filePath: null, title: eid, caption: "Photo not found in local index" });
});
photoPaths.forEach(function(fp) {
  resolvedPlates.push({ filePath: fp, title: path.basename(fp) });
});

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch (e) {}
var cachePath = path.join(cacheDir, "photo-albums.json");
var cached = { albums: [] };
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch (e) {}
if (!Array.isArray(cached.albums)) cached.albums = [];

var coverUrl = coverPath || (resolvedPlates[0] && resolvedPlates[0].filePath) || "";

var nowIso = new Date().toISOString();
var albumRecord = {
  entityId: entityId,
  slug: slug,
  title: title,
  kind: "personal",
  photographer: null,
  description: description,
  themes: theme ? [theme] : [],
  style: theme || "",
  plates: resolvedPlates,
  plateCount: resolvedPlates.length,
  coverUrl: coverUrl,
  source: "manual",
  addedAt: nowIso,
  updatedAt: nowIso,
};

var existingIdx = cached.albums.findIndex(function(a) { return a.entityId === entityId || a.slug === slug; });
if (existingIdx >= 0) {
  albumRecord.addedAt = cached.albums[existingIdx].addedAt || nowIso;
  cached.albums[existingIdx] = albumRecord;
} else {
  cached.albums.push(albumRecord);
}
cached.updatedAt = nowIso;
try { fs.writeFileSync(cachePath, JSON.stringify(cached, null, 2), "utf-8"); } catch (e) { ctx.log("Cache write failed: " + (e.message || e)); }

// Write Cortex page
var wikiDir = path.join(os.homedir(), ".enso", "wiki", "entities");
try { if (!fs.existsSync(wikiDir)) fs.mkdirSync(wikiDir, { recursive: true }); } catch (e) {}
var wikiPath = path.join(wikiDir, "album-" + slug + ".md");
var md = ["# " + title + "\n"];
md.push("A personal themed album curated from your photo library." + (theme ? " Theme: **" + theme + "**." : "") + "\n");
if (description) md.push(description + "\n");
md.push("## Details");
md.push("- **Kind**: Personal themed album");
if (theme) md.push("- **Theme**: " + theme);
md.push("- **Photos**: " + resolvedPlates.length);
md.push("- **Created**: " + nowIso.slice(0, 10));
if (resolvedPlates.length) {
  md.push("\n## Photos");
  for (var i = 0; i < resolvedPlates.length; i++) {
    var pl = resolvedPlates[i];
    var line = "- " + pl.title;
    if (pl.caption) line += " — " + pl.caption;
    if (pl.filePath) line += " `" + pl.filePath + "`";
    md.push(line);
  }
}
try { fs.writeFileSync(wikiPath, md.join("\n"), "utf-8"); } catch (e) { ctx.log("Cortex page write failed: " + (e.message || e)); }

// Update wiki _index.md
try {
  var indexPath = path.join(os.homedir(), ".enso", "wiki", "_index.md");
  var indexContent = "";
  try { indexContent = fs.readFileSync(indexPath, "utf-8"); } catch (e) { indexContent = "# Wiki Index\n\n"; }
  var pageKey = "entities/album-" + slug + ".md";
  var entryBlock = "## " + pageKey + "\nTitle: " + title + "\nEntityId: " + entityId + "\nSummary: " + (description || title).slice(0, 200) + "\n";
  if (indexContent.indexOf("## " + pageKey) >= 0) {
    indexContent = indexContent.replace(new RegExp("## " + pageKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?(?=\\n## |$)", "g"), entryBlock);
  } else {
    indexContent += "\n" + entryBlock;
  }
  fs.writeFileSync(indexPath, indexContent, "utf-8");
} catch (e) { ctx.log("Wiki index update failed: " + (e.message || e)); }

// Update entity index
try {
  var eiPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
  var ei = {};
  try { ei = JSON.parse(fs.readFileSync(eiPath, "utf-8")); } catch (e) {}
  ei[entityId] = {
    entityId: entityId,
    type: "photo-album",
    source: "manual",
    title: title,
    slug: slug,
    imageUrl: coverUrl,
    cortexPath: "entities/album-" + slug + ".md",
    tags: ["photo-album", "album-personal"].concat(theme ? [theme.toLowerCase()] : []),
    updatedAt: nowIso,
  };
  fs.writeFileSync(eiPath, JSON.stringify(ei), "utf-8");
} catch (e) {}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_photo_albums_curate_personal",
  success: true,
  entityId: entityId,
  album: albumRecord,
  wikiPath: "entities/album-" + slug + ".md",
  message: "Created personal album '" + title + "' with " + resolvedPlates.length + " photo(s).",
}) }] };
