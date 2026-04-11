// Travel — Golden Hour Calculator: compute sunrise/sunset/golden/blue hour for destination
var p = params || {};
var city = (p.city || "").trim();
var startDate = (p.startDate || "").trim();
var endDate = (p.endDate || "").trim();

if (!city) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_travel_golden_hour", error: "Please provide a destination city." }) }] };
}

// City latitude/longitude database for sun calculations
var cityData = {
  "tokyo": { lat: 35.68, lng: 139.69, tz: 9, country: "Japan" },
  "kyoto": { lat: 35.01, lng: 135.77, tz: 9, country: "Japan" },
  "osaka": { lat: 34.69, lng: 135.50, tz: 9, country: "Japan" },
  "paris": { lat: 48.86, lng: 2.35, tz: 1, country: "France" },
  "london": { lat: 51.51, lng: -0.13, tz: 0, country: "UK" },
  "new york": { lat: 40.71, lng: -74.01, tz: -5, country: "USA" },
  "los angeles": { lat: 34.05, lng: -118.24, tz: -8, country: "USA" },
  "san francisco": { lat: 37.77, lng: -122.42, tz: -8, country: "USA" },
  "rome": { lat: 41.90, lng: 12.50, tz: 1, country: "Italy" },
  "florence": { lat: 43.77, lng: 11.25, tz: 1, country: "Italy" },
  "venice": { lat: 45.44, lng: 12.34, tz: 1, country: "Italy" },
  "barcelona": { lat: 41.39, lng: 2.17, tz: 1, country: "Spain" },
  "istanbul": { lat: 41.01, lng: 28.98, tz: 3, country: "Turkey" },
  "bangkok": { lat: 13.76, lng: 100.50, tz: 7, country: "Thailand" },
  "singapore": { lat: 1.35, lng: 103.82, tz: 8, country: "Singapore" },
  "hong kong": { lat: 22.32, lng: 114.17, tz: 8, country: "China" },
  "shanghai": { lat: 31.23, lng: 121.47, tz: 8, country: "China" },
  "beijing": { lat: 39.90, lng: 116.40, tz: 8, country: "China" },
  "seoul": { lat: 37.57, lng: 126.98, tz: 9, country: "South Korea" },
  "sydney": { lat: -33.87, lng: 151.21, tz: 10, country: "Australia" },
  "melbourne": { lat: -37.81, lng: 144.96, tz: 10, country: "Australia" },
  "cape town": { lat: -33.93, lng: 18.42, tz: 2, country: "South Africa" },
  "dubai": { lat: 25.20, lng: 55.27, tz: 4, country: "UAE" },
  "mumbai": { lat: 19.08, lng: 72.88, tz: 5.5, country: "India" },
  "delhi": { lat: 28.61, lng: 77.21, tz: 5.5, country: "India" },
  "cairo": { lat: 30.04, lng: 31.24, tz: 2, country: "Egypt" },
  "marrakech": { lat: 31.63, lng: -8.00, tz: 1, country: "Morocco" },
  "lisbon": { lat: 38.72, lng: -9.14, tz: 0, country: "Portugal" },
  "amsterdam": { lat: 52.37, lng: 4.90, tz: 1, country: "Netherlands" },
  "berlin": { lat: 52.52, lng: 13.41, tz: 1, country: "Germany" },
  "prague": { lat: 50.08, lng: 14.44, tz: 1, country: "Czech Republic" },
  "vienna": { lat: 48.21, lng: 16.37, tz: 1, country: "Austria" },
  "zurich": { lat: 47.38, lng: 8.54, tz: 1, country: "Switzerland" },
  "stockholm": { lat: 59.33, lng: 18.07, tz: 1, country: "Sweden" },
  "reykjavik": { lat: 64.15, lng: -21.94, tz: 0, country: "Iceland" },
  "athens": { lat: 37.98, lng: 23.73, tz: 2, country: "Greece" },
  "hanoi": { lat: 21.03, lng: 105.85, tz: 7, country: "Vietnam" },
  "ho chi minh city": { lat: 10.82, lng: 106.63, tz: 7, country: "Vietnam" },
  "bali": { lat: -8.41, lng: 115.19, tz: 8, country: "Indonesia" },
  "kuala lumpur": { lat: 3.14, lng: 101.69, tz: 8, country: "Malaysia" },
  "taipei": { lat: 25.03, lng: 121.57, tz: 8, country: "Taiwan" },
  "rio de janeiro": { lat: -22.91, lng: -43.17, tz: -3, country: "Brazil" },
  "buenos aires": { lat: -34.60, lng: -58.38, tz: -3, country: "Argentina" },
  "mexico city": { lat: 19.43, lng: -99.13, tz: -6, country: "Mexico" },
  "havana": { lat: 23.11, lng: -82.37, tz: -5, country: "Cuba" },
  "nairobi": { lat: -1.29, lng: 36.82, tz: 3, country: "Kenya" },
  "cusco": { lat: -13.53, lng: -71.97, tz: -5, country: "Peru" },
  "santorini": { lat: 36.39, lng: 25.46, tz: 2, country: "Greece" },
  "dubrovnik": { lat: 42.65, lng: 18.09, tz: 1, country: "Croatia" },
  "chiang mai": { lat: 18.79, lng: 98.98, tz: 7, country: "Thailand" },
  "kathmandu": { lat: 27.72, lng: 85.32, tz: 5.75, country: "Nepal" },
  "petra": { lat: 30.33, lng: 35.44, tz: 2, country: "Jordan" },
  "siem reap": { lat: 13.36, lng: 103.86, tz: 7, country: "Cambodia" }
};

