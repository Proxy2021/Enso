var scanResult = await ctx.callTool("enso_context_scan_movies_tv", {});
result = { tool: "enso_movies_tv_scan", success: true, data: scanResult };
