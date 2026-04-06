var scanResult = await ctx.callTool("enso_context_scan_bookmarks", {});
result = { tool: "enso_bookmarks_scan", success: true, data: scanResult };
