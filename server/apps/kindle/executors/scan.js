var scanResult = await ctx.callTool("enso_context_scan_kindle_library", {});
return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_kindle_scan",
  success: true,
  data: scanResult,
}) }] };
