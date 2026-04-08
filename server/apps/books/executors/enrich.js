var enrichResult = null;
try {
  // Dynamic import of the enrichment function
  var mod = await import("../../../../server/src/user-context-tools.js");
  if (mod.enrichKindleMetadata) {
    enrichResult = await mod.enrichKindleMetadata();
  } else {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_books_enrich", error: "Enrichment function not available" }) }] };
  }
} catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_books_enrich", error: "Enrichment failed: " + e.message }) }] };
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_books_enrich",
  enriched: enrichResult.enriched,
  total: enrichResult.total,
  errors: enrichResult.errors,
}) }] };
