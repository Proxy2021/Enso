---
name: meal_planner
description: "Comprehensive meal planning with weekly scheduling, shopping lists, nutrition tracking, pantry management, and meal suggestions"
---

Build a reusable, general-purpose Meal Planner app with at least 4 tools. This app handles weekly meal planning, shopping list generation, and nutritional tracking.

REQUIRED: Read CLAUDE-REFERENCE.md first before building.
REQUIRED: Study openclaw-plugin/apps/media_gallery/ as the gold standard for app structure.

**Tools to implement (minimum 4):**
1. **plan_meals** - Create and manage a weekly meal plan. Assign recipes to specific days and meal slots (breakfast, lunch, dinner, snacks). Support drag-and-drop style reassignment via parameters. Allow setting serving counts per meal for household size.
2. **generate_shopping_list** - Generate a consolidated shopping list from the current meal plan. Automatically merge duplicate ingredients across recipes (e.g., 2 recipes needing onions = combined quantity). Categorize items by department (Produce, Dairy, Meat, Pantry, Frozen, etc.). Support checking off purchased items.
3. **track_nutrition** - Show nutritional summary for the planned meals: daily calorie and macro totals, weekly averages, and comparison against customizable daily targets (e.g., 2000 cal, 50g protein). Visualize with progress bars or simple charts.
4. **manage_pantry** - Track what ingredients the user already has. When generating shopping lists, subtract pantry items to avoid buying duplicates. Support adding/removing pantry items.
5. **suggest_meals** - Suggest recipes based on what's in the pantry, dietary preferences, or to fill nutritional gaps in the current week's plan. Help with meal variety and balanced nutrition.

**UI Requirements:**
- Weekly calendar view for meal planning (7 columns x meal slots)
- Shopping list with checkboxes grouped by store department
- Nutrition dashboard with daily/weekly summaries
- Pantry inventory list with search

**Technical Requirements:**
- Integrate with Recipe Manager app data (reference saved recipes)
- All parameters configurable (meal slots, nutrition targets, department categories)
- Smart ingredient merging with unit conversion awareness
- Support multiple household sizes

App family name: meal_planner

## Tool Reference

### enso_meal_planner_plan_meals (primary)

Create and manage a weekly meal plan with configurable meal slots and serving sizes. Supports generating AI-powered plans, assigning recipes to slots, and removing meals.

Parameters:
- `action` (string): Action to perform: generate, assign, remove, or view (default: view)
- `day` (string): Day of the week (Monday-Sunday)
- `slot` (string): Meal slot: breakfast, lunch, dinner, or snacks
- `recipe` (string): Recipe name to assign to a slot
- `servings` (number): Number of servings per meal (default: 2)
- `diet` (string): Dietary preference for plan generation (e.g., balanced, vegetarian, keto, mediterranean)
- `mealSlots` (string): Comma-separated meal slots to include (default: breakfast,lunch,dinner,snacks)

### enso_meal_planner_generate_shopping_list

Generate a consolidated shopping list from the current meal plan. Merges duplicate ingredients and categorizes by store department. Subtracts pantry items.

Parameters:
- `subtractPantry` (boolean): Whether to subtract pantry items from the list (default: true)
- `departments` (string): Comma-separated department categories to use (default: Produce,Dairy,Meat,Pantry,Frozen,Bakery,Beverages,Other)

### enso_meal_planner_track_nutrition

Show nutritional summary for planned meals with daily calorie and macro totals, weekly averages, and progress against customizable daily targets.

Parameters:
- `action` (string): Action: view or set_targets (default: view)
- `calorieTarget` (number): Daily calorie target (default: 2000)
- `proteinTarget` (number): Daily protein target in grams (default: 50)
- `carbsTarget` (number): Daily carbs target in grams (default: 250)
- `fatTarget` (number): Daily fat target in grams (default: 65)

### enso_meal_planner_manage_pantry

Track pantry inventory. Add or remove items. Used by shopping list to subtract what you already have.

Parameters:
- `action` (string): Action: view, add, remove, or clear (default: view)
- `item` (string): Item description to add (e.g., 'Rice 2kg', 'Olive Oil 1 bottle')
- `itemName` (string): Item name to remove

### enso_meal_planner_suggest_meals

Suggest recipes based on pantry contents, dietary preferences, nutritional gaps, or time constraints. Provides AI-powered meal ideas with nutritional info.

Parameters:
- `criteria` (string): Suggestion criteria: pantry, balanced, quick, high-protein, vegetarian, low-carb (default: balanced)
- `excludeRecipes` (string): Comma-separated recipe names to exclude from suggestions
- `count` (number): Number of suggestions to return (default: 5)
