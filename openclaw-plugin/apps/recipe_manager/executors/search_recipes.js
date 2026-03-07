var query = (params.query || "").trim();
var cuisine = (params.cuisine || "").trim();
var dietary = (params.dietary || "").trim();
var mealType = (params.mealType || "").trim();
var maxTime = typeof params.maxTime === "number" ? params.maxTime : 0;
var limit = typeof params.limit === "number" ? params.limit : 10;

var searchParts = [];
if (query) searchParts.push(query);
if (cuisine) searchParts.push(cuisine);
if (dietary) searchParts.push(dietary);
if (mealType) searchParts.push(mealType);
searchParts.push("recipe");

var searchQuery = searchParts.join(" ");

if (!query && !cuisine && !dietary && !mealType) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_recipe_manager_search_recipes",
        query: "",
        totalResults: 0,
        filters: { cuisine: [], dietary: [], mealType: "" },
        recipes: []
      })
    }]
  };
}

var searchResult = await ctx.search(searchQuery, { limit: limit });

var urls = [];
if (searchResult.ok && searchResult.results) {
  urls = searchResult.results.slice(0, limit).map(function(r) {
    return r.title + " - " + r.url + " - " + (r.description || "");
  });
}

var prompt = "Based on these search results for recipes matching '" + searchQuery + "', extract up to " + limit + " recipes as a JSON array. Each recipe object must have: title (string), description (1-2 sentence summary), imageUrl (use a relevant Unsplash food image URL like https://images.unsplash.com/photo-XXXXX?w=400&h=300&fit=crop — pick a real photo ID that matches the dish), prepTime (string like '15 min'), cookTime (string), totalTime (string), servings (number), cuisine (string), dietary (array of strings like 'Vegetarian', 'Gluten-Free'), rating (number 1-5), source (string 'web').\n\nSearch results:\n" + urls.join("\n");

if (maxTime > 0) {
  prompt += "\n\nOnly include recipes with total time under " + maxTime + " minutes.";
}

var aiResult = await ctx.ask(prompt);
var recipes = [];
if (aiResult.ok && aiResult.text) {
  try {
    var parsed = aiResult.text;
    var jsonMatch = parsed.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      recipes = JSON.parse(jsonMatch[0]);
    }
  } catch(e) {
    recipes = [];
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_recipe_manager_search_recipes",
      query: query,
      totalResults: recipes.length,
      filters: {
        cuisine: cuisine ? [cuisine] : [],
        dietary: dietary ? [dietary] : [],
        mealType: mealType || ""
      },
      recipes: recipes
    })
  }]
};