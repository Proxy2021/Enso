var scanResult = await ctx.callTool("enso_context_scan_qq_music", {});

try {
  var pipeline = await import("../../../../server/src/data-source-pipeline.js");
  pipeline.runPostScanPipeline(["qqMusic"]).catch(function() {});
} catch(e) { /* pipeline unavailable */ }

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_qq_music_scan",
  success: true,
  data: scanResult,
}) }] };