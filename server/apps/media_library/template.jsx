export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var typeIcons = { book: "BookOpen", movie: "Film", "tv-series": "Tv", documentary: "Video", game: "Gamepad2", album: "Disc3", artist: "Music" };
  var typeColors = { book: "emerald", movie: "purple", "tv-series": "cyan", documentary: "amber", game: "rose", album: "blue", artist: "orange" };
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

    return React.createElement("div", null,
      React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, color: "#f3f4f6", marginBottom: "8px" } }, "Discover"),
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
            return React.createElement(UICard, { key: item.entityId || ii, accent: typeColors[item.type] || "blue", style: { marginBottom: "6px" } },
              React.createElement("div", { style: { display: "flex", gap: "10px", padding: "10px" } },
                item.imageUrl
                  ? React.createElement("img", { src: item.imageUrl, style: { width: "40px", height: "52px", objectFit: "cover", borderRadius: "4px" }, alt: "" })
                  : React.createElement("div", { style: { width: "40px", height: "52px", background: "#1f2937", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" } },
                      React.createElement(LucideIcons[typeIcons[item.type] || "FileText"], { size: 16, color: "#6b7280" })
                    ),
                React.createElement("div", { style: { flex: 1 } },
                  React.createElement("div", { style: { fontWeight: 600, fontSize: "13px", color: "#f3f4f6" } }, item.title),
                  React.createElement("div", { style: { display: "flex", gap: "4px", marginTop: "2px" } },
                    React.createElement(TypeBadge, { type: item.type })
                  ),
                  React.createElement("div", { style: { fontSize: "12px", color: "#6b7280", marginTop: "4px" } }, item.reason || "")
                )
              )
            );
          })
        );
      })
    );
  }

  // ── Fallback ──
  return React.createElement(UICard, null,
    React.createElement("div", { style: { padding: "16px" } },
      React.createElement("pre", { style: { fontSize: "12px", color: "#9ca3af", whiteSpace: "pre-wrap" } }, JSON.stringify(data, null, 2))
    )
  );
}
