var scanResult = await ctx.callTool("enso_context_scan_system", { include: ["apps", "processes"] });

try {
  var pipeline = await import("../../../../server/src/data-source-pipeline.js");
  pipeline.runPostScanPipeline(["system"]).catch(function() {});
} catch(e) { /* pipeline unavailable */ }

return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_system_info_scan", success: true, data: scanResult }) }] };