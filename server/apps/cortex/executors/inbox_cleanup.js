// Cortex Inbox Cleanup — scans inbox for low-value emails, builds report, sends email
var p = params || {};

ctx.log("Inbox cleanup scan starting...");

var result = null;
try {
  // Trigger the scan + report via the server endpoint
  var response = await ctx.fetch("http://localhost:3001/api/email-cleanup/scan-and-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "http://localhost:3001" },
  });

  if (response.ok) {
    result = response.data || response;
    ctx.log("Cleanup report: " + JSON.stringify(result).slice(0, 300));
  } else {
    ctx.log("Scan error: " + (response.status || "unknown"));
    result = { success: false, error: "Server returned error: " + (response.status || "unknown") };
  }
} catch(e) {
  ctx.log("Scan request failed: " + (e.message || e));
  result = { success: false, error: "Failed: " + (e.message || e) };
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_inbox_cleanup",
  success: result ? !!result.success : false,
  candidateCount: result ? result.candidateCount : 0,
  emailCount: result ? result.emailCount : 0,
  emailSent: result ? !!result.emailSent : false,
  message: result ? result.message : "Scan did not complete"
}) }] };
