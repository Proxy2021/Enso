var scanResult = await ctx.callTool("enso_context_scan_files", {
  maxDepth: params.maxDepth || 3,
});

try {
  var pipeline = await import("../../../../server/src/data-source-pipeline.js");
  pipeline.runPostScanPipeline(["files"]).catch(function() {});
} catch(e) { /* pipeline unavailable */ }

return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_projects_scanner_scan", success: true, data: scanResult }) }] };