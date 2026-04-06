var scanResult = await ctx.callTool("enso_context_scan_twitter", {});
result = {
  tool: "enso_twitter_scan",
  success: true,
  data: scanResult,
};
