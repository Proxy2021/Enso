// Books Enrich — enriches both Kindle and WeRead books with metadata from their respective platforms
var kindleResult = { enriched: 0, total: 0, errors: 0 };
var wereadResult = { enriched: 0, total: 0, errors: 0 };

// Enrich Kindle books (Amazon product pages)
try {
  var mod = await import("../../../../server/src/user-context-tools.js");
  if (mod.enrichKindleMetadata) {
    ctx.log("Enriching Kindle books...");
    kindleResult = await mod.enrichKindleMetadata();
    ctx.log("Kindle: " + kindleResult.enriched + " enriched, " + kindleResult.errors + " errors");
  }
} catch (e) {
  ctx.log("Kindle enrichment error: " + (e.message || e));
  kindleResult.errors = -1;
}

// Enrich WeRead books (WeRead book detail pages)
try {
  var mod2 = await import("../../../../server/src/user-context-tools.js");
  if (mod2.enrichWeReadMetadata) {
    ctx.log("Enriching WeRead books...");
    wereadResult = await mod2.enrichWeReadMetadata();
    ctx.log("WeRead: " + wereadResult.enriched + " enriched, " + wereadResult.errors + " errors");
  } else {
    ctx.log("WeRead enrichment function not available");
  }
} catch (e) {
  ctx.log("WeRead enrichment error: " + (e.message || e));
  wereadResult.errors = -1;
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_books_enrich",
  kindle: {
    enriched: kindleResult.enriched,
    total: kindleResult.total,
    errors: kindleResult.errors,
  },
  weread: {
    enriched: wereadResult.enriched,
    total: wereadResult.total,
    errors: wereadResult.errors,
  },
  totalEnriched: kindleResult.enriched + wereadResult.enriched,
  totalErrors: (kindleResult.errors > 0 ? kindleResult.errors : 0) + (wereadResult.errors > 0 ? wereadResult.errors : 0),
}) }] };
