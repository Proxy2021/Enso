---
name: recipe_manager
description: "Recipe discovery, organization, meal planning with nutritional info and collections"
---

# Recipe Manager

Recipe discovery, organization, meal planning with nutritional info and collections

## Available Tools

### enso_recipe_manager_search_recipes (primary)

Search for recipes by keyword, ingredient, cuisine type, dietary restriction, or meal type. Returns paginated results with images, titles, prep time, and ratings.

Parameters:
- `query` (string): Search query: keyword, ingredient, dish name, cuisine, or dietary preference
- `cuisine` (string): Filter by cuisine type (e.g. italian, mexican, japanese, indian)
- `dietary` (string): Filter by dietary restriction (e.g. vegetarian, vegan, gluten-free, keto, paleo)
- `mealType` (string): Filter by meal type (e.g. breakfast, lunch, dinner, snack, dessert)
- `maxTime` (number): Maximum total time in minutes
- `limit` (number): Max number of results (default 10)

### enso_recipe_manager_view_recipe

Display full recipe details: ingredients with quantities, step-by-step instructions, prep/cook time, servings, cuisine tags, and dietary labels.

Parameters:
- `query` (string): Recipe name or search query to find and display the recipe
- `servings` (number): Number of servings to scale the recipe to

### enso_recipe_manager_get_nutrition

Look up detailed nutritional information for a recipe or ingredient: calories, protein, carbs, fat, fiber, sugar, sodium, and vitamins/minerals. Supports per-serving and per-recipe views.

Parameters:
- `query` (string): Recipe name or ingredient to look up nutrition for
- `servings` (number): Number of servings (for per-serving calculation)
- `viewMode` (string): View mode: 'serving' for per-serving or 'recipe' for total recipe

### enso_recipe_manager_save_recipe

Save a recipe to a personal collection with custom tags, notes, and rating. Organize into collections like 'Weeknight Dinners', 'Holiday Favorites'.

Parameters:
- `recipeName` (string): Name of the recipe to save
- `recipeData` (string): JSON string of the full recipe data
- `collection` (string): Collection name to save to (e.g. 'Weeknight Dinners', 'Quick Meals')
- `tags` (string): Comma-separated tags (e.g. 'easy,chicken,pasta')
- `notes` (string): Personal notes about the recipe
- `rating` (number): Personal rating 1-5

### enso_recipe_manager_browse_collections

Browse and manage saved recipe collections. View all saved recipes, filter by collection or tag, sort by date added or rating.

Parameters:
- `collection` (string): Filter by collection name
- `tag` (string): Filter by tag
- `sortBy` (string): Sort by: 'date', 'rating', or 'name'
