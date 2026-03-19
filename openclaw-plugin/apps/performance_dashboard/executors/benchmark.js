var industry = (params.industry || "").trim() || "e-commerce";

var prompt = "List 5-7 key performance benchmarks for the " + industry + " industry. "
  + "Return ONLY valid JSON array: [{\"name\":\"Metric Name\",\"value\":\"formatted value\",\"description\":\"one-line context\",\"source\":\"data source and year\"}]. "
  + "Include common KPIs like conversion rate, average order value, customer acquisition cost, retention rate, etc. "
  + "Use real 2025-2026 industry data and cite sources.";

var result = await ctx.ask(prompt);
var benchmarks = [];

try {
  var text = (result.text || "").trim();
  if (text.startsWith("```")) text = text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
  benchmarks = JSON.parse(text);
  if (!Array.isArray(benchmarks)) benchmarks = [];
} catch (e) {
  benchmarks = [
    { name: "Conversion Rate", value: "2.5%", description: "Average for established stores", source: "Industry Report 2025" },
    { name: "Average Order Value", value: "$150", description: "Global e-commerce average", source: "Industry Report 2025" },
    { name: "Customer Acquisition Cost", value: "$76", description: "All-channel average", source: "Industry Report 2025" },
    { name: "LTV:CAC Ratio", value: "3:1", description: "Healthy benchmark target", source: "Industry Standard" }
  ];
}

var output = {
  tool: "enso_performance_dashboard_benchmark",
  industry: industry.charAt(0).toUpperCase() + industry.slice(1),
  benchmarks: benchmarks
};

return {
  content: [{ type: "text", text: JSON.stringify(output) }]
};
