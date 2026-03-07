var filterCollection = (params.collection || "").trim();
var filterTag = (params.tag || "").trim();
var sortBy = (params.sortBy || "").trim() || "date";

var savedRecipes = await ctx.store.get("recipes") || [];

var collectionMap = {};
var allTags = {};
for (var i = 0; i < savedRecipes.length; i++) {
  var r = savedRecipes[i];
  var col = r.collection || "Uncategorized";
  if (!collectionMap[col]) collectionMap[col] = 0;
  collectionMap[col]++;
  var rTags = r.tags || [];
  for (var j = 0; j < rTags.length; j++) {
    allTags[rTags[j]] = true;
  }
}

var collections = [];
var colNames = Object.keys(collectionMap);
for (var k = 0; k < colNames.length; k++) {
  collections.push({ name: colNames[k], count: collectionMap[colNames[k]] });
}

var filtered = savedRecipes.slice();
if (filterCollection) {
  filtered = filtered.filter(function(r) { return r.collection === filterCollection; });
}
if (filterTag) {
  filtered = filtered.filter(function(r) { return (r.tags || []).indexOf(filterTag) >= 0; });
}

if (sortBy === "rating") {
  filtered.sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); });
} else if (sortBy === "name") {
  filtered.sort(function(a, b) { return (a.name || "").localeCompare(b.name || ""); });
} else {
  filtered.sort(function(a, b) {
    return new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime();
  });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_recipe_manager_browse_collections",
      collections: collections,
      allTags: Object.keys(allTags),
      recipes: filtered,
      filterCollection: filterCollection,
      filterTag: filterTag,
      sortBy: sortBy
    })
  }]
};