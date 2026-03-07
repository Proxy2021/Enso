var query = (params.query || "").trim();
var servings = typeof params.servings === "number" ? params.servings : 0;

if (!query) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_recipe_manager_view_recipe",
        error: "No recipe specified"
      })
    }]
  };
}

var savedRecipes = await ctx.store.get("recipes") || [];
var found = savedRecipes.find(function(r) {
  return (r.name || "").toLowerCase() === query.toLowerCase() ||
         (r.title || "").toLowerCase() === query.toLowerCase();
});

var recipeData = null;
if (found && found.recipeData) {
  try { recipeData = typeof found.recipeData === "string" ? JSON.parse(found.recipeData) : found.recipeData; } catch(e) {}
}

if (recipeData && recipeData.ingredients && recipeData.instructions) {
  recipeData.tool = "enso_recipe_manager_view_recipe";
  if (servings > 0) recipeData.servings = servings;
  return { content: [{ type: "text", text: JSON.stringify(recipeData) }] };
}

var searchResult = await ctx.search(query + " recipe ingredients instructions", { limit: 5 });
var context = "";
if (searchResult.ok && searchResult.results) {
  context = searchResult.results.map(function(r) {
    return r.title + ": " + (r.description || "") + " (" + r.url + ")";
  }).join("\n");
}

var prompt = 'Create a detailed recipe for "' + query + '" as JSON. Include these fields:\n' +
  '- title (string)\n- description (1-2 sentences)\n' +
  '- imageUrl (relevant Unsplash food URL like https://images.unsplash.com/photo-XXXXX?w=400&h=300&fit=crop)\n' +
  '- prepTime, cookTime, totalTime (strings like "15 min")\n' +
  '- servings (number, default 4)\n- difficulty (Easy/Medium/Hard)\n' +
  '- cuisine (array of strings)\n- dietary (array of strings if applicable, e.g. Vegetarian, Gluten-Free)\n' +
  '- ingredients (array of {name, amount (number), unit})\n' +
  '- instructions (array of step strings)\n' +
  '- tips (array of tip strings, 2-3 tips)\n- rating (number)\n- source ("web")\n\n' +
  'Reference info:\n' + context + '\n\nReturn ONLY the JSON object, no markdown.';

var aiResult = await ctx.ask(prompt);
var recipe = {};
if (aiResult.ok && aiResult.text) {
  try {
    var jsonMatch = aiResult.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) recipe = JSON.parse(jsonMatch[0]);
  } catch(e) {}
}

recipe.tool = "enso_recipe_manager_view_recipe";
if (servings > 0) recipe.servings = servings;
if (!recipe.title) recipe.title = query;
if (!recipe.ingredients) recipe.ingredients = [];
if (!recipe.instructions) recipe.instructions = [];

return { content: [{ type: "text", text: JSON.stringify(recipe) }] };