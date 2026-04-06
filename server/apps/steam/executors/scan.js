var scanResult = await ctx.callTool("enso_context_scan_steam", {});
result = { tool: "enso_steam_scan", success: true, data: scanResult };
