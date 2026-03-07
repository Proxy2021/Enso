var query = (params.query || "").trim();
var servings = typeof params.servings === "number" ? params.servings : 4;
var viewMode = (params.viewMode || "").trim() || "serving";

if (!query) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_recipe_manager_get_nutrition",
        error: "No recipe or ingredient specified"
      })
    }]
  };
}

var prompt = 'Provide detailed nutritional information for "' + query + '" (' + servings + ' servings, showing per ' + viewMode + ' values). Return as JSON with these fields:\n' +
  '- name (string, the food/recipe name)\n' +
  '- servings (number)\n- servingSize (string like "1 plate (~350g)")\n' +
  '- nutrition: { calories (number), protein (string, grams), carbs (string, grams), fat (string, grams), fiber (string, grams), sugar (string, grams), sodium (string, mg), vitamins: [{name, amount, unit, dailyValue}] }\n' +
  'Include at least 4 vitamins/minerals (Vitamin A, C, Iron, Calcium, Potassium, etc.).\n' +
  'Use realistic nutritional values based on common recipe data.\n' +
  'If viewMode is "recipe", multiply per-serving values by ' + servings + '.\n' +
  'Return ONLY the JSON object.';

var aiResult = await ctx.ask(prompt);
var data = {};
if (aiResult.ok && aiResult.text) {
  try {
    var jsonMatch = aiResult.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) data = JSON.parse(jsonMatch[0]);
  } catch(e) {}
}

data.tool = "enso_recipe_manager_get_nutrition";
data.recipeName = query;
data.viewMode = viewMode;
if (!data.name) data.name = query;
if (!data.servings) data.servings = servings;
if (!data.nutrition) data.nutrition = { calories: 0, protein: "0", carbs: "0", fat: "0", fiber: "0", sugar: "0", sodium: "0", vitamins: [] };

return { content: [{ type: "text", text: JSON.stringify(data) }] };