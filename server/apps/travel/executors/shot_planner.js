// Travel — Shot Planner: plan and organize photography shots by day/time
var p = params || {};
var action = (p.action || "load").trim();
var city = (p.city || "").trim();

// Load current trip context
var tripData = null;
try {
  tripData = await ctx.store.get("current_trip");
} catch(e) {}

if (!city && tripData) city = tripData.city || "";

var storeKey = "shots_" + city.toLowerCase().replace(/\s+/g, "_");
var shots = null;
try {
  shots = await ctx.store.get(storeKey);
} catch(e) {}

if (!shots) {
  shots = { items: [], nextId: 1 };
}

// Handle actions
if (action === "add" && p.location) {
  var newShot = {
    id: shots.nextId++,
    location: p.location || "",
    timeOfDay: p.timeOfDay || "golden_hour_pm",
    sceneType: p.sceneType || "",
    day: parseInt(p.day) || 1,
    subject: p.subject || "",
    technique: p.technique || "",
    reference: p.reference || "",
    priority: p.priority || "must_get",
    notes: p.notes || "",
    completed: false,
    createdAt: new Date().toISOString()
  };
  shots.items.push(newShot);
}

if (action === "toggle" && p.shotId) {
  var sid = parseInt(p.shotId);
  for (var i = 0; i < shots.items.length; i++) {
    if (shots.items[i].id === sid) {
      shots.items[i].completed = !shots.items[i].completed;
      break;
    }
  }
}

if (action === "delete" && p.shotId) {
  var did = parseInt(p.shotId);
  shots.items = shots.items.filter(function(s) { return s.id !== did; });
}

if (action === "update_priority" && p.shotId && p.priority) {
  var uid = parseInt(p.shotId);
  for (var j = 0; j < shots.items.length; j++) {
    if (shots.items[j].id === uid) {
      shots.items[j].priority = p.priority;
      break;
    }
  }
}

// Save shots
try {
  await ctx.store.set(storeKey, shots);
} catch(e) {}

// Organize by day
var byDay = {};
var totalDays = (tripData && tripData.days) ? tripData.days.length : 7;
for (var d = 1; d <= totalDays; d++) {
  byDay[d] = [];
}
for (var k = 0; k < shots.items.length; k++) {
  var shot = shots.items[k];
  var dayNum = shot.day || 1;
  if (!byDay[dayNum]) byDay[dayNum] = [];
  byDay[dayNum].push(shot);
}

// Sort each day's shots by time of day order
var timeOrder = { "blue_hour_am": 0, "sunrise": 1, "golden_hour_am": 2, "midday": 3, "golden_hour_pm": 4, "sunset": 5, "blue_hour_pm": 6, "night": 7 };
var dayKeys = Object.keys(byDay).sort(function(a, b) { return parseInt(a) - parseInt(b); });
var organizedDays = [];
for (var dk = 0; dk < dayKeys.length; dk++) {
  var dayShots = byDay[dayKeys[dk]];
  dayShots.sort(function(a, b) { return (timeOrder[a.timeOfDay] || 0) - (timeOrder[b.timeOfDay] || 0); });
  organizedDays.push({
    day: parseInt(dayKeys[dk]),
    shots: dayShots,
    date: (tripData && tripData.days && tripData.days[parseInt(dayKeys[dk]) - 1]) ? tripData.days[parseInt(dayKeys[dk]) - 1].date : null
  });
}

// Stats
var totalShots = shots.items.length;
var mustGet = shots.items.filter(function(s) { return s.priority === "must_get"; }).length;
var niceToHave = shots.items.filter(function(s) { return s.priority === "nice_to_have"; }).length;
var completed = shots.items.filter(function(s) { return s.completed; }).length;

// Time label map
var timeLabels = {
  "blue_hour_am": "Blue Hour AM",
  "sunrise": "Sunrise",
  "golden_hour_am": "Golden Hour AM",
  "midday": "Midday",
  "golden_hour_pm": "Golden Hour PM",
  "sunset": "Sunset",
  "blue_hour_pm": "Blue Hour PM",
  "night": "Night"
};

// Scene type archetypes (from SCAF framework)
var sceneTypes = [
  { value: "ancient_temple", label: "Ancient Temple", icon: "temple" },
  { value: "market_street", label: "Bustling Market", icon: "market" },
  { value: "coastal_sunset", label: "Coastal Sunset", icon: "coast" },
  { value: "urban_night", label: "Urban Night", icon: "night" },
  { value: "mountain_vista", label: "Mountain Vista", icon: "mountain" },
  { value: "village_morning", label: "Village Morning", icon: "village" },
  { value: "grand_interior", label: "Grand Interior", icon: "interior" },
  { value: "desert_landscape", label: "Desert / Arid", icon: "desert" },
  { value: "festival", label: "Festival / Celebration", icon: "festival" },
  { value: "waterfront_twilight", label: "Waterfront Twilight", icon: "water" },
  { value: "street_candid", label: "Street / Candid", icon: "street" },
  { value: "portrait", label: "Portrait", icon: "portrait" },
  { value: "food_culture", label: "Food & Culture", icon: "food" },
  { value: "architecture", label: "Architecture", icon: "arch" },
  { value: "other", label: "Other", icon: "other" }
];

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_travel_shot_planner",
  city: city,
  totalShots: totalShots,
  mustGet: mustGet,
  niceToHave: niceToHave,
  completed: completed,
  totalDays: totalDays,
  timeLabels: timeLabels,
  sceneTypes: sceneTypes,
  days: organizedDays,
  allShots: shots.items
}) }] };
