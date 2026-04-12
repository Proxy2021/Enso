var scanResult = await ctx.callTool("enso_context_scan_bookmarks", {});

try {
  var pipeline = await import("../../../../server/src/data-source-pipeline.js");
  pipeline.runPostScanPipeline(["bookmarks"]).catch(function() {});
} catch(e) { /* pipeline unavailable */ }

return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_bookmarks_scan", success: true, data: scanResult }) }] };