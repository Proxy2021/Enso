// Golden Hour Planner — Shot Planning Cards: manage shot plans with photography details
var p = params || {};
var action = (p.action || "load").trim();
var city = (p.city || "").trim();

// Load current trip context
var tripData = null;
try {
  tripData = await ctx.store.get("current_trip");
} catch(e) {}

if (!city && tripData) city = tripData.city || "";
if (!city) city = "My Trip";

var storeKey = "ghp_shots_" + city.toLowerCase().replace(/[^a-z0-9]/g, "_");
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
    id: "s" + shots.nextId++,
    location: p.location || "",
    bestTime: p.bestTime || "evening_golden",
    focalLength: p.focalLength || "35mm",
    subjectType: p.subjectType || "street",
    lightDirection: p.lightDirection || "side_lit",
    notes: p.notes || "",
    scouted: false,
    attempted: false,
    gotIt: false,
    createdAt: new Date().toISOString()
  };
  shots.items.push(newShot);
}

if (action === "update" && p.shotId) {
  for (var i = 0; i < shots.items.length; i++) {
    if (shots.items[i].id === p.shotId) {
      if (p.location) shots.items[i].location = p.location;
      if (p.bestTime) shots.items[i].bestTime = p.bestTime;
      if (p.focalLength) shots.items[i].focalLength = p.focalLength;
      if (p.subjectType) shots.items[i].subjectType = p.subjectType;
      if (p.lightDirection) shots.items[i].lightDirection = p.lightDirection;
      if (p.notes !== undefined) shots.items[i].notes = p.notes;
      break;
    }
  }
}

if (action === "delete" && p.shotId) {
  shots.items = shots.items.filter(function(s) { return s.id !== p.shotId; });
}

if (action === "toggle_scouted" && p.shotId) {
  for (var j = 0; j < shots.items.length; j++) {
    if (shots.items[j].id === p.shotId) {
      shots.items[j].scouted = !shots.items[j].scouted;
      break;
    }
  }
}

if (action === "toggle_attempted" && p.shotId) {
  for (var k = 0; k < shots.items.length; k++) {
    if (shots.items[k].id === p.shotId) {
      shots.items[k].attempted = !shots.items[k].attempted;
      break;
    }
  }
}

if (action === "toggle_got_it" && p.shotId) {
  for (var m = 0; m < shots.items.length; m++) {
    if (shots.items[m].id === p.shotId) {
      shots.items[m].gotIt = !shots.items[m].gotIt;
      if (shots.items[m].gotIt) shots.items[m].attempted = true;
      break;
    }
  }
}

// Save
try {
  await ctx.store.set(storeKey, shots);
} catch(e) {}

// Stats
var totalShots = shots.items.length;
var scouted = shots.items.filter(function(s) { return s.scouted; }).length;
var attempted = shots.items.filter(function(s) { return s.attempted; }).length;
var gotIt = shots.items.filter(function(s) { return s.gotIt; }).length;

// Group by bestTime
var byTime = {
  "morning_golden": [],
  "evening_golden": [],
  "blue_hour": [],
  "midday_ok": []
};
for (var n = 0; n < shots.items.length; n++) {
  var time = shots.items[n].bestTime || "evening_golden";
  if (!byTime[time]) byTime[time] = [];
  byTime[time].push(shots.items[n]);
}

var timeLabels = {
  "morning_golden": "Morning Golden Hour",
  "evening_golden": "Evening Golden Hour",
  "blue_hour": "Blue Hour",
  "midday_ok": "Midday (OK Light)"
};

var focalLengthOptions = ["28mm", "35mm", "50mm", "85mm+"];
var subjectTypeOptions = ["architecture", "portrait", "street", "landscape", "culture"];
var lightDirectionOptions = ["front_lit", "side_lit", "back_lit", "silhouette"];
var bestTimeOptions = ["morning_golden", "evening_golden", "blue_hour", "midday_ok"];

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_ghp_manage_shots",
  city: city,
  totalShots: totalShots,
  scouted: scouted,
  attempted: attempted,
  gotIt: gotIt,
  byTime: byTime,
  timeLabels: timeLabels,
  allShots: shots.items,
  focalLengthOptions: focalLengthOptions,
  subjectTypeOptions: subjectTypeOptions,
  lightDirectionOptions: lightDirectionOptions,
  bestTimeOptions: bestTimeOptions
}) }] };
