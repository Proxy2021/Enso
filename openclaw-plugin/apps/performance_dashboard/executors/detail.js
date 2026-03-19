var metricKey = (params.metric || "").trim();

// Retrieve stored dashboard data
var stored = await ctx.store.get("last_dashboard");
var kpis = (stored && stored.kpis) || [];
var periods = (stored && stored.periods) || ["Q1", "Q2", "Q3", "Q4"];

var kpi = kpis.find(function(k) { return (k.key || "") === metricKey; });

if (!kpi) {
  // Try to generate detail via LLM
  var prompt = "Generate realistic quarterly performance data for the metric '" + metricKey + "'. "
    + "Return ONLY valid JSON: {\"key\":\"" + metricKey + "\",\"name\":\"Display Name\",\"format\":\"currency|percent|dollars|number\","
    + "\"color\":\"#hex\",\"benchmark\":num_or_null,\"inverse\":boolean,"
    + "\"periods\":[{\"label\":\"Q1\",\"value\":num},{\"label\":\"Q2\",\"value\":num},{\"label\":\"Q3\",\"value\":num},{\"label\":\"Q4\",\"value\":num}]}";

  var result = await ctx.ask(prompt);
  try {
    var text = (result.text || "").trim();
    if (text.startsWith("```")) text = text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
    kpi = JSON.parse(text);
  } catch (e) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        tool: "enso_performance_dashboard_detail",
        error: "Metric '" + metricKey + "' not found. Run the overview first."
      })}]
    };
  }
}

// Build periods array for detail view
var metricPeriods = [];
if (kpi.periods) {
  metricPeriods = kpi.periods;
} else if (kpi.values && periods.length) {
  metricPeriods = periods.map(function(label, i) {
    return { label: label, value: (kpi.values || [])[i] || 0 };
  });
}

var output = {
  tool: "enso_performance_dashboard_detail",
  metric: {
    key: kpi.key || metricKey,
    name: kpi.name || metricKey,
    format: kpi.format || "number",
    color: kpi.color || "#3b82f6",
    benchmark: kpi.benchmark || null,
    inverse: kpi.inverse || false,
    periods: metricPeriods
  }
};

return {
  content: [{ type: "text", text: JSON.stringify(output) }]
};
