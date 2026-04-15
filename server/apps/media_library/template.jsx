export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var typeIcons = { book: "BookOpen", movie: "Film", "tv-series": "Tv", documentary: "Video", game: "Gamepad2", album: "Disc3", artist: "Music", song: "Music", playlist: "ListMusic", article: "FileText" };
  var typeColors = { book: "emerald", movie: "purple", "tv-series": "cyan", documentary: "amber", game: "rose", album: "blue", artist: "orange", song: "pink", playlist: "violet", article: "slate" };
  var statusLabels = { not_started: "Not Started", in_progress: "In Progress", completed: "Completed", dropped: "Dropped", on_hold: "On Hold" };
  var statusVariants = { not_started: "default", in_progress: "info", completed: "success", dropped: "danger", on_hold: "warning" };

  var fmtDate = function(d) {
    if (!d) return "";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return "";
      return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return ""; }
  };

  var renderStars = function(rating, max) {
    max = max || 10;
    var stars = [];
    for (var i = 1; i <= max; i++) {
      stars.push(
        React.createElement("span", { key: i, style: { color: i <= (rating || 0) ? "#f59e0b" : "#4b5563", fontSize: "14px" } }, "\u2605")
      );
    }
    return React.createElement("span", { style: { display: "inline-flex", gap: "1px" } }, stars);
  };

  var TypeBadge = function(props) {
    return React.createElement(Badge, { variant: "outline", style: { borderColor: "var(--accent-" + (typeColors[props.type] || "blue") + ", #3b82f6)" } }, (props.type || "").replace("-", " "));
  };

  // ── State ──
  var filterState = useState("all");
  var activeFilter = filterState[0];
  var setActiveFilter = filterState[1];

  var searchState = useState("");
  var localSearch = searchState[0];
  var setLocalSearch = searchState[1];

  // ── Tool detection ──
  var tool = (data && data.tool) || "";
  var isBrowse = tool === "enso_media_library_browse";
  var isSearch = tool === "enso_media_library_search";
  var isRate = tool === "enso_media_library_rate";
  var isStatus = tool === "enso_media_library_status";
  var isFavorite = tool === "enso_media_library_favorite";
  var isCollection = tool === "enso_media_library_collection";
  var isStats = tool === "enso_media_library_stats";
  var isAdd = tool === "enso_media_library_add";
  var isDiscover = tool === "enso_media_library_discover";
  var isBatchSeed = tool === "enso_media_library_batch_seed";
  var isSmartCollections = tool === "enso_media_library_smart_collections";
  var isDashboard = tool === "enso_media_library_dashboard";
  var isTimeline = tool === "enso_media_library_timeline";
  var isTasteProfile = tool === "enso_media_library_taste_profile";

  // ── Error handling ──
  if (data && data.error) {
    return React.createElement(UICard, { accent: "red" },
      React.createElement("div", { style: { padding: "16px", textAlign: "center" } },
        React.createElement("div", { style: { fontSize: "16px", fontWeight: 600, color: "#ef4444", marginBottom: "8px" } }, "Error"),
        React.createElement("div", { style: { color: "#9ca3af" } }, data.error)
      )
    );
  }

  // ══════════════════════════════════════════════
  // BROWSE VIEW
  // ══════════════════════════════════════════════
  if (isBrowse) {
    var items = (data.items || []);
    var groups = data.groups || null;
    var typeCounts = data.typeCounts || {};
    var total = data.total || 0;

    // Type filter tabs
    var typeFilters = [{ value: "all", label: "All (" + total + ")" }];
    var typeKeys = Object.keys(typeCounts).sort();
    for (var tf = 0; tf < typeKeys.length; tf++) {
      typeFilters.push({ value: typeKeys[tf], label: (typeKeys[tf] === "tv-series" ? "TV" : typeKeys[tf].charAt(0).toUpperCase() + typeKeys[tf].slice(1)) + " (" + typeCounts[typeKeys[tf]] + ")" });
    }

    // Client-side filter on type tabs
    var displayItems = items;
    if (activeFilter !== "all") {
      displayItems = items.filter(function(item) { return item.type === activeFilter; });
    }
    if (localSearch) {
      var q = localSearch.toLowerCase();
      displayItems = displayItems.filter(function(item) {
        return (item.title || "").toLowerCase().indexOf(q) >= 0 ||
          (item.tags || []).join(" ").toLowerCase().indexOf(q) >= 0;
      });
    }

    var renderItemCard = function(item, idx) {
      return React.createElement(UICard, { key: item.entityId || idx, accent: typeColors[item.type] || "blue", style: { marginBottom: "8px" } },
        React.createElement("div", { style: { display: "flex", gap: "12px", padding: "12px" } },
          item.imageUrl
            ? React.createElement("img", { src: item.imageUrl, style: { width: "48px", height: "64px", objectFit: "cover", borderRadius: "6px", flexShrink: 0 }, alt: "" })
            : React.createElement("div", { style: { width: "48px", height: "64px", borderRadius: "6px", background: "#1f2937", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "20px" } },
                React.createElement(LucideIcons[typeIcons[item.type] || "FileText"], { size: 20, color: "#6b7280" })
              ),
          React.createElement("div", { style: { flex: 1, minWidth: 0 } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" } },
              React.createElement("span", { style: { fontWeight: 600, fontSize: "14px", color: "#f3f4f6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item.title),
              item.isFavorite ? React.createElement("span", { style: { color: "#ef4444", fontSize: "12px" } }, "\u2764") : null
            ),
            React.createElement("div", { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginBottom: "4px" } },
              React.createElement(TypeBadge, { type: item.type }),
              item.consumptionStatus ? React.createElement(Badge, { variant: statusVariants[item.consumptionStatus] || "default" }, statusLabels[item.consumptionStatus] || item.consumptionStatus) : null,
              item.source ? React.createElement(Badge, { variant: "outline" }, item.source) : null
            ),
            item.userRating ? React.createElement("div", { style: { marginBottom: "2px" } }, renderStars(item.userRating)) : null,
            (item.semanticTags || []).length > 0
              ? React.createElement("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap" } },
                  (item.semanticTags || []).slice(0, 3).map(function(tag, ti) {
                    return React.createElement("span", { key: ti, style: { fontSize: "11px", padding: "1px 6px", borderRadius: "4px", background: "#1f2937", color: "#9ca3af" } }, tag);
                  })
                )
              : null
          ),
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 } },
            React.createElement(Button, { variant: "ghost", size: "sm", onClick: function() { onAction("favorite", { entityId: item.entityId }); } },
              React.createElement(LucideIcons[item.isFavorite ? "HeartOff" : "Heart"], { size: 14 })
            ),
            React.createElement(Button, { variant: "ghost", size: "sm", onClick: function() { onAction("rate", { entityId: item.entityId, rating: 8 }); } },
              React.createElement(LucideIcons.Star, { size: 14 })
            )
          )
        )
      );
    };

    // Grouped view
    if (groups && groups.length > 0) {
      var accordionItems = groups.map(function(g) {
        return {
          value: g.group,
          title: g.group + " (" + g.count + ")",
          content: React.createElement("div", null, g.items.map(renderItemCard))
        };
      });
      return React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
          React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, "Media Library"),
          React.createElement(Badge, { variant: "info" }, total + " items")
        ),
        React.createElement(Accordion, { items: accordionItems, type: "multiple", defaultOpen: [groups[0].group] })
      );
    }

    // Flat view
    return React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
        React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, "Media Library"),
        React.createElement(Badge, { variant: "info" }, total + " items")
      ),
      React.createElement("div", { style: { marginBottom: "12px" } },
        React.createElement(Input, { placeholder: "Filter by title or tag...", value: localSearch, onChange: function(e) { setLocalSearch(e.target.value); }, icon: React.createElement(LucideIcons.Search, { size: 14 }) })
      ),
      typeFilters.length > 2
        ? React.createElement("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" } },
            typeFilters.map(function(f) {
              return React.createElement(Button, {
                key: f.value,
                variant: activeFilter === f.value ? "primary" : "outline",
                size: "sm",
                onClick: function() { setActiveFilter(f.value); }
              }, f.label);
            })
          )
        : null,
      displayItems.length === 0
        ? React.createElement(EmptyState, { icon: React.createElement(LucideIcons.Library, { size: 32 }), title: "No items found", description: "Try adjusting your filters or search query" })
        : React.createElement("div", null, displayItems.map(renderItemCard)),
      data.showing < total && !groups
        ? React.createElement("div", { style: { textAlign: "center", marginTop: "12px" } },
            React.createElement(Button, { variant: "outline", onClick: function() { onAction("browse", { offset: (data.offset || 0) + (data.limit || 50), mediaType: data.mediaType, sortBy: data.sortBy }); } }, "Load More")
          )
        : null
    );
  }

  // ══════════════════════════════════════════════
  // SEARCH VIEW
  // ══════════════════════════════════════════════
  if (isSearch) {
    var results = data.results || [];
    return React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
        React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, "Search: \"" + (data.query || "") + "\""),
        React.createElement(Badge, { variant: "info" }, data.total + " results")
      ),
      results.length === 0
        ? React.createElement(EmptyState, { icon: React.createElement(LucideIcons.SearchX, { size: 32 }), title: "No results", description: "Try different search terms" })
        : React.createElement("div", null,
            results.map(function(r, ri) {
              return React.createElement(UICard, { key: r.entityId || ri, accent: typeColors[r.type] || "blue", style: { marginBottom: "8px" } },
                React.createElement("div", { style: { padding: "12px" } },
                  React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" } },
                    React.createElement("div", null,
                      React.createElement("div", { style: { fontWeight: 600, fontSize: "14px", color: "#f3f4f6", marginBottom: "4px" } }, r.title),
                      React.createElement("div", { style: { display: "flex", gap: "6px", marginBottom: "4px" } },
                        React.createElement(TypeBadge, { type: r.type }),
                        r.isFavorite ? React.createElement(Badge, { variant: "danger" }, "\u2764 Fav") : null,
                        r.userRating ? React.createElement(Badge, { variant: "warning" }, "\u2605 " + r.userRating) : null
                      ),
                      React.createElement("div", { style: { fontSize: "12px", color: "#6b7280" } }, (r.matchReasons || []).join(" \u2022 "))
                    ),
                    React.createElement(Badge, { variant: "outline" }, "Score: " + r.matchScore)
                  )
                )
              );
            })
          )
    );
  }

  // ══════════════════════════════════════════════
  // RATE / STATUS / FAVORITE — Confirmation Views
  // ══════════════════════════════════════════════
  if (isRate || isStatus || isFavorite) {
    var successMsg = "";
    var accent = "emerald";
    if (isRate) {
      successMsg = data.success ? "Rated \"" + (data.title || "") + "\" " + (data.userRating || 0) + "/10" : "Rating failed";
      accent = "amber";
    } else if (isStatus) {
      successMsg = data.success ? "Status updated to " + (statusLabels[data.consumptionStatus] || data.consumptionStatus) : "Status update failed";
      accent = "cyan";
    } else if (isFavorite) {
      successMsg = data.success ? (data.isFavorite ? "Added to favorites" : "Removed from favorites") : "Favorite toggle failed";
      accent = "rose";
    }

    return React.createElement(UICard, { accent: data.success ? accent : "red" },
      React.createElement("div", { style: { padding: "16px", textAlign: "center" } },
        React.createElement("div", { style: { fontSize: "24px", marginBottom: "8px" } }, data.success ? "\u2713" : "\u2717"),
        React.createElement("div", { style: { fontSize: "16px", fontWeight: 600, color: "#f3f4f6", marginBottom: "4px" } }, successMsg),
        React.createElement("div", { style: { fontSize: "14px", color: "#9ca3af", marginBottom: "8px" } }, data.title || data.entityId || ""),
        isRate && data.userRating ? React.createElement("div", { style: { marginBottom: "8px" } }, renderStars(data.userRating)) : null,
        isRate && data.userNotes ? React.createElement("div", { style: { fontSize: "12px", color: "#6b7280", fontStyle: "italic" } }, "\"" + data.userNotes + "\"") : null,
        isStatus && data.consumptionProgress ? React.createElement("div", { style: { fontSize: "12px", color: "#6b7280" } }, "Progress: " + data.consumptionProgress) : null,
        isStatus && data.dateCompleted ? React.createElement("div", { style: { fontSize: "12px", color: "#6b7280" } }, "Completed: " + fmtDate(data.dateCompleted)) : null,
        React.createElement("div", { style: { marginTop: "12px" } },
          React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("browse", {}); } }, "Back to Library")
        )
      )
    );
  }

  // ══════════════════════════════════════════════
  // COLLECTION VIEW
  // ══════════════════════════════════════════════
  if (isCollection) {
    var action = data.action || "";

    // List view
    if (action === "list") {
      var cols = data.collections || [];
      return React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
          React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, "Collections"),
          React.createElement(Button, { variant: "primary", size: "sm", onClick: function() { onAction("collection", { action: "create", name: "New Collection" }); } },
            React.createElement(LucideIcons.Plus, { size: 14 }), " New"
          )
        ),
        cols.length === 0
          ? React.createElement(EmptyState, { icon: React.createElement(LucideIcons.FolderOpen, { size: 32 }), title: "No collections yet", description: "Create your first collection to organize your media" })
          : React.createElement("div", null,
              cols.map(function(c, ci) {
                return React.createElement(UICard, { key: c.id || ci, accent: "purple", style: { marginBottom: "8px", cursor: "pointer" } },
                  React.createElement("div", { style: { padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }, onClick: function() { onAction("collection", { action: "view", collectionId: c.id }); } },
                    React.createElement("div", null,
                      React.createElement("div", { style: { fontWeight: 600, color: "#f3f4f6" } }, c.name),
                      c.description ? React.createElement("div", { style: { fontSize: "12px", color: "#9ca3af" } }, c.description) : null,
                      React.createElement("div", { style: { fontSize: "12px", color: "#6b7280", marginTop: "4px" } }, fmtDate(c.createdAt))
                    ),
                    React.createElement(Badge, { variant: "info" }, (c.itemCount || 0) + " items")
                  )
                );
              })
            )
      );
    }

    // View single collection
    if (action === "view") {
      var col = data.collection || {};
      var colItems = data.items || [];
      return React.createElement("div", null,
        React.createElement("div", { style: { marginBottom: "12px" } },
          React.createElement(Button, { variant: "ghost", size: "sm", onClick: function() { onAction("collection", { action: "list" }); } },
            React.createElement(LucideIcons.ArrowLeft, { size: 14 }), " Collections"
          )
        ),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, col.name || "Collection"),
            col.description ? React.createElement("div", { style: { fontSize: "13px", color: "#9ca3af" } }, col.description) : null
          ),
          React.createElement(Badge, { variant: "info" }, (data.itemCount || 0) + " items")
        ),
        colItems.length === 0
          ? React.createElement(EmptyState, { icon: React.createElement(LucideIcons.Inbox, { size: 32 }), title: "Empty collection", description: "Add items using the collection tool" })
          : React.createElement("div", null,
              colItems.map(function(item, ii) {
                return React.createElement(UICard, { key: item.entityId || ii, accent: typeColors[item.type] || "blue", style: { marginBottom: "8px" } },
                  React.createElement("div", { style: { display: "flex", gap: "10px", padding: "10px", alignItems: "center" } },
                    item.imageUrl
                      ? React.createElement("img", { src: item.imageUrl, style: { width: "40px", height: "52px", objectFit: "cover", borderRadius: "4px" }, alt: "" })
                      : React.createElement("div", { style: { width: "40px", height: "52px", background: "#1f2937", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" } },
                          React.createElement(LucideIcons[typeIcons[item.type] || "FileText"], { size: 16, color: "#6b7280" })
                        ),
                    React.createElement("div", { style: { flex: 1 } },
                      React.createElement("div", { style: { fontWeight: 600, fontSize: "13px", color: "#f3f4f6" } }, item.title),
                      React.createElement("div", { style: { display: "flex", gap: "4px", marginTop: "2px" } },
                        React.createElement(TypeBadge, { type: item.type }),
                        item.userRating ? React.createElement(Badge, { variant: "warning" }, "\u2605 " + item.userRating) : null
                      )
                    ),
                    item.missing ? React.createElement(Badge, { variant: "danger" }, "Missing") : null
                  )
                );
              })
            )
      );
    }

    // Create/add/remove/delete confirmation
    return React.createElement(UICard, { accent: data.success ? "emerald" : "red" },
      React.createElement("div", { style: { padding: "16px", textAlign: "center" } },
        React.createElement("div", { style: { fontSize: "24px", marginBottom: "8px" } }, data.success ? "\u2713" : "\u2717"),
        React.createElement("div", { style: { fontSize: "14px", fontWeight: 600, color: "#f3f4f6" } },
          action === "create" ? "Collection created" :
          action === "add_item" ? "Item added to collection" :
          action === "remove_item" ? "Item removed from collection" :
          action === "delete" ? "Collection \"" + (data.deletedName || "") + "\" deleted" : "Done"
        ),
        React.createElement("div", { style: { marginTop: "12px" } },
          React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("collection", { action: "list" }); } }, "View Collections")
        )
      )
    );
  }

  // ══════════════════════════════════════════════
  // STATS VIEW
  // ══════════════════════════════════════════════
  if (isStats) {
    var typeCounts = data.typeCounts || {};
    var statusDist = data.statusDistribution || {};
    var topRated = data.topRated || [];
    var recentlyCompleted = data.recentlyCompleted || [];
    var topTags = data.topSemanticTags || [];

    // Pie chart data for type distribution
    var typeChartData = Object.keys(typeCounts).map(function(k) {
      return { name: k === "tv-series" ? "TV" : k.charAt(0).toUpperCase() + k.slice(1), value: typeCounts[k] };
    }).sort(function(a, b) { return b.value - a.value; });

    var COLORS = ["#10b981", "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899"];

    return React.createElement("div", null,
      React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6", marginBottom: "12px" } }, "Library Statistics"),

      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px", marginBottom: "16px" } },
        React.createElement(Stat, { label: "Total Items", value: data.totalEntities || 0, accent: "blue" }),
        React.createElement(Stat, { label: "Favorites", value: data.favoriteCount || 0, accent: "rose" }),
        React.createElement(Stat, { label: "Rated", value: data.ratedCount || 0, accent: "amber" }),
        React.createElement(Stat, { label: "Avg Rating", value: data.averageRating || "N/A", accent: "emerald" }),
        React.createElement(Stat, { label: "Completed", value: statusDist.completed || 0, accent: "cyan" }),
        React.createElement(Stat, { label: "In Progress", value: statusDist.in_progress || 0, accent: "purple" })
      ),

      React.createElement(Tabs, { tabs: [
        { value: "types", label: "By Type" },
        { value: "top", label: "Top Rated" },
        { value: "tags", label: "Top Tags" },
        { value: "recent", label: "Recent" }
      ], defaultValue: "types" }, function(tab) {
        if (tab === "types") {
          return React.createElement("div", { style: { marginTop: "8px" } },
            typeChartData.length > 0
              ? React.createElement(ResponsiveContainer, { width: "100%", height: 250 },
                  React.createElement(PieChart, null,
                    React.createElement(Pie, { data: typeChartData, dataKey: "value", nameKey: "name", cx: "50%", cy: "50%", outerRadius: 80, label: function(entry) { return entry.name + " (" + entry.value + ")"; } },
                      typeChartData.map(function(entry, ci) {
                        return React.createElement(Cell, { key: ci, fill: COLORS[ci % COLORS.length] });
                      })
                    ),
                    React.createElement(Tooltip, null)
                  )
                )
              : React.createElement(EmptyState, { title: "No data" })
          );
        }
        if (tab === "top") {
          return React.createElement("div", { style: { marginTop: "8px" } },
            topRated.length === 0
              ? React.createElement(EmptyState, { icon: React.createElement(LucideIcons.Star, { size: 24 }), title: "No ratings yet", description: "Rate your media to see top items here" })
              : React.createElement("div", null,
                  topRated.map(function(item, idx) {
                    return React.createElement("div", { key: item.entityId || idx, style: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid #1f2937" } },
                      React.createElement("span", { style: { fontWeight: 700, color: "#6b7280", width: "24px", textAlign: "center" } }, "#" + (idx + 1)),
                      item.imageUrl
                        ? React.createElement("img", { src: item.imageUrl, style: { width: "32px", height: "42px", objectFit: "cover", borderRadius: "4px" }, alt: "" })
                        : null,
                      React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "#f3f4f6" } }, item.title),
                        React.createElement(TypeBadge, { type: item.type })
                      ),
                      React.createElement(Badge, { variant: "warning" }, "\u2605 " + item.userRating)
                    );
                  })
                )
          );
        }
        if (tab === "tags") {
          return React.createElement("div", { style: { marginTop: "8px" } },
            topTags.length === 0
              ? React.createElement(EmptyState, { title: "No tags found" })
              : React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                  topTags.map(function(t, ti) {
                    return React.createElement(Badge, { key: ti, variant: ti < 5 ? "info" : "outline" }, t.tag + " (" + t.count + ")");
                  })
                )
          );
        }
        if (tab === "recent") {
          return React.createElement("div", { style: { marginTop: "8px" } },
            recentlyCompleted.length === 0
              ? React.createElement(EmptyState, { icon: React.createElement(LucideIcons.CheckCircle, { size: 24 }), title: "Nothing completed yet", description: "Mark items as completed to see them here" })
              : React.createElement("div", null,
                  recentlyCompleted.map(function(item, idx) {
                    return React.createElement("div", { key: item.entityId || idx, style: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid #1f2937" } },
                      React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "#f3f4f6" } }, item.title),
                        React.createElement("div", { style: { display: "flex", gap: "4px" } },
                          React.createElement(TypeBadge, { type: item.type }),
                          item.userRating ? React.createElement(Badge, { variant: "warning" }, "\u2605 " + item.userRating) : null
                        )
                      ),
                      React.createElement("div", { style: { fontSize: "12px", color: "#6b7280" } }, fmtDate(item.dateCompleted))
                    );
                  })
                )
          );
        }
        return null;
      })
    );
  }

  // ══════════════════════════════════════════════
  // ADD CONFIRMATION VIEW
  // ══════════════════════════════════════════════
  if (isAdd) {
    return React.createElement(UICard, { accent: data.success ? "emerald" : "red" },
      React.createElement("div", { style: { padding: "16px", textAlign: "center" } },
        React.createElement("div", { style: { fontSize: "24px", marginBottom: "8px" } }, data.success ? "\u2713" : "\u2717"),
        React.createElement("div", { style: { fontSize: "16px", fontWeight: 600, color: "#f3f4f6", marginBottom: "4px" } },
          data.success ? "Added to library" : "Failed to add"
        ),
        data.success ? React.createElement("div", null,
          React.createElement("div", { style: { fontSize: "14px", color: "#d1d5db", marginBottom: "4px" } }, data.title),
          React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "center", marginBottom: "4px" } },
            React.createElement(TypeBadge, { type: data.type }),
            React.createElement(Badge, { variant: "outline" }, data.entityId)
          ),
          (data.tags || []).length > 0
            ? React.createElement("div", { style: { display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap" } },
                data.tags.map(function(t, ti) { return React.createElement(Badge, { key: ti, variant: "outline" }, t); })
              )
            : null
        ) : null,
        React.createElement("div", { style: { marginTop: "12px" } },
          React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("browse", {}); } }, "View Library")
        )
      )
    );
  }

  // ══════════════════════════════════════════════
  // DISCOVER VIEW
  // ══════════════════════════════════════════════
  if (isDiscover) {
    var categories = data.categories || [];
    var tasteProfile = data.tasteProfile || {};
    var topTags = tasteProfile.topTags || [];
    var embMethod = data.embeddingMethod || "tag-overlap";
    var embStats = data.embeddingStats || {};
    var isEmbedding = embMethod === "embedding-cosine";

    // Similarity badge color by percentage
    var simBadgeColor = function(pct) {
      if (pct >= 80) return "#10b981";
      if (pct >= 60) return "#3b82f6";
      if (pct >= 40) return "#f59e0b";
      return "#6b7280";
    };

    return React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } },
        React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, "Discover"),
        React.createElement(Badge, { variant: isEmbedding ? "success" : "outline" },
          isEmbedding ? "AI Embeddings" : "Tag Matching"
        )
      ),
      isEmbedding && (embStats.cached > 0 || embStats.computed > 0)
        ? React.createElement("div", { style: { fontSize: "11px", color: "#6b7280", marginBottom: "10px" } },
            embStats.cached + " cached + " + embStats.computed + " new embeddings computed"
          )
        : null,
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "8px", marginBottom: "16px" } },
        React.createElement(Stat, { label: "Favorites", value: tasteProfile.totalFavorites || 0, accent: "rose" }),
        React.createElement(Stat, { label: "Highly Rated", value: tasteProfile.totalRated || 0, accent: "amber" }),
        React.createElement(Stat, { label: "Completed", value: tasteProfile.totalCompleted || 0, accent: "emerald" }),
        React.createElement(Stat, { label: "To Explore", value: tasteProfile.totalUnstarted || 0, accent: "blue" })
      ),
      topTags.length > 0
        ? React.createElement("div", { style: { marginBottom: "16px" } },
            React.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "#9ca3af", marginBottom: "6px" } }, "YOUR TASTE PROFILE"),
            React.createElement("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
              topTags.slice(0, 8).map(function(t, ti) {
                return React.createElement(Badge, { key: ti, variant: ti < 3 ? "info" : "outline" }, t.tag + " (" + t.count + ")");
              })
            )
          )
        : null,
      categories.map(function(cat, ci) {
        if (!cat.items || cat.items.length === 0) return null;
        return React.createElement("div", { key: ci, style: { marginBottom: "16px" } },
          React.createElement("div", { style: { fontSize: "15px", fontWeight: 600, color: "#d1d5db", marginBottom: "8px" } }, cat.title),
          cat.items.map(function(item, ii) {
            var hasSim = item.similarityPct != null && item.similarityPct > 0;
            return React.createElement(UICard, { key: item.entityId || ii, accent: typeColors[item.type] || "blue", style: { marginBottom: "6px" } },
              React.createElement("div", { style: { display: "flex", gap: "10px", padding: "10px" } },
                item.imageUrl
                  ? React.createElement("img", { src: item.imageUrl, style: { width: "40px", height: "52px", objectFit: "cover", borderRadius: "4px" }, alt: "" })
                  : React.createElement("div", { style: { width: "40px", height: "52px", background: "#1f2937", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" } },
                      React.createElement(LucideIcons[typeIcons[item.type] || "FileText"], { size: 16, color: "#6b7280" })
                    ),
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
                    React.createElement("span", { style: { fontWeight: 600, fontSize: "13px", color: "#f3f4f6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item.title),
                    hasSim
                      ? React.createElement("span", { style: {
                          fontSize: "11px", fontWeight: 700, padding: "1px 6px", borderRadius: "10px",
                          background: simBadgeColor(item.similarityPct) + "22",
                          color: simBadgeColor(item.similarityPct),
                          whiteSpace: "nowrap", flexShrink: 0
                        } }, item.similarityPct + "%")
                      : null
                  ),
                  React.createElement("div", { style: { display: "flex", gap: "4px", marginTop: "2px" } },
                    React.createElement(TypeBadge, { type: item.type })
                  ),
                  React.createElement("div", { style: { fontSize: "12px", color: "#6b7280", marginTop: "4px" } }, item.reason || "")
                )
              )
            );
          })
        );
      }),
      tasteProfile.tasteEntityCount === 0
        ? React.createElement(UICard, { accent: "amber", style: { marginTop: "8px" } },
            React.createElement("div", { style: { padding: "12px", textAlign: "center" } },
              React.createElement(LucideIcons.Sparkles, { size: 20, color: "#f59e0b", style: { margin: "0 auto 8px" } }),
              React.createElement("div", { style: { fontSize: "13px", color: "#d1d5db" } }, "Rate or favorite some items to unlock AI-powered discovery recommendations")
            )
          )
        : null
    );
  }

  // ══════════════════════════════════════════════
  // SMART COLLECTIONS VIEW
  // ══════════════════════════════════════════════
  if (isSmartCollections) {
    var scAction = data.action || "";

    // ── GENERATE: Proposal cards ──
    if (scAction === "generate") {
      var proposals = data.proposals || [];
      return React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, "Smart Collection Proposals"),
            React.createElement("div", { style: { fontSize: "12px", color: "#9ca3af", marginTop: "2px" } },
              data.totalEntitiesAnalyzed + " entities analyzed \u2022 " + data.uniqueTagsFound + " tags found \u2022 " + data.uniqueEntitiesCovered + " entities covered"
            )
          ),
          React.createElement(Badge, { variant: "info" }, proposals.length + " proposals")
        ),
        proposals.length === 0
          ? React.createElement(EmptyState, { icon: React.createElement(LucideIcons.Sparkles, { size: 32 }), title: "No clusters found", description: "Not enough entities with shared semantic tags to form collections" })
          : React.createElement("div", null,
              proposals.map(function(p, pi) {
                var typeKeys = Object.keys(p.typeBreakdown || {});
                return React.createElement(UICard, { key: p.proposalId || pi, accent: typeKeys.length > 2 ? "amber" : typeKeys.length > 1 ? "purple" : "blue", style: { marginBottom: "10px" } },
                  React.createElement("div", { style: { padding: "12px" } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" } },
                      React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { fontWeight: 700, fontSize: "15px", color: "#f3f4f6", marginBottom: "4px" } }, p.name),
                        React.createElement("div", { style: { fontSize: "12px", color: "#9ca3af", marginBottom: "6px" } }, p.description)
                      ),
                      React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0, marginLeft: "8px" } },
                        React.createElement(Badge, { variant: "info" }, p.entityCount + " items"),
                        React.createElement(Badge, { variant: p.diversityScore > 1.3 ? "success" : "outline" },
                          typeKeys.length + " type" + (typeKeys.length > 1 ? "s" : "")
                        )
                      )
                    ),
                    React.createElement("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "8px" } },
                      typeKeys.map(function(tk) {
                        return React.createElement(Badge, { key: tk, variant: "outline", style: { borderColor: "var(--accent-" + (typeColors[tk] || "blue") + ", #3b82f6)" } },
                          (tk === "tv-series" ? "TV" : tk.charAt(0).toUpperCase() + tk.slice(1)) + " " + p.typeBreakdown[tk]
                        );
                      })
                    ),
                    (p.sampleEntities || []).length > 0
                      ? React.createElement("div", { style: { display: "flex", gap: "8px", marginBottom: "10px", overflowX: "auto" } },
                          p.sampleEntities.map(function(se, sei) {
                            return React.createElement("div", { key: sei, style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } },
                              se.imageUrl
                                ? React.createElement("img", { src: se.imageUrl, style: { width: "28px", height: "36px", objectFit: "cover", borderRadius: "3px" }, alt: "" })
                                : React.createElement("div", { style: { width: "28px", height: "36px", background: "#1f2937", borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center" } },
                                    React.createElement(LucideIcons[typeIcons[se.type] || "FileText"], { size: 12, color: "#6b7280" })
                                  ),
                              React.createElement("span", { style: { fontSize: "11px", color: "#d1d5db", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, se.title)
                            );
                          })
                        )
                      : null,
                    React.createElement("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px" } },
                      (p.tags || []).slice(0, 4).map(function(tg, tgi) {
                        return React.createElement("span", { key: tgi, style: { fontSize: "11px", padding: "1px 6px", borderRadius: "4px", background: "#1f2937", color: "#9ca3af" } }, tg);
                      })
                    ),
                    React.createElement("div", { style: { display: "flex", gap: "8px" } },
                      React.createElement(Button, { variant: "primary", size: "sm", onClick: function() {
                        var proposal = proposals[pi];
                        onAction("smart_collections", {
                          action: "apply",
                          proposalId: proposal.proposalId,
                          name: proposal.name,
                          description: proposal.description,
                          entityIds: proposal.entityIds || [],
                          tags: proposal.tags || []
                        });
                      } },
                        React.createElement(LucideIcons.Check, { size: 14 }), " Approve"
                      ),
                      React.createElement(Button, { variant: "ghost", size: "sm", onClick: function() { onAction("collection", { action: "view", collectionId: proposals[pi].proposalId }); } },
                        React.createElement(LucideIcons.Eye, { size: 14 }), " Preview"
                      )
                    )
                  )
                );
              })
            ),
        React.createElement("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } },
          React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("smart_collections", { action: "list" }); } },
            React.createElement(LucideIcons.List, { size: 14 }), " View Saved"
          ),
          React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("smart_collections", { action: "refresh" }); } },
            React.createElement(LucideIcons.RefreshCw, { size: 14 }), " Refresh All"
          )
        )
      );
    }

    // ── APPLY: Confirmation ──
    if (scAction === "apply") {
      return React.createElement(UICard, { accent: data.success ? "emerald" : "red" },
        React.createElement("div", { style: { padding: "16px", textAlign: "center" } },
          React.createElement("div", { style: { fontSize: "24px", marginBottom: "8px" } }, data.success ? "\u2713" : "\u2717"),
          React.createElement("div", { style: { fontSize: "16px", fontWeight: 600, color: "#f3f4f6", marginBottom: "4px" } },
            data.success ? "Smart collection saved!" : "Failed to save"
          ),
          data.success ? React.createElement("div", null,
            React.createElement("div", { style: { fontSize: "14px", color: "#d1d5db", marginBottom: "4px" } }, data.name),
            React.createElement(Badge, { variant: "info" }, data.entityCount + " items"),
            React.createElement("div", { style: { fontSize: "12px", color: "#6b7280", marginTop: "4px" } }, "ID: " + data.collectionId)
          ) : React.createElement("div", { style: { color: "#ef4444" } }, data.error || "Unknown error"),
          React.createElement("div", { style: { display: "flex", gap: "8px", justifyContent: "center", marginTop: "12px" } },
            React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("smart_collections", { action: "generate" }); } }, "Generate More"),
            React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("smart_collections", { action: "list" }); } }, "View All Smart Collections")
          )
        )
      );
    }

    // ── REFRESH: Results ──
    if (scAction === "refresh") {
      var refreshed = data.refreshed || [];
      return React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
          React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, "Smart Collections Refreshed"),
          React.createElement(Badge, { variant: data.success !== false ? "success" : "danger" }, data.refreshedCount + " updated")
        ),
        data.message
          ? React.createElement(EmptyState, { icon: React.createElement(LucideIcons.FolderOpen, { size: 32 }), title: "No smart collections", description: data.message })
          : React.createElement("div", null,
              refreshed.map(function(r, ri) {
                return React.createElement(UICard, { key: ri, accent: r.added > 0 ? "emerald" : r.removed > 0 ? "amber" : "blue", style: { marginBottom: "8px" } },
                  React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px" } },
                    React.createElement("div", null,
                      React.createElement("div", { style: { fontWeight: 600, color: "#f3f4f6" } }, r.name),
                      React.createElement("div", { style: { fontSize: "12px", color: "#9ca3af" } }, r.oldCount + " \u2192 " + r.newCount + " items")
                    ),
                    React.createElement("div", { style: { display: "flex", gap: "4px" } },
                      r.added > 0 ? React.createElement(Badge, { variant: "success" }, "+" + r.added) : null,
                      r.removed > 0 ? React.createElement(Badge, { variant: "danger" }, "-" + r.removed) : null,
                      r.added === 0 && r.removed === 0 ? React.createElement(Badge, { variant: "outline" }, "No change") : null
                    )
                  )
                );
              })
            ),
        React.createElement("div", { style: { marginTop: "12px" } },
          React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("smart_collections", { action: "list" }); } }, "View All Smart Collections")
        )
      );
    }

    // ── LIST: Smart collection grid ──
    if (scAction === "list") {
      var smartCols = data.collections || [];
      return React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
          React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, "Smart Collections"),
          React.createElement("div", { style: { display: "flex", gap: "6px" } },
            React.createElement(Badge, { variant: "info" }, data.totalSmartCollections + " collections"),
            React.createElement(Button, { variant: "primary", size: "sm", onClick: function() { onAction("smart_collections", { action: "generate" }); } },
              React.createElement(LucideIcons.Sparkles, { size: 14 }), " Generate New"
            )
          )
        ),
        smartCols.length === 0
          ? React.createElement(EmptyState, { icon: React.createElement(LucideIcons.Sparkles, { size: 32 }), title: "No smart collections yet", description: "Generate smart collections to auto-organize your media by theme" })
          : React.createElement("div", null,
              smartCols.map(function(sc, sci) {
                var scTypeKeys = Object.keys(sc.typeBreakdown || {});
                return React.createElement(UICard, { key: sc.id || sci, accent: scTypeKeys.length > 2 ? "amber" : scTypeKeys.length > 1 ? "purple" : "blue", style: { marginBottom: "8px", cursor: "pointer" } },
                  React.createElement("div", { style: { padding: "12px" }, onClick: function() { onAction("collection", { action: "view", collectionId: sc.id }); } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" } },
                      React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { fontWeight: 600, fontSize: "14px", color: "#f3f4f6" } }, sc.name),
                        sc.description ? React.createElement("div", { style: { fontSize: "12px", color: "#9ca3af", marginTop: "2px" } }, sc.description) : null
                      ),
                      React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 } },
                        React.createElement(Badge, { variant: "info" }, sc.entityCount + " items"),
                        React.createElement("span", { style: { fontSize: "11px", color: "#6b7280" } }, sc.freshness)
                      )
                    ),
                    React.createElement("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "6px" } },
                      scTypeKeys.map(function(stk) {
                        return React.createElement(Badge, { key: stk, variant: "outline", style: { borderColor: "var(--accent-" + (typeColors[stk] || "blue") + ", #3b82f6)" } },
                          (stk === "tv-series" ? "TV" : stk.charAt(0).toUpperCase() + stk.slice(1)) + " " + sc.typeBreakdown[stk]
                        );
                      })
                    ),
                    (sc.sampleEntities || []).length > 0
                      ? React.createElement("div", { style: { display: "flex", gap: "6px" } },
                          sc.sampleEntities.map(function(se, sei) {
                            return React.createElement("div", { key: sei, style: { display: "flex", alignItems: "center", gap: "4px" } },
                              se.imageUrl
                                ? React.createElement("img", { src: se.imageUrl, style: { width: "24px", height: "32px", objectFit: "cover", borderRadius: "3px" }, alt: "" })
                                : null,
                              React.createElement("span", { style: { fontSize: "11px", color: "#d1d5db", maxWidth: "70px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, se.title)
                            );
                          })
                        )
                      : null
                  )
                );
              }),
              React.createElement("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } },
                React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("smart_collections", { action: "refresh" }); } },
                  React.createElement(LucideIcons.RefreshCw, { size: 14 }), " Refresh All"
                )
              )
            )
      );
    }

    // Fallback for unknown smart collection action
    return React.createElement(UICard, null,
      React.createElement("div", { style: { padding: "16px" } },
        React.createElement("pre", { style: { fontSize: "12px", color: "#9ca3af", whiteSpace: "pre-wrap" } }, JSON.stringify(data, null, 2))
      )
    );
  }

  // ══════════════════════════════════════════════
  // DASHBOARD VIEW
  // ══════════════════════════════════════════════
  if (isDashboard) {
    var ov = data.overview || {};
    var hs = data.healthScore || 0;
    var hColor = data.healthColor || "red";
    var hBreakdown = data.healthBreakdown || [];
    var typeEng = data.typeEngagement || [];
    var dGaps = data.gaps || [];
    var disc = data.discovery || {};
    var qActions = data.quickActions || [];
    var topOpp = data.topOpportunities || [];

    // Color mappings
    var accentMap = { red: "#ef4444", amber: "#f59e0b", emerald: "#10b981" };
    var accentBg = { red: "rgba(239,68,68,0.1)", amber: "rgba(245,158,11,0.1)", emerald: "rgba(16,185,129,0.1)" };
    var sevColors = { high: "#ef4444", medium: "#f59e0b", low: "#6b7280" };
    var readinessColors = { ready: "#10b981", partial: "#f59e0b", not_ready: "#ef4444" };
    var readinessLabels = { ready: "Ready", partial: "Partially Ready", not_ready: "Not Ready" };
    var strengthLabels = { strong: "Strong", moderate: "Moderate", weak: "Weak", none: "None" };
    var strengthColors = { strong: "#10b981", moderate: "#f59e0b", weak: "#ef4444", none: "#6b7280" };

    // Health gauge - circular score display
    var gaugeSize = 120;
    var gaugeStroke = 10;
    var gaugeRadius = (gaugeSize - gaugeStroke) / 2;
    var gaugeCircumference = 2 * Math.PI * gaugeRadius;
    var gaugeFill = (hs / 100) * gaugeCircumference;

    var HealthGauge = React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0" } },
      React.createElement("svg", { width: gaugeSize, height: gaugeSize, viewBox: "0 0 " + gaugeSize + " " + gaugeSize },
        React.createElement("circle", {
          cx: gaugeSize / 2, cy: gaugeSize / 2, r: gaugeRadius,
          fill: "none", stroke: "#374151", strokeWidth: gaugeStroke
        }),
        React.createElement("circle", {
          cx: gaugeSize / 2, cy: gaugeSize / 2, r: gaugeRadius,
          fill: "none", stroke: accentMap[hColor] || "#ef4444", strokeWidth: gaugeStroke,
          strokeDasharray: gaugeCircumference,
          strokeDashoffset: gaugeCircumference - gaugeFill,
          strokeLinecap: "round",
          transform: "rotate(-90 " + (gaugeSize / 2) + " " + (gaugeSize / 2) + ")"
        }),
        React.createElement("text", {
          x: gaugeSize / 2, y: gaugeSize / 2 - 4, textAnchor: "middle",
          fill: accentMap[hColor] || "#ef4444", fontSize: "28", fontWeight: "700"
        }, String(hs)),
        React.createElement("text", {
          x: gaugeSize / 2, y: gaugeSize / 2 + 14, textAnchor: "middle",
          fill: "#9ca3af", fontSize: "10"
        }, "/ 100")
      ),
      React.createElement("div", { style: { fontSize: "13px", color: "#d1d5db", marginTop: "4px", fontWeight: 600 } }, "Engagement Health")
    );

    // Health breakdown bars
    var BreakdownBars = React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
      hBreakdown.map(function(hb, hbi) {
        var barPct = Math.min(100, hb.rawPercent);
        return React.createElement("div", { key: hbi, style: { display: "flex", alignItems: "center", gap: "8px" } },
          React.createElement("div", { style: { width: "100px", fontSize: "11px", color: "#9ca3af", textAlign: "right", flexShrink: 0 } },
            hb.label + " (" + hb.weight + "%)"
          ),
          React.createElement("div", { style: { flex: 1, height: "16px", background: "#1f2937", borderRadius: "8px", overflow: "hidden", position: "relative" } },
            React.createElement("div", { style: {
              width: barPct + "%", height: "100%",
              background: barPct < 10 ? "#ef4444" : (barPct < 40 ? "#f59e0b" : "#10b981"),
              borderRadius: "8px", transition: "width 0.3s"
            } })
          ),
          React.createElement("div", { style: { width: "55px", fontSize: "11px", color: "#d1d5db", textAlign: "right", flexShrink: 0 } },
            hb.rawPercent + "% → " + hb.contribution
          )
        );
      })
    );

    // Type breakdown stacked bars
    var catKeys = Object.keys(ov.categoryCounts || {}).sort(function(a, b) {
      return (ov.categoryCounts[b] || 0) - (ov.categoryCounts[a] || 0);
    });
    var catColorMap = { books: "#10b981", movies: "#a855f7", tv: "#06b6d4", documentaries: "#f59e0b", games: "#f43f5e", music: "#3b82f6" };

    var TypeBars = React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
      catKeys.map(function(ck) {
        var cnt = ov.categoryCounts[ck] || 0;
        var pct = ov.totalEntities > 0 ? Math.round((cnt / ov.totalEntities) * 100) : 0;
        return React.createElement("div", { key: ck, style: { display: "flex", alignItems: "center", gap: "8px" } },
          React.createElement("div", { style: { width: "90px", fontSize: "12px", color: "#d1d5db", textAlign: "right", flexShrink: 0, textTransform: "capitalize" } }, ck),
          React.createElement("div", { style: { flex: 1, height: "20px", background: "#1f2937", borderRadius: "10px", overflow: "hidden" } },
            React.createElement("div", { style: {
              width: Math.max(2, pct) + "%", height: "100%",
              background: catColorMap[ck] || "#6b7280", borderRadius: "10px"
            } })
          ),
          React.createElement("div", { style: { width: "65px", fontSize: "11px", color: "#9ca3af", textAlign: "right", flexShrink: 0 } },
            cnt + " (" + pct + "%)"
          )
        );
      })
    );

    // Per-type engagement table
    var EngagementTable = typeEng.length > 0
      ? React.createElement(DataTable, {
          columns: [
            { key: "type", label: "Type", render: function(v) { return React.createElement("span", { style: { textTransform: "capitalize" } }, (v || "").replace("-", " ")); } },
            { key: "count", label: "Total" },
            { key: "ratedPercent", label: "Rated %", render: function(v) { return v + "%"; } },
            { key: "withTagsPercent", label: "Tagged %", render: function(v) { return v + "%"; } },
            { key: "engagementRate", label: "Engagement", render: function(v) {
              var c = v < 5 ? "#ef4444" : (v < 20 ? "#f59e0b" : "#10b981");
              return React.createElement("span", { style: { color: c, fontWeight: 600 } }, v + "%");
            }}
          ],
          data: typeEng,
          compact: true
        })
      : null;

    // Gap alert cards
    var GapAlerts = dGaps.length > 0
      ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
          dGaps.map(function(gap, gi) {
            return React.createElement("div", {
              key: gi,
              style: {
                padding: "10px 12px", borderRadius: "8px",
                borderLeft: "3px solid " + (sevColors[gap.severity] || "#6b7280"),
                background: "rgba(31,41,55,0.7)"
              }
            },
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                React.createElement("div", { style: { fontSize: "12px", color: "#d1d5db" } }, gap.message),
                React.createElement(Badge, {
                  variant: gap.severity === "high" ? "danger" : (gap.severity === "medium" ? "warning" : "default")
                }, gap.severity)
              )
            );
          })
        )
      : React.createElement("div", { style: { padding: "12px", textAlign: "center", color: "#6b7280", fontSize: "13px" } }, "No coverage gaps detected");

    // Discovery readiness panel
    var DiscoveryPanel = React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" } },
        React.createElement("span", { style: { fontSize: "13px", color: "#d1d5db" } }, "Overall Readiness"),
        React.createElement(Badge, {
          variant: disc.overallReadiness === "ready" ? "success" : (disc.overallReadiness === "partial" ? "warning" : "danger")
        }, readinessLabels[disc.overallReadiness] || "Unknown")
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } },
        React.createElement(Stat, { label: "Taste Profile", value: strengthLabels[disc.tasteProfileStrength] || "None", accent: disc.tasteProfileStrength === "strong" ? "emerald" : (disc.tasteProfileStrength === "moderate" ? "amber" : "red") }),
        React.createElement(Stat, { label: "Taste Signals", value: String(disc.tasteSignals || 0), accent: "blue" }),
        React.createElement(Stat, { label: "Tag Coverage", value: (disc.semanticTagCoverage || 0) + "%", accent: (disc.semanticTagCoverage || 0) >= 50 ? "emerald" : "amber" }),
        React.createElement(Stat, { label: "Cross-Refs / Entity", value: String(disc.crossRefDensity || 0), accent: (disc.crossRefDensity || 0) >= 1 ? "emerald" : "amber" }),
        React.createElement(Stat, { label: "Embeddings Cached", value: String(disc.embeddingsCached || 0), accent: "purple" }),
        React.createElement(Stat, { label: "Embedding Coverage", value: (disc.embeddingsPercent || 0) + "%", accent: (disc.embeddingsPercent || 0) >= 30 ? "emerald" : "amber" })
      )
    );

    // Quick action buttons
    var QuickActions = qActions.length > 0
      ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
          qActions.map(function(qa) {
            var icon = null;
            if (qa.id === "batch_seed") icon = React.createElement(LucideIcons.Zap, { size: 14 });
            else if (qa.id === "smart_collections") icon = React.createElement(LucideIcons.Layers, { size: 14 });
            else if (qa.id === "scan_music") icon = React.createElement(LucideIcons.Music, { size: 14 });
            else if (qa.id === "rate_top_10") icon = React.createElement(LucideIcons.Star, { size: 14 });
            else if (qa.id === "compute_embeddings") icon = React.createElement(LucideIcons.Cpu, { size: 14 });

            var prioColor = qa.priority === "high" ? "#ef4444" : (qa.priority === "medium" ? "#f59e0b" : "#6b7280");

            return React.createElement("div", {
              key: qa.id,
              style: {
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderRadius: "8px", background: "rgba(31,41,55,0.7)",
                borderLeft: "3px solid " + prioColor
              }
            },
              React.createElement("div", { style: { flex: 1 } },
                React.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "#e5e7eb", display: "flex", alignItems: "center", gap: "6px" } },
                  icon, qa.label
                ),
                React.createElement("div", { style: { fontSize: "11px", color: "#9ca3af", marginTop: "2px" } }, qa.description)
              ),
              qa.action
                ? React.createElement(Button, {
                    size: "sm",
                    variant: qa.priority === "high" ? "primary" : "outline",
                    onClick: function() { onAction(qa.action, qa.actionParams || {}); }
                  }, "Run")
                : null
            );
          })
        )
      : React.createElement("div", { style: { padding: "12px", textAlign: "center", color: "#6b7280", fontSize: "13px" } }, "All good! No urgent actions.");

    // Top unrated opportunities (compact list)
    var OpportunitiesList = topOpp.length > 0
      ? React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          topOpp.slice(0, 5).map(function(opp, opi) {
            return React.createElement("div", {
              key: opi,
              style: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", borderRadius: "6px", background: "rgba(31,41,55,0.5)" }
            },
              opp.imageUrl
                ? React.createElement("img", { src: opp.imageUrl, style: { width: "28px", height: "38px", objectFit: "cover", borderRadius: "4px" }, alt: "" })
                : React.createElement("div", { style: { width: "28px", height: "38px", background: "#374151", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" } },
                    React.createElement(LucideIcons.BookOpen, { size: 14, color: "#6b7280" })
                  ),
              React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                React.createElement("div", { style: { fontSize: "12px", color: "#e5e7eb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, opp.title),
                React.createElement("div", { style: { fontSize: "10px", color: "#6b7280", textTransform: "capitalize" } }, (opp.type || "").replace("-", " "))
              ),
              React.createElement(Badge, { variant: "info" }, "★ " + opp.externalRating),
              React.createElement(Button, {
                size: "sm", variant: "outline",
                onClick: function() { onAction("rate", { entityId: opp.entityId, rating: Math.round(opp.externalRating) }); }
              }, "Rate")
            );
          })
        )
      : null;

    // Overview stats row
    var OverviewRow = React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" } },
      React.createElement(Stat, { label: "Total Entities", value: String(ov.totalEntities || 0), accent: "blue" }),
      React.createElement(Stat, { label: "Rated", value: (ov.ratedCount || 0) + " (" + (ov.ratedPercent || 0) + "%)", accent: (ov.ratedPercent || 0) > 20 ? "emerald" : "red" }),
      React.createElement(Stat, { label: "Avg Rating", value: ov.averageRating ? String(ov.averageRating) : "—", accent: "amber" }),
      React.createElement(Stat, { label: "Favorites", value: String(ov.favoriteCount || 0), accent: "rose" }),
      React.createElement(Stat, { label: "Collections", value: String(ov.totalCollections || 0), accent: "purple" }),
      React.createElement(Stat, { label: "Tracked", value: (ov.statusTrackedCount || 0) + " (" + (ov.statusTrackedPercent || 0) + "%)", accent: "cyan" })
    );

    // Dashboard tabs
    var dashTabs = [
      { id: "overview", label: "Overview" },
      { id: "engagement", label: "Engagement" },
      { id: "gaps", label: "Gaps" },
      { id: "discovery", label: "Discovery" },
      { id: "actions", label: "Actions" }
    ];

    return React.createElement("div", { className: "space-y-4" },
      // Header with health gauge
      React.createElement(UICard, { accent: hColor },
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" } },
          React.createElement("div", { style: { flex: 1 } },
            React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6", marginBottom: "4px" } }, "Library Health Dashboard"),
            React.createElement("div", { style: { fontSize: "12px", color: "#9ca3af" } },
              (ov.totalEntities || 0) + " entities across " + catKeys.length + " media types"
            ),
            React.createElement("div", { style: { marginTop: "8px" } }, OverviewRow)
          ),
          HealthGauge
        )
      ),

      // Tabbed content
      React.createElement(Tabs, {
        tabs: dashTabs
      }, function(tab) {
        if (tab === "overview") {
          return React.createElement("div", { className: "space-y-4" },
            React.createElement(UICard, { header: "Media Type Breakdown" }, TypeBars),
            React.createElement(UICard, { header: "Health Score Breakdown" }, BreakdownBars)
          );
        }
        if (tab === "engagement") {
          return React.createElement("div", { className: "space-y-4" },
            React.createElement(UICard, { header: "Per-Type Engagement" }, EngagementTable),
            topOpp.length > 0
              ? React.createElement(UICard, { header: "Top Unrated — High External Rating" }, OpportunitiesList)
              : null
          );
        }
        if (tab === "gaps") {
          return React.createElement(UICard, { header: "Coverage Gaps (" + dGaps.length + ")" }, GapAlerts);
        }
        if (tab === "discovery") {
          return React.createElement(UICard, { header: "Discovery Readiness" }, DiscoveryPanel);
        }
        if (tab === "actions") {
          return React.createElement(UICard, { header: "Quick Actions" }, QuickActions);
        }
        return null;
      }),

      // Refresh button
      React.createElement("div", { style: { display: "flex", justifyContent: "center", padding: "4px 0" } },
        React.createElement(Button, {
          variant: "outline", size: "sm",
          onClick: function() { onAction("dashboard", {}); }
        }, React.createElement(LucideIcons.RefreshCw, { size: 14 }), " Refresh Dashboard"),
        React.createElement(Button, {
          variant: "outline", size: "sm", style: { marginLeft: "8px" },
          onClick: function() { onAction("browse", {}); }
        }, React.createElement(LucideIcons.Library, { size: 14 }), " Browse Library")
      )
    );
  }

  // ══════════════════════════════════════════════
  // BATCH SEED VIEW
  // ══════════════════════════════════════════════
  if (isBatchSeed) {
    var bsAction = data.action || "";

    if (data.error) {
      return React.createElement(UICard, { accent: "red" },
        React.createElement("div", { style: { padding: "16px", textAlign: "center" } },
          React.createElement("div", { style: { fontSize: "16px", fontWeight: 600, color: "#ef4444", marginBottom: "8px" } }, "Batch Seed Error"),
          React.createElement("div", { style: { color: "#9ca3af" } }, data.error)
        )
      );
    }

    // ── STATUS VIEW ──
    if (bsAction === "status") {
      var bsTypes = data.byType || {};
      var bsTypeKeys = Object.keys(bsTypes).sort();
      return React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, "Engagement Coverage"),
            React.createElement("div", { style: { fontSize: "12px", color: "#9ca3af", marginTop: "2px" } }, data.totalMedia + " media entities")
          ),
          React.createElement(Button, { variant: "primary", size: "sm", onClick: function() { onAction("batch_seed", { action: "preview" }); } },
            React.createElement(LucideIcons.Zap, { size: 14 }), " Preview Seed"
          )
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "16px" } },
          React.createElement(Stat, { label: "Rated", value: data.withRating + "/" + data.totalMedia, accent: data.ratingCoverage > 50 ? "emerald" : data.ratingCoverage > 10 ? "amber" : "red" }),
          React.createElement(Stat, { label: "Favorites", value: data.withFavorite, accent: data.favoriteCoverage > 5 ? "rose" : "red" }),
          React.createElement(Stat, { label: "Tracked", value: data.withStatus + "/" + data.totalMedia, accent: data.statusCoverage > 50 ? "cyan" : data.statusCoverage > 10 ? "amber" : "red" })
        ),
        React.createElement("div", { style: { marginBottom: "12px" } },
          React.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "#9ca3af", marginBottom: "8px" } }, "COVERAGE BY TYPE"),
          bsTypeKeys.map(function(tk) {
            var t = bsTypes[tk];
            var rPct = t.total > 0 ? Math.round((t.rated / t.total) * 100) : 0;
            var sPct = t.total > 0 ? Math.round((t.tracked / t.total) * 100) : 0;
            return React.createElement(UICard, { key: tk, accent: typeColors[tk] || "blue", style: { marginBottom: "6px" } },
              React.createElement("div", { style: { padding: "10px" } },
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
                    React.createElement(LucideIcons[typeIcons[tk] || "FileText"], { size: 16, color: "#9ca3af" }),
                    React.createElement("span", { style: { fontWeight: 600, fontSize: "14px", color: "#f3f4f6" } },
                      (tk === "tv-series" ? "TV Series" : tk.charAt(0).toUpperCase() + tk.slice(1)) + "s"
                    )
                  ),
                  React.createElement(Badge, { variant: "outline" }, t.total + " total")
                ),
                React.createElement("div", { style: { display: "flex", gap: "12px" } },
                  React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontSize: "11px", color: "#6b7280", marginBottom: "2px" } }, "Rated: " + t.rated + " (" + rPct + "%)"),
                    React.createElement("div", { style: { height: "4px", borderRadius: "2px", background: "#1f2937" } },
                      React.createElement("div", { style: { height: "4px", borderRadius: "2px", background: rPct > 50 ? "#10b981" : rPct > 10 ? "#f59e0b" : "#ef4444", width: rPct + "%" } })
                    )
                  ),
                  React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontSize: "11px", color: "#6b7280", marginBottom: "2px" } }, "Tracked: " + t.tracked + " (" + sPct + "%)"),
                    React.createElement("div", { style: { height: "4px", borderRadius: "2px", background: "#1f2937" } },
                      React.createElement("div", { style: { height: "4px", borderRadius: "2px", background: sPct > 50 ? "#06b6d4" : sPct > 10 ? "#f59e0b" : "#ef4444", width: sPct + "%" } })
                    )
                  )
                )
              )
            );
          })
        ),
        React.createElement("div", { style: { display: "flex", gap: "8px" } },
          React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("stats", {}); } },
            React.createElement(LucideIcons.BarChart3, { size: 14 }), " Full Stats"
          ),
          React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("browse", {}); } },
            React.createElement(LucideIcons.Library, { size: 14 }), " Browse Library"
          )
        )
      );
    }

    // ── PREVIEW VIEW ──
    if (bsAction === "preview") {
      var pvTypes = data.byType || {};
      var pvTypeKeys = Object.keys(pvTypes).sort();
      var pvFormulas = data.formulas || [];
      var pvSamples = data.samples || {};
      return React.createElement("div", null,
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
          React.createElement("div", null,
            React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, "Batch Seed Preview"),
            React.createElement("div", { style: { fontSize: "12px", color: "#9ca3af", marginTop: "2px" } }, "Dry run \u2014 no changes applied yet")
          ),
          React.createElement(Badge, { variant: "info" }, data.totalCandidates + " candidates")
        ),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "8px", marginBottom: "16px" } },
          React.createElement(Stat, { label: "Would Rate", value: data.wouldRate || 0, accent: "amber" }),
          React.createElement(Stat, { label: "Would Fav", value: data.wouldFavorite || 0, accent: "rose" }),
          React.createElement(Stat, { label: "Would Track", value: data.wouldTrack || 0, accent: "cyan" }),
          React.createElement(Stat, { label: "Skipped", value: data.skippedExisting || 0, accent: "purple" })
        ),
        React.createElement("div", { style: { marginBottom: "16px" } },
          React.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "#9ca3af", marginBottom: "8px" } }, "BREAKDOWN BY TYPE"),
          pvTypeKeys.map(function(tk) {
            var pt = pvTypes[tk];
            return React.createElement(UICard, { key: tk, accent: typeColors[tk] || "blue", style: { marginBottom: "6px" } },
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px" } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
                  React.createElement(LucideIcons[typeIcons[tk] || "FileText"], { size: 16, color: "#9ca3af" }),
                  React.createElement("span", { style: { fontWeight: 600, fontSize: "14px", color: "#f3f4f6" } },
                    tk === "tv-series" ? "TV Series" : tk.charAt(0).toUpperCase() + tk.slice(1)
                  )
                ),
                React.createElement("div", { style: { display: "flex", gap: "6px" } },
                  pt.ratable > 0 ? React.createElement(Badge, { variant: "warning" }, pt.ratable + " ratings") : null,
                  pt.favoritable > 0 ? React.createElement(Badge, { variant: "danger" }, pt.favoritable + " favs") : null,
                  pt.statusable > 0 ? React.createElement(Badge, { variant: "info" }, pt.statusable + " status") : null
                )
              )
            );
          })
        ),
        React.createElement(Tabs, { tabs: [
          { value: "formulas", label: "Conversion" },
          { value: "samples", label: "Samples" }
        ], defaultValue: "formulas" }, function(tab) {
          if (tab === "formulas") {
            return React.createElement("div", { style: { marginTop: "8px" } },
              pvFormulas.map(function(f, fi) {
                return React.createElement(UICard, { key: fi, accent: "blue", style: { marginBottom: "6px" } },
                  React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px" } },
                    React.createElement("div", null,
                      React.createElement("div", { style: { fontWeight: 600, fontSize: "13px", color: "#f3f4f6" } }, f.source),
                      React.createElement("div", { style: { fontSize: "12px", color: "#6b7280" } }, f.scale + " \u2192 " + f.formula)
                    ),
                    React.createElement(Badge, { variant: "outline" }, f.example)
                  )
                );
              }),
              React.createElement(UICard, { accent: "emerald", style: { marginTop: "6px" } },
                React.createElement("div", { style: { padding: "10px" } },
                  React.createElement("div", { style: { fontSize: "12px", color: "#9ca3af" } },
                    "Auto-favorite: rating \u2265 8 \u2022 Auto-complete: Kindle/WeRead books, movies_tv, Steam games"
                  )
                )
              )
            );
          }
          if (tab === "samples") {
            var sampleKeys = Object.keys(pvSamples);
            if (sampleKeys.length === 0) return React.createElement(EmptyState, { title: "No samples" });
            return React.createElement("div", { style: { marginTop: "8px" } },
              sampleKeys.map(function(sk) {
                return React.createElement("div", { key: sk, style: { marginBottom: "12px" } },
                  React.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "#9ca3af", marginBottom: "6px" } },
                    (sk === "tv-series" ? "TV Series" : sk.charAt(0).toUpperCase() + sk.slice(1)) + " Samples"
                  ),
                  pvSamples[sk].map(function(s, si) {
                    return React.createElement("div", { key: si, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1f2937" } },
                      React.createElement("span", { style: { fontSize: "13px", color: "#d1d5db", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "8px" } }, s.title),
                      React.createElement("div", { style: { display: "flex", gap: "6px", flexShrink: 0 } },
                        React.createElement(Badge, { variant: "outline" }, s.sourceScale + ": " + s.sourceRating),
                        React.createElement(Badge, { variant: "warning" }, "\u2192 " + s.convertedRating + "/10")
                      )
                    );
                  })
                );
              })
            );
          }
          return null;
        }),
        React.createElement("div", { style: { display: "flex", gap: "8px", marginTop: "16px" } },
          React.createElement(Button, { variant: "primary", onClick: function() { onAction("batch_seed", { action: "seed" }); } },
            React.createElement(LucideIcons.Zap, { size: 14 }), " Apply Seed Now"
          ),
          React.createElement(Button, { variant: "outline", onClick: function() { onAction("batch_seed", { action: "status" }); } },
            React.createElement(LucideIcons.BarChart3, { size: 14 }), " View Status"
          )
        ),
        (data.noWikiPage > 0 || data.noRatingFound > 0)
          ? React.createElement("div", { style: { fontSize: "11px", color: "#6b7280", marginTop: "8px" } },
              (data.noWikiPage > 0 ? data.noWikiPage + " entities had no wiki page. " : "") +
              (data.noRatingFound > 0 ? data.noRatingFound + " wiki pages had no extractable rating." : "")
            )
          : null
      );
    }

    // ── SEED RESULTS VIEW ──
    if (bsAction === "seed") {
      var seedTypes = data.byType || {};
      var seedTypeKeys = Object.keys(seedTypes).sort();
      var rDist = data.ratingDistribution || {};
      var rDistKeys = Object.keys(rDist).sort(function(a, b) { return parseInt(a) - parseInt(b); });
      return React.createElement("div", null,
        React.createElement(UICard, { accent: data.success ? "emerald" : "red" },
          React.createElement("div", { style: { padding: "16px", textAlign: "center" } },
            React.createElement("div", { style: { fontSize: "32px", marginBottom: "8px" } }, data.success ? "\u2713" : "\u2717"),
            React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6", marginBottom: "4px" } },
              data.success ? "Batch Seed Complete!" : "Seed Failed"
            ),
            data.error
              ? React.createElement("div", { style: { color: "#ef4444" } }, data.error)
              : React.createElement("div", { style: { fontSize: "13px", color: "#9ca3af" } }, data.totalProcessed + " entities processed")
          )
        ),
        data.success ? React.createElement("div", null,
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", margin: "12px 0" } },
            React.createElement(Stat, { label: "Ratings Seeded", value: data.seededRatings || 0, accent: "amber" }),
            React.createElement(Stat, { label: "Favorites Set", value: data.seededFavorites || 0, accent: "rose" }),
            React.createElement(Stat, { label: "Status Tracked", value: data.seededStatus || 0, accent: "cyan" })
          ),
          seedTypeKeys.length > 0
            ? React.createElement("div", { style: { marginBottom: "12px" } },
                React.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "#9ca3af", marginBottom: "6px" } }, "BY TYPE"),
                seedTypeKeys.map(function(tk) {
                  var st = seedTypes[tk];
                  return React.createElement("div", { key: tk, style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1f2937" } },
                    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
                      React.createElement(LucideIcons[typeIcons[tk] || "FileText"], { size: 14, color: "#9ca3af" }),
                      React.createElement("span", { style: { fontSize: "13px", color: "#d1d5db" } }, tk === "tv-series" ? "TV Series" : tk.charAt(0).toUpperCase() + tk.slice(1))
                    ),
                    React.createElement("div", { style: { display: "flex", gap: "4px" } },
                      st.ratable > 0 ? React.createElement(Badge, { variant: "warning" }, st.ratable + " rated") : null,
                      st.favoritable > 0 ? React.createElement(Badge, { variant: "danger" }, st.favoritable + " fav") : null,
                      st.statusable > 0 ? React.createElement(Badge, { variant: "info" }, st.statusable + " tracked") : null
                    )
                  );
                })
              )
            : null,
          rDistKeys.length > 0
            ? React.createElement("div", { style: { marginBottom: "12px" } },
                React.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "#9ca3af", marginBottom: "6px" } }, "RATING DISTRIBUTION"),
                React.createElement("div", { style: { display: "flex", gap: "4px", alignItems: "flex-end", height: "80px" } },
                  rDistKeys.map(function(rk) {
                    var maxVal = Math.max.apply(null, rDistKeys.map(function(k) { return rDist[k]; }));
                    var barH = maxVal > 0 ? Math.round((rDist[rk] / maxVal) * 70) : 0;
                    return React.createElement("div", { key: rk, style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" } },
                      React.createElement("div", { style: { fontSize: "10px", color: "#9ca3af", marginBottom: "2px" } }, rDist[rk]),
                      React.createElement("div", { style: { width: "100%", height: barH + "px", background: parseInt(rk) >= 8 ? "#f59e0b" : "#3b82f6", borderRadius: "2px 2px 0 0", minHeight: "2px" } }),
                      React.createElement("div", { style: { fontSize: "10px", color: "#6b7280", marginTop: "2px" } }, rk)
                    );
                  })
                )
              )
            : null
        ) : null,
        React.createElement("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } },
          React.createElement(Button, { variant: "primary", size: "sm", onClick: function() { onAction("batch_seed", { action: "status" }); } },
            React.createElement(LucideIcons.BarChart3, { size: 14 }), " View Coverage"
          ),
          React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("browse", { sortBy: "rating" }); } },
            React.createElement(LucideIcons.Library, { size: 14 }), " Browse by Rating"
          ),
          React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("discover", {}); } },
            React.createElement(LucideIcons.Compass, { size: 14 }), " Discover"
          )
        )
      );
    }

    // Batch seed fallback
    return React.createElement(UICard, null,
      React.createElement("div", { style: { padding: "16px" } },
        React.createElement("pre", { style: { fontSize: "12px", color: "#9ca3af", whiteSpace: "pre-wrap" } }, JSON.stringify(data, null, 2))
      )
    );
  }

  // ══════════════════════════════════════════════
  // TIMELINE VIEW
  // ══════════════════════════════════════════════
  if (isTimeline) {
    var tlTimeline = data.timeline || [];
    var tlStats = data.overallStats || {};
    var tlEventTypeCounts = tlStats.eventTypeCounts || {};
    var tlMediaTypeCounts = tlStats.mediaTypeCounts || {};
    var tlPeriod = data.period || "all";
    var tlMediaType = data.mediaType || "all";

    // Event type icons and colors
    var eventIcons = { started: "Play", completed: "CheckCircle", rated: "Star", favorited: "Heart" };
    var eventColors = { started: "#3b82f6", completed: "#10b981", rated: "#f59e0b", favorited: "#ef4444" };
    var eventLabels = { started: "Started", completed: "Completed", rated: "Rated", favorited: "Favorited" };

    // Period filter buttons
    var periodOptions = [
      { value: "week", label: "Week" },
      { value: "month", label: "Month" },
      { value: "quarter", label: "Quarter" },
      { value: "year", label: "Year" },
      { value: "all", label: "All Time" }
    ];

    // Render a single event card
    var renderEventCard = function(ev, idx) {
      var iconName = eventIcons[ev.eventType] || "Activity";
      var color = eventColors[ev.eventType] || "#6b7280";
      var label = eventLabels[ev.eventType] || ev.eventType;
      var ent = ev.entity || {};

      return React.createElement("div", {
        key: (ent.entityId || "") + "-" + ev.eventType + "-" + idx,
        style: { display: "flex", gap: "10px", padding: "8px 0", borderBottom: "1px solid #1f2937" }
      },
        // Event type icon
        React.createElement("div", {
          style: {
            width: "32px", height: "32px", borderRadius: "50%",
            background: color + "22", display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0
          }
        },
          React.createElement(LucideIcons[iconName] || LucideIcons.Activity, { size: 16, color: color })
        ),
        // Entity info
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" } },
            React.createElement("span", {
              style: { fontWeight: 600, fontSize: "13px", color: "#f3f4f6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
            }, ent.title || "Unknown"),
            ev.eventType === "rated" && ev.rating
              ? React.createElement(Badge, { variant: "warning" }, "\u2605 " + ev.rating)
              : null
          ),
          React.createElement("div", { style: { display: "flex", gap: "4px", alignItems: "center" } },
            React.createElement(Badge, {
              variant: "outline",
              style: { borderColor: color, color: color, fontSize: "10px" }
            }, label),
            React.createElement(TypeBadge, { type: ent.type }),
            React.createElement("span", { style: { fontSize: "11px", color: "#6b7280" } }, fmtDate(ev.date))
          )
        ),
        // Entity thumbnail
        ent.imageUrl
          ? React.createElement("img", {
              src: ent.imageUrl,
              style: { width: "32px", height: "42px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 },
              alt: ""
            })
          : React.createElement("div", {
              style: { width: "32px", height: "42px", background: "#1f2937", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }
            },
              React.createElement(LucideIcons[typeIcons[ent.type] || "FileText"], { size: 14, color: "#6b7280" })
            )
      );
    };

    // Empty state
    if (tlTimeline.length === 0) {
      return React.createElement("div", null,
        React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6", marginBottom: "12px" } }, "Consumption Timeline"),
        React.createElement(EmptyState, {
          icon: React.createElement(LucideIcons.Clock, { size: 32 }),
          title: "No activity yet",
          description: "Start rating, favoriting, or tracking media to see your consumption timeline"
        }),
        React.createElement("div", { style: { display: "flex", justifyContent: "center", marginTop: "12px" } },
          React.createElement(Button, { variant: "outline", size: "sm", onClick: function() { onAction("browse", {}); } }, "Browse Library")
        )
      );
    }

    return React.createElement("div", null,
      // Header
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
        React.createElement("div", null,
          React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6" } }, "Consumption Timeline"),
          React.createElement("div", { style: { fontSize: "12px", color: "#9ca3af", marginTop: "2px" } },
            tlStats.totalEvents + " events across " + tlStats.activeMonths + " month" + (tlStats.activeMonths !== 1 ? "s" : "")
          )
        ),
        React.createElement(Badge, { variant: "info" },
          tlPeriod === "all" ? "All Time" : tlPeriod.charAt(0).toUpperCase() + tlPeriod.slice(1)
        )
      ),

      // Overall stats
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "8px", marginBottom: "16px" } },
        React.createElement(Stat, { label: "Total Events", value: tlStats.totalEvents || 0, accent: "blue" }),
        React.createElement(Stat, { label: "Active Months", value: tlStats.activeMonths || 0, accent: "purple" }),
        React.createElement(Stat, { label: "Busiest Month", value: (tlStats.busiestMonth || "—").split(" ")[0], accent: "amber" }),
        React.createElement(Stat, { label: "Longest Streak", value: (tlStats.longestStreak || 0) + " mo", accent: "emerald" })
      ),

      // Event type breakdown
      React.createElement("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" } },
        Object.keys(eventLabels).map(function(ek) {
          var cnt = tlEventTypeCounts[ek] || 0;
          if (cnt === 0) return null;
          return React.createElement("div", {
            key: ek,
            style: {
              display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px",
              borderRadius: "6px", background: (eventColors[ek] || "#6b7280") + "15"
            }
          },
            React.createElement(LucideIcons[eventIcons[ek] || "Activity"], { size: 12, color: eventColors[ek] }),
            React.createElement("span", { style: { fontSize: "12px", color: eventColors[ek], fontWeight: 600 } }, cnt),
            React.createElement("span", { style: { fontSize: "11px", color: "#9ca3af" } }, eventLabels[ek])
          );
        })
      ),

      // Period filter
      React.createElement("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" } },
        periodOptions.map(function(po) {
          return React.createElement(Button, {
            key: po.value,
            variant: tlPeriod === po.value ? "primary" : "outline",
            size: "sm",
            onClick: function() { onAction("timeline", { period: po.value, mediaType: tlMediaType }); }
          }, po.label);
        })
      ),

      // Monthly groups
      tlTimeline.map(function(mg, mgi) {
        var summary = mg.summary || {};
        var monthEvents = mg.events || [];

        return React.createElement("div", { key: mg.monthKey || mgi, style: { marginBottom: "20px" } },
          // Month header
          React.createElement("div", {
            style: {
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 12px", background: "#111827", borderRadius: "8px", marginBottom: "8px"
            }
          },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
              React.createElement(LucideIcons.Calendar, { size: 16, color: "#6b7280" }),
              React.createElement("span", { style: { fontWeight: 700, fontSize: "15px", color: "#e5e7eb" } }, mg.month)
            ),
            React.createElement("div", { style: { display: "flex", gap: "4px" } },
              summary.itemsStarted > 0
                ? React.createElement(Badge, { variant: "info" }, summary.itemsStarted + " started")
                : null,
              summary.itemsCompleted > 0
                ? React.createElement(Badge, { variant: "success" }, summary.itemsCompleted + " done")
                : null,
              summary.itemsRated > 0
                ? React.createElement(Badge, { variant: "warning" },
                    summary.itemsRated + " rated" + (summary.avgRating > 0 ? " \u00B7 \u2605" + summary.avgRating : "")
                  )
                : null,
              summary.itemsFavorited > 0
                ? React.createElement(Badge, { variant: "danger" }, summary.itemsFavorited + " \u2764")
                : null
            )
          ),
          // Events list
          React.createElement("div", { style: { paddingLeft: "4px" } },
            monthEvents.slice(0, 20).map(function(ev, evi) {
              return renderEventCard(ev, evi);
            }),
            monthEvents.length > 20
              ? React.createElement("div", { style: { textAlign: "center", padding: "8px 0", fontSize: "12px", color: "#6b7280" } },
                  "+" + (monthEvents.length - 20) + " more events"
                )
              : null
          )
        );
      }),

      // Footer actions
      React.createElement("div", { style: { display: "flex", gap: "8px", justifyContent: "center", padding: "8px 0" } },
        React.createElement(Button, {
          variant: "outline", size: "sm",
          onClick: function() { onAction("timeline", { period: tlPeriod, mediaType: tlMediaType }); }
        }, React.createElement(LucideIcons.RefreshCw, { size: 14 }), " Refresh"),
        React.createElement(Button, {
          variant: "outline", size: "sm",
          onClick: function() { onAction("stats", {}); }
        }, React.createElement(LucideIcons.BarChart3, { size: 14 }), " Full Stats"),
        React.createElement(Button, {
          variant: "outline", size: "sm",
          onClick: function() { onAction("browse", {}); }
        }, React.createElement(LucideIcons.Library, { size: 14 }), " Browse Library")
      )
    );
  }

  // ══════════════════════════════════════════════
  // TASTE PROFILE VIEW
  // ══════════════════════════════════════════════
  if (isTasteProfile) {
    var tpGenres = data.genreAffinities || [];
    var tpMedia = data.mediaPreferences || [];
    var tpTags = data.topTags || [];
    var tpPatterns = data.consumptionPatterns || {};
    var tpCrossMedia = data.crossMediaConnections || [];
    var tpDNA = data.tasteDNA || "";
    var tpEngaged = data.engagedEntityCount || 0;
    var tpTotal = data.entityCount || 0;
    var tpFromCache = data.fromCache === true;
    var tpCacheAge = data.cacheAge || "";
    var tpTopRated = tpPatterns.topRatedItems || [];

    // Genre affinity colors by rank
    var genreColor = function(idx) {
      var colors = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#f43f5e", "#a855f7"];
      return colors[idx % colors.length];
    };

    // Max genre score for bar scaling
    var maxGenreScore = tpGenres.length > 0 ? tpGenres[0].score : 1;

    return React.createElement("div", { className: "space-y-4" },
      // Header
      React.createElement(UICard, { accent: "purple" },
        React.createElement("div", { style: { padding: "4px 0" } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" } },
            React.createElement("div", null,
              React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6", display: "flex", alignItems: "center", gap: "8px" } },
                React.createElement(LucideIcons.Fingerprint, { size: 20, color: "#a855f7" }),
                "Taste Profile"
              ),
              React.createElement("div", { style: { fontSize: "12px", color: "#9ca3af", marginTop: "4px" } },
                tpEngaged + " engaged items out of " + tpTotal + " total"
              )
            ),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" } },
              React.createElement(Badge, { variant: tpFromCache ? "outline" : "success" },
                tpFromCache ? "Cached (" + tpCacheAge + ")" : "Fresh"
              )
            )
          ),
          // Taste DNA summary
          tpDNA
            ? React.createElement("div", {
                style: {
                  padding: "10px 14px", borderRadius: "8px",
                  background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)",
                  fontSize: "13px", color: "#d1d5db", fontStyle: "italic", lineHeight: "1.5"
                }
              }, tpDNA)
            : null
        )
      ),

      // Quick stats
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "8px" } },
        React.createElement(Stat, { label: "Rated", value: tpPatterns.totalRated || 0, accent: "amber" }),
        React.createElement(Stat, { label: "Favorites", value: tpPatterns.totalFavorites || 0, accent: "rose" }),
        React.createElement(Stat, { label: "Completed", value: tpPatterns.totalCompleted || 0, accent: "emerald" }),
        React.createElement(Stat, { label: "In Progress", value: tpPatterns.totalInProgress || 0, accent: "cyan" }),
        React.createElement(Stat, { label: "Avg Rating", value: tpPatterns.avgRating || "—", accent: "blue" }),
        React.createElement(Stat, { label: "Completion %", value: (tpPatterns.completionRate || 0) + "%", accent: "purple" })
      ),

      // Tabbed content
      React.createElement(Tabs, {
        tabs: [
          { value: "genres", label: "Genre Affinities" },
          { value: "media", label: "Media Mix" },
          { value: "crossmedia", label: "Cross-Media" },
          { value: "top", label: "Top Rated" }
        ],
        defaultValue: "genres"
      }, function(tab) {
        if (tab === "genres") {
          return React.createElement("div", { style: { marginTop: "8px" } },
            tpGenres.length === 0
              ? React.createElement(EmptyState, {
                  icon: React.createElement(LucideIcons.Sparkles, { size: 24 }),
                  title: "No genre data yet",
                  description: "Rate or favorite items to build your taste profile"
                })
              : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                  tpGenres.slice(0, 15).map(function(g, gi) {
                    var barPct = maxGenreScore > 0 ? Math.round((g.score / maxGenreScore) * 100) : 0;
                    return React.createElement("div", { key: gi, style: { display: "flex", alignItems: "center", gap: "8px" } },
                      React.createElement("div", { style: { width: "120px", fontSize: "12px", color: "#d1d5db", textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, g.genre),
                      React.createElement("div", { style: { flex: 1, height: "20px", background: "#1f2937", borderRadius: "10px", overflow: "hidden" } },
                        React.createElement("div", { style: {
                          width: Math.max(4, barPct) + "%", height: "100%",
                          background: genreColor(gi), borderRadius: "10px",
                          transition: "width 0.3s"
                        } })
                      ),
                      React.createElement("div", { style: { width: "35px", fontSize: "11px", color: "#9ca3af", textAlign: "right", flexShrink: 0 } }, g.score)
                    );
                  }),
                  // Tag cloud below
                  tpTags.length > 0
                    ? React.createElement("div", { style: { marginTop: "12px" } },
                        React.createElement("div", { style: { fontSize: "12px", fontWeight: 600, color: "#6b7280", marginBottom: "6px" } }, "TOP SEMANTIC TAGS"),
                        React.createElement("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                          tpTags.slice(0, 12).map(function(t, ti) {
                            return React.createElement(Badge, { key: ti, variant: ti < 3 ? "info" : "outline" }, t.tag + " (" + t.count + ")");
                          })
                        )
                      )
                    : null
                )
          );
        }

        if (tab === "media") {
          return React.createElement("div", { style: { marginTop: "8px" } },
            tpMedia.length === 0
              ? React.createElement(EmptyState, { title: "No media data" })
              : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                  tpMedia.map(function(m, mi) {
                    var mBarPct = tpTotal > 0 ? Math.round((m.total / tpTotal) * 100) : 0;
                    var mIcon = typeIcons[m.type] || "FileText";
                    var mColor = typeColors[m.type] || "blue";
                    return React.createElement(UICard, { key: mi, accent: mColor, style: { marginBottom: "0" } },
                      React.createElement("div", { style: { padding: "10px", display: "flex", alignItems: "center", gap: "10px" } },
                        React.createElement(LucideIcons[mIcon], { size: 18, color: "#9ca3af" }),
                        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" } },
                            React.createElement("span", { style: { fontWeight: 600, fontSize: "13px", color: "#f3f4f6", textTransform: "capitalize" } },
                              (m.type || "").replace("-", " ")
                            ),
                            React.createElement("span", { style: { fontSize: "12px", color: "#9ca3af" } },
                              m.engaged + " / " + m.total + " engaged"
                            )
                          ),
                          React.createElement("div", { style: { height: "6px", borderRadius: "3px", background: "#1f2937" } },
                            React.createElement("div", { style: {
                              height: "6px", borderRadius: "3px",
                              background: m.engagementRate > 20 ? "#10b981" : m.engagementRate > 5 ? "#f59e0b" : "#ef4444",
                              width: Math.max(2, m.engagementRate) + "%"
                            } })
                          ),
                          React.createElement("div", { style: { fontSize: "11px", color: "#6b7280", marginTop: "2px" } },
                            m.engagementRate + "% engagement rate"
                          )
                        )
                      )
                    );
                  })
                )
          );
        }

        if (tab === "crossmedia") {
          return React.createElement("div", { style: { marginTop: "8px" } },
            tpCrossMedia.length === 0
              ? React.createElement(EmptyState, {
                  icon: React.createElement(LucideIcons.Link, { size: 24 }),
                  title: "No cross-media connections yet",
                  description: "Engage with items across different media types to discover shared themes"
                })
              : React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                  tpCrossMedia.map(function(cm, cmi) {
                    return React.createElement(UICard, { key: cmi, accent: cm.mediaTypes.length >= 3 ? "amber" : "purple", style: { marginBottom: "0" } },
                      React.createElement("div", { style: { padding: "10px" } },
                        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
                          React.createElement("span", { style: { fontWeight: 600, fontSize: "14px", color: "#f3f4f6" } }, cm.theme),
                          React.createElement(Badge, { variant: "info" }, cm.totalOccurrences + " items")
                        ),
                        React.createElement("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                          cm.mediaTypes.map(function(mt, mti) {
                            var mtCount = cm.typeBreakdown ? cm.typeBreakdown[mt] || 0 : 0;
                            return React.createElement(Badge, {
                              key: mti,
                              variant: "outline",
                              style: { borderColor: "var(--accent-" + (typeColors[mt] || "blue") + ", #3b82f6)" }
                            }, (mt === "tv-series" ? "TV" : mt.charAt(0).toUpperCase() + mt.slice(1)) + (mtCount > 0 ? " " + mtCount : ""));
                          })
                        )
                      )
                    );
                  })
                )
          );
        }

        if (tab === "top") {
          return React.createElement("div", { style: { marginTop: "8px" } },
            tpTopRated.length === 0
              ? React.createElement(EmptyState, {
                  icon: React.createElement(LucideIcons.Star, { size: 24 }),
                  title: "No ratings yet",
                  description: "Rate your media to see your top picks"
                })
              : React.createElement("div", null,
                  tpTopRated.map(function(item, idx) {
                    return React.createElement("div", { key: item.entityId || idx, style: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid #1f2937" } },
                      React.createElement("span", { style: { fontWeight: 700, color: idx < 3 ? "#f59e0b" : "#6b7280", width: "28px", textAlign: "center", fontSize: "15px" } }, "#" + (idx + 1)),
                      item.imageUrl
                        ? React.createElement("img", { src: item.imageUrl, style: { width: "36px", height: "48px", objectFit: "cover", borderRadius: "4px" }, alt: "" })
                        : React.createElement("div", { style: { width: "36px", height: "48px", background: "#1f2937", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" } },
                            React.createElement(LucideIcons[typeIcons[item.type] || "FileText"], { size: 16, color: "#6b7280" })
                          ),
                      React.createElement("div", { style: { flex: 1 } },
                        React.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "#f3f4f6" } }, item.title),
                        React.createElement(TypeBadge, { type: item.type })
                      ),
                      React.createElement(Badge, { variant: "warning" }, "\u2605 " + item.userRating)
                    );
                  })
                )
          );
        }

        return null;
      }),

      // Footer actions
      React.createElement("div", { style: { display: "flex", gap: "8px", justifyContent: "center", padding: "8px 0" } },
        React.createElement(Button, {
          variant: "primary", size: "sm",
          onClick: function() { onAction("taste_profile", { refresh: true }); }
        }, React.createElement(LucideIcons.RefreshCw, { size: 14 }), " Refresh Profile"),
        React.createElement(Button, {
          variant: "outline", size: "sm",
          onClick: function() { onAction("discover", {}); }
        }, React.createElement(LucideIcons.Compass, { size: 14 }), " Discover"),
        React.createElement(Button, {
          variant: "outline", size: "sm",
          onClick: function() { onAction("browse", {}); }
        }, React.createElement(LucideIcons.Library, { size: 14 }), " Browse")
      )
    );
  }

  // ── Fallback ──
  return React.createElement(UICard, null,
    React.createElement("div", { style: { padding: "16px" } },
      React.createElement("pre", { style: { fontSize: "12px", color: "#9ca3af", whiteSpace: "pre-wrap" } }, JSON.stringify(data, null, 2))
    )
  );
}
