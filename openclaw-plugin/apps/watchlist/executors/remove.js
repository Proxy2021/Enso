var itemId = (params.itemId || "").trim();

if (!itemId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_watchlist_remove", success: false, error: "Item ID is required" })
    }]
  };
}

var items = (await ctx.store.get("watchlist")) || [];
var newItems = items.filter(function(item) { return item.id !== itemId; });

if (newItems.length === items.length) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_watchlist_remove", success: false, error: "Item not found" })
    }]
  };
}

await ctx.store.set("watchlist", newItems);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_watchlist_remove",
      success: true,
      removedId: itemId
    })
  }]
};