// Fuzzy match city name
var cityKey = city.toLowerCase();
var loc = cityData[cityKey];
if (!loc) {
  // Try partial match
  var keys = Object.keys(cityData);
  for (var k = 0; k < keys.length; k++) {
    if (keys[k].indexOf(cityKey) >= 0 || cityKey.indexOf(keys[k]) >= 0) {
      loc = cityData[keys[k]];
      cityKey = keys[k];
      break;
    }
  }
}

// If still not found, estimate from latitude (default ~40N)
if (!loc) {
  loc = { lat: 40, lng: 0, tz: 0, country: "Unknown" };
  // Try to use ctx.ask to get coordinates
  try {
    var geoResult = await ctx.ask("What is the latitude, longitude, and UTC timezone offset of " + city + "? Reply ONLY as JSON: {\"lat\":N,\"lng\":N,\"tz\":N,\"country\":\"X\"}", { maxTokens: 100 });
    if (geoResult && geoResult.ok && geoResult.text) {
      var jsonMatch = geoResult.text.match(/\{[^}]+\}/);
      if (jsonMatch) {
        var parsed = JSON.parse(jsonMatch[0]);
        if (parsed.lat) loc = { lat: parsed.lat, lng: parsed.lng || 0, tz: parsed.tz || 0, country: parsed.country || "Unknown" };
      }
    }
  } catch(e) {}
}

// Sun calculation (simplified but reasonably accurate)
function calcSun(lat, lng, tz, dateStr) {
  var parts = dateStr.split("-");
  var year = parseInt(parts[0]);
  var month = parseInt(parts[1]);
  var day = parseInt(parts[2]);

  // Day of year
  var daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) daysInMonth[2] = 29;
  var doy = day;
  for (var m = 1; m < month; m++) doy += daysInMonth[m];

  // Solar declination (approximate)
  var declRad = -23.45 * Math.cos(2 * Math.PI * (doy + 10) / 365) * Math.PI / 180;
  var latRad = lat * Math.PI / 180;

  // Hour angle at sunrise/sunset
  var cosHa = -Math.tan(latRad) * Math.tan(declRad);
  if (cosHa < -1) cosHa = -1; // midnight sun
  if (cosHa > 1) cosHa = 1;   // polar night
  var ha = Math.acos(cosHa) * 180 / Math.PI;

  // Solar noon (approximate using longitude)
  var solarNoon = 12.0 - (lng / 15.0) + tz;

  // Sunrise and sunset in decimal hours (local time)
  var sunriseHr = solarNoon - (ha / 15.0);
  var sunsetHr = solarNoon + (ha / 15.0);

  // Golden hour: ~sun within 6° of horizon (roughly 25 min after rise / before set)
  var goldenDuration = 0.42; // ~25 minutes in hours
  // Blue hour: ~sun between -4° and -6° below horizon (roughly 20 min before rise / after set)
  var blueDuration = 0.33; // ~20 minutes

  function formatTime(h) {
    if (h < 0) h += 24;
    if (h >= 24) h -= 24;
    var hrs = Math.floor(h);
    var mins = Math.round((h - hrs) * 60);
    if (mins === 60) { hrs++; mins = 0; }
    return (hrs < 10 ? "0" : "") + hrs + ":" + (mins < 10 ? "0" : "") + mins;
  }

  return {
    date: dateStr,
    dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(year, month - 1, day).getDay()],
    blueHourMorning: { start: formatTime(sunriseHr - blueDuration - goldenDuration), end: formatTime(sunriseHr - goldenDuration) },
    sunrise: formatTime(sunriseHr),
    goldenHourMorning: { start: formatTime(sunriseHr), end: formatTime(sunriseHr + goldenDuration) },
    solarNoon: formatTime(solarNoon),
    goldenHourEvening: { start: formatTime(sunsetHr - goldenDuration), end: formatTime(sunsetHr) },
    sunset: formatTime(sunsetHr),
    blueHourEvening: { start: formatTime(sunsetHr + goldenDuration), end: formatTime(sunsetHr + goldenDuration + blueDuration) },
    daylightHours: Math.round((sunsetHr - sunriseHr) * 10) / 10
  };
}

