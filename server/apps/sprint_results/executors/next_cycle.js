var focusId = (params.focusId || "").trim();

if (!focusId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_next_cycle",
    success: false,
    error: "Missing focusId parameter"
  }) }] };
}

var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
var focusPath = homeDir + "/.enso/data/focus-areas.json";

// Load focus state to get the area title and validate
var focusTitle = "";
var currentCycle = 0;
try {
  var focusResult = await ctx.readFile(focusPath);
  var focusData = null;
  if (focusResult && typeof focusResult === "string") {
    focusData = JSON.parse(focusResult);
  } else if (focusResult && focusResult.success && focusResult.data) {
    focusData = typeof focusResult.data === "string" ? JSON.parse(focusResult.data) : focusResult.data;
  }

  if (focusData && focusData.areas) {
    for (var ai = 0; ai < focusData.areas.length; ai++) {
      if (focusData.areas[ai].id === focusId) {
        focusTitle = focusData.areas[ai].title || "Untitled";
        currentCycle = focusData.areas[ai].cycleCount || 0;
        break;
      }
    }
  }
} catch(e) {}

if (!focusTitle) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_next_cycle",
    success: false,
    error: "Focus area not found: " + focusId
  }) }] };
}

// Use ctx.ask to generate a message about the next cycle
var nextCycleMessage = "New evaluation cycle initiated for " + focusTitle + ". The next briefing will assess your current position and identify new growth areas.";

try {
  var llmResult = await ctx.ask(
    "Generate a brief, encouraging 1-sentence message about starting cycle #" + (currentCycle + 1) +
    " of the focus area '" + focusTitle + "'. Mention that Enso will evaluate progress from the previous sprint and identify new opportunities. Keep it under 40 words."
  );
  if (llmResult && llmResult.ok && llmResult.text) {
    nextCycleMessage = llmResult.text.trim();
  }
} catch(e) {}

var result = {
  tool: "enso_sprint_results_next_cycle",
  success: true,
  focusId: focusId,
  focusTitle: focusTitle,
  message: nextCycleMessage,
  newCycleCount: currentCycle + 1,
  note: "To actually trigger the Evaluate phase, use the focus area conversation or Team Leader schedule. This action registers your intent to proceed."
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
