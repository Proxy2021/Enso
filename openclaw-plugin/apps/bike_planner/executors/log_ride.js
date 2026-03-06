var name = (params.name || "").trim();
var distance = parseFloat(params.distance) || 0;
var duration = (params.duration || "").trim();
var notes = (params.notes || "").trim();

if (!name || !distance || !duration) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_bike_log_ride",
        success: false,
        error: "Name, distance, and duration are required"
      })
    }]
  };
}

// Calculate avg speed
var durMin = 0;
var hMatch = duration.match(/(\d+)\s*h/);
var mMatch = duration.match(/(\d+)\s*m/);
if (hMatch) durMin += parseInt(hMatch[1]) * 60;
if (mMatch) durMin += parseInt(mMatch[1]);
var avgSpeed = durMin > 0 ? Math.round((distance / (durMin / 60)) * 10) / 10 : 0;

var ride = {
  id: "r" + Date.now(),
  date: new Date().toISOString().split("T")[0],
  name: name,
  distance: distance,
  duration: duration,
  avgSpeed: avgSpeed,
  notes: notes
};

// Load existing rides and append
var rides = (await ctx.store.get("rides")) || [];
rides.push(ride);
await ctx.store.set("rides", rides);

// Compute quick stats
var totalDistance = 0;
var thisMonth = 0;
var now = new Date();
for (var i = 0; i < rides.length; i++) {
  totalDistance += rides[i].distance || 0;
  try {
    var rDate = new Date(rides[i].date);
    if (rDate.getMonth() === now.getMonth() && rDate.getFullYear() === now.getFullYear()) thisMonth++;
  } catch(e) {}
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_bike_log_ride",
      success: true,
      ride: ride,
      stats: {
        totalRides: rides.length,
        totalDistance: Math.round(totalDistance * 10) / 10,
        thisMonth: thisMonth
      }
    })
  }]
};
