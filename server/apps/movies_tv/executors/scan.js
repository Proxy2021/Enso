var scanResult = await ctx.callTool("enso_context_scan_movies_tv", {});

try {
  var pipeline = await import("../../../../server/src/data-source-pipeline.js");
  pipeline.runPostScanPipeline(["moviesTv"]).catch(function() {});
} catch(e) { /* pipeline unavailable */ }

return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_movies_tv_scan", success: true, data: scanResult }) }] };