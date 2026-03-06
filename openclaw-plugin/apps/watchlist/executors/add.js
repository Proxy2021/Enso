var title = (params.title || "").trim();
var year = parseInt(params.year) || 0;
var type = (params.type || "").trim() || "movie";
var genre = (params.genre || "").trim() || "Unknown";
var status = (params.status || "").trim() || "to-watch";
var notes = (params.notes || "").trim();

if (!title) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_watchlist_add", success: false, error: "Title is required" })
    }]
  };
}

var items = (await ctx.store.get("watchlist")) || [];

// Check for duplicates
var exists = items.some(function(item) {
  return item.title.toLowerCase() === title.toLowerCase();
});
if (exists) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_watchlist_add", success: false, error: "'" + title + "' is already in your watchlist" })
    }]
  };
}

var newItem = {
  id: "w" + Date.now(),
  title: title,
  year: year,
  type: type,
  genre: genre,
  status: status,
  rating: 0,
  notes: notes,
  dateAdded: new Date().toISOString().split("T")[0]
};

items.push(newItem);
await ctx.store.set("watchlist", items);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_watchlist_add",
      success: true,
      item: newItem
    })
  }]
};
