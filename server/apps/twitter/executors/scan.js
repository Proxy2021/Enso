var scanResult = await ctx.callTool("enso_context_scan_twitter", {});
return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_twitter_scan",
  success: true,
  data: scanResult,
}) }] };