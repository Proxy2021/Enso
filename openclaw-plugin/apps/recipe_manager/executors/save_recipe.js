var recipeName = (params.recipeName || "").trim();
var recipeData = (params.recipeData || "").trim();
var collection = (params.collection || "").trim() || "Uncategorized";
var tags = (params.tags || "").trim();
var notes = (params.notes || "").trim();
var rating = typeof params.rating === "number" ? Math.min(5, Math.max(0, params.rating)) : 0;

if (!recipeName) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_recipe_manager_save_recipe",
        error: "No recipe name provided"
      })
    }]
  };
}

var tagList = [];
if (tags) {
  tagList = tags.split(",").map(function(t) { return t.trim(); }).filter(function(t) { return t.length > 0; });
}

var parsedRecipe = null;
if (recipeData) {
  try { parsedRecipe = JSON.parse(recipeData); } catch(e) {}
}

var savedRecipes = await ctx.store.get("recipes") || [];

var existingIdx = -1;
for (var i = 0; i < savedRecipes.length; i++) {
  if (savedRecipes[i].name === recipeName) {
    existingIdx = i;
    break;
  }
}

var entry = {
  name: recipeName,
  collection: collection,
  tags: tagList,
  notes: notes,
  rating: rating,
  imageUrl: parsedRecipe ? (parsedRecipe.imageUrl || "") : "",
  recipeData: recipeData || "",
  savedAt: new Date().toISOString()
};

if (existingIdx >= 0) {
  savedRecipes[existingIdx] = entry;
} else {
  savedRecipes.push(entry);
}

await ctx.store.set("recipes", savedRecipes);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_recipe_manager_save_recipe",
      recipeName: recipeName,
      collection: collection,
      rating: rating,
      tags: tagList,
      notes: notes,
      savedAt: entry.savedAt
    })
  }]
};