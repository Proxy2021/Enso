var scanPath = (params.path || "").trim() || "~/Desktop/Github";

// Expand ~ to home dir
if (scanPath.indexOf("~") === 0) {
  var homeResult = await ctx.listDir("/Users");
  // Try common paths
  var expandedPaths = [
    scanPath.replace("~", "/Users/" + (process && process.env ? process.env.USER : "user")),
    scanPath
  ];
}

var found = [];
try {
  var dirResult = await ctx.listDir(scanPath);
  if (dirResult.success && Array.isArray(dirResult.data)) {
    var entries = dirResult.data;
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (entry.isDirectory || entry.type === "directory") {
        var entryPath = scanPath + "/" + (entry.name || entry);
        // Check if it has a .git directory
        try {
          var gitCheck = await ctx.listDir(entryPath + "/.git");
          if (gitCheck.success) {
            var branch = "main";
            try {
              var headResult = await ctx.readFile(entryPath + "/.git/HEAD");
              if (headResult.success) {
                var headContent = (typeof headResult.data === "string" ? headResult.data : "").trim();
                if (headContent.indexOf("ref: refs/heads/") === 0) {
                  branch = headContent.replace("ref: refs/heads/", "");
                }
              }
            } catch(e) {}

            found.push({
              name: entry.name || entry,
              path: entryPath,
              branch: branch,
              hasChanges: false
            });
          }
        } catch(e) {}
      }
    }
  }
} catch(e) {}

// Save found repos as projects
var existingProjects = (await ctx.store.get("projects")) || [];
var existingPaths = existingProjects.map(function(p) { return p.path; });

for (var j = 0; j < found.length; j++) {
  if (existingPaths.indexOf(found[j].path) === -1) {
    existingProjects.push({
      id: "p" + Date.now() + j,
      name: found[j].name,
      path: found[j].path,
      branch: found[j].branch,
      status: "active"
    });
  }
}
await ctx.store.set("projects", existingProjects);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_dev_scan_repos",
      scannedPath: scanPath,
      found: found,
      totalFound: found.length,
      totalProjects: existingProjects.length
    })
  }]
};
