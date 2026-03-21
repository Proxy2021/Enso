var topic = (params.topic || "").trim() || "business";
var metricsParam = (params.metrics || "").trim();
var periodsParam = (params.periods || "").trim();

var metricNames = metricsParam ? metricsParam.split(",").map(function(s){ return s.trim(); }) : ["Revenue", "AOV", "Conversion Rate", "CAC"];
var periodLabels = periodsParam ? periodsParam.split(",").map(function(s){ return s.trim(); }) : ["Q1", "Q2", "Q3", "Q4"];

// Ask LLM to generate realistic performance data
var prompt = "Generate realistic " + topic + " performance data for a dashboard. "
  + "Metrics: " + metricNames.join(", ") + ". "
  + "Periods: " + periodLabels.join(", ") + ". "
  + "Return ONLY valid JSON (no markdown, no explanation) with this exact structure: "
  + '{"title":"...","subtitle":"...","kpis":[{"key":"snake_case_key","name":"Display Name","format":"currency|percent|dollars|number","color":"hex","values":[num,num,...],"benchmark":num_or_null,"inverse":boolean}],"insights":["insight1","insight2","insight3"]}. '
  + "For format: use 'currency' for large money values (>1000), 'dollars' for small money (<1000), 'percent' for percentages, 'number' for counts. "
  + "For inverse: set true if lower is better (like cost metrics). "
  + "Use realistic industry benchmarks. Generate 3-5 actionable insights about the data. "
  + "Colors: use #3b82f6 (blue), #8b5cf6 (purple), #10b981 (green), #f59e0b (amber), #f43f5e (rose), #06b6d4 (cyan).";

var result = await ctx.ask(prompt);
var parsed = null;
try {
  var text = (result.text || "").trim();
  // Strip markdown fences if present
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  parsed = JSON.parse(text);
} catch (e) {
  // Fallback: generate minimal data
  parsed = {
    title: topic.charAt(0).toUpperCase() + topic.slice(1) + " Dashboard",
    subtitle: "Performance Overview",
    kpis: metricNames.map(function(name, idx) {
      var colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e"];
      return {
        key: name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        name: name,
        format: "number",
        color: colors[idx % colors.length],
        values: periodLabels.map(function() { return Math.round(Math.random() * 100); }),
        benchmark: null,
        inverse: false
      };
    }),
    insights: ["Data generated with placeholder values. Run again for AI-powered analysis."]
  };
}

// Build chart data and table data from kpis
var kpis = parsed.kpis || [];
var chartData = periodLabels.map(function(label, i) {
  var row = { period: label };
  kpis.forEach(function(kpi) {
    var key = kpi.key || "";
    row[key] = (kpi.values || [])[i] || 0;
  });
  return row;
});

var fmtVal = function(val, format) {
  if (val == null) return "—";
  if (format === "currency") {
    if (Math.abs(val) >= 1e6) return "$" + (val / 1e6).toFixed(2) + "M";
    if (Math.abs(val) >= 1e3) return "$" + (val / 1e3).toFixed(1) + "K";
    return "$" + val.toFixed(0);
  }
  if (format === "percent") return val.toFixed(1) + "%";
  if (format === "dollars") return "$" + val.toFixed(0);
  return String(val);
};

var tableData = periodLabels.map(function(label, i) {
  var row = { period: label };
  kpis.forEach(function(kpi) {
    var key = kpi.key || "";
    var val = (kpi.values || [])[i];
    row[key] = fmtVal(val, kpi.format);
  });
  return row;
});

var output = {
  tool: "enso_performance_dashboard_overview",
  title: parsed.title || (topic + " Dashboard"),
  subtitle: parsed.subtitle || "Performance Overview",
  industry: topic,
  periods: periodLabels,
  kpis: kpis,
  chartData: chartData,
  tableData: tableData,
  insights: parsed.insights || []
};

return {
  content: [{ type: "text", text: JSON.stringify(output) }]
};
