var tripId = (params.tripId || "").trim();
var destination = (params.destination || "").trim();
var startDate = (params.startDate || "").trim();
var endDate = (params.endDate || "").trim();
var interests = (params.interests || "").trim();
var action = (params.action || "").trim() || "view";

if (!destination) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_trip_planner_itinerary",
        error: "No destination specified. Please provide a destination."
      })
    }]
  };
}

// Try to load existing itinerary from store
var storeKey = "itinerary_" + (tripId || destination.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase());
var existing = await ctx.store.get(storeKey);

if (existing && action === "view") {
  if (typeof existing === "string") {
    try { existing = JSON.parse(existing); } catch(e) { existing = null; }
  }
  if (existing && existing.days) {
    existing.tool = "enso_trip_planner_itinerary";
    return { content: [{ type: "text", text: JSON.stringify(existing) }] };
  }
}

// Generate itinerary via LLM
var duration = 3;
if (startDate && endDate) {
  try {
    var diff = Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000);
    if (diff > 0) duration = Math.min(diff, 14);
  } catch(e) {}
}

var prompt = "Create a " + duration + "-day travel itinerary for " + destination + ".\n";
if (startDate) prompt += "Starting: " + startDate + ".\n";
if (interests) prompt += "Focus on: " + interests + ".\n";
prompt += "\nReturn JSON with:\n";
prompt += "- days: array of objects with {dayNumber (int), date (YYYY-MM-DD or null), title (string), activities: [{time (HH:MM), title, category (transport|accommodation|food|attraction|shopping|activity), location, duration, cost (string or null), notes (string or null)}]}\n";
prompt += "Include 3-5 activities per day. Use realistic times and local prices.\n";
prompt += "Return ONLY valid JSON, no markdown.";

var result = await ctx.ask(prompt);
var itineraryData = { days: [] };
if (result.ok && result.text) {
  try {
    var cleaned = result.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    itineraryData = JSON.parse(cleaned);
  } catch(e) {
    itineraryData = { days: [] };
  }
}

var output = {
  tool: "enso_trip_planner_itinerary",
  tripId: tripId || "",
  destination: destination,
  startDate: startDate || "",
  endDate: endDate || "",
  status: "planning",
  days: Array.isArray(itineraryData.days) ? itineraryData.days : []
};

// Save to store
await ctx.store.set(storeKey, output);

return {
  content: [{
    type: "text",
    text: JSON.stringify(output)
  }]
};
