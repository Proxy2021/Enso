var location = (params.location || "").trim();

// Load saved preference if no location given
if (!location) {
  var savedLoc = await ctx.store.get("preferred_location");
  location = savedLoc || "San Francisco";
}

// Save the location preference
await ctx.store.set("preferred_location", location);

// Load ride history
var rides = (await ctx.store.get("rides")) || [];

// Get weather info via web search
var weather = { temp: "N/A", condition: "Unknown", wind: "N/A", humidity: "N/A", rideScore: 5, recommendation: "Check local conditions before riding." };
try {
  var weatherSearch = await ctx.search("current weather " + location + " cycling conditions today");
  if (weatherSearch.ok && weatherSearch.results && weatherSearch.results.length > 0) {
    var snippets = weatherSearch.results.slice(0, 3).map(function(r) { return r.title + ": " + r.description; }).join("\n");
    var weatherAI = await ctx.ask("Based on these search results about weather in " + location + ":\n" + snippets + "\n\nReturn a JSON object with these fields: temp (string with unit), condition (short word like Sunny/Cloudy/Rainy), wind (string with speed and direction), humidity (string with %), rideScore (1-10 integer rating for cycling), recommendation (one sentence cycling advice). Return ONLY valid JSON, no markdown.");
    if (weatherAI.ok && weatherAI.text) {
      var cleaned = weatherAI.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      try { weather = JSON.parse(cleaned); } catch(e) {}
    }
  }
} catch(e) {}

// Compute stats
var totalDistance = 0;
var totalMinutes = 0;
var longestRide = 0;
var now = new Date();
var thisMonthRides = 0;
var thisMonthDistance = 0;

for (var i = 0; i < rides.length; i++) {
  var r = rides[i];
  totalDistance += r.distance || 0;
  if (r.distance > longestRide) longestRide = r.distance;

  // Parse duration like "1h 30m" to minutes
  var durMin = 0;
  var hMatch = (r.duration || "").match(/(\d+)\s*h/);
  var mMatch = (r.duration || "").match(/(\d+)\s*m/);
  if (hMatch) durMin += parseInt(hMatch[1]) * 60;
  if (mMatch) durMin += parseInt(mMatch[1]);
  totalMinutes += durMin;

  // Check if this month
  try {
    var rDate = new Date(r.date);
    if (rDate.getMonth() === now.getMonth() && rDate.getFullYear() === now.getFullYear()) {
      thisMonthRides++;
      thisMonthDistance += r.distance || 0;
    }
  } catch(e) {}
}

var totalHours = Math.floor(totalMinutes / 60);
var remMinutes = totalMinutes % 60;

var stats = {
  totalRides: rides.length,
  totalDistance: Math.round(totalDistance * 10) / 10,
  totalDuration: totalHours + "h " + remMinutes + "m",
  avgSpeed: totalMinutes > 0 ? Math.round((totalDistance / (totalMinutes / 60)) * 10) / 10 : 0,
  longestRide: Math.round(longestRide * 10) / 10,
  thisMonth: thisMonthRides,
  thisMonthDistance: Math.round(thisMonthDistance * 10) / 10
};

// Get recent rides (last 10)
var recentRides = rides.slice(-10).reverse();

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_bike_dashboard",
      location: location,
      weather: weather,
      stats: stats,
      recentRides: recentRides
    })
  }]
};
