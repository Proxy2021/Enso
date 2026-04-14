var action = (params.action || "").trim();

if (!action) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_pkg_tracker_run_action", error: "action is required" }) }] };
}

if (action === "full_sync") {
  // Trigger connection checks and gather counts
  var sources = await ctx.store.get("sources") || [];
  var syncResults = [];
  var now = new Date().toISOString();

  // Check Cortex
  try {
    var cortexResult = await ctx.callTool("enso_cortex_search", { query: "*", limit: 1 });
    if (cortexResult.success) {
      var cData = cortexResult.data;
      if (typeof cData === "string") { try { cData = JSON.parse(cData); } catch(e) {} }
      var count = (cData && cData.totalCount) || 0;
      syncResults.push({ source: "Enso Cortex", status: "synced", records: count });
      for (var si = 0; si < sources.length; si++) {
        if (sources[si].id === "enso_cortex") {
          sources[si].status = "connected";
          sources[si].health = "healthy";
          sources[si].lastSync = now;
          if (count > 0) sources[si].recordCount = count;
        }
      }
    }
  } catch(e) {
    syncResults.push({ source: "Enso Cortex", status: "error", records: 0 });
  }

  // Check other sources by connectivity
  var httpChecks = [
    { id: "calibre_web", name: "Calibre-Web", url: "http://localhost:8083" },
    { id: "jellyfin", name: "Jellyfin", url: "http://localhost:8096/System/Info/Public" }
  ];

  for (var hi = 0; hi < httpChecks.length; hi++) {
    try {
      var resp = await ctx.fetch(httpChecks[hi].url);
      var status = resp.ok ? "synced" : "unreachable";
      syncResults.push({ source: httpChecks[hi].name, status: status, records: 0 });
      for (var hsi = 0; hsi < sources.length; hsi++) {
        if (sources[hsi].id === httpChecks[hi].id) {
          sources[hsi].status = resp.ok ? "connected" : "disconnected";
          sources[hsi].health = resp.ok ? "healthy" : "unreachable";
          if (resp.ok) sources[hsi].lastSync = now;
        }
      }
    } catch(e) {
      syncResults.push({ source: httpChecks[hi].name, status: "unreachable", records: 0 });
    }
  }

  await ctx.store.set("sources", sources);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_pkg_tracker_run_action",
        action: "full_sync",
        result: "Sync completed across " + syncResults.length + " sources",
        syncResults: syncResults,
        timestamp: now
      })
    }]
  };
}

if (action === "reset_tracker") {
  await ctx.store.delete("phases");
  await ctx.store.delete("sources");
  await ctx.store.delete("graphStats");

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_pkg_tracker_run_action",
        action: "reset_tracker",
        result: "Tracker reset to defaults. All progress cleared.",
        timestamp: new Date().toISOString()
      })
    }]
  };
}

if (action === "export_status") {
  var phases = await ctx.store.get("phases") || [];
  var sources2 = await ctx.store.get("sources") || [];
  var graphStats = await ctx.store.get("graphStats") || {};

  var totalT = 0;
  var deployedT = 0;
  for (var epi = 0; epi < phases.length; epi++) {
    for (var eti = 0; eti < phases[epi].tools.length; eti++) {
      totalT++;
      var es = phases[epi].tools[eti].status;
      if (es === "deployed" || es === "verified") deployedT++;
    }
  }

  var exportData = {
    exportedAt: new Date().toISOString(),
    overallProgress: totalT > 0 ? Math.round((deployedT / totalT) * 100) : 0,
    totalTools: totalT,
    deployedTools: deployedT,
    phases: phases.map(function(p) {
      return {
        name: p.name,
        progress: p.progress || 0,
        tools: p.tools.map(function(t) {
          return { name: t.name, status: t.status, notes: t.notes };
        })
      };
    }),
    connectedSources: sources2.filter(function(s) { return s.status === "connected"; }).length,
    totalSources: sources2.length,
    graphNodes: graphStats.totalNodes || 0
  };

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_pkg_tracker_run_action",
        action: "export_status",
        result: "Status exported successfully",
        exportData: exportData
      })
    }]
  };
}

if (action === "add_custom_tool") {
  var phaseId = (params.phaseId || "").trim();
  var toolName = (params.toolName || "").trim();
  var checklistStr = (params.checklistItems || "").trim();

  if (!phaseId || !toolName) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_pkg_tracker_run_action", error: "phaseId and toolName required for add_custom_tool" }) }] };
  }

  var phases3 = await ctx.store.get("phases");
  if (!phases3) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_pkg_tracker_run_action", error: "No tracker data found" }) }] };
  }

  var addedToPhase = "";
  var newToolId = toolName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  var checkItems = checklistStr ? checklistStr.split(",").map(function(c) { return { item: c.trim(), done: false }; }) : [
    { item: "Install/Deploy", done: false },
    { item: "Configure", done: false },
    { item: "Test", done: false }
  ];

  for (var api = 0; api < phases3.length; api++) {
    if (phases3[api].id === phaseId) {
      phases3[api].tools.push({
        id: newToolId,
        name: toolName,
        status: "not_started",
        notes: "",
        checklist: checkItems
      });
      addedToPhase = phases3[api].name;
      break;
    }
  }

  if (!addedToPhase) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_pkg_tracker_run_action", error: "Phase not found: " + phaseId }) }] };
  }

  await ctx.store.set("phases", phases3);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_pkg_tracker_run_action",
        action: "add_custom_tool",
        result: "Added '" + toolName + "' to " + addedToPhase,
        toolId: newToolId,
        phaseName: addedToPhase
      })
    }]
  };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_pkg_tracker_run_action",
      error: "Unknown action: " + action + ". Valid actions: full_sync, reset_tracker, export_status, add_custom_tool"
    })
  }]
};
