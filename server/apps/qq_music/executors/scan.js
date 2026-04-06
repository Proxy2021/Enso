var scanResult = await ctx.callTool("enso_context_scan_qq_music", {});
result = {
  tool: "enso_qq_music_scan",
  success: true,
  data: scanResult,
};