// Parse dates
var today = new Date();
var start = startDate ? new Date(startDate) : today;
var end = endDate ? new Date(endDate) : new Date(start.getTime() + 6 * 86400000); // default 7 days

// Cap at 14 days max
var maxDays = 14;
var diffMs = end.getTime() - start.getTime();
var numDays = Math.min(Math.ceil(diffMs / 86400000) + 1, maxDays);
if (numDays < 1) numDays = 1;

var days = [];
for (var i = 0; i < numDays; i++) {
  var d = new Date(start.getTime() + i * 86400000);
  var dateStr = d.getFullYear() + "-" + (d.getMonth() < 9 ? "0" : "") + (d.getMonth() + 1) + "-" + (d.getDate() < 10 ? "0" : "") + d.getDate();
  days.push(calcSun(loc.lat, loc.lng, loc.tz, dateStr));
}

// Build daily schedule template
var schedule = days.map(function(day) {
  return {
    date: day.date,
    dayOfWeek: day.dayOfWeek,
    windows: [
      { label: "Blue Hour AM", time: day.blueHourMorning.start + " - " + day.blueHourMorning.end, icon: "blue_hour", tip: "Cool blue tones, silhouettes, city lights still on" },
      { label: "Sunrise", time: day.sunrise, icon: "sunrise", tip: "Dramatic color, long shadows begin" },
      { label: "Golden Hour AM", time: day.goldenHourMorning.start + " - " + day.goldenHourMorning.end, icon: "golden", tip: "Warm, soft light — ideal for portraits & landscapes" },
      { label: "Midday", time: "~" + day.solarNoon, icon: "midday", tip: "Harsh overhead light — best for architecture, interiors" },
      { label: "Golden Hour PM", time: day.goldenHourEvening.start + " - " + day.goldenHourEvening.end, icon: "golden", tip: "Warm backlight, rim lighting, golden tones" },
      { label: "Sunset", time: day.sunset, icon: "sunset", tip: "Dramatic sky colors, reflections on water" },
      { label: "Blue Hour PM", time: day.blueHourEvening.start + " - " + day.blueHourEvening.end, icon: "blue_hour", tip: "City lights + deep blue sky — magic combination" }
    ],
    daylightHours: day.daylightHours
  };
});

// Save trip to store for other tools to reference
var tripData = {
  city: city,
  country: loc.country,
  lat: loc.lat,
  lng: loc.lng,
  tz: loc.tz,
  startDate: days[0].date,
  endDate: days[days.length - 1].date,
  days: days,
  updatedAt: new Date().toISOString()
};
try {
  await ctx.store.set("current_trip", tripData);
} catch(e) {}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_travel_golden_hour",
  city: city,
  country: loc.country,
  latitude: loc.lat,
  longitude: loc.lng,
  timezone: "UTC" + (loc.tz >= 0 ? "+" : "") + loc.tz,
  tripDays: numDays,
  startDate: days[0].date,
  endDate: days[days.length - 1].date,
  days: days,
  schedule: schedule
}) }] };
