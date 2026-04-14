var projectId = (params.projectId || "").trim();

if (!projectId) {
  projectId = await ctx.store.get("active_project") || "";
}
if (!projectId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_view_narrative", error: "No project ID" }) }] };
}

var allProjects = await ctx.store.get("album_projects") || {};
var project = allProjects[projectId];
if (!project) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_view_narrative", error: "Project not found" }) }] };
}

var spreads = await ctx.store.get("spreads_" + projectId) || [];

// Narrative arc value mapping
var ARC_VALUES = {
  opening: 20,
  rising: 50,
  climax: 85,
  resolution: 30
};

// Theme color mapping
var THEME_COLORS = {
  light_shadow: "#f59e0b",
  faces: "#ef4444",
  architecture: "#3b82f6",
  nature: "#22c55e",
  culture: "#a855f7",
  street: "#f97316",
  food: "#ec4899",
  transport: "#06b6d4"
};

// Build arc data
var arcData = [];
var themeCounts = {};
var layoutCounts = {};
var arcCounts = { opening: 0, rising: 0, climax: 0, resolution: 0 };

for (var i = 0; i < spreads.length; i++) {
  var s = spreads[i];
  var pos = s.narrativePos || "rising";
  var thm = s.themeTag || "nature";
  var lay = s.layout || "full_bleed";

  arcData.push({
    spread: i + 1,
    narrativePos: pos,
    arcValue: ARC_VALUES[pos] || 40,
    themeTag: thm,
    themeColor: THEME_COLORS[thm] || "#6b7280",
    layout: lay,
    imageDesc: s.imageDesc || ""
  });

  themeCounts[thm] = (themeCounts[thm] || 0) + 1;
  layoutCounts[lay] = (layoutCounts[lay] || 0) + 1;
  if (arcCounts[pos] !== undefined) arcCounts[pos]++;
}

// Theme distribution
var themeDistribution = [];
var themeKeys = Object.keys(themeCounts);
for (var t = 0; t < themeKeys.length; t++) {
  themeDistribution.push({
    theme: themeKeys[t],
    count: themeCounts[themeKeys[t]],
    color: THEME_COLORS[themeKeys[t]] || "#6b7280"
  });
}

// Layout distribution
var layoutDistribution = [];
var layoutKeys = Object.keys(layoutCounts);
for (var l = 0; l < layoutKeys.length; l++) {
  layoutDistribution.push({
    layout: layoutKeys[l],
    count: layoutCounts[layoutKeys[l]]
  });
}

// Pacing warnings: flag consecutive same themes (3+)
var pacingWarnings = [];
if (spreads.length >= 3) {
  var runStart = 0;
  var runTheme = spreads.length > 0 ? (spreads[0].themeTag || "") : "";
  for (var w = 1; w <= spreads.length; w++) {
    var curTheme = w < spreads.length ? (spreads[w].themeTag || "") : "";
    if (curTheme !== runTheme || w === spreads.length) {
      var runLen = w - runStart;
      if (runLen >= 3) {
        pacingWarnings.push({
          type: "consecutive_theme",
          start: runStart + 1,
          end: w,
          theme: runTheme,
          message: runLen + " consecutive '" + runTheme + "' spreads (" + (runStart + 1) + "-" + w + ") \u2014 consider alternating themes"
        });
      }
      runStart = w;
      runTheme = curTheme;
    }
  }
}

// Check for narrative arc imbalance
var total = spreads.length;
if (total >= 10) {
  if (arcCounts.climax > total * 0.4) {
    pacingWarnings.push({
      type: "arc_imbalance",
      message: "Too many climax spreads (" + arcCounts.climax + "/" + total + ") \u2014 the peak loses impact without quieter moments"
    });
  }
  if (arcCounts.opening === 0) {
    pacingWarnings.push({
      type: "arc_missing",
      message: "No opening spreads \u2014 consider a gentle introduction to set the mood"
    });
  }
  if (arcCounts.resolution === 0) {
    pacingWarnings.push({
      type: "arc_missing",
      message: "No resolution spreads \u2014 the album needs a peaceful conclusion"
    });
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_designer_view_narrative",
      projectId: projectId,
      title: project.title || "Untitled Album",
      totalSpreads: spreads.length,
      arcData: arcData,
      themeDistribution: themeDistribution,
      layoutDistribution: layoutDistribution,
      pacingWarnings: pacingWarnings,
      arcBalance: arcCounts
    })
  }]
};
