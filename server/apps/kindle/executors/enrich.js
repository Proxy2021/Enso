var enrichResult = null;
try {
  // Dynamic import of the enrichment function
  var mod = await import("../../../../server/src/user-context-tools.js");
  if (mod.enrichKindleMetadata) {
    enrichResult = await mod.enrichKindleMetadata();
  } else {
    result = { tool: "enso_kindle_enrich", error: "Enrichment function not available" };
    return;
  }
} catch (e) {
  result = { tool: "enso_kindle_enrich", error: "Enrichment failed: " + e.message };
  return;
}

result = {
  tool: "enso_kindle_enrich",
  enriched: enrichResult.enriched,
  total: enrichResult.total,
  errors: enrichResult.errors,
};
