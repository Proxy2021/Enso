// Books — Kindle scan executor: scan + auto-enrich + Cortex ingest
var scanResult = await ctx.callTool("enso_context_scan_kindle_library", {});

// Fire-and-forget: platform API enrichment + Cortex ingest pipeline
try {
  var pipeline = await import("../../../../server/src/data-source-pipeline.js");
  pipeline.runPostScanPipeline(["kindleLibrary"]).catch(function() {});
} catch(e) { /* pipeline unavailable */ }

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_books_scan_kindle",
  success: true,
  data: scanResult,
}) }] };
