var scanResult = await ctx.callTool("enso_context_scan_twitter", {});

try {
  var pipeline = await import("../../../../server/src/data-source-pipeline.js");
  pipeline.runPostScanPipeline(["twitter"]).catch(function() {});
} catch(e) { /* pipeline unavailable */ }

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_twitter_scan",
  success: true,
  data: scanResult,
}) }] };