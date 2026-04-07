var scanResult = await ctx.callTool("enso_context_scan_steam", {});
return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_steam_scan", success: true, data: scanResult }) }] };