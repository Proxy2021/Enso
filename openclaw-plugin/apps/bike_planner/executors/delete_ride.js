var rideId = (params.rideId || "").trim();

if (!rideId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_bike_delete_ride",
        success: false,
        error: "Ride ID is required"
      })
    }]
  };
}

var rides = (await ctx.store.get("rides")) || [];
var newRides = rides.filter(function(r) { return r.id !== rideId; });

if (newRides.length === rides.length) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_bike_delete_ride",
        success: false,
        error: "Ride not found: " + rideId
      })
    }]
  };
}

await ctx.store.set("rides", newRides);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_bike_delete_ride",
      success: true,
      deletedId: rideId
    })
  }]
};
