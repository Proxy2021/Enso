var scanResult = await ctx.callTool("enso_context_scan_email", {
  folder: params.folder || "INBOX",
  limit: params.limit || 50,
});
result = { tool: "enso_email_scanner_scan", success: true, data: scanResult };
