export default function GeneratedUI({ data, onAction }) {
  // ── Hooks (ALL at top level) ──
  const [activeDay, setActiveDay] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pantryInput, setPantryInput] = useState("");
  const [editingMeal, setEditingMeal] = useState(null);
  const [checkedItems, setCheckedItems] = useState({});
  const [activeTab, setActiveTab] = useState("daily");

  // ── Top-level memos (must be before any conditionals) ──
  const pantryItems = useMemo(() => data?.items || [], [data?.items]);
  const filteredPantry = useMemo(function() {
    if (!searchQuery) return pantryItems;
    var q = searchQuery.toLowerCase();
    return pantryItems.filter(function(item) {
      return (item.name || "").toLowerCase().includes(q) || (item.category || "").toLowerCase().includes(q);
    });
  }, [pantryItems, searchQuery]);
  const pantryCategories = useMemo(function() {
    var cats = {};
    filteredPantry.forEach(function(item) {
      var cat = item.category || "Other";
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(item);
    });
    return Object.entries(cats).sort(function(a, b) { return a[0].localeCompare(b[0]); });
  }, [filteredPantry]);

  // ── Tool detection ──
  const tool = data?.tool || "";
  const isPlan = tool === "enso_meal_planner_plan_meals";
  const isShopping = tool === "enso_meal_planner_generate_shopping_list";
  const isNutrition = tool === "enso_meal_planner_track_nutrition";
  const isPantry = tool === "enso_meal_planner_manage_pantry";
  const isSuggest = tool === "enso_meal_planner_suggest_meals";

  // ── Helpers ──
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const slotIcons = { breakfast: "Sun", lunch: "Utensils", dinner: "Moon", snacks: "Cookie" };
  const slotColors = { breakfast: "amber", lunch: "emerald", dinner: "purple", snacks: "cyan" };
  const deptIcons = { Produce: "Leaf", Dairy: "Milk", Meat: "Beef", Pantry: "Package", Frozen: "Snowflake", Bakery: "Croissant", Beverages: "Coffee", Other: "ShoppingCart" };

  const pctOf = (val, target) => target > 0 ? Math.min(Math.round((val / target) * 100), 100) : 0;
  const macroColor = (name) => {
    var colors = { calories: "amber", protein: "rose", carbs: "blue", fat: "orange", fiber: "emerald" };
    return colors[name] || "gray";
  };

  // ── Error view ──
  if (data?.error) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <EmptyState
          icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />}
          title="Something went wrong"
          description={data.error}
          action={<Button size="sm" onClick={() => onAction("plan_meals", {})}>Back to Meal Plan</Button>}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── MEAL PLAN VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isPlan) {
    var plan = data?.plan || {};
    var mealSlots = data?.mealSlots || ["breakfast", "lunch", "dinner", "snacks"];
    var servings = data?.servings || 2;
    var weekStart = data?.weekStart || "";

    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">
              <LucideReact.CalendarDays className="w-4 h-4 text-blue-400" />
              Weekly Meal Plan
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {weekStart && <span>{weekStart} · </span>}
              {servings} serving{servings !== 1 ? "s" : ""}
            </div>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => onAction("track_nutrition", {})}>
              <LucideReact.Activity className="w-3.5 h-3.5 mr-1" />Nutrition
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAction("generate_shopping_list", {})}>
              <LucideReact.ShoppingCart className="w-3.5 h-3.5 mr-1" />Shop
            </Button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-1.5">
          <Button size="sm" variant="primary" onClick={() => onAction("plan_meals", { action: "generate", servings: servings })}>
            <LucideReact.Sparkles className="w-3.5 h-3.5 mr-1" />Generate Plan
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("suggest_meals", {})}>
            <LucideReact.Lightbulb className="w-3.5 h-3.5 mr-1" />Suggest
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("manage_pantry", {})}>
            <LucideReact.Warehouse className="w-3.5 h-3.5 mr-1" />Pantry
          </Button>
        </div>

        {/* Weekly calendar grid */}
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {days.map((day) => {
            var dayPlan = plan[day] || {};
            var isExpanded = activeDay === day;
            var filledSlots = mealSlots.filter((s) => dayPlan[s] && dayPlan[s].name).length;
            return (
              <div key={day} className="bg-gray-800/50 rounded-xl border border-gray-700/40 overflow-hidden">
                <button
                  onClick={() => setActiveDay(isExpanded ? null : day)}
                  className="w-full flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-800/80 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-200 w-20">{day}</span>
                    <div className="flex gap-1">
                      {mealSlots.map((slot) => {
                        var meal = dayPlan[slot];
                        var IconName = slotIcons[slot] || "Circle";
                        var IconComp = LucideReact[IconName] || LucideReact.Circle;
                        return (
                          <div key={slot} className={"w-5 h-5 rounded-full flex items-center justify-center " +
                            (meal && meal.name ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-700/40 text-gray-600")}>
                            <IconComp className="w-3 h-3" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">{filledSlots}/{mealSlots.length}</span>
                    {isExpanded
                      ? <LucideReact.ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                      : <LucideReact.ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-2.5 space-y-1.5">
                    {mealSlots.map((slot) => {
                      var meal = dayPlan[slot] || {};
                      var accentColor = slotColors[slot] || "blue";
                      return (
                        <div key={slot} className={"flex items-center gap-2 px-2.5 py-2 rounded-lg border " +
                          (meal.name
                            ? "bg-gray-800/60 border-gray-700/30"
                            : "bg-gray-800/30 border-dashed border-gray-700/30")}>
                          <Badge variant={meal.name ? "default" : "outline"} className="text-[10px] shrink-0 capitalize">
                            {slot}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            {meal.name ? (
                              <div>
                                <div className="text-xs text-gray-200 truncate">{meal.name}</div>
                                {meal.calories && (
                                  <div className="text-[10px] text-gray-500">{meal.calories} cal</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-600 italic">Empty</span>
                            )}
                          </div>
                          <Button size="sm" variant="ghost"
                            onClick={(e) => { e.stopPropagation(); onAction("plan_meals", { action: "assign", day: day, slot: slot }); }}>
                            <LucideReact.Pencil className="w-3 h-3" />
                          </Button>
                          {meal.name && (
                            <Button size="sm" variant="ghost"
                              onClick={(e) => { e.stopPropagation(); onAction("plan_meals", { action: "remove", day: day, slot: slot }); }}>
                              <LucideReact.X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── SHOPPING LIST VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isShopping) {
    var departments = data?.departments || [];
    var totalItems = data?.totalItems || 0;
    var checkedCount = Object.values(checkedItems).filter(Boolean).length;

    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onAction("plan_meals", {})}>
              <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
            </Button>
            <div>
              <div className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">
                <LucideReact.ShoppingCart className="w-4 h-4 text-emerald-400" />
                Shopping List
              </div>
              <div className="text-[11px] text-gray-500">{checkedCount}/{totalItems} items checked</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setCheckedItems({})}>
            <LucideReact.RotateCcw className="w-3.5 h-3.5 mr-1" />Reset
          </Button>
        </div>

        {/* Progress */}
        <Progress value={checkedCount} max={totalItems || 1} variant="emerald" showLabel />

        {/* Departments */}
        {departments.length === 0 ? (
          <EmptyState
            icon={<LucideReact.ShoppingCart className="w-8 h-8" />}
            title="No items yet"
            description="Generate a meal plan first, then create a shopping list."
            action={<Button size="sm" onClick={() => onAction("plan_meals", {})}>Go to Meal Plan</Button>}
          />
        ) : (
          <Accordion
            type="multiple"
            defaultOpen={departments.map((_, i) => "dept-" + i)}
            items={departments.map((dept, i) => ({
              value: "dept-" + i,
              title: (
                <div className="flex items-center gap-2 w-full">
                  {(() => {
                    var DeptIcon = LucideReact[deptIcons[dept.name] || "ShoppingCart"] || LucideReact.ShoppingCart;
                    return <DeptIcon className="w-3.5 h-3.5 text-emerald-400" />;
                  })()}
                  <span className="text-xs font-medium text-gray-200">{dept.name}</span>
                  <Badge variant="outline" className="ml-auto">{(dept.items || []).length}</Badge>
                </div>
              ),
              content: (
                <div className="space-y-1">
                  {(dept.items || []).map((item, j) => {
                    var itemKey = dept.name + "-" + item.name;
                    var isChecked = checkedItems[itemKey] || false;
                    return (
                      <button key={j}
                        onClick={() => setCheckedItems(function(prev) { var n = Object.assign({}, prev); n[itemKey] = !isChecked; return n; })}
                        className={"flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg cursor-pointer transition-all " +
                          (isChecked ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-gray-800/40 border border-gray-700/20 hover:bg-gray-800/60")}>
                        <div className={"w-4 h-4 rounded border flex items-center justify-center shrink-0 " +
                          (isChecked ? "bg-emerald-500 border-emerald-500" : "border-gray-600")}>
                          {isChecked && <LucideReact.Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className={"flex-1 text-xs text-left " + (isChecked ? "text-gray-500 line-through" : "text-gray-200")}>
                          {item.name}
                        </span>
                        <span className="text-[10px] text-gray-500 shrink-0">
                          {item.quantity}{item.unit ? " " + item.unit : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ),
            }))}
          />
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── NUTRITION TRACKING VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isNutrition) {
    var targets = data?.targets || { calories: 2000, protein: 50, carbs: 250, fat: 65 };
    var daily = data?.daily || [];
    var weeklyAvg = data?.weeklyAvg || {};
    var macros = ["calories", "protein", "carbs", "fat"];

    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("plan_meals", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">
            <LucideReact.Activity className="w-4 h-4 text-rose-400" />
            Nutrition Dashboard
          </div>
        </div>

        {/* Weekly averages */}
        <div className="grid grid-cols-4 gap-2">
          {macros.map((m) => (
            <Stat
              key={m}
              label={m.charAt(0).toUpperCase() + m.slice(1)}
              value={weeklyAvg[m] != null ? Math.round(weeklyAvg[m]) : "—"}
              change={targets[m] ? (pctOf(weeklyAvg[m] || 0, targets[m]) + "% of target") : undefined}
              accent={macroColor(m)}
            />
          ))}
        </div>

        {/* Tabs for daily vs chart */}
        <Tabs
          tabs={[
            { value: "daily", label: "Daily Breakdown" },
            { value: "chart", label: "Weekly Chart" },
          ]}
          defaultValue={activeTab}
          onChange={(v) => setActiveTab(v)}
        >
          {(tab) => {
            if (tab === "chart") {
              return (
                <div className="mt-2">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 10 }} tickFormatter={(d) => d.slice(0, 3)} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="calories" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Calories" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            }
            return (
              <div className="space-y-2 mt-2 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {daily.map((d) => (
                  <div key={d.day} className="bg-gray-800/50 rounded-xl p-2.5 border border-gray-700/30">
                    <div className="text-xs font-medium text-gray-200 mb-1.5">{d.day}</div>
                    <div className="space-y-1">
                      {macros.map((m) => (
                        <div key={m} className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 w-14 capitalize">{m}</span>
                          <div className="flex-1">
                            <Progress
                              value={d[m] || 0}
                              max={targets[m] || 100}
                              variant={macroColor(m)}
                              showLabel={false}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 w-16 text-right">
                            {d[m] || 0}{m === "calories" ? "" : "g"} / {targets[m]}{m === "calories" ? "" : "g"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          }}
        </Tabs>

        {/* Edit targets */}
        <Button size="sm" variant="ghost" onClick={() => onAction("track_nutrition", { action: "set_targets" })}>
          <LucideReact.Settings className="w-3.5 h-3.5 mr-1" />Edit Targets
        </Button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── PANTRY VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isPantry) {
    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("plan_meals", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">
              <LucideReact.Warehouse className="w-4 h-4 text-cyan-400" />
              Pantry Inventory
            </div>
            <div className="text-[11px] text-gray-500">{pantryItems.length} items</div>
          </div>
        </div>

        {/* Search + Add */}
        <div className="flex gap-1.5">
          <div className="flex-1">
            <Input
              placeholder="Search pantry..."
              value={searchQuery}
              onChange={(v) => setSearchQuery(v)}
              icon={<LucideReact.Search className="w-3.5 h-3.5" />}
              size="sm"
            />
          </div>
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1">
            <Input
              placeholder="Add item (e.g., 'Rice 2kg')"
              value={pantryInput}
              onChange={(v) => setPantryInput(v)}
              size="sm"
            />
          </div>
          <Button size="sm" variant="primary"
            onClick={() => {
              if (pantryInput.trim()) {
                onAction("manage_pantry", { action: "add", item: pantryInput.trim() });
                setPantryInput("");
              }
            }}>
            <LucideReact.Plus className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Items by category */}
        {pantryCategories.length === 0 ? (
          <EmptyState
            icon={<LucideReact.Warehouse className="w-8 h-8" />}
            title={searchQuery ? "No matches" : "Pantry is empty"}
            description={searchQuery ? "Try different search terms." : "Add items to track what you have at home."}
          />
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {pantryCategories.map(function(entry) {
              var catName = entry[0];
              var catItems = entry[1];
              return (
                <div key={catName} className="space-y-1">
                  <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium px-1">{catName}</div>
                  {catItems.map(function(item, j) {
                    return (
                      <div key={j} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-800/40 rounded-lg border border-gray-700/20">
                        <LucideReact.Package className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="flex-1 text-xs text-gray-200 truncate">{item.name}</span>
                        <span className="text-[10px] text-gray-500 shrink-0">
                          {item.quantity}{item.unit ? " " + item.unit : ""}
                        </span>
                        <button
                          onClick={() => onAction("manage_pantry", { action: "remove", itemName: item.name })}
                          className="p-1 rounded hover:bg-gray-700 cursor-pointer text-gray-600 hover:text-rose-400 transition-all">
                          <LucideReact.Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── SUGGEST MEALS VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isSuggest) {
    var suggestions = data?.suggestions || [];
    var criteria = data?.criteria || "general";

    return (
      <div className="bg-gray-900 rounded-2xl p-3 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("plan_meals", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">
              <LucideReact.Lightbulb className="w-4 h-4 text-amber-400" />
              Meal Suggestions
            </div>
            <div className="text-[11px] text-gray-500">Based on: {criteria}</div>
          </div>
        </div>

        {/* Criteria buttons */}
        <div className="flex gap-1.5 flex-wrap">
          {["pantry", "balanced", "quick", "high-protein", "vegetarian"].map((c) => (
            <Button key={c} size="sm" variant={criteria === c ? "primary" : "outline"}
              onClick={() => onAction("suggest_meals", { criteria: c })}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </Button>
          ))}
        </div>

        {/* Suggestions */}
        {suggestions.length === 0 ? (
          <EmptyState
            icon={<LucideReact.Lightbulb className="w-8 h-8" />}
            title="No suggestions yet"
            description="Choose a criteria above to get meal ideas."
          />
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {suggestions.map(function(s, i) {
              return (
                <UICard key={i} accent="amber">
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-100">{s.name}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{s.description}</div>
                      </div>
                      <Button size="sm" variant="primary"
                        onClick={() => onAction("plan_meals", { action: "assign", recipe: s.name })}>
                        <LucideReact.Plus className="w-3 h-3 mr-1" />Add
                      </Button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {s.prepTime && <Badge variant="outline"><LucideReact.Clock className="w-2.5 h-2.5 mr-0.5" />{s.prepTime}</Badge>}
                      {s.calories && <Badge variant="outline"><LucideReact.Flame className="w-2.5 h-2.5 mr-0.5" />{s.calories} cal</Badge>}
                      {s.protein && <Badge variant="outline">{s.protein}g protein</Badge>}
                    </div>
                    {s.matchReason && (
                      <div className="text-[10px] text-emerald-400/70 flex items-center gap-1">
                        <LucideReact.Sparkles className="w-2.5 h-2.5" />
                        {s.matchReason}
                      </div>
                    )}
                  </div>
                </UICard>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Fallback ──
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <EmptyState
        icon={<LucideReact.UtensilsCrossed className="w-8 h-8" />}
        title="Meal Planner"
        description="Plan your meals, generate shopping lists, and track nutrition."
        action={<Button size="sm" onClick={() => onAction("plan_meals", {})}>Get Started</Button>}
      />
    </div>
  );
}
