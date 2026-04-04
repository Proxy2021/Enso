// YouTube Manager — unsubscribe.js

var channelIds = params.channelIds || [];

if (channelIds.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_youtube_manager_unsubscribe", error: "No channels specified" }) }] };
}

var result = await ctx.callTool("enso_youtube_unsubscribe", { channelIds: channelIds });
var parsed = typeof result === "string" ? JSON.parse(result) : result;

// Invalidate the subscription cache so next load is fresh
try {
  await ctx.store.delete("yt_manager_subs");
} catch(e) {}

var data = {
  tool: "enso_youtube_manager_unsubscribe",
  unsubscribed: parsed.unsubscribed || parsed.data?.unsubscribed || [],
  errors: parsed.errors || parsed.data?.errors || [],
  count: (parsed.unsubscribed || parsed.data?.unsubscribed || []).length
};

return { content: [{ type: "text", text: JSON.stringify(data) }] };
