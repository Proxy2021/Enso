var scanResult = await ctx.callTool("enso_context_scan_qq_music", {});
return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_qq_music_scan",
  success: true,
  data: scanResult,
}) }] };