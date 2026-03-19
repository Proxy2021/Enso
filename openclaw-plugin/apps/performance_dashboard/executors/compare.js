var metricKeysParam = (params.metricKeys || "").trim();

// Retrieve stored dashboard data
var stored = await ctx.store.get("last_dashboard");
var kpis = (stored && stored.kpis) || [];
var periods = (stored && stored.periods) || ["Q1", "Q2", "Q3", "Q4"];

var selectedKeys = metricKeysParam ? metricKeysParam.split(",").map(function(s) { return s.trim(); }) : [];

// If no specific keys, use all kpis
var metricsToCompare = [];
if (selectedKeys.length > 0) {
  selectedKeys.forEach(function(key) {
    var found = kpis.find(function(k) { return (k.key || "") === key; });
    if (found) metricsToCompare.push(found);
  });
} else {
  metricsToCompare = kpis;
}

// If no stored data, generate via LLM
if (metricsToCompare.length === 0) {
  var prompt = "Generate 4 business performance metrics for comparison. "
    + "Return ONLY valid JSON: {\"periods\":[\"Q1\",\"Q2\",\"Q3\",\"Q4\"],\"metrics\":[{\"name\":\"Metric Name\",\"values\":[num,num,num,num]}]}. "
    + "Include diverse metrics like revenue, conversion, cost, engagement. Use realistic values.";

  var result = await ctx.ask(prompt);
  try {
    var text = (result.text || "").trim();
    if (text.startsWith("```")) text = text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
    var parsed = JSON.parse(text);
    return {
      content: [{ type: "text", text: JSON.stringify({
        tool: "enso_performance_dashboard_compare",
        periods: parsed.periods || periods,
        metrics: parsed.metrics || []
      })}]
    };
  } catch (e) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        tool: "enso_performance_dashboard_compare",
        periods: periods,
        metrics: []
      })}]
    };
  }
}

var output = {
  tool: "enso_performance_dashboard_compare",
  periods: periods,
  metrics: metricsToCompare.map(function(kpi) {
    return {
      name: kpi.name || kpi.key || "Metric",
      values: kpi.values || []
    };
  })
};

return {
  content: [{ type: "text", text: JSON.stringify(output) }]
};
