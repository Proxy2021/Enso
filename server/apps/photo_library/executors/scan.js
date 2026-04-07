var scanResult = await ctx.callTool("enso_context_scan_photos", {});
return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_photo_library_scan",
  success: true,
  data: scanResult,
}) }] };