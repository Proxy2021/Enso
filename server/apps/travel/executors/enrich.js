// Travel — Enrich Places: batch-enrich saved destinations with structured travel data
var os = require("os");
var fs = require("fs");
var path = require("path");

var indexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
if (!fs.existsSync(indexPath)) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_travel_enrich", enriched: 0, message: "No entity index found. Add some destinations first." }) }] };
}

var entityIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
var entries = Object.values(entityIndex);
var places = entries.filter(function(e) { return e.type === "place"; });
var p = params || {};
var forceAll = !!p.force;
var unenriched = forceAll
  ? places
  : places.filter(function(e) { return !e.metadata || !e.metadata.enrichedAt; });

if (unenriched.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_travel_enrich", enriched: 0, total: places.length, message: "All " + places.length + " destinations are already enriched." }) }] };
}

ctx.log("Enriching " + unenriched.length + " places out of " + places.length + " total" + (forceAll ? " (force re-enrich)" : ""));

var enrichModPath = require.resolve("./content-enrichment.js");
var enrichMod = await import("file:///" + enrichModPath.replace(/\\/g, "/"));
var enriched = 0;
var errors = 0;

for (var i = 0; i < unenriched.length; i++) {
  var entry = unenriched[i];
  try {
    ctx.log("Enriching " + (i + 1) + "/" + unenriched.length + ": " + entry.title);
    var success = await enrichMod.enrichEntity(entry.entityId);
    if (success) {
      enriched++;
      ctx.log("  -> Done: " + entry.title);
    } else {
      errors++;
      ctx.log("  -> Failed: " + entry.title);
    }
  } catch(e) {
    ctx.log("Error enriching " + entry.title + ": " + (e.message || e));
    errors++;
  }

  // 2s between enrichments (involves web search + LLM calls)
  if (i < unenriched.length - 1) {
    await new Promise(function(r) { setTimeout(r, 2000); });
  }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_travel_enrich",
  enriched: enriched,
  errors: errors,
  total: places.length,
  unenrichedRemaining: unenriched.length - enriched - errors,
}) }] };
