// Rebuild Cortex pages and entity index from the photo-albums cache.
// Useful after manual cache edits or entity-index drift.
var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
var cachePath = path.join(cacheDir, "photo-albums.json");
var cached = { albums: [] };
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch (e) {}
if (!Array.isArray(cached.albums)) cached.albums = [];

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80);
}

var wikiDir = path.join(os.homedir(), ".enso", "wiki", "entities");
try { if (!fs.existsSync(wikiDir)) fs.mkdirSync(wikiDir, { recursive: true }); } catch (e) {}

var eiPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var ei = {};
try { ei = JSON.parse(fs.readFileSync(eiPath, "utf-8")); } catch (e) {}

var indexPath = path.join(os.homedir(), ".enso", "wiki", "_index.md");
var indexContent = "";
try { indexContent = fs.readFileSync(indexPath, "utf-8"); } catch (e) { indexContent = "# Wiki Index\n\n"; }

var pagesWritten = 0;
var indexEntriesUpdated = 0;

for (var i = 0; i < cached.albums.length; i++) {
  var a = cached.albums[i];
  if (!a.title) continue;
  var slug = a.slug || slugify(a.title);
  var kind = a.kind || "external";
  var src = a.source || (kind === "external" ? "research" : "manual");
  var entityId = a.entityId || (src + ":photo-album:" + slug);

  // Write Cortex page
  var md = ["# " + a.title + "\n"];
  if (kind === "external") {
    md.push("By **" + (a.photographer || "Unknown") + "**." + (a.yearPublished ? " Published " + a.yearPublished : "") + (a.publisher ? " by " + a.publisher : "") + ".\n");
  } else {
    md.push("A personal themed album curated from your photo library." + (a.style ? " Theme: **" + a.style + "**." : "") + "\n");
  }
  if (a.description) md.push(a.description + "\n");
  if (a.coverUrl) md.push("![cover](" + a.coverUrl + ")\n");
  md.push("## Details");
  md.push("- **Kind**: " + (kind === "external" ? "Photographer album (external)" : "Personal themed album"));
  if (a.photographer) md.push("- **Photographer**: [[" + slugify(a.photographer) + "]]");
  if (a.yearPublished) md.push("- **Year**: " + a.yearPublished);
  if (a.publisher) md.push("- **Publisher**: " + a.publisher);
  if (a.style) md.push("- **Style**: " + a.style);
  var pc = a.plateCount || (a.plates || []).length || 0;
  if (pc) md.push("- **Plates**: " + pc);
  if (a.sourceUrl) md.push("- **Source**: [" + a.sourceUrl + "](" + a.sourceUrl + ")");
  if (Array.isArray(a.themes) && a.themes.length) {
    md.push("\n## Themes");
    for (var ti = 0; ti < a.themes.length; ti++) md.push("- [[" + slugify(a.themes[ti]) + "]]");
  }
  if (Array.isArray(a.plates) && a.plates.length) {
    md.push("\n## Plates");
    for (var pi = 0; pi < a.plates.length; pi++) {
      var pl = a.plates[pi];
      var line = "- **" + (pl.title || "(untitled)") + "**";
      if (pl.year) line += " (" + pl.year + ")";
      if (pl.caption) line += " — " + pl.caption;
      md.push(line);
      if (pl.imageUrl) md.push("  ![" + (pl.title || "plate") + "](" + pl.imageUrl + ")");
    }
  }
  if (a.photographerBio) {
    md.push("\n## Photographer");
    md.push(a.photographerBio);
  }

  var wikiPath = path.join(wikiDir, "album-" + slug + ".md");
  try {
    fs.writeFileSync(wikiPath, md.join("\n"), "utf-8");
    pagesWritten++;
  } catch (e) { ctx.log("Failed to write " + wikiPath + ": " + (e.message || e)); }

  // Update wiki index
  var pageKey = "entities/album-" + slug + ".md";
  var entryBlock = "## " + pageKey + "\nTitle: " + a.title + "\nEntityId: " + entityId + "\nSummary: " + (a.description || a.title).slice(0, 200) + "\n";
  if (indexContent.indexOf("## " + pageKey) >= 0) {
    indexContent = indexContent.replace(new RegExp("## " + pageKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?(?=\\n## |$)", "g"), entryBlock);
  } else {
    indexContent += "\n" + entryBlock;
  }
  indexEntriesUpdated++;

  // Update entity index
  ei[entityId] = {
    entityId: entityId,
    type: "photo-album",
    source: src,
    title: a.title,
    slug: slug,
    imageUrl: a.coverUrl || null,
    cortexPath: pageKey,
    tags: ["photo-album", "album-" + kind].concat(a.photographer ? [a.photographer.toLowerCase()] : []).concat(a.style ? [a.style.toLowerCase()] : []).concat((a.themes || []).map(function(t) { return String(t).toLowerCase(); })),
    updatedAt: a.updatedAt || a.addedAt || new Date().toISOString(),
  };
}

try { fs.writeFileSync(indexPath, indexContent, "utf-8"); } catch (e) {}
try { fs.writeFileSync(eiPath, JSON.stringify(ei), "utf-8"); } catch (e) {}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_photo_albums_update",
  success: true,
  totalAlbums: cached.albums.length,
  pagesWritten: pagesWritten,
  indexEntriesUpdated: indexEntriesUpdated,
  message: "Rebuilt " + pagesWritten + " Cortex pages from photo-albums cache.",
}) }] };
