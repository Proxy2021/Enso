var scanResult = await ctx.callTool("enso_context_scan_photos", {});
result = {
  tool: "enso_photo_library_scan",
  success: true,
  data: scanResult,
};
