var action = (params.action || "").trim() || "view";
var itemInput = (params.item || "").trim();
var itemName = (params.itemName || "").trim();

var STORE_KEY = "pantry";
var stored = await ctx.store.get(STORE_KEY);
var items = (stored && stored.items) ? stored.items : [];

if (action === "add" && itemInput) {
  var categoryMap = {
    "rice": "Pantry", "pasta": "Pantry", "flour": "Pantry", "sugar": "Pantry", "salt": "Pantry",
    "oil": "Pantry", "sauce": "Pantry", "vinegar": "Pantry", "spice": "Pantry", "honey": "Pantry",
    "milk": "Dairy", "cheese": "Dairy", "yogurt": "Dairy", "butter": "Dairy", "cream": "Dairy", "egg": "Dairy",
    "chicken": "Meat", "beef": "Meat", "pork": "Meat", "fish": "Meat", "shrimp": "Meat", "salmon": "Meat", "turkey": "Meat",
    "apple": "Produce", "banana": "Produce", "onion": "Produce", "garlic": "Produce", "tomato": "Produce",
    "potato": "Produce", "carrot": "Produce", "lettuce": "Produce", "spinach": "Produce", "pepper": "Produce",
    "lemon": "Produce", "avocado": "Produce", "broccoli": "Produce", "cucumber": "Produce",
    "bread": "Bakery", "tortilla": "Bakery", "bun": "Bakery", "croissant": "Bakery",
    "ice cream": "Frozen", "frozen": "Frozen"
  };

  var parts = itemInput.match(/^(.+?)\s+(\d+\.?\d*)\s*(.*)$/);
  var name = itemInput;
  var quantity = "1";
  var unit = "pcs";

  if (parts) {
    name = parts[1].trim();
    quantity = parts[2];
    unit = (parts[3] || "pcs").trim() || "pcs";
  }

  var category = "Other";
  var nameLower = name.toLowerCase();
  var catKeys = Object.keys(categoryMap);
  for (var ci = 0; ci < catKeys.length; ci++) {
    if (nameLower.includes(catKeys[ci])) {
      category = categoryMap[catKeys[ci]];
      break;
    }
  }

  var existing = items.findIndex(function(it) { return it.name.toLowerCase() === nameLower; });
  if (existing >= 0) {
    items[existing].quantity = quantity;
    items[existing].unit = unit;
  } else {
    items.push({
      name: name,
      quantity: quantity,
      unit: unit,
      category: category,
      addedAt: new Date().toISOString()
    });
  }

  await ctx.store.set(STORE_KEY, { items: items });
} else if (action === "remove" && itemName) {
  items = items.filter(function(it) {
    return it.name.toLowerCase() !== itemName.toLowerCase();
  });
  await ctx.store.set(STORE_KEY, { items: items });
} else if (action === "clear") {
  items = [];
  await ctx.store.set(STORE_KEY, { items: items });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_meal_planner_manage_pantry",
      totalItems: items.length,
      items: items
    })
  }]
};
