var p = params || {};
// YouTube Manager — unsubscribe.js

var channelIds = p.channelIds || [];

if (channelIds.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_youtube_manager_unsubscribe", error: "No channels specified" }) }] };
}

var result = await ctx.callTool("enso_youtube_unsubscribe", { channelIds: channelIds });

var unsubscribed = [];
var errors = [];
if (result && result.success && result.data) {
  unsubscribed = result.data.unsubscribed || [];
  errors = result.data.errors || [];
} else if (result && typeof result === "string") {
  try {
    var parsed = JSON.parse(result);
    unsubscribed = parsed.unsubscribed || [];
    errors = parsed.errors || [];
  } catch(e) {}
}

// Invalidate cache
try { await ctx.store.delete("yt_manager_subs"); } catch(e) {}

var data = {
  tool: "enso_youtube_manager_unsubscribe",
  unsubscribed: unsubscribed,
  errors: errors,
  count: unsubscribed.length
};

return { content: [{ type: "text", text: JSON.stringify(data) }] };
