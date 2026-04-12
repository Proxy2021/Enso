var scanResult = await ctx.callTool("enso_context_scan_browser_history", {
  browser: params.browser || "all",
  sinceDays: params.sinceDays || 30,
  limit: 500,
});

try {
  var pipeline = await import("../../../../server/src/data-source-pipeline.js");
  pipeline.runPostScanPipeline(["browserHistory"]).catch(function() {});
} catch(e) { /* pipeline unavailable */ }

return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_browser_history_scan", success: true, data: scanResult }) }] };