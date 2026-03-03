var recipeId = (params.recipeId || "").trim();
var recipeName = (params.recipeName || "").trim() || recipeId.replace(/_/g, " ");

var prompt = "Generate a detailed Japanese recipe for " + recipeName + " as a JSON object with these fields: " +
  "id (use: " + recipeId + "), name, category (sushi/ramen/tempura/noodles/hotpot), " +
  "cookTime (minutes number), prepTime (minutes number), servings (number), " +
  "difficulty (easy/intermediate/advanced), description (2-3 sentences), " +
  "image (single food emoji), " +
  "ingredients (array of objects with: item, amount, category like broth/noodles/toppings/garnish/sauce/main), " +
  "steps (array of instruction strings, 6-10 steps), " +
  "tips (array of 2-3 helpful cooking tips). " +
  "Return ONLY the JSON object, no markdown.";

var result = await ctx.ask(prompt);
var recipe = null;
try {
  var text = result.text || "";
  var match = text.match(/\{[\s\S]*\}/);
  if (match) {
    recipe = JSON.parse(match[0]);
  }
} catch(e) {
  recipe = null;
}

if (!recipe) {
  recipe = {
    id: recipeId,
    name: recipeName,
    category: "general",
    cookTime: 30,
    prepTime: 15,
    servings: 4,
    difficulty: "intermediate",
    description: "A delicious Japanese dish. Details could not be loaded at this time.",
    image: "\u{1F371}",
    ingredients: [{ item: recipeName + " ingredients", amount: "as needed", category: "main" }],
    steps: ["Prepare all ingredients.", "Cook according to traditional methods.", "Serve and enjoy."],
    tips: ["Use the freshest ingredients available."]
  };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_japanese_recipes_detail",
      recipe: recipe
    })
  }]
};
