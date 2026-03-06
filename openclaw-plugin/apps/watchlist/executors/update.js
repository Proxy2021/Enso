var itemId = (params.itemId || "").trim();

if (!itemId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_watchlist_update", success: false, error: "Item ID is required" })
    }]
  };
}

var items = (await ctx.store.get("watchlist")) || [];
var found = false;
var updatedItem = null;

for (var i = 0; i < items.length; i++) {
  if (items[i].id === itemId) {
    found = true;
    if (params.status !== undefined && params.status !== null) items[i].status = params.status;
    if (params.rating !== undefined && params.rating !== null) items[i].rating = parseInt(params.rating) || 0;
    if (params.notes !== undefined && params.notes !== null) items[i].notes = params.notes;
    updatedItem = items[i];
    break;
  }
}

if (!found) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_watchlist_update", success: false, error: "Item not found" })
    }]
  };
}

await ctx.store.set("watchlist", items);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_watchlist_update",
      success: true,
      item: updatedItem
    })
  }]
};
