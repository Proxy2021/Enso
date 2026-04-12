var scanResult = await ctx.callTool("enso_context_scan_photos", {});

try {
  var pipeline = await import("../../../../server/src/data-source-pipeline.js");
  pipeline.runPostScanPipeline(["photos"]).catch(function() {});
} catch(e) { /* pipeline unavailable */ }

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_photo_library_scan",
  success: true,
  data: scanResult,
}) }] };