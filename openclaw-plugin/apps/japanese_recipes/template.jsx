export default function GeneratedUI({ data, onAction }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [ingredientInput, setIngredientInput] = useState("");
  const [matchAllMode, setMatchAllMode] = useState(false);
  const [expandedStep, setExpandedStep] = useState(null);

  const isDetailView = data?.tool === "enso_japanese_recipes_detail";
  const isFilterView = data?.tool === "enso_japanese_recipes_filter";
  const isBrowseView = data?.tool === "enso_japanese_recipes_browse" || Array.isArray(data?.recipes);

  const formatTime = (minutes) => {
    if (!minutes) return "N/A";
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return h + "h" + (m > 0 ? " " + m + "m" : "");
    }
    return minutes + "m";
  };

  const difficultyColor = (d) => {
    if (d === "easy") return "emerald";
    if (d === "intermediate") return "amber";
    return "rose";
  };

  const categoryOptions = [
    { value: "all", label: "All Dishes" },
    { value: "sushi", label: "Sushi" },
    { value: "ramen", label: "Ramen" },
    { value: "tempura", label: "Tempura" },
    { value: "noodles", label: "Noodles" },
    { value: "hotpot", label: "Hot Pot" }
  ];

  // --- DETAIL VIEW ---
  if (isDetailView) {
    const r = data.recipe || {};
    const ingredients = r.ingredients || [];
    const steps = r.steps || [];
    const tips = r.tips || [];
    const ingredientCategories = [...new Set(ingredients.map(i => i.category || "other"))];

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => onAction("browse", { category: "all" })}>
            <LucideReact.ArrowLeft size={16} /> Back
          </Button>
        </div>

        <UICard accent="rose">
          <div className="flex items-start gap-3">
            <span style={{ fontSize: "2.5rem" }}>{r.image || "\u{1F371}"}</span>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-white">{r.name}</h2>
              <p className="text-sm text-gray-400 mt-1">{r.description}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="info">{r.category}</Badge>
                <Badge variant={difficultyColor(r.difficulty)}>{r.difficulty}</Badge>
              </div>
            </div>
          </div>
        </UICard>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Prep Time" value={formatTime(r.prepTime)} accent="cyan" />
          <Stat label="Cook Time" value={formatTime(r.cookTime)} accent="orange" />
          <Stat label="Total" value={formatTime((r.prepTime || 0) + (r.cookTime || 0))} accent="purple" />
          <Stat label="Servings" value={r.servings || "4"} accent="emerald" />
        </div>

        <Tabs
          tabs={[
            { value: "ingredients", label: "Ingredients (" + ingredients.length + ")" },
            { value: "steps", label: "Steps (" + steps.length + ")" },
            { value: "tips", label: "Tips" }
          ]}
          defaultValue="ingredients"
          variant="pills"
        >
          {(activeTab) => {
            if (activeTab === "ingredients") {
              return (
                <div className="space-y-2 mt-2">
                  {ingredientCategories.map((cat) => (
                    <UICard key={cat} header={cat.charAt(0).toUpperCase() + cat.slice(1)} accent="blue">
                      <div className="space-y-1">
                        {ingredients.filter(i => (i.category || "other") === cat).map((ing, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-gray-200">{ing.item}</span>
                            <span className="text-gray-400">{ing.amount}</span>
                          </div>
                        ))}
                      </div>
                    </UICard>
                  ))}
                </div>
              );
            }
            if (activeTab === "steps") {
              return (
                <div className="space-y-2 mt-2">
                  {steps.map((step, idx) => (
                    <UICard key={idx} accent={idx === steps.length - 1 ? "emerald" : "gray"}>
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-white">
                          {idx + 1}
                        </div>
                        <p className="text-sm text-gray-200 leading-relaxed">{step}</p>
                      </div>
                    </UICard>
                  ))}
                </div>
              );
            }
            return (
              <div className="space-y-2 mt-2">
                {tips.map((tip, idx) => (
                  <UICard key={idx} accent="amber">
                    <div className="flex gap-2 text-sm">
                      <LucideReact.Lightbulb size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-200">{tip}</span>
                    </div>
                  </UICard>
                ))}
              </div>
            );
          }}
        </Tabs>
      </div>
    );
  }

  // --- FILTER VIEW ---
  if (isFilterView) {
    const matched = data.matchedRecipes || [];
    const filterIngs = data.filterIngredients || [];

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => onAction("browse", { category: "all" })}>
            <LucideReact.ArrowLeft size={16} /> Back to Browse
          </Button>
        </div>

        <UICard accent="purple" header="Ingredient Filter Results">
          <div className="flex flex-wrap gap-1 mb-2">
            {filterIngs.map((ing, i) => (
              <Badge key={i} variant="info">{ing}</Badge>
            ))}
            <Badge variant={data.matchAll ? "warning" : "default"}>
              {data.matchAll ? "Match ALL" : "Match ANY"}
            </Badge>
          </div>
          <Stat label="Recipes Found" value={data.totalMatches || 0} accent="purple" />
        </UICard>

        <div className="space-y-1">
          <Input
            placeholder="Try different ingredients..."
            value={ingredientInput}
            onChange={(e) => setIngredientInput(e.target.value)}
            icon={<LucideReact.Search size={14} />}
          />
          <div className="flex gap-2 items-center">
            <Switch
              checked={matchAllMode}
              onChange={(val) => setMatchAllMode(val)}
              label="Must contain all ingredients"
            />
            <Button
              variant="primary"
              onClick={() => {
                if (ingredientInput.trim()) {
                  onAction("filter", { ingredients: ingredientInput.trim(), matchAll: matchAllMode });
                }
              }}
            >
              <LucideReact.Filter size={14} /> Filter
            </Button>
          </div>
        </div>

        {matched.length === 0 ? (
          <EmptyState
            icon={<LucideReact.SearchX size={32} />}
            title="No recipes found"
            description="Try different ingredients or switch to 'Match ANY' mode"
          />
        ) : (
          <div className="space-y-2">
            {matched.map((recipe) => (
              <UICard key={recipe.id} accent="gray">
                <div className="flex items-start gap-3">
                  <span style={{ fontSize: "1.8rem" }}>{recipe.image || "\u{1F371}"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{recipe.name}</span>
                      <Badge variant={difficultyColor(recipe.difficulty)}>{recipe.difficulty}</Badge>
                      <Badge variant="outline">{formatTime(recipe.cookTime)}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{recipe.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(recipe.keyIngredients || []).map((ing, i) => {
                        var isMatch = (recipe.matchedIngredients || []).some(function(m) {
                          return ing.toLowerCase().indexOf(m) !== -1 || m.indexOf(ing.toLowerCase()) !== -1;
                        });
                        return (
                          <Badge key={i} variant={isMatch ? "success" : "outline"}>
                            {ing}
                          </Badge>
                        );
                      })}
                    </div>
                    <Button
                      variant="ghost"
                      className="mt-2"
                      onClick={() => onAction("detail", { recipeId: recipe.id, recipeName: recipe.name })}
                    >
                      View Recipe <LucideReact.ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              </UICard>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- BROWSE VIEW (default) ---
  const recipes = data?.recipes || [];
  const allIngredients = data?.allIngredients || [];

  const filteredRecipes = recipes.filter((r) => {
    var matchesCat = selectedCategory === "all" || r.category === selectedCategory;
    var matchesSearch = !searchQuery || r.name.toLowerCase().indexOf(searchQuery.toLowerCase()) !== -1 ||
      r.description.toLowerCase().indexOf(searchQuery.toLowerCase()) !== -1 ||
      (r.keyIngredients || []).some(function(ing) { return ing.toLowerCase().indexOf(searchQuery.toLowerCase()) !== -1; });
    return matchesCat && matchesSearch;
  });

  const categories = categoryOptions.filter(function(c) {
    return c.value === "all" || recipes.some(function(r) { return r.category === c.value; });
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <Input
            placeholder="Search recipes or ingredients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<LucideReact.Search size={14} />}
          />
        </div>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <Select
          options={categories}
          value={selectedCategory}
          onChange={(val) => {
            setSelectedCategory(val);
            if (val !== "all" && val !== (data?.category || "all")) {
              onAction("browse", { category: val });
            }
          }}
          placeholder="Category"
        />
        <div className="flex-1" />
        <div className="flex gap-1 items-center">
          <Input
            placeholder="Filter by ingredients..."
            value={ingredientInput}
            onChange={(e) => setIngredientInput(e.target.value)}
            icon={<LucideReact.Filter size={14} />}
          />
          <Button
            variant="primary"
            onClick={() => {
              if (ingredientInput.trim()) {
                onAction("filter", { ingredients: ingredientInput.trim(), matchAll: false });
              }
            }}
          >
            Go
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Stat label="Recipes" value={filteredRecipes.length} accent="rose" />
        <Stat label="Category" value={selectedCategory === "all" ? "All Dishes" : selectedCategory} accent="blue" />
      </div>

      {filteredRecipes.length === 0 ? (
        <EmptyState
          icon={<LucideReact.UtensilsCrossed size={32} />}
          title="No recipes found"
          description="Try adjusting your search or category filter"
          action={
            <Button variant="primary" onClick={() => { setSearchQuery(""); setSelectedCategory("all"); }}>
              Clear Filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {filteredRecipes.map((recipe) => (
            <UICard key={recipe.id} accent="gray">
              <div className="flex items-start gap-3">
                <span style={{ fontSize: "2rem" }}>{recipe.image || "\u{1F371}"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{recipe.name}</span>
                    <Badge variant={difficultyColor(recipe.difficulty)}>{recipe.difficulty}</Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{recipe.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <LucideReact.Clock size={12} /> {formatTime(recipe.cookTime)}
                    </span>
                    <span className="flex items-center gap-1">
                      <LucideReact.ChefHat size={12} /> {recipe.category}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(recipe.keyIngredients || []).slice(0, 5).map((ing, i) => (
                      <Badge key={i} variant="outline">{ing}</Badge>
                    ))}
                    {(recipe.keyIngredients || []).length > 5 && (
                      <Badge variant="outline">+{recipe.keyIngredients.length - 5}</Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    className="mt-2"
                    onClick={() => onAction("detail", { recipeId: recipe.id, recipeName: recipe.name })}
                  >
                    View Full Recipe <LucideReact.ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </UICard>
          ))}
        </div>
      )}
    </div>
  );
}
