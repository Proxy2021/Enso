var metricId = (params.metricId || "").trim();
var value = (params.value || "").trim();

if (!metricId || !value) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_update_metric",
        success: false,
        error: "Both metricId and value are required"
      })
    }]
  };
}

var metrics = await ctx.store.get("metrics");
if (!metrics) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_update_metric",
        success: false,
        error: "No metrics data found. Run overview first to initialize."
      })
    }]
  };
}

var found = false;
var metricLabel = "";

for (var i = 0; i < metrics.length; i++) {
  if (metrics[i].id === metricId) {
    metrics[i].current = value;
    metricLabel = metrics[i].label;
    found = true;
    break;
  }
}

if (!found) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_alpharank_roadmap_update_metric",
        success: false,
        error: "Metric '" + metricId + "' not found. Valid IDs: cagr, sharpe, max_dd, ic"
      })
    }]
  };
}

await ctx.store.set("metrics", metrics);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_alpharank_roadmap_update_metric",
      success: true,
      metricId: metricId,
      value: value,
      message: "Metric '" + metricLabel + "' updated to '" + value + "'"
    })
  }]
};
