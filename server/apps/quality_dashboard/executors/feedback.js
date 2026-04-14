var feedbackType = (params.type || "").trim();
var value = params.value;
var text = (params.text || "").trim();
var contextId = (params.contextId || "").trim();

if (!feedbackType) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_quality_dashboard_feedback",
    success: false,
    message: "Feedback type is required ('rating', 'pulse', or 'freeform')"
  }) }] };
}

var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
var qualityDir = homeDir + "/.enso/data/quality";

// Read existing signals
var signals = [];
try {
  var sigResult = await ctx.readFile(qualityDir + "/signals.json");
  if (sigResult.success && sigResult.data) {
    var parsed = typeof sigResult.data === "string" ? JSON.parse(sigResult.data) : sigResult.data;
    signals = Array.isArray(parsed) ? parsed : (parsed.signals || []);
  }
} catch(e) {}

// Create new signal
var now = Date.now();
var signalId = "fb" + now.toString(36).slice(-8);
var newSignal = {
  id: signalId,
  timestamp: now,
  dimension: "satisfaction"
};

if (feedbackType === "rating") {
  newSignal.signal = value > 0 ? "response.rated" : "response.rated";
  newSignal.dimension = "accuracy";
  newSignal.value = value || 0;
  if (contextId) newSignal.context = { conversationId: contextId };
} else if (feedbackType === "pulse") {
  newSignal.signal = "pulse.response";
  newSignal.value = value || 3;
  if (text) newSignal.context = { response: text };
} else if (feedbackType === "freeform") {
  newSignal.signal = "pulse.response";
  newSignal.value = value || 3;
  newSignal.context = { freeform: text || "No text provided" };
}

// Add to ring buffer (keep last 500)
signals.push(newSignal);
if (signals.length > 500) {
  signals = signals.slice(signals.length - 500);
}

// Try to persist the signal
var persisted = false;
try {
  // Ensure quality directory exists by writing
  await ctx.store.set("last_feedback", { type: feedbackType, value: value, timestamp: now });

  // Also try writing to the quality signals file
  // Note: ctx.readFile works but we don't have a direct writeFile
  // Use store as persistent backup
  await ctx.store.set("quality_signals_backup", signals.slice(-100));
  persisted = true;
} catch(e) {}

// Get total feedback count
var totalFeedback = 0;
for (var si = 0; si < signals.length; si++) {
  if (signals[si].signal === "response.rated" || signals[si].signal === "pulse.response") {
    totalFeedback++;
  }
}

// Compute recent quality score from rated signals
var recentRated = [];
for (var ri = signals.length - 1; ri >= 0 && recentRated.length < 20; ri--) {
  if (signals[ri].value !== undefined) {
    recentRated.push(signals[ri].value);
  }
}
var recentScore = 75;
if (recentRated.length > 0) {
  var sum = 0;
  for (var rs = 0; rs < recentRated.length; rs++) sum += recentRated[rs];
  recentScore = Math.round((sum / recentRated.length) * (recentRated[0] <= 1 ? 100 : 20));
}

var messages = {
  rating: value > 0 ? "Thanks for the positive feedback! This helps Enso improve." : "Thanks for letting us know. Enso will learn from this.",
  pulse: "Pulse response recorded. These regular check-ins help calibrate quality.",
  freeform: "Your detailed feedback has been recorded. Thank you for helping Enso improve."
};

var result = {
  tool: "enso_quality_dashboard_feedback",
  success: true,
  type: feedbackType,
  value: value,
  text: text || undefined,
  message: messages[feedbackType] || "Feedback recorded.",
  totalFeedback: totalFeedback,
  recentScore: recentScore,
  persisted: persisted,
  signalId: signalId
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
