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

var recipes = [];
try {
  var searchResult = await ctx.search(searchQuery, { limit: limit });

  var snippets = [];
  if (searchResult.ok && searchResult.results && searchResult.results.length > 0) {
    snippets = searchResult.results.slice(0, limit).map(function(r) {
      return r.title + ": " + (r.description || "");
    });
  }

  var prompt = "Based on these search results for '" + searchQuery + "':\n" + snippets.join("\n") + "\n\nReturn a JSON array of up to " + limit + " recipes. Each object must have: title (string), description (one sentence), prepTime (string like '15 min'), cookTime (string), totalTime (string), servings (number), cuisine (string), dietary (array of strings), rating (number 1-5), source (string 'web').";

  if (maxTime > 0) {
    prompt += " Only include recipes with total time under " + maxTime + " minutes.";
  }

  prompt += " Return ONLY valid JSON array, no markdown.";

  var aiResult = await ctx.ask(prompt);
  if (aiResult.ok && aiResult.text) {
    var cleaned = aiResult.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    try { recipes = JSON.parse(cleaned); } catch(e) {
      var jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try { recipes = JSON.parse(jsonMatch[0]); } catch(e2) {}
      }
    }
  }
} catch(e) {}

if (!Array.isArray(recipes)) recipes = [];

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
