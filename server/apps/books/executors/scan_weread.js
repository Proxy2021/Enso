// Books — WeRead scan executor (thin wrapper)
var result = await ctx.callTool("enso_context_scan_weread", {});
return result;
