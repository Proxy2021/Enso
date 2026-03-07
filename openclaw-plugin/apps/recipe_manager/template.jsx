export default function GeneratedUI({ data, onAction }) {
  const [searchInput, setSearchInput] = useState("");
  const [servingsScale, setServingsScale] = useState(null);
  const [saveCollection, setSaveCollection] = useState("");
  const [saveNotes, setSaveNotes] = useState("");
  const [saveRating, setSaveRating] = useState(0);
  const [saveTags, setSaveTags] = useState("");
  const [filterCollection, setFilterCollection] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [saveSuccess, setSaveSuccess] = useState(false);

  var isSearch = data?.tool === "enso_recipe_manager_search_recipes";
  var isView = data?.tool === "enso_recipe_manager_view_recipe";
  var isNutrition = data?.tool === "enso_recipe_manager_get_nutrition";
  var isSave = data?.tool === "enso_recipe_manager_save_recipe";
  var isBrowse = data?.tool === "enso_recipe_manager_browse_collections";

  // --- Error state ---
  if (data?.error) {
    return (
      <UICard accent="red" header="Error">
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#f87171" }}>
          <LucideReact.AlertCircle size={20} />
          <span>{data.error}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <Button variant="outline" icon={<LucideReact.Search size={14} />} onClick={() => onAction("search_recipes", { query: "" })}>
            Back to Search
          </Button>
        </div>
      </UICard>
    );
  }

  // --- Save Recipe Result ---
  if (isSave) {
    return (
      <UICard accent="emerald" header="Recipe Saved">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <LucideReact.CheckCircle size={24} color="#34d399" />
          <span style={{ fontSize: 16, fontWeight: 600 }}>{data.recipeName || "Recipe"} saved!</span>
        </div>
        {data.collection && (
          <Badge variant="info">{data.collection}</Badge>
        )}
        {data.rating > 0 && (
          <div style={{ marginTop: 8 }}>
            {[1,2,3,4,5].map(s => (
              <span key={s} style={{ color: s <= data.rating ? "#fbbf24" : "#4b5563", fontSize: 18 }}>★</span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <Button variant="outline" icon={<LucideReact.FolderOpen size={14} />} onClick={() => onAction("browse_collections", {})}>
            View Collections
          </Button>
          <Button variant="outline" icon={<LucideReact.Search size={14} />} onClick={() => onAction("search_recipes", { query: "" })}>
            Search More
          </Button>
        </div>
      </UICard>
    );
  }

  // --- Nutrition View ---
  if (isNutrition) {
    var nutri = data.nutrition || {};
    var nutriItems = [
      { label: "Calories", value: nutri.calories, unit: "kcal", accent: "amber" },
      { label: "Protein", value: nutri.protein, unit: "g", accent: "blue" },
      { label: "Carbs", value: nutri.carbs, unit: "g", accent: "emerald" },
      { label: "Fat", value: nutri.fat, unit: "g", accent: "rose" },
      { label: "Fiber", value: nutri.fiber, unit: "g", accent: "teal" },
      { label: "Sugar", value: nutri.sugar, unit: "g", accent: "orange" },
      { label: "Sodium", value: nutri.sodium, unit: "mg", accent: "purple" },
    ];
    var vitamins = nutri.vitamins || [];

    return (
      <div className="space-y-3">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LucideReact.Apple size={20} color="#34d399" />
            <span style={{ fontSize: 16, fontWeight: 600 }}>{data.name || "Nutrition Facts"}</span>
          </div>
          {data.recipeName && (
            <Button variant="ghost" size="sm" icon={<LucideReact.ArrowLeft size={14} />} onClick={() => onAction("view_recipe", { query: data.recipeName })}>
              Back
            </Button>
          )}
        </div>
        {data.servings && (
          <Badge variant="outline">Per {data.viewMode === "recipe" ? "recipe" : "serving"} ({data.servings} servings)</Badge>
        )}

        <UICard header="Nutrition Label" accent="emerald">
          <div style={{ borderBottom: "8px solid #e5e7eb", paddingBottom: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 24, fontWeight: 800 }}>Nutrition Facts</div>
            {data.servingSize && <div style={{ fontSize: 12, color: "#9ca3af" }}>Serving size: {data.servingSize}</div>}
          </div>
          <div style={{ borderBottom: "4px solid #e5e7eb", paddingBottom: 8, marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 20 }}>Calories</span>
              <span style={{ fontWeight: 700, fontSize: 20 }}>{nutri.calories || "—"}</span>
            </div>
          </div>
          {nutriItems.slice(1).map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #374151" }}>
              <span style={{ fontWeight: item.label === "Fat" || item.label === "Protein" || item.label === "Carbs" ? 700 : 400 }}>{item.label}</span>
              <span>{item.value != null ? item.value + item.unit : "—"}</span>
            </div>
          ))}
          {vitamins.length > 0 && (
            <div style={{ marginTop: 8, borderTop: "4px solid #e5e7eb", paddingTop: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Vitamins & Minerals</div>
              {vitamins.map((v, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 13 }}>
                  <span>{v.name}</span>
                  <span>{v.amount}{v.unit} ({v.dailyValue || "—"})</span>
                </div>
              ))}
            </div>
          )}
        </UICard>

        {nutri.calories && nutri.protein && nutri.carbs && nutri.fat && (
          <UICard header="Macro Breakdown" accent="blue">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Protein", value: parseFloat(nutri.protein) || 0 },
                    { name: "Carbs", value: parseFloat(nutri.carbs) || 0 },
                    { name: "Fat", value: parseFloat(nutri.fat) || 0 }
                  ]}
                  cx="50%" cy="50%" outerRadius={70}
                  dataKey="value"
                  label={({ name, percent }) => name + " " + (percent * 100).toFixed(0) + "%"}
                >
                  <Cell fill="#3b82f6" />
                  <Cell fill="#34d399" />
                  <Cell fill="#f87171" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </UICard>
        )}
      </div>
    );
  }

  // --- View Recipe ---
  if (isView) {
    var recipe = data;
    var scale = servingsScale || recipe.servings || 4;
    var origServings = recipe.servings || 4;
    var ratio = scale / origServings;

    var scaleAmount = function(amount) {
      if (!amount || typeof amount !== "number") return amount;
      var scaled = amount * ratio;
      return scaled % 1 === 0 ? scaled : scaled.toFixed(1);
    };

    return (
      <div className="space-y-3">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Button variant="ghost" icon={<LucideReact.ArrowLeft size={14} />} onClick={() => onAction("search_recipes", { query: "" })}>
            Back
          </Button>
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="outline" icon={<LucideReact.Apple size={14} />} onClick={() => onAction("get_nutrition", { query: recipe.title, servings: scale })}>
              Nutrition
            </Button>
            <Button variant="primary" icon={<LucideReact.Bookmark size={14} />} onClick={() => onAction("save_recipe", { recipeName: recipe.title, recipeData: JSON.stringify(recipe) })}>
              Save
            </Button>
          </div>
        </div>

        {recipe.imageUrl && (
          <div style={{ borderRadius: 12, overflow: "hidden", maxHeight: 250 }}>
            <img src={recipe.imageUrl} alt={recipe.title} style={{ width: "100%", objectFit: "cover" }} />
          </div>
        )}

        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{recipe.title}</h2>
          {recipe.description && <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 4 }}>{recipe.description}</p>}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {recipe.prepTime && (
            <Badge variant="outline">
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <LucideReact.Clock size={12} /> Prep: {recipe.prepTime}
              </span>
            </Badge>
          )}
          {recipe.cookTime && (
            <Badge variant="outline">
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <LucideReact.Flame size={12} /> Cook: {recipe.cookTime}
              </span>
            </Badge>
          )}
          {recipe.totalTime && (
            <Badge variant="info">Total: {recipe.totalTime}</Badge>
          )}
          {recipe.difficulty && <Badge variant="default">{recipe.difficulty}</Badge>}
          {(recipe.cuisine || []).map((c, i) => <Badge key={i} variant="outline">{c}</Badge>)}
          {(recipe.dietary || []).map((d, i) => <Badge key={"d"+i} variant="success">{d}</Badge>)}
        </div>

        <UICard header="Ingredients" accent="amber">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "#9ca3af" }}>Servings:</span>
            <Button variant={scale > 1 ? "ghost" : "outline"} onClick={() => setServingsScale(Math.max(1, scale - 1))}>−</Button>
            <span style={{ fontWeight: 600, minWidth: 24, textAlign: "center" }}>{scale}</span>
            <Button variant="ghost" onClick={() => setServingsScale(scale + 1)}>+</Button>
            {scale !== origServings && (
              <Button variant="ghost" onClick={() => setServingsScale(origServings)} style={{ fontSize: 11 }}>Reset</Button>
            )}
          </div>
          <div>
            {(recipe.ingredients || []).map((ing, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #1f2937" }}>
                <span style={{ fontWeight: 600, minWidth: 60, textAlign: "right" }}>
                  {ing.amount ? scaleAmount(ing.amount) : ""} {ing.unit || ""}
                </span>
                <span>{ing.name}</span>
              </div>
            ))}
          </div>
        </UICard>

        <UICard header="Instructions" accent="blue">
          <div>
            {(recipe.instructions || []).map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #1f2937" }}>
                <div style={{ minWidth: 28, height: 28, borderRadius: "50%", background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ fontSize: 14 }}>{typeof step === "string" ? step : step.text}</div>
              </div>
            ))}
          </div>
        </UICard>

        {recipe.tips && recipe.tips.length > 0 && (
          <Accordion items={[{ value: "tips", title: "Tips & Notes", content: (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {recipe.tips.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
            </ul>
          )}]} defaultOpen={[]} />
        )}
      </div>
    );
  }

  // --- Browse Collections ---
  if (isBrowse) {
    var collections = data.collections || [];
    var allRecipes = data.recipes || [];
    var allTags = data.allTags || [];
    var viewing = data.viewingCollection || "";

    var filteredRecipes = allRecipes;
    if (filterCollection) {
      filteredRecipes = filteredRecipes.filter(function(r) { return r.collection === filterCollection; });
    }
    if (filterTag) {
      filteredRecipes = filteredRecipes.filter(function(r) { return (r.tags || []).indexOf(filterTag) >= 0; });
    }
    if (sortBy === "rating") {
      filteredRecipes = filteredRecipes.slice().sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); });
    } else if (sortBy === "name") {
      filteredRecipes = filteredRecipes.slice().sort(function(a, b) { return (a.name || "").localeCompare(b.name || ""); });
    }

    return (
      <div className="space-y-3">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LucideReact.BookOpen size={20} color="#a78bfa" />
            <span style={{ fontSize: 16, fontWeight: 600 }}>My Recipe Collections</span>
          </div>
          <Button variant="outline" icon={<LucideReact.Search size={14} />} onClick={() => onAction("search_recipes", { query: "" })}>
            Search
          </Button>
        </div>

        {collections.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant={!filterCollection ? "primary" : "outline"} onClick={() => setFilterCollection("")}>All</Button>
            {collections.map(function(col, i) {
              return (
                <Button key={i} variant={filterCollection === col.name ? "primary" : "outline"} onClick={() => setFilterCollection(col.name)}>
                  {col.name} ({col.count || 0})
                </Button>
              );
            })}
          </div>
        )}

        {allTags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <LucideReact.Tag size={14} color="#9ca3af" />
            {allTags.map(function(tag, i) {
              return (
                <Badge key={i} variant={filterTag === tag ? "info" : "outline"} onClick={() => setFilterTag(filterTag === tag ? "" : tag)} style={{ cursor: "pointer" }}>
                  {tag}
                </Badge>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>Sort:</span>
          <Select value={sortBy} onChange={function(v) { setSortBy(v); }} options={[
            { value: "date", label: "Date Added" },
            { value: "rating", label: "Rating" },
            { value: "name", label: "Name" }
          ]} />
        </div>

        {filteredRecipes.length === 0 ? (
          <EmptyState
            icon={<LucideReact.BookOpen size={40} />}
            title="No saved recipes"
            description="Search for recipes and save your favorites"
            action={<Button variant="primary" icon={<LucideReact.Search size={14} />} onClick={() => onAction("search_recipes", { query: "" })}>Search Recipes</Button>}
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {filteredRecipes.map(function(r, i) {
              return (
                <UICard key={i} accent="purple">
                  {r.imageUrl && (
                    <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 8, height: 120 }}>
                      <img src={r.imageUrl} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    {r.collection && <Badge variant="info">{r.collection}</Badge>}
                    {(r.tags || []).map(function(t, j) { return <Badge key={j} variant="outline">{t}</Badge>; })}
                  </div>
                  {r.rating > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {[1,2,3,4,5].map(function(s) {
                        return <span key={s} style={{ color: s <= r.rating ? "#fbbf24" : "#4b5563" }}>★</span>;
                      })}
                    </div>
                  )}
                  {r.notes && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{r.notes}</div>}
                  <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                    <Button variant="outline" size="sm" onClick={() => onAction("view_recipe", { query: r.name })}>View</Button>
                    <Button variant="ghost" size="sm" icon={<LucideReact.Apple size={12} />} onClick={() => onAction("get_nutrition", { query: r.name })}>Nutrition</Button>
                  </div>
                </UICard>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- Default: Search Recipes ---
  var recipes = data?.recipes || [];
  var searchQuery = data?.query || "";

  return (
    <div className="space-y-3">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <LucideReact.ChefHat size={22} color="#f59e0b" />
        <span style={{ fontSize: 18, fontWeight: 700 }}>Recipe Manager</span>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="outline" icon={<LucideReact.BookOpen size={14} />} onClick={() => onAction("browse_collections", {})}>
            Collections
          </Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Input
            icon={<LucideReact.Search size={14} />}
            placeholder="Search recipes (e.g. 'chicken pasta', 'vegan desserts', 'gluten-free breakfast')"
            value={searchInput || searchQuery}
            onChange={function(v) { setSearchInput(v); }}
            onKeyDown={function(e) { if (e.key === "Enter" && searchInput.trim()) onAction("search_recipes", { query: searchInput.trim() }); }}
          />
        </div>
        <Button variant="primary" icon={<LucideReact.Search size={14} />} onClick={function() { if (searchInput.trim()) onAction("search_recipes", { query: searchInput.trim() }); }}>
          Search
        </Button>
      </div>

      {data?.filters && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(data.filters.cuisine || []).map(function(c, i) { return <Badge key={"c"+i} variant="outline">{c}</Badge>; })}
          {(data.filters.dietary || []).map(function(d, i) { return <Badge key={"d"+i} variant="success">{d}</Badge>; })}
          {data.filters.mealType && <Badge variant="info">{data.filters.mealType}</Badge>}
        </div>
      )}

      {recipes.length === 0 && !data?.error ? (
        <EmptyState
          icon={<LucideReact.ChefHat size={40} />}
          title={searchQuery ? "No recipes found" : "Discover Recipes"}
          description={searchQuery ? "Try different keywords or broaden your search" : "Search by ingredient, cuisine, dietary preference, or meal type"}
        />
      ) : (
        <div>
          {data?.totalResults && (
            <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 8 }}>
              Found {data.totalResults} recipes for "{searchQuery}"
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {recipes.map(function(r, i) {
              return (
                <UICard key={i} accent="amber">
                  {r.imageUrl && (
                    <div style={{ borderRadius: 8, overflow: "hidden", marginBottom: 8, height: 140, cursor: "pointer" }} onClick={() => onAction("view_recipe", { query: r.title })}>
                      <img src={r.imageUrl} alt={r.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  <div style={{ fontWeight: 600, cursor: "pointer" }} onClick={() => onAction("view_recipe", { query: r.title })}>
                    {r.title}
                  </div>
                  {r.description && (
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {r.description}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {r.prepTime && (
                      <Badge variant="outline">
                        <span style={{ display: "flex", alignItems: "center", gap: 2 }}><LucideReact.Clock size={10} /> {r.prepTime}</span>
                      </Badge>
                    )}
                    {r.cuisine && <Badge variant="outline">{r.cuisine}</Badge>}
                    {(r.dietary || []).map(function(d, j) { return <Badge key={j} variant="success">{d}</Badge>; })}
                  </div>
                  {r.rating && (
                    <div style={{ marginTop: 4 }}>
                      {[1,2,3,4,5].map(function(s) {
                        return <span key={s} style={{ color: s <= r.rating ? "#fbbf24" : "#4b5563", fontSize: 13 }}>★</span>;
                      })}
                    </div>
                  )}
                  <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                    <Button variant="primary" size="sm" onClick={() => onAction("view_recipe", { query: r.title })}>View Recipe</Button>
                    <Button variant="ghost" size="sm" icon={<LucideReact.Bookmark size={12} />} onClick={() => onAction("save_recipe", { recipeName: r.title, recipeData: JSON.stringify(r) })}>Save</Button>
                  </div>
                </UICard>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}