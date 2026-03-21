---
name: meal_planner
description: "Comprehensive meal planning with weekly scheduling, shopping lists, nutrition tracking, pantry management, and meal suggestions"
---

# Meal Planner

Comprehensive meal planning with weekly scheduling, shopping lists, nutrition tracking, pantry management, and meal suggestions

## Available Tools

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
