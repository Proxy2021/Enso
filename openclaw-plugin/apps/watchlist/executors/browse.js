var status = (params.status || "").trim() || "all";
var sortBy = (params.sortBy || "").trim() || "dateAdded";

var items = (await ctx.store.get("watchlist")) || [];

// Filter by status
var filtered = items;
if (status !== "all") {
  filtered = items.filter(function(item) { return item.status === status; });
}

// Sort
filtered.sort(function(a, b) {
  if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
  if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
  return (b.dateAdded || "").localeCompare(a.dateAdded || "");
});

// Compute stats
var toWatch = 0, watching = 0, completed = 0, ratedCount = 0, ratingSum = 0;
for (var i = 0; i < items.length; i++) {
  if (items[i].status === "to-watch") toWatch++;
  else if (items[i].status === "watching") watching++;
  else if (items[i].status === "completed") completed++;
  if (items[i].rating > 0) { ratedCount++; ratingSum += items[i].rating; }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_watchlist_browse",
      status: status,
      sortBy: sortBy,
      items: filtered,
      stats: {
        total: items.length,
        toWatch: toWatch,
        watching: watching,
        completed: completed,
        avgRating: ratedCount > 0 ? Math.round((ratingSum / ratedCount) * 10) / 10 : 0
      }
    })
  }]
};
