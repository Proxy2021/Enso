var category = (params.category || "").trim().toLowerCase() || "all";

var prompt = "Generate a JSON array of 8-12 popular Japanese recipes" +
  (category !== "all" ? " in the " + category + " category" : " across categories: sushi, ramen, tempura, noodles, hotpot") +
  ". Each recipe object must have: id (snake_case), name, category (one of: sushi, ramen, tempura, noodles, hotpot), " +
  "cookTime (minutes as number), difficulty (easy/intermediate/advanced), " +
  "description (1 sentence), keyIngredients (array of 4-6 strings), " +
  "image (single food emoji). Return ONLY the JSON array, no markdown.";

var recipes = [];
try {
  var result = await ctx.ask(prompt);
  var text = result.text || "";
  var match = text.match(/\[[\s\S]*\]/);
  if (match) {
    recipes = JSON.parse(match[0]);
  } else {
    // If ctx.ask succeeds but returns no valid JSON array,
    // we still fall back to default data.
    throw new Error("AI response did not contain a valid JSON array.");
  }
} catch(e) {
  // This catch block will handle both ctx.ask timeouts and JSON parsing errors.
  recipes = [
    { id: "nigiri_sushi", name: "Nigiri Sushi", category: "sushi", cookTime: 45, difficulty: "intermediate", description: "Hand-pressed sushi rice topped with fresh sliced fish", keyIngredients: ["sushi rice", "fresh fish", "rice vinegar", "nori", "wasabi"], image: "\u{1F363}" },
    { id: "tonkotsu_ramen", name: "Tonkotsu Ramen", category: "ramen", cookTime: 480, difficulty: "advanced", description: "Rich pork bone broth ramen with chashu and soft-boiled egg", keyIngredients: ["pork bones", "wheat noodles", "chashu pork", "soft-boiled egg", "scallions"], image: "\u{1F35C}" },
    { id: "shrimp_tempura", name: "Shrimp Tempura", category: "tempura", cookTime: 30, difficulty: "intermediate", description: "Crispy battered shrimp with tentsuyu dipping sauce", keyIngredients: ["shrimp", "flour", "egg", "ice water", "vegetable oil"], image: "\u{1F364}" },
    { id: "kitsune_udon", name: "Kitsune Udon", category: "noodles", cookTime: 25, difficulty: "easy", description: "Thick udon noodles in dashi broth with sweet fried tofu", keyIngredients: ["udon noodles", "dashi", "soy sauce", "aburaage", "scallions"], image: "\u{1F372}" },
    { id: "sukiyaki", name: "Sukiyaki", category: "hotpot", cookTime: 40, difficulty: "easy", description: "Sweet soy-based hot pot with thinly sliced beef and vegetables", keyIngredients: ["sliced beef", "napa cabbage", "tofu", "shiitake mushrooms", "warishita sauce"], image: "\u{1FAD5}" }
  ];
}

var allIngredients = [];
var seen = {};
for (var i = 0; i < recipes.length; i++) {
  var ing = recipes[i].keyIngredients || [];
  for (var j = 0; j < ing.length; j++) {
    var lower = ing[j].toLowerCase();
    if (!seen[lower]) {
      seen[lower] = true;
      allIngredients.push(ing[j]);
    }
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_japanese_recipes_browse",
      category: category,
      recipes: recipes,
      allIngredients: allIngredients.sort()
    })
  }]
};