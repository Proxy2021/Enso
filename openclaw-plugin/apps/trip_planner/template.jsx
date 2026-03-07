export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  const fmtDate = (d) => {
    if (!d) return "";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d).substring(0, 10);
      return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return String(d).substring(0, 10); }
  };
  const fmtCurrency = (amount, currency) => {
    if (amount == null) return "";
    var c = currency || "USD";
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 0 }).format(amount); }
    catch(e) { return c + " " + Number(amount).toFixed(0); }
  };
  const pct = (val, total) => total > 0 ? Math.round((val / total) * 100) : 0;
  const daysBetween = (a, b) => {
    if (!a || !b) return 0;
    try { return Math.max(0, Math.ceil((new Date(b) - new Date(a)) / 86400000)); }
    catch(e) { return 0; }
  };
  const statusColor = (s) => {
    var st = (s || "").toLowerCase();
    if (st === "done" || st === "completed" || st === "booked") return "success";
    if (st === "in_progress" || st === "in progress" || st === "pending") return "warning";
    if (st === "overdue" || st === "cancelled") return "danger";
    return "default";
  };
  const accentForCategory = (cat) => {
    var c = (cat || "").toLowerCase();
    if (c.includes("flight") || c.includes("transport")) return "blue";
    if (c.includes("hotel") || c.includes("accommodation") || c.includes("lodging")) return "purple";
    if (c.includes("food") || c.includes("dining") || c.includes("meal")) return "orange";
    if (c.includes("activity") || c.includes("attraction") || c.includes("tour")) return "emerald";
    if (c.includes("shopping")) return "pink";
    if (c.includes("insurance") || c.includes("visa")) return "cyan";
    return "gray";
  };

  // ── Hooks (ALL at top level) ──
  const [activeTab, setActiveTab] = useState("overview");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedDay, setExpandedDay] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [checkedItems, setCheckedItems] = useState({});

  // ── Detect tool ──
  var tool = data?.tool || "";
  var isTrips = tool === "enso_trip_planner_list_trips";
  var isResearch = tool === "enso_trip_planner_research";
  var isItinerary = tool === "enso_trip_planner_itinerary";
  var isBudget = tool === "enso_trip_planner_budget";
  var isPacking = tool === "enso_trip_planner_packing";
  var isChecklist = tool === "enso_trip_planner_checklist";
  var isSearchDest = tool === "enso_trip_planner_search_dest";

  // ── Error view ──
  if (data?.error) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <EmptyState
          icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />}
          title="Something went wrong"
          description={data.error}
          action={<Button size="sm" onClick={() => onAction("list_trips", {})}>My Trips</Button>}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── TRIPS LIST VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isTrips) {
    var trips = data?.trips || [];
    var filteredTrips = trips;
    if (filterStatus !== "all") {
      filteredTrips = trips.filter(function(t) { return (t.status || "").toLowerCase() === filterStatus; });
    }
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      filteredTrips = filteredTrips.filter(function(t) {
        return (t.destination || "").toLowerCase().includes(q) ||
               (t.name || "").toLowerCase().includes(q);
      });
    }

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.Plane className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-semibold text-gray-100">My Trips</span>
            <Badge variant="outline">{trips.length}</Badge>
          </div>
          <Button variant="primary" size="sm" onClick={() => onAction("search_dest", { query: "popular travel destinations" })}>
            <LucideReact.Plus className="w-3.5 h-3.5 mr-1" /> New Trip
          </Button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <Input placeholder="Search trips..." value={searchQuery}
              onChange={function(v) { setSearchQuery(v); }}
              icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
          </div>
          <Select size="sm" value={filterStatus} options={[
            { value: "all", label: "All" },
            { value: "planning", label: "Planning" },
            { value: "booked", label: "Booked" },
            { value: "completed", label: "Completed" },
          ]} onChange={function(v) { setFilterStatus(v); }} />
        </div>

        {/* Stats row */}
        {trips.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Upcoming" value={trips.filter(function(t) { return t.status === "planning" || t.status === "booked"; }).length} accent="blue" />
            <Stat label="Completed" value={trips.filter(function(t) { return t.status === "completed"; }).length} accent="emerald" />
            <Stat label="Total Budget" value={fmtCurrency(trips.reduce(function(s, t) { return s + (t.totalBudget || 0); }, 0), data?.currency)} accent="amber" />
          </div>
        )}

        {/* Trip cards */}
        {filteredTrips.length === 0 ? (
          <EmptyState
            icon={<LucideReact.MapPin className="w-8 h-8" />}
            title={searchQuery ? "No matching trips" : "No trips yet"}
            description={searchQuery ? "Try different search terms." : "Start planning your next adventure!"}
            action={<Button size="sm" onClick={() => onAction("search_dest", { query: "best travel destinations" })}>Explore Destinations</Button>}
          />
        ) : (
          <div className="space-y-2">
            {filteredTrips.map(function(trip, i) {
              var days = daysBetween(trip.startDate, trip.endDate);
              return (
                <button key={i} onClick={function() { onAction("itinerary", { tripId: trip.id, destination: trip.destination }); }}
                  className="w-full bg-gray-800/60 rounded-xl border border-gray-700/50 p-3 hover:border-blue-500/40 cursor-pointer text-left transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-100 truncate">{trip.name || trip.destination}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <LucideReact.MapPin className="w-3 h-3 text-gray-500 shrink-0" />
                        <span className="text-xs text-gray-400 truncate">{trip.destination}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <LucideReact.Calendar className="w-3 h-3" />
                          {fmtDate(trip.startDate)} - {fmtDate(trip.endDate)}
                        </span>
                        {days > 0 && <span>{days} days</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={statusColor(trip.status)}>{trip.status}</Badge>
                      {trip.totalBudget > 0 && (
                        <span className="text-xs text-gray-400">{fmtCurrency(trip.totalBudget, trip.currency)}</span>
                      )}
                    </div>
                  </div>
                  {trip.progress != null && (
                    <div className="mt-2">
                      <Progress value={trip.progress} max={100} variant="blue" showLabel />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── DESTINATION RESEARCH VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isResearch) {
    var dest = data?.destination || "Destination";
    var weather = data?.weather || [];
    var costs = data?.costs || {};
    var attractions = data?.attractions || [];
    var tips = data?.tips || [];
    var bestTime = data?.bestTimeToVisit || "";
    var visa = data?.visaInfo || "";
    var safety = data?.safetyRating || "";

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("list_trips", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate flex items-center gap-1.5">
              <LucideReact.Globe className="w-4 h-4 text-blue-400 shrink-0" /> {dest}
            </div>
            <div className="text-[11px] text-gray-500">Destination Research</div>
          </div>
          <Button variant="primary" size="sm" onClick={function() { onAction("itinerary", { destination: dest, action: "create" }); }}>
            <LucideReact.Plus className="w-3.5 h-3.5 mr-1" /> Plan Trip
          </Button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          {bestTime && <Stat label="Best Time" value={bestTime} accent="emerald" />}
          {safety && <Stat label="Safety" value={safety} accent="blue" />}
          {visa && <Stat label="Visa" value={visa} accent="purple" />}
        </div>

        <Tabs
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "weather", label: "Weather" },
            { value: "attractions", label: "Things to Do" },
            { value: "costs", label: "Costs" },
          ]}
          defaultValue="overview"
          variant="pills"
        >
          {function(tab) {
            if (tab === "weather") {
              return weather.length > 0 ? (
                <div className="space-y-2 mt-2">
                  <div style={{ width: "100%", height: 200 }}>
                    <ResponsiveContainer>
                      <BarChart data={weather}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="month" tick={{ fill: "#9CA3AF", fontSize: 10 }} />
                        <YAxis tick={{ fill: "#9CA3AF", fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="avgTemp" fill="#3B82F6" name="Avg °C" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="rainfall" fill="#06B6D4" name="Rain mm" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {weather.map(function(w, i) {
                      return (
                        <div key={i} className="bg-gray-800/60 rounded-lg p-2 text-center">
                          <div className="text-[10px] text-gray-500">{w.month}</div>
                          <div className="text-xs font-medium text-gray-200">{w.avgTemp}°</div>
                          <div className="text-[10px] text-cyan-400">{w.rainfall}mm</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <EmptyState icon={<LucideReact.Cloud className="w-6 h-6" />} title="No weather data" description="Weather information not available yet." />
              );
            }
            if (tab === "attractions") {
              return attractions.length > 0 ? (
                <div className="space-y-1.5 mt-2 max-h-64 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                  {attractions.map(function(a, i) {
                    return (
                      <div key={i} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-gray-200">{a.name}</div>
                            {a.category && <Badge variant="info">{a.category}</Badge>}
                            {a.description && <div className="text-[11px] text-gray-400 mt-1">{a.description}</div>}
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            {a.rating && (
                              <div className="flex items-center gap-0.5">
                                <LucideReact.Star className="w-3 h-3 text-amber-400 fill-current" />
                                <span className="text-xs text-gray-300">{a.rating}</span>
                              </div>
                            )}
                            {a.estimatedCost && <span className="text-[10px] text-gray-500">{a.estimatedCost}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={<LucideReact.MapPin className="w-6 h-6" />} title="No attractions listed" description="Attraction data not available yet." />
              );
            }
            if (tab === "costs") {
              var costEntries = Object.entries(costs);
              return costEntries.length > 0 ? (
                <div className="space-y-2 mt-2">
                  {costEntries.map(function(entry, i) {
                    return (
                      <div key={i} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                        <span className="text-xs text-gray-300 capitalize">{entry[0].replace(/_/g, " ")}</span>
                        <span className="text-xs font-medium text-gray-100">{entry[1]}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={<LucideReact.DollarSign className="w-6 h-6" />} title="No cost data" description="Cost information not available yet." />
              );
            }
            // overview tab (default)
            return (
              <div className="space-y-3 mt-2">
                {data?.summary && (
                  <div className="bg-blue-500/5 rounded-xl p-3 border border-blue-500/15">
                    <div className="text-xs text-gray-300 leading-relaxed">{data.summary}</div>
                  </div>
                )}
                {tips.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Travel Tips</div>
                    {tips.map(function(tip, i) {
                      return (
                        <div key={i} className="flex items-start gap-2 bg-gray-800/40 rounded-lg p-2.5">
                          <LucideReact.Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span className="text-xs text-gray-300">{tip}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={function() { onAction("budget", { destination: dest }); }}>
                    <LucideReact.DollarSign className="w-3.5 h-3.5 mr-1" /> Budget
                  </Button>
                  <Button variant="outline" size="sm" onClick={function() { onAction("packing", { destination: dest }); }}>
                    <LucideReact.Luggage className="w-3.5 h-3.5 mr-1" /> Packing
                  </Button>
                </div>
              </div>
            );
          }}
        </Tabs>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── DESTINATION SEARCH VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isSearchDest) {
    var results = data?.results || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("list_trips", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate">Destination Search</div>
            <div className="text-[11px] text-gray-500">{data?.query ? '"' + data.query + '"' : "Explore destinations"}</div>
          </div>
        </div>

        <div className="flex gap-1.5">
          <div className="flex-1">
            <Input placeholder="Search destinations..." value={searchQuery}
              onChange={function(v) { setSearchQuery(v); }}
              icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
          </div>
          <Button size="sm" variant="primary"
            onClick={function() { if (searchQuery.trim()) onAction("search_dest", { query: searchQuery.trim() }); }}>
            Search
          </Button>
        </div>

        {results.length === 0 ? (
          <EmptyState
            icon={<LucideReact.Globe className="w-8 h-8" />}
            title="No results"
            description="Try searching for a different destination."
          />
        ) : (
          <div className="space-y-2">
            {results.map(function(r, i) {
              return (
                <button key={i} onClick={function() { onAction("research", { destination: r.name || r.title }); }}
                  className="w-full bg-gray-800/60 rounded-xl border border-gray-700/50 p-3 hover:border-blue-500/40 cursor-pointer text-left transition-all">
                  <div className="text-xs font-medium text-gray-200">{r.name || r.title}</div>
                  {r.description && <div className="text-[11px] text-gray-400 mt-1 line-clamp-2">{r.description}</div>}
                  {r.highlights && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(Array.isArray(r.highlights) ? r.highlights : []).slice(0, 4).map(function(h, j) {
                        return <Badge key={j} variant="outline">{h}</Badge>;
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── ITINERARY VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isItinerary) {
    var dest2 = data?.destination || "Trip";
    var days = data?.days || [];
    var tripDuration = daysBetween(data?.startDate, data?.endDate);

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("list_trips", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate flex items-center gap-1.5">
              <LucideReact.Route className="w-4 h-4 text-emerald-400 shrink-0" /> {dest2}
            </div>
            <div className="text-[11px] text-gray-500">
              {data?.startDate ? fmtDate(data.startDate) + " - " + fmtDate(data.endDate) : "Itinerary"}
              {tripDuration > 0 ? " · " + tripDuration + " days" : ""}
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={function() { onAction("budget", { tripId: data?.tripId, destination: dest2 }); }}>
              <LucideReact.DollarSign className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={function() { onAction("packing", { tripId: data?.tripId, destination: dest2 }); }}>
              <LucideReact.Luggage className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={function() { onAction("checklist", { tripId: data?.tripId, destination: dest2 }); }}>
              <LucideReact.ClipboardCheck className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        {days.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Days" value={days.length} accent="blue" />
            <Stat label="Activities" value={days.reduce(function(s, d) { return s + (d.activities || []).length; }, 0)} accent="emerald" />
            <Stat label="Status" value={data?.status || "planning"} accent="purple" />
          </div>
        )}

        {/* Day timeline */}
        {days.length === 0 ? (
          <EmptyState
            icon={<LucideReact.Calendar className="w-8 h-8" />}
            title="No itinerary yet"
            description="Generate your day-by-day itinerary."
            action={<Button size="sm" onClick={function() { onAction("itinerary", { destination: dest2, action: "generate" }); }}>Generate Itinerary</Button>}
          />
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {days.map(function(day, di) {
              var isExpanded = expandedDay === di || expandedDay === null;
              var activities = day.activities || [];
              return (
                <div key={di} className="bg-gray-800/50 rounded-xl border border-gray-700/30 overflow-hidden">
                  <button onClick={function() { setExpandedDay(expandedDay === di ? -1 : di); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 cursor-pointer text-left hover:bg-gray-800/80 transition-all">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-blue-400">{day.dayNumber || di + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-200 truncate">{day.title || "Day " + (di + 1)}</div>
                      {day.date && <div className="text-[10px] text-gray-500">{fmtDate(day.date)}</div>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-gray-500">{activities.length} items</span>
                      {isExpanded ?
                        <LucideReact.ChevronUp className="w-3.5 h-3.5 text-gray-500" /> :
                        <LucideReact.ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                      }
                    </div>
                  </button>

                  {isExpanded && activities.length > 0 && (
                    <div className="px-3 pb-2.5 space-y-1">
                      {activities.map(function(act, ai) {
                        return (
                          <div key={ai} className="flex items-start gap-2 bg-gray-900/40 rounded-lg p-2">
                            <div className="flex flex-col items-center shrink-0">
                              {act.time && <span className="text-[10px] text-gray-500 font-mono">{act.time}</span>}
                              <div className={"w-2 h-2 rounded-full mt-0.5 bg-" + (accentForCategory(act.category) || "gray") + "-400"} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-200">{act.title || act.name}</div>
                              {act.location && (
                                <div className="text-[10px] text-gray-500 flex items-center gap-0.5 mt-0.5">
                                  <LucideReact.MapPin className="w-2.5 h-2.5" /> {act.location}
                                </div>
                              )}
                              {act.notes && <div className="text-[10px] text-gray-400 mt-0.5">{act.notes}</div>}
                            </div>
                            {act.duration && <span className="text-[10px] text-gray-500 shrink-0">{act.duration}</span>}
                            {act.cost && <span className="text-[10px] text-emerald-400 shrink-0">{act.cost}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── BUDGET DASHBOARD VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isBudget) {
    var categories = data?.categories || [];
    var totalBudget = data?.totalBudget || 0;
    var totalSpent = data?.totalSpent || 0;
    var currency = data?.currency || "USD";
    var remaining = totalBudget - totalSpent;
    var expenses = data?.expenses || [];

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("list_trips", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate flex items-center gap-1.5">
              <LucideReact.DollarSign className="w-4 h-4 text-emerald-400 shrink-0" /> Budget
            </div>
            <div className="text-[11px] text-gray-500">{data?.destination || "Trip"}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={function() { onAction("itinerary", { tripId: data?.tripId, destination: data?.destination }); }}>
            <LucideReact.Route className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Budget overview */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Budget" value={fmtCurrency(totalBudget, currency)} accent="blue" />
          <Stat label="Spent" value={fmtCurrency(totalSpent, currency)} accent={totalSpent > totalBudget ? "rose" : "amber"} />
          <Stat label="Remaining" value={fmtCurrency(remaining, currency)} accent={remaining >= 0 ? "emerald" : "rose"} />
        </div>

        {/* Overall progress */}
        {totalBudget > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-400">Budget Used</span>
              <span className={remaining >= 0 ? "text-emerald-400" : "text-rose-400"}>{pct(totalSpent, totalBudget)}%</span>
            </div>
            <Progress value={Math.min(totalSpent, totalBudget)} max={totalBudget}
              variant={totalSpent > totalBudget ? "rose" : totalSpent > totalBudget * 0.8 ? "amber" : "emerald"} />
          </div>
        )}

        <Tabs
          tabs={[
            { value: "breakdown", label: "Breakdown" },
            { value: "expenses", label: "Expenses" },
          ]}
          defaultValue="breakdown"
          variant="pills"
        >
          {function(tab) {
            if (tab === "expenses") {
              return expenses.length > 0 ? (
                <div className="space-y-1 mt-2 max-h-56 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                  {expenses.map(function(exp, i) {
                    return (
                      <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-gray-200 truncate">{exp.description || exp.name}</div>
                          <div className="text-[10px] text-gray-500">{exp.category} · {fmtDate(exp.date)}</div>
                        </div>
                        <span className="text-xs font-medium text-gray-100 shrink-0 ml-2">{fmtCurrency(exp.amount, currency)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={<LucideReact.Receipt className="w-6 h-6" />} title="No expenses" description="Expenses will appear here as you add them." />
              );
            }
            // breakdown
            return categories.length > 0 ? (
              <div className="space-y-2 mt-2">
                {/* Pie chart */}
                {categories.length > 1 && (
                  <div style={{ width: "100%", height: 180 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={categories.map(function(c) { return { name: c.name, value: c.budgeted || c.spent || 0 }; })}
                          dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}
                          fill="#3B82F6" label={function(e) { return e.name; }} labelLine={false}>
                          {categories.map(function(c, i) {
                            var colors = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#EC4899", "#06B6D4", "#F97316"];
                            return <Cell key={i} fill={colors[i % colors.length]} />;
                          })}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Category bars */}
                {categories.map(function(cat, i) {
                  var catPct = pct(cat.spent || 0, cat.budgeted || 1);
                  return (
                    <div key={i} className="bg-gray-800/50 rounded-lg p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-200 capitalize">{cat.name}</span>
                        <span className="text-[10px] text-gray-400">
                          {fmtCurrency(cat.spent || 0, currency)} / {fmtCurrency(cat.budgeted, currency)}
                        </span>
                      </div>
                      <Progress value={cat.spent || 0} max={cat.budgeted || 1}
                        variant={catPct > 100 ? "rose" : catPct > 80 ? "amber" : "emerald"} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<LucideReact.PieChart className="w-6 h-6" />} title="No budget set" description="Set up budget categories for your trip." />
            );
          }}
        </Tabs>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── PACKING LIST VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isPacking) {
    var packingCategories = data?.categories || [];
    var allItems = [];
    packingCategories.forEach(function(cat) { (cat.items || []).forEach(function(it) { allItems.push(it); }); });
    var totalItems = allItems.length;
    var packedCount = Object.keys(checkedItems).filter(function(k) { return checkedItems[k]; }).length;

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("list_trips", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate flex items-center gap-1.5">
              <LucideReact.Luggage className="w-4 h-4 text-amber-400 shrink-0" /> Packing List
            </div>
            <div className="text-[11px] text-gray-500">{data?.destination || "Trip"}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={function() { onAction("itinerary", { tripId: data?.tripId, destination: data?.destination }); }}>
            <LucideReact.Route className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Progress */}
        {totalItems > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-400">Packed</span>
              <span className="text-emerald-400">{packedCount} / {totalItems} ({pct(packedCount, totalItems)}%)</span>
            </div>
            <Progress value={packedCount} max={totalItems} variant="emerald" />
          </div>
        )}

        {/* Categories */}
        {packingCategories.length === 0 ? (
          <EmptyState
            icon={<LucideReact.Luggage className="w-8 h-8" />}
            title="No packing list yet"
            description="Generate a packing list for your destination."
            action={<Button size="sm" onClick={function() { onAction("packing", { destination: data?.destination, action: "generate" }); }}>Generate List</Button>}
          />
        ) : (
          <Accordion
            type="multiple"
            defaultOpen={packingCategories.length <= 4 ? packingCategories.map(function(c) { return c.name; }) : [packingCategories[0].name]}
            items={packingCategories.map(function(cat) {
              var catItems = cat.items || [];
              var catPacked = catItems.filter(function(it) { return checkedItems[cat.name + ":" + it.name]; }).length;
              return {
                value: cat.name,
                title: (
                  <div className="flex items-center justify-between w-full pr-2">
                    <span className="capitalize">{cat.name}</span>
                    <span className="text-[10px] text-gray-500">{catPacked}/{catItems.length}</span>
                  </div>
                ),
                content: (
                  <div className="space-y-0.5">
                    {catItems.map(function(item, ii) {
                      var key = cat.name + ":" + item.name;
                      var isChecked = !!checkedItems[key];
                      return (
                        <button key={ii}
                          onClick={function() {
                            var next = Object.assign({}, checkedItems);
                            next[key] = !isChecked;
                            setCheckedItems(next);
                          }}
                          className={"flex items-center gap-2 w-full px-2 py-1.5 rounded-lg cursor-pointer text-left transition-all " +
                            (isChecked ? "bg-emerald-500/5" : "hover:bg-gray-800/50")}>
                          <div className={"w-4 h-4 rounded border flex items-center justify-center shrink-0 " +
                            (isChecked ? "bg-emerald-500 border-emerald-500" : "border-gray-600")}>
                            {isChecked && <LucideReact.Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className={"text-xs flex-1 " + (isChecked ? "text-gray-500 line-through" : "text-gray-300")}>{item.name}</span>
                          {item.quantity && item.quantity > 1 && (
                            <span className="text-[10px] text-gray-500">x{item.quantity}</span>
                          )}
                          {item.essential && (
                            <LucideReact.AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ),
              };
            })}
          />
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── PREPARATION CHECKLIST VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  if (isChecklist) {
    var tasks = data?.tasks || [];
    var completedTasks = tasks.filter(function(t) { return t.status === "done" || t.status === "completed"; }).length;

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function() { onAction("list_trips", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100 truncate flex items-center gap-1.5">
              <LucideReact.ClipboardCheck className="w-4 h-4 text-cyan-400 shrink-0" /> Preparation Checklist
            </div>
            <div className="text-[11px] text-gray-500">{data?.destination || "Trip"}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={function() { onAction("itinerary", { tripId: data?.tripId, destination: data?.destination }); }}>
            <LucideReact.Route className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Progress */}
        {tasks.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-400">Completed</span>
              <span className="text-cyan-400">{completedTasks} / {tasks.length}</span>
            </div>
            <Progress value={completedTasks} max={tasks.length} variant="cyan" />
          </div>
        )}

        {/* Task list */}
        {tasks.length === 0 ? (
          <EmptyState
            icon={<LucideReact.ClipboardList className="w-8 h-8" />}
            title="No checklist items"
            description="Generate a preparation checklist for your trip."
            action={<Button size="sm" onClick={function() { onAction("checklist", { destination: data?.destination, action: "generate" }); }}>Generate Checklist</Button>}
          />
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {tasks.map(function(task, i) {
              var isDone = task.status === "done" || task.status === "completed";
              return (
                <div key={i} className={"flex items-start gap-2 bg-gray-800/50 rounded-lg p-2.5 border transition-all " +
                  (isDone ? "border-emerald-500/20" : task.priority === "high" ? "border-amber-500/20" : "border-gray-700/30")}>
                  <div className={"w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 " +
                    (isDone ? "bg-emerald-500/20" : "bg-gray-700/50")}>
                    {isDone ? (
                      <LucideReact.Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={"text-xs " + (isDone ? "text-gray-500 line-through" : "text-gray-200")}>{task.title || task.name}</div>
                    {task.dueDate && (
                      <div className="text-[10px] text-gray-500 flex items-center gap-0.5 mt-0.5">
                        <LucideReact.Clock className="w-2.5 h-2.5" /> Due: {fmtDate(task.dueDate)}
                      </div>
                    )}
                    {task.notes && <div className="text-[10px] text-gray-400 mt-0.5">{task.notes}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {task.priority && <Badge variant={task.priority === "high" ? "danger" : task.priority === "medium" ? "warning" : "default"}>{task.priority}</Badge>}
                    <Badge variant={statusColor(task.status)}>{task.status}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── FALLBACK VIEW ──
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <EmptyState
        icon={<LucideReact.Plane className="w-8 h-8 text-blue-400" />}
        title="Trip Planner"
        description="Plan and organize your trips with destination research, itineraries, budgets, and packing lists."
        action={<Button size="sm" onClick={function() { onAction("list_trips", {}); }}>View My Trips</Button>}
      />
    </div>
  );
}
