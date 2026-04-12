// Books — WeRead scan executor: scan + auto-enrich + Cortex ingest
var result = await ctx.callTool("enso_context_scan_weread", {});

// Fire-and-forget: platform API enrichment + Cortex ingest pipeline
try {
  var pipeline = await import("../../../../server/src/data-source-pipeline.js");
  pipeline.runPostScanPipeline(["wereadLibrary"]).catch(function() {});
} catch(e) { /* pipeline unavailable */ }

return result;
