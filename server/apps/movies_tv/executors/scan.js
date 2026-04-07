var scanResult = await ctx.callTool("enso_context_scan_movies_tv", {});
return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_movies_tv_scan", success: true, data: scanResult }) }] };