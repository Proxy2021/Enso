var scanResult = await ctx.callTool("enso_context_scan_bookmarks", {});
return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_bookmarks_scan", success: true, data: scanResult }) }] };