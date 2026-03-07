var tripId = (params.tripId || "").trim();
var destination = (params.destination || "").trim();
var duration = typeof params.duration === "number" ? params.duration : 7;
var climate = (params.climate || "").trim();
var activities = (params.activities || "").trim();
var action = (params.action || "").trim() || "view";

if (!destination) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_trip_planner_packing",
        error: "No destination specified. Please provide a destination."
      })
    }]
  };
}

// Try loading existing packing list
var storeKey = "packing_" + (tripId || destination.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase());
var existing = await ctx.store.get(storeKey);

if (existing && action === "view") {
  if (typeof existing === "string") {
    try { existing = JSON.parse(existing); } catch(e) { existing = null; }
  }
  if (existing && existing.categories) {
    existing.tool = "enso_trip_planner_packing";
    return { content: [{ type: "text", text: JSON.stringify(existing) }] };
  }
}

// Generate packing list via LLM
var prompt = "Create a packing list for a " + duration + "-day trip to " + destination + ".\n";
if (climate) prompt += "Climate: " + climate + ".\n";
if (activities) prompt += "Planned activities: " + activities + ".\n";
prompt += "\nReturn JSON with:\n";
prompt += "- categories: array of {name (string), items: [{name (string), quantity (number), essential (boolean)}]}\n";
prompt += "Include categories: Clothing, Toiletries, Electronics, Documents, Accessories, and any activity-specific categories.\n";
prompt += "Mark truly critical items (passport, charger, etc) as essential: true.\n";
prompt += "Return ONLY valid JSON, no markdown.";

var result = await ctx.ask(prompt);
var packingData = { categories: [] };
if (result.ok && result.text) {
  try {
    var cleaned = result.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    packingData = JSON.parse(cleaned);
  } catch(e) {
    packingData = { categories: [] };
  }
}

var output = {
  tool: "enso_trip_planner_packing",
  tripId: tripId || "",
  destination: destination,
  climate: climate || "",
  categories: Array.isArray(packingData.categories) ? packingData.categories : []
};

// Save to store
await ctx.store.set(storeKey, output);

return {
  content: [{
    type: "text",
    text: JSON.stringify(output)
  }]
};
