var sources = await ctx.store.get("sources");
if (!sources) {
  sources = [
    { id: "enso_cortex", name: "Enso Cortex", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
    { id: "kindle_readwise", name: "Kindle / Readwise", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
    { id: "photos", name: "Photos", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
    { id: "calibre_web", name: "Calibre-Web", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
    { id: "jellyfin", name: "Jellyfin", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
    { id: "playnite", name: "Playnite", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" },
    { id: "obsidian", name: "Obsidian", status: "unknown", lastSync: null, recordCount: 0, health: "unknown" }
  ];
}

var now = new Date().toISOString();

// Check Enso Cortex
try {
  var cortexResult = await ctx.callTool("enso_cortex_search", { query: "*", limit: 1 });
  if (cortexResult.success) {
    var cData = cortexResult.data;
    if (typeof cData === "string") { try { cData = JSON.parse(cData); } catch(e) {} }
    for (var i = 0; i < sources.length; i++) {
      if (sources[i].id === "enso_cortex") {
        sources[i].status = "connected";
        sources[i].health = "healthy";
        sources[i].lastSync = now;
        if (cData && cData.totalCount) sources[i].recordCount = cData.totalCount;
        else if (cData && cData.results) sources[i].recordCount = cData.results.length;
      }
    }
  }
} catch(e) {
  for (var i2 = 0; i2 < sources.length; i2++) {
    if (sources[i2].id === "enso_cortex") {
      sources[i2].status = "error";
      sources[i2].health = "unhealthy";
    }
  }
}

// Check Photos directory
try {
  var photosDir = process.platform === "win32" ? (process.env.USERPROFILE || "C:/Users") + "/Pictures" : (process.env.HOME || "/home") + "/Pictures";
  var photoList = await ctx.listDir(photosDir);
  if (photoList && photoList.success !== false) {
    for (var pi = 0; pi < sources.length; pi++) {
      if (sources[pi].id === "photos") {
        sources[pi].status = "connected";
        sources[pi].health = "healthy";
        sources[pi].lastSync = now;
        var pData = photoList.data || photoList;
        if (Array.isArray(pData)) sources[pi].recordCount = pData.length;
      }
    }
  }
} catch(e) {}

// Check if Calibre-Web is reachable
try {
  var calibreCheck = await ctx.fetch("http://localhost:8083");
  for (var ci = 0; ci < sources.length; ci++) {
    if (sources[ci].id === "calibre_web") {
      if (calibreCheck.ok) {
        sources[ci].status = "connected";
        sources[ci].health = "healthy";
        sources[ci].lastSync = now;
      } else {
        sources[ci].status = "disconnected";
        sources[ci].health = "unreachable";
      }
    }
  }
} catch(e) {
  for (var ci2 = 0; ci2 < sources.length; ci2++) {
    if (sources[ci2].id === "calibre_web") {
      sources[ci2].status = "disconnected";
      sources[ci2].health = "unreachable";
    }
  }
}

// Check Jellyfin
try {
  var jellyCheck = await ctx.fetch("http://localhost:8096/System/Info/Public");
  for (var ji = 0; ji < sources.length; ji++) {
    if (sources[ji].id === "jellyfin") {
      if (jellyCheck.ok) {
        sources[ji].status = "connected";
        sources[ji].health = "healthy";
        sources[ji].lastSync = now;
      } else {
        sources[ji].status = "disconnected";
        sources[ji].health = "unreachable";
      }
    }
  }
} catch(e) {
  for (var ji2 = 0; ji2 < sources.length; ji2++) {
    if (sources[ji2].id === "jellyfin") {
      sources[ji2].status = "disconnected";
      sources[ji2].health = "unreachable";
    }
  }
}

// Check Obsidian vault existence
try {
  var obsVault = (process.env.USERPROFILE || process.env.HOME || "") + "/Documents/Obsidian";
  var obsDir = await ctx.listDir(obsVault);
  for (var oi = 0; oi < sources.length; oi++) {
    if (sources[oi].id === "obsidian") {
      if (obsDir && obsDir.success !== false) {
        sources[oi].status = "connected";
        sources[oi].health = "healthy";
        sources[oi].lastSync = now;
        var oData = obsDir.data || obsDir;
        if (Array.isArray(oData)) sources[oi].recordCount = oData.length;
      }
    }
  }
} catch(e) {}

await ctx.store.set("sources", sources);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_pkg_tracker_check_connections",
      sources: sources,
      checkedAt: now
    })
  }]
};
