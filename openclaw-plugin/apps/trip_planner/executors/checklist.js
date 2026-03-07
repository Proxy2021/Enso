var tripId = (params.tripId || "").trim();
var destination = (params.destination || "").trim();
var startDate = (params.startDate || "").trim();
var action = (params.action || "").trim() || "view";

if (!destination) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_trip_planner_checklist",
        error: "No destination specified. Please provide a destination."
      })
    }]
  };
}

// Try loading existing checklist
var storeKey = "checklist_" + (tripId || destination.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase());
var existing = await ctx.store.get(storeKey);

if (existing && action === "view") {
  if (typeof existing === "string") {
    try { existing = JSON.parse(existing); } catch(e) { existing = null; }
  }
  if (existing && existing.tasks) {
    existing.tool = "enso_trip_planner_checklist";
    return { content: [{ type: "text", text: JSON.stringify(existing) }] };
  }
}

// Generate checklist via LLM
var prompt = "Create a pre-trip preparation checklist for traveling to " + destination + ".\n";
if (startDate) prompt += "Departure date: " + startDate + ".\n";
prompt += "\nReturn JSON with:\n";
prompt += "- tasks: array of {title (string), status ('pending'), priority ('high'|'medium'|'low'), dueDate (YYYY-MM-DD or null), notes (string or null)}\n";
prompt += "Include 8-12 tasks covering: passport/visa, flights, accommodation, insurance, activities booking, transport, communication (SIM/WiFi), currency, packing, and day-before prep.\n";
prompt += "Set all statuses to 'pending'.\n";
if (startDate) prompt += "Calculate due dates based on departure: " + startDate + " (high priority items 2-3 months before, medium 1 month, low 1 week).\n";
prompt += "Return ONLY valid JSON, no markdown.";

var result = await ctx.ask(prompt);
var checklistData = { tasks: [] };
if (result.ok && result.text) {
  try {
    var cleaned = result.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    checklistData = JSON.parse(cleaned);
  } catch(e) {
    checklistData = { tasks: [] };
  }
}

var output = {
  tool: "enso_trip_planner_checklist",
  tripId: tripId || "",
  destination: destination,
  startDate: startDate || "",
  tasks: Array.isArray(checklistData.tasks) ? checklistData.tasks : []
};

// Save to store
await ctx.store.set(storeKey, output);

return {
  content: [{
    type: "text",
    text: JSON.stringify(output)
  }]
};
