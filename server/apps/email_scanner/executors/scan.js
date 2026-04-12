var scanResult = await ctx.callTool("enso_context_scan_email", {
  folder: params.folder || "INBOX",
  limit: params.limit || 50,
});

try {
  var pipeline = await import("../../../../server/src/data-source-pipeline.js");
  pipeline.runPostScanPipeline(["email"]).catch(function() {});
} catch(e) { /* pipeline unavailable */ }

return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_email_scanner_scan", success: true, data: scanResult }) }] };