var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheFile = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "file-index.json");
var projects = [];
var topFileTypes = [];

try {
  var raw = fs.readFileSync(cacheFile, "utf-8");
  var data = JSON.parse(raw);
  projects = data.projects || [];
  topFileTypes = data.topFileTypes || [];
} catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_projects_scanner_browse", projects: [], topFileTypes: [], groups: {}, error: "No project data cached. Run a scan first." }) }] };
}

// Apply filters
var filtered = projects;
var p = params || {};
if (p.type) {
  var t = p.type.toLowerCase();
  filtered = filtered.filter(function(p) {
    return p.type && p.type.toLowerCase() === t;
  });
}
if (p.query) {
  var q = p.query.toLowerCase();
  filtered = filtered.filter(function(p) {
    return (p.name && p.name.toLowerCase().indexOf(q) >= 0) ||
      (p.path && p.path.toLowerCase().indexOf(q) >= 0);
  });
}

// Group by type
var groups = {};
for (var p of filtered) {
  var type = p.type || "other";
  if (!groups[type]) groups[type] = [];
  groups[type].push(p);
}

// Collect all unique types for filter pills
var allTypes = {};
for (var proj of projects) {
  var pt = proj.type || "other";
  allTypes[pt] = (allTypes[pt] || 0) + 1;
}
var typeList = Object.entries(allTypes)
  .sort(function(a, b) { return b[1] - a[1]; })
  .map(function(e) { return { name: e[0], count: e[1] }; });

// Check wiki for existing project pages
var wikiDir = path.join(os.homedir(), ".enso", "wiki");
var indexPath = path.join(wikiDir, "_index.md");
var existingPages = new Set();
try {
  if (fs.existsSync(indexPath)) {
    var idx = fs.readFileSync(indexPath, "utf-8");
    var matches = idx.matchAll(/^## (.+\.md)$/gm);
    for (var m of matches) existingPages.add(m[1]);
  }
} catch (e) {}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_projects_scanner_browse",
  totalProjects: projects.length,
  filteredCount: filtered.length,
  typeFilter: p.type || null,
  query: p.query || null,
  typeList: typeList,
  topFileTypes: topFileTypes,
  groups: groups,
  projects: filtered.map(function(p) {
    var slug = slugify(p.name || "unknown");
    return {
      entityId: "files:project:" + slug,
      name: p.name,
      path: p.path,
      type: p.type,
      technologies: p.technologies || [],
      hasWikiPage: existingPages.has("entities/" + slug + ".md"),
      wikiPath: "entities/" + slug + ".md",
    };
  }),
}) }] };