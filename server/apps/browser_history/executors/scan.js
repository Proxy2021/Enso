var scanResult = await ctx.callTool("enso_context_scan_browser_history", {
  browser: params.browser || "all",
  sinceDays: params.sinceDays || 30,
  limit: 500,
});
result = { tool: "enso_browser_history_scan", success: true, data: scanResult };
