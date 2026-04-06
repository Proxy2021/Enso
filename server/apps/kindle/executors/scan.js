var scanResult = await ctx.callTool("enso_context_scan_kindle_library", {});
result = {
  tool: "enso_kindle_scan",
  success: true,
  data: scanResult,
};
