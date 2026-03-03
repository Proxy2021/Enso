---
name: japanese_recipes
description: "Japanese recipe browser with ingredient filters and cooking time estimates"
---

a Japanese recipe browser with ingredient filters and cooking time estimates

## Tool Reference

### enso_japanese_recipes_browse (primary)

Browse Japanese recipes by category (sushi, ramen, tempura, noodles, hotpot, all)

Parameters:
- `category` (string): Recipe category: sushi, ramen, tempura, noodles, hotpot, or all

### enso_japanese_recipes_detail

View full recipe details with step-by-step instructions and cooking tips

Parameters:
- `recipeId` (string): The recipe identifier
- `recipeName` (string): The recipe name for context

### enso_japanese_recipes_filter

Filter Japanese recipes by one or more ingredients

Parameters:
- `ingredients` (string): Comma-separated list of ingredients to filter by
- `matchAll` (boolean): If true, recipes must contain ALL listed ingredients. If false, any match counts.
