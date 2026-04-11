// Cortex Article Reader — uses wiki read tool
var pagePath = String(params.path || "").replace(/\\/g, "/");
if (!pagePath) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_cortex_read", error: "No page path provided" }) }] };
}

// Read page via wiki tool (includes backlinks)
var readResult = await ctx.callTool("enso_wiki_read", { path: pagePath });
if (!readResult.success || !readResult.data) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_cortex_read", path: pagePath, error: readResult.error || "Page not found" }) }] };
}

var pageData = readResult.data;
var content = pageData.content || "";
var backlinks = pageData.backlinks || [];

// Extract title
var titleMatch = content.match(/^#\s+(.+)$/m);
var title = titleMatch ? titleMatch[1] : pagePath.replace(/.*\//, "").replace(/\.md$/, "");
var category = pagePath.split("/")[0];

// Get index for tags + related pages
var searchResult = await ctx.callTool("enso_wiki_search", { query: "", maxResults: 200 });
var allEntries = (searchResult.success && searchResult.data) ? (searchResult.data.results || []) : [];
var thisEntry = allEntries.find(function(e) { return e.path === pagePath; });
var tags = thisEntry ? (thisEntry.tags || []) : [];

// Find outgoing [[links]]
var outgoingLinks = [];
var linkMatches = content.match(/\[\[([^\]]+)\]\]/g) || [];
var seen = {};
for (var li = 0; li < linkMatches.length; li++) {
  var linkName = linkMatches[li].replace(/\[\[|\]\]/g, "");
  if (seen[linkName]) continue;
  seen[linkName] = true;
  var linkSlug = linkName.toLowerCase().replace(/\s+/g, "-").replace(/^(entities|synthesis)\//, "");
  var found = allEntries.find(function(e) { return e.path.replace(/.*\//, "").replace(/\.md$/, "") === linkSlug; });
  outgoingLinks.push({ name: linkName, slug: linkSlug, path: found ? found.path : null, exists: !!found });
}

// Find related pages (shared tags, excluding source-identifier tags)
var related = [];
var SOURCE_TAGS = { kindle: 1, weread: 1, steam: 1, youtube: 1, movies_tv: 1, photos: 1, "qq_music": 1, "qq-music": 1, twitter: 1, project: 1, "social-media": 1 };
var contentTags = tags.filter(function(t) { return !SOURCE_TAGS[t]; });
if (contentTags.length > 0) {
  for (var ri = 0; ri < allEntries.length; ri++) {
    if (allEntries[ri].path === pagePath) continue;
    var entryTags = (allEntries[ri].tags || []).filter(function(t) { return !SOURCE_TAGS[t]; });
    var shared = entryTags.filter(function(t) { return contentTags.indexOf(t) >= 0; });
    if (shared.length > 0) {
      var crossSource = (allEntries[ri].source || "") !== (thisEntry ? thisEntry.source || "" : "");
      related.push({ path: allEntries[ri].path, title: allEntries[ri].title, sharedTags: shared, crossSource: crossSource, score: shared.length + (crossSource ? 0.5 : 0) });
    }
  }
  related.sort(function(a, b) { return b.score - a.score; });
  related = related.slice(0, 10);
}

// Derive entityId from index entry (if available) or page path
var entityId = thisEntry ? thisEntry.entityId : null;
if (!entityId && category === "entities") {
  // Infer from path: entities/game-x.md → steam:game:x, entities/movie-x.md → movies_tv:movie:x, etc.
  var filename = pagePath.replace(/.*\//, "").replace(/\.md$/, "");
  if (filename.startsWith("game-")) entityId = "steam:game:" + filename.replace("game-", "");
  else if (filename.startsWith("movie-")) entityId = "movies_tv:movie:" + filename.replace("movie-", "");
  else if (filename.startsWith("tv-")) entityId = "movies_tv:tv-series:" + filename.replace("tv-", "");
  else if (filename.startsWith("photo-album-")) entityId = "photos:album:" + filename.replace("photo-album-", "");
  else if (filename.startsWith("artist-")) entityId = "qq_music:artist:" + filename.replace("artist-", "");
  else if (filename.startsWith("twitter-")) entityId = "twitter:twitter-account:" + filename.replace("twitter-", "");
  else {
    // Check source tag for kindle books (no prefix)
    var source = thisEntry ? thisEntry.source : null;
    if (source === "kindle") entityId = "kindle:book:" + filename;
    else if (source === "youtube") entityId = "youtube:channel:" + filename;
    else if (source === "project") entityId = "files:project:" + filename;
    else entityId = "cortex:concept:" + filename;
  }
}

return {
  content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_read",
    path: pagePath,
    title: title,
    content: content,
    category: category,
    tags: tags,
    entityId: entityId,
    backlinks: backlinks.map(function(bl) { return typeof bl === "string" ? { path: bl, title: bl.replace(/.*\//, "").replace(/\.md$/, "").replace(/-/g, " ") } : bl; }),
    outgoingLinks: outgoingLinks,
    related: related
  }) }]
};
