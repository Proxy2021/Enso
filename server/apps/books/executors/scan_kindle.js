// Books — Kindle scan executor (thin wrapper)
var scanResult = await ctx.callTool("enso_context_scan_kindle_library", {});
return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_books_scan_kindle",
  success: true,
  data: scanResult,
}) }] };
