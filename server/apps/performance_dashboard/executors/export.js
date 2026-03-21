var format = (params.format || "").trim() || "text";

// Retrieve stored dashboard data
var stored = await ctx.store.get("last_dashboard");
var kpis = (stored && stored.kpis) || [];
var periods = (stored && stored.periods) || [];
var title = (stored && stored.title) || "Performance Report";
var insights = (stored && stored.insights) || [];

var fmtVal = function(val, fmt) {
  if (val == null) return "—";
  if (fmt === "currency") {
    if (Math.abs(val) >= 1e6) return "$" + (val / 1e6).toFixed(2) + "M";
    if (Math.abs(val) >= 1e3) return "$" + (val / 1e3).toFixed(1) + "K";
    return "$" + val.toFixed(0);
  }
  if (fmt === "percent") return val.toFixed(1) + "%";
  if (fmt === "dollars") return "$" + val.toFixed(0);
  return String(val);
};

var summary = "";

if (format === "csv") {
  // CSV format
  var headers = ["Period"].concat(kpis.map(function(k) { return k.name || k.key || ""; }));
  summary = headers.join(",") + "\n";
  periods.forEach(function(label, i) {
    var row = [label];
    kpis.forEach(function(kpi) {
      row.push(String((kpi.values || [])[i] || 0));
    });
    summary += row.join(",") + "\n";
  });
} else if (format === "markdown") {
  // Markdown format
  summary = "# " + title + "\n\n";
  summary += "| Period |";
  kpis.forEach(function(k) { summary += " " + (k.name || "") + " |"; });
  summary += "\n|--------|";
  kpis.forEach(function() { summary += "--------|"; });
  summary += "\n";
  periods.forEach(function(label, i) {
    summary += "| " + label + " |";
    kpis.forEach(function(kpi) {
      summary += " " + fmtVal((kpi.values || [])[i], kpi.format) + " |";
    });
    summary += "\n";
  });
  if (insights.length > 0) {
    summary += "\n## Insights\n\n";
    insights.forEach(function(text, idx) {
      summary += (idx + 1) + ". " + text + "\n";
    });
  }
} else {
  // Plain text format
  summary = title.toUpperCase() + "\n" + "=".repeat(title.length) + "\n\n";
  periods.forEach(function(label, i) {
    var line = label + ":";
    kpis.forEach(function(kpi) {
      line += " " + (kpi.name || kpi.key || "") + " " + fmtVal((kpi.values || [])[i], kpi.format) + " |";
    });
    summary += line.slice(0, -2) + "\n";
  });
  if (insights.length > 0) {
    summary += "\nHighlights:\n";
    insights.forEach(function(text, idx) {
      summary += "- " + text + "\n";
    });
  }
}

// If no stored data, generate via LLM
if (kpis.length === 0) {
  var prompt = "Generate a sample quarterly performance report for an e-commerce business in " + format + " format. "
    + "Include metrics: Revenue, AOV, Conversion Rate, CAC for Q1-Q4. Use realistic values.";
  var result = await ctx.ask(prompt);
  summary = result.text || "No data available. Run the overview first to populate the dashboard.";
}

var output = {
  tool: "enso_performance_dashboard_export",
  format: format,
  summary: summary
};

return {
  content: [{ type: "text", text: JSON.stringify(output) }]
};
