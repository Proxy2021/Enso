var scanResult = await ctx.callTool("enso_context_scan_files", {
  maxDepth: params.maxDepth || 3,
});
return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_projects_scanner_scan", success: true, data: scanResult }) }] };