// Cortex Content Recommendation — triggers the discovery pipeline for movies, games, places, articles
// Each type discovers a new item matching Cortex interests, generates a deep AI podcast, and emails it.

var p = params || {};
var contentType = p.type || "movie";
var validTypes = ["movie", "game", "place", "channel", "article"];
if (validTypes.indexOf(contentType) === -1) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_content_recommendation",
    success: false,
    error: "Invalid type: " + contentType + ". Valid types: " + validTypes.join(", ")
  }) }] };
}

ctx.log("Content recommendation pipeline starting for type: " + contentType);

var result = null;
try {
  var response = await ctx.fetch("http://localhost:3001/api/content-recommendation/daily?type=" + contentType, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3001" },
  });

  if (response.ok) {
    result = response.data || response;
    ctx.log("Discovery result: " + JSON.stringify(result).slice(0, 300));
  } else {
    ctx.log("Pipeline error: " + (response.status || "unknown"));
    result = { success: false, message: "Server returned error: " + (response.status || "unknown") };
  }
} catch(e) {
  ctx.log("Pipeline request failed: " + (e.message || e));
  result = { success: false, message: "Failed to trigger pipeline: " + (e.message || e) };
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_content_recommendation",
  type: contentType,
  success: result ? !!result.success : false,
  title: result ? result.title : null,
  message: result ? result.message : "Pipeline did not return a result",
  note: "Deep processing runs in the background (15-30 min). An email with podcast + Cortex button will be sent when ready."
}) }] };
