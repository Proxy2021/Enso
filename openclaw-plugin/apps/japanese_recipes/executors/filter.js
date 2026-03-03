var ingredientStr = (params.ingredients || "").trim();
var matchAll = params.matchAll === true;

var filterIngredients = ingredientStr.split(",").map(function(s) { return s.trim().toLowerCase(); }).filter(function(s) { return s.length > 0; });

if (filterIngredients.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_japanese_recipes_filter",
        filterIngredients: [],
        matchAll: matchAll,
        matchedRecipes: [],
        totalMatches: 0
      })
    }]
  };
}

var prompt = "Generate a JSON array of 10-15 popular Japanese recipes. " +
  "Each recipe object must have: id (snake_case), name, category (sushi/ramen/tempura/noodles/hotpot), " +
  "cookTime (minutes as number), difficulty (easy/intermediate/advanced), " +
  "description (1 sentence), keyIngredients (array of 5-8 strings of actual ingredients), " +
  "image (single food emoji). " +
  "Include recipes that use some of these ingredients: " + filterIngredients.join(", ") + ". " +
  "Return ONLY the JSON array, no markdown.";

var result = await ctx.ask(prompt);
var allRecipes = [];
try {
  var text = result.text || "";
  var match = text.match(/\[[\s\S]*\]/);
  if (match) {
    allRecipes = JSON.parse(match[0]);
  }
} catch(e) {
  allRecipes = [];
}

var matchedRecipes = [];
for (var i = 0; i < allRecipes.length; i++) {
  var recipe = allRecipes[i];
  var recipeIngLower = (recipe.keyIngredients || []).map(function(s) { return s.toLowerCase(); });
  var matched = [];
  for (var j = 0; j < filterIngredients.length; j++) {
    for (var k = 0; k < recipeIngLower.length; k++) {
      if (recipeIngLower[k].indexOf(filterIngredients[j]) !== -1 || filterIngredients[j].indexOf(recipeIngLower[k]) !== -1) {
        matched.push(filterIngredients[j]);
        break;
      }
    }
  }

  var passes = matchAll ? (matched.length === filterIngredients.length) : (matched.length > 0);
  if (passes) {
    recipe.matchedIngredients = matched;
    matchedRecipes.push(recipe);
  }
}

matchedRecipes.sort(function(a, b) { return (b.matchedIngredients || []).length - (a.matchedIngredients || []).length; });

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_japanese_recipes_filter",
      filterIngredients: filterIngredients,
      matchAll: matchAll,
      matchedRecipes: matchedRecipes,
      totalMatches: matchedRecipes.length
    })
  }]
};
