var scanResult = await ctx.callTool("enso_context_scan_system", { include: ["apps", "processes"] });
result = { tool: "enso_system_info_scan", success: true, data: scanResult };
