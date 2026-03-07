var status = (params.status || "").trim() || "all";

// Load saved trips from persistent store
var tripsRaw = await ctx.store.get("trips");
var trips = [];
if (Array.isArray(tripsRaw)) {
  trips = tripsRaw;
} else if (tripsRaw && typeof tripsRaw === "string") {
  try { trips = JSON.parse(tripsRaw); } catch(e) { trips = []; }
}

// Filter by status if requested
var filtered = trips;
if (status !== "all") {
  filtered = trips.filter(function(t) { return (t.status || "").toLowerCase() === status.toLowerCase(); });
}

// Calculate progress for each trip
filtered = filtered.map(function(t) {
  if (t.progress == null) {
    var hasFlights = t.flightsBooked ? 20 : 0;
    var hasHotel = t.hotelBooked ? 20 : 0;
    var hasItinerary = t.hasItinerary ? 20 : 0;
    var hasBudget = t.hasBudget ? 20 : 0;
    var hasPacking = t.hasPacking ? 20 : 0;
    t.progress = hasFlights + hasHotel + hasItinerary + hasBudget + hasPacking;
  }
  return t;
});

// Determine default currency from first trip or USD
var currency = "USD";
if (filtered.length > 0 && filtered[0].currency) {
  currency = filtered[0].currency;
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_trip_planner_list_trips",
      currency: currency,
      trips: filtered
    })
  }]
};
