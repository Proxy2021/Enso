// Projects Update — rescan filesystem for new projects, ingest to Cortex
var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheFile = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "files.json");

// 1. Read existing cache to get known project paths
var existing = { projects: [], totalProjects: 0 };
try { existing = JSON.parse(fs.readFileSync(cacheFile, "utf-8")); } catch (e) {}
var existingPaths = new Set();
if (existing.projects) {
  existing.projects.forEach(function(p) { existingPaths.add(p.path || p.name); });
}
var beforeCount = existing.projects ? existing.projects.length : 0;

// 2. Re-scan filesystem
var scanResult = await ctx.callTool("enso_context_scan_files", { maxDepth: 3 });

// 3. Read updated cache
var updated = { projects: [], totalProjects: 0 };
try { updated = JSON.parse(fs.readFileSync(cacheFile, "utf-8")); } catch (e) {}

// 4. Find new projects
var newProjects = [];
if (updated.projects) {
  newProjects = updated.projects.filter(function(p) {
    return !existingPaths.has(p.path || p.name);
  });
}

// 5. Ingest new projects to Cortex
var cortexIngested = false;
if (newProjects.length > 0) {
  try {
    var summary = "New software projects detected (" + newProjects.length + "):\n" +
      newProjects.map(function(p) {
        return "- " + (p.name || path.basename(p.path)) +
          (p.type ? " [" + p.type + "]" : "") +
          (p.technologies ? " — " + p.technologies.join(", ") : "") +
          (p.path ? " @ " + p.path : "");
      }).join("\n");
    await ctx.callTool("enso_wiki_ingest", { text: summary, topic: "Software Projects Update" });
    cortexIngested = true;
  } catch (e) {}
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_projects_scanner_update",
  beforeCount: beforeCount,
  afterCount: updated.projects ? updated.projects.length : 0,
  newProjects: newProjects.length,
  newNames: newProjects.slice(0, 20).map(function(p) { return p.name || path.basename(p.path || "unknown"); }),
  cortexIngested: cortexIngested,
}) }] };