var tool = data?.tool || "";
var isBrowse = tool === "enso_asset_gallery_browse";
var isView = tool === "enso_asset_gallery_view";
var isSearch = tool === "enso_asset_gallery_search";
var isOrganize = tool === "enso_asset_gallery_organize";
var isStatus = tool === "enso_asset_gallery_status";
var isCreate = tool === "enso_asset_gallery_create";
var isStatusResult = isStatus || isCreate;

var [lightboxIdx, setLightboxIdx] = useState(-1);
var [searchInput, setSearchInput] = useState("");
var [filterText, setFilterText] = useState("");
var [selectedIds, setSelectedIds] = useState([]);
var [statusFilterVal, setStatusFilterVal] = useState("All");

var CameraIcon = LucideReact.Camera;
var SearchIcon = LucideReact.Search;
var ImageIcon = LucideReact.Image;
var VideoIcon = LucideReact.Video;
var FilmIcon = LucideReact.Film;
var TagIcon = LucideReact.Tag;
var FolderIcon = LucideReact.Folder;
var ChevronLeft = LucideReact.ChevronLeft;
var ChevronRight = LucideReact.ChevronRight;
var XIcon = LucideReact.X;
var CheckIcon = LucideReact.Check;
var ShieldIcon = LucideReact.Shield;
var EyeIcon = LucideReact.Eye;

var STATUS_VARIANTS = { "Approved": "success", "Draft": "warning", "In-Use": "info", "Archived": "default", "Rejected": "danger", "In Review": "warning" };

function fmtIcon(fmt) {
  if ((fmt || "").toUpperCase() === "MP4" || (fmt || "").toUpperCase() === "MOV") return React.createElement(VideoIcon, { size: 12 });
  if ((fmt || "").toUpperCase() === "GIF") return React.createElement(FilmIcon, { size: 12 });
  return React.createElement(ImageIcon, { size: 12 });
}

if (data?.error) {
  return React.createElement(EmptyState, {
    icon: React.createElement(LucideReact.AlertTriangle, { size: 48 }),
    title: "Error",
    description: data.error || "An error occurred",
    action: data.retryAction ? React.createElement(Button, { onClick: function() { onAction(data.retryAction.suffix, data.retryAction.params || {}); } }, "Retry") : null
  });
}

if (isView || isStatusResult) {
  var asset = data || {};
  var statusVar = STATUS_VARIANTS[asset.status || ""] ?? "default";
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      asset.collectionPath ? React.createElement(Button, { variant: "ghost", onClick: function() { onAction("browse", { path: asset.collectionPath, campaign: asset.campaign || "" }); }, icon: React.createElement(ChevronLeft, { size: 14 }) }, "Back") : null,
      React.createElement("div", { style: { fontSize: 16, fontWeight: 700, color: "#f1f5f9" } }, asset.title || asset.name || "Asset Detail")
    ),
    asset.mediaUrl ? React.createElement("img", { src: asset.mediaUrl, alt: asset.title || "", style: { width: "100%", maxHeight: 400, objectFit: "contain", borderRadius: 8, background: "#0f172a" }, loading: "lazy" })
      : React.createElement("div", { style: { background: asset.color || "linear-gradient(135deg, #3b82f6, #8b5cf6)", borderRadius: 8, height: 200, display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement(CameraIcon, { size: 48, color: "rgba(255,255,255,0.4)", strokeWidth: 1 })),
    React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
      asset.campaign ? React.createElement(Badge, { variant: "outline" }, asset.campaign) : null,
      asset.status ? React.createElement(Badge, { variant: statusVar }, asset.status) : null,
      asset.format ? React.createElement(Badge, { variant: "outline" }, fmtIcon(asset.format), " ", asset.format) : null,
      (asset.width && asset.height) ? React.createElement(Badge, { variant: "outline" }, asset.width + "x" + asset.height) : null
    ),
    (asset.tags || []).length > 0 ? React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#94a3b8", marginBottom: 4 } }, "Tags"),
      React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
        (asset.tags || []).map(function(t, i) { return React.createElement(Badge, { key: i, variant: "info" }, t || ""); }))
    ) : null,
    React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
      asset.category ? React.createElement("div", null, React.createElement("div", { style: { fontSize: 11, color: "#64748b" } }, "Category"), React.createElement("div", { style: { fontSize: 13, color: "#e2e8f0" } }, asset.category)) : null,
      asset.dateAdded ? React.createElement("div", null, React.createElement("div", { style: { fontSize: 11, color: "#64748b" } }, "Date Added"), React.createElement("div", { style: { fontSize: 13, color: "#e2e8f0" } }, asset.dateAdded)) : null,
      asset.usageRights ? React.createElement("div", null, React.createElement("div", { style: { fontSize: 11, color: "#64748b" } }, "Usage Rights"), React.createElement("div", { style: { fontSize: 13, color: "#e2e8f0" } }, asset.usageRights)) : null,
      asset.filename ? React.createElement("div", null, React.createElement("div", { style: { fontSize: 11, color: "#64748b" } }, "Filename"), React.createElement("div", { style: { fontSize: 12, color: "#e2e8f0", wordBreak: "break-all" } }, asset.filename)) : null
    ),
    (asset.notes || "").trim() ? React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 11, color: "#64748b", marginBottom: 4 } }, "Notes"),
      React.createElement("div", { style: { fontSize: 13, color: "#cbd5e1", background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 6, lineHeight: 1.5 } }, asset.notes)
    ) : null,
    isStatus ? React.createElement(Badge, { variant: "success" }, "Status updated to: " + (asset.status || "")) : null,
    isCreate ? React.createElement(Badge, { variant: "success" }, "Asset created successfully") : null,
    React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
      React.createElement(Button, { variant: "ghost", onClick: function() { onAction("status", { id: asset.id, status: "Approved" }); }, icon: React.createElement(CheckIcon, { size: 14 }) }, "Approve"),
      React.createElement(Button, { variant: "ghost", onClick: function() { onAction("status", { id: asset.id, status: "In-Use" }); }, icon: React.createElement(ShieldIcon, { size: 14 }) }, "Mark In-Use"),
      asset.collectionPath ? React.createElement(Button, { variant: "ghost", onClick: function() { onAction("browse", { path: asset.collectionPath }); }, icon: React.createElement(FolderIcon, { size: 14 }) }, "Back to Gallery") : null
    )
  );
}

if (isSearch) {
  var results = data?.results || [];
  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      React.createElement(SearchIcon, { size: 20, color: "#3b82f6" }),
      React.createElement("div", { style: { fontSize: 16, fontWeight: 700, color: "#f1f5f9" } }, "Search Results"),
      React.createElement(Badge, { variant: "info" }, results.length + " found")
    ),
    React.createElement("div", { style: { display: "flex", gap: 8 } },
      React.createElement(Input, { placeholder: "Search assets...", value: searchInput || "", onChange: function(e) { setSearchInput(e?.target?.value ?? ""); }, icon: React.createElement(SearchIcon, { size: 14 }) }),
      React.createElement(Button, { onClick: function() { onAction("search", { query: searchInput || "", path: data?.path || "" }); } }, "Search")
    ),
    results.length === 0 ? React.createElement(EmptyState, { icon: React.createElement(SearchIcon, { size: 48 }), title: "No results for \"" + (data?.query || "") + "\"", description: "Try different keywords" })
      : React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 } },
        results.map(function(item, i) {
          return React.createElement("div", { key: item?.id || i, style: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden", cursor: "pointer" }, onClick: function() { onAction("view", { id: item?.id || "" }); } },
            React.createElement("div", { style: { background: item?.color || "#3b82f6", height: 100, display: "flex", alignItems: "center", justifyContent: "center" } },
              item?.mediaUrl ? React.createElement("img", { src: item.mediaUrl, alt: "", style: { width: "100%", height: "100%", objectFit: "cover" }, loading: "lazy" }) : React.createElement(CameraIcon, { size: 28, color: "rgba(255,255,255,0.4)" })),
            React.createElement("div", { style: { padding: "8px 10px" } },
              React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item?.title || item?.name || "Untitled"),
              React.createElement("div", { style: { display: "flex", gap: 4, marginTop: 4 } },
                item?.campaign ? React.createElement(Badge, { variant: "outline" }, item.campaign) : null,
                item?.status ? React.createElement(Badge, { variant: STATUS_VARIANTS[item.status || ""] ?? "default" }, item.status) : null)
            )
          );
        })
      )
  );
}

if (isOrganize) {
  return React.createElement(UICard, { header: "Organize Assets" },
    React.createElement(Badge, { variant: "success" }, data?.message || "Operation completed"),
    React.createElement("div", { style: { marginTop: 12 } },
      React.createElement(Button, { variant: "ghost", onClick: function() { onAction("browse", { path: data?.path || "", campaign: data?.campaign || "" }); }, icon: React.createElement(FolderIcon, { size: 14 }) }, "Back to Gallery")
    )
  );
}

var items = data?.items || [];
var statuses = data?.statuses || [];
var campaigns = data?.campaigns || [];
var totalCount = data?.total ?? items.length;

var filteredItems = useMemo(function() {
  return (items || []).filter(function(item) {
    if (!item) return false;
    var q = ((filterText || "") + "").trim().toLowerCase();
    var matchText = !q || ((item.title || item.name || "").toLowerCase().indexOf(q) >= 0) || ((item.tags || []).some(function(t) { return ((t || "") + "").toLowerCase().indexOf(q) >= 0; }));
    var matchStatus = statusFilterVal === "All" || (item.status || "") === statusFilterVal;
    return matchText && matchStatus;
  });
}, [items, filterText, statusFilterVal]);

function toggleItemSelect(id) {
  setSelectedIds(function(prev) {
    var arr = prev || [];
    return arr.indexOf(id) >= 0 ? arr.filter(function(x) { return x !== id; }) : arr.concat([id]);
  });
}

var lightboxItems = filteredItems || [];
var lightboxItem = lightboxIdx >= 0 && lightboxIdx < lightboxItems.length ? lightboxItems[lightboxIdx] : null;

function ItemCard(props) {
  var item = props?.item;
  var idx = props?.index ?? 0;
  if (!item) return null;
  var isSel = (selectedIds || []).indexOf(item.id || idx) >= 0;
  var sv = STATUS_VARIANTS[item.status || ""] ?? "default";
  return React.createElement("div", { style: { background: "rgba(255,255,255,0.03)", border: isSel ? "2px solid #3b82f6" : "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden", cursor: "pointer" }, onClick: function() { setLightboxIdx(idx); } },
    React.createElement("div", { style: { position: "relative" } },
      React.createElement("div", { style: { background: item.color || "#3b82f6", aspectRatio: "1.5", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80 } },
        item.mediaUrl ? React.createElement("img", { src: item.mediaUrl, alt: "", style: { width: "100%", height: "100%", objectFit: "cover" }, loading: "lazy" }) : React.createElement(CameraIcon, { size: 28, color: "rgba(255,255,255,0.4)", strokeWidth: 1 }),
        React.createElement("div", { style: { position: "absolute", top: 6, left: 6 }, onClick: function(e) { e.stopPropagation(); toggleItemSelect(item.id || idx); } },
          React.createElement("div", { style: { width: 20, height: 20, borderRadius: 4, border: "2px solid rgba(255,255,255,0.8)", background: isSel ? "#3b82f6" : "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" } },
            isSel ? React.createElement(CheckIcon, { size: 12, color: "#fff" }) : null)),
        item.format ? React.createElement("div", { style: { position: "absolute", top: 6, right: 6 } }, React.createElement(Badge, { variant: "outline" }, fmtIcon(item.format), " ", item.format)) : null
      )
    ),
    React.createElement("div", { style: { padding: "8px 10px 10px" } },
      React.createElement("div", { style: { fontWeight: 600, fontSize: 13, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 } }, item.title || item.name || "Untitled"),
      React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
        item.campaign ? React.createElement(Badge, { variant: "outline" }, item.campaign) : null,
        item.status ? React.createElement(Badge, { variant: sv }, item.status) : null)
    )
  );
}

return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
    React.createElement(CameraIcon, { size: 22, color: "#3b82f6" }),
    React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 16, fontWeight: 700, color: "#f1f5f9" } }, data?.title || "Asset Gallery"),
      data?.path ? React.createElement("div", { style: { fontSize: 12, color: "#64748b" } }, data.path) : null),
    React.createElement("div", { style: { flex: 1 } }),
    React.createElement(Badge, { variant: "info" }, filteredItems.length + " of " + totalCount + " assets")
  ),
  (data?.stats || []).length > 0 ? React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 6 } },
    (data.stats || []).map(function(s, i) { return React.createElement(Stat, { key: i, label: s?.label || "", value: s?.value ?? 0, accent: s?.accent || "blue" }); })
  ) : null,
  React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },
    React.createElement("div", { style: { flex: 1, minWidth: 180 } },
      React.createElement(Input, { placeholder: "Filter by title or tags...", value: filterText || "", onChange: function(e) { setFilterText(e?.target?.value ?? ""); }, icon: React.createElement(SearchIcon, { size: 14 }) })),
    statuses.length > 0 ? React.createElement(Select, { value: statusFilterVal || "All", onChange: function(v) { setStatusFilterVal(v ?? "All"); }, options: [{ value: "All", label: "All Statuses" }].concat(statuses.map(function(s) { return { value: s || "", label: s || "" }; })) }) : null,
    React.createElement(Button, { variant: "ghost", onClick: function() { onAction("search", { query: filterText || "", path: data?.path || "" }); }, icon: React.createElement(SearchIcon, { size: 14 }) }, "Deep Search")
  ),
  (selectedIds || []).length > 0 ? React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 8, flexWrap: "wrap" } },
    React.createElement("span", { style: { fontSize: 13, fontWeight: 600, color: "#93c5fd" } }, (selectedIds || []).length + " selected"),
    React.createElement(Button, { variant: "ghost", onClick: function() { onAction("organize", { action: "move", ids: selectedIds }); }, icon: React.createElement(FolderIcon, { size: 14 }) }, "Move"),
    React.createElement(Button, { variant: "ghost", onClick: function() { onAction("organize", { action: "tag", ids: selectedIds }); }, icon: React.createElement(TagIcon, { size: 14 }) }, "Tag"),
    React.createElement(Button, { variant: "ghost", onClick: function() { onAction("status", { ids: selectedIds, status: "Approved" }); }, icon: React.createElement(ShieldIcon, { size: 14 }) }, "Approve"),
    React.createElement("div", { style: { flex: 1 } }),
    React.createElement(Button, { variant: "ghost", onClick: function() { setSelectedIds([]); }, icon: React.createElement(XIcon, { size: 14 }) }, "Clear")
  ) : null,
  React.createElement(Tabs, { tabs: [{ value: "grid", label: "Grid (" + filteredItems.length + ")" }, { value: "list", label: "List" }], defaultValue: "grid", variant: "underline" }, function(tab) {
    if (filteredItems.length === 0) return React.createElement(EmptyState, { icon: React.createElement(CameraIcon, { size: 48 }), title: "No assets found", description: filterText ? "Try adjusting your search" : "This collection is empty", action: filterText ? React.createElement(Button, { variant: "ghost", onClick: function() { setFilterText(""); setStatusFilterVal("All"); } }, "Clear Filters") : null });
    if (tab === "list") return React.createElement(DataTable, {
      columns: [
        { key: "title", label: "Title", sortable: true, render: function(v, row) {
          return React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }, onClick: function() { onAction("view", { id: row?.id || "" }); } },
            React.createElement("div", { style: { width: 28, height: 28, borderRadius: 6, flexShrink: 0, background: row?.color || "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center" } },
              React.createElement(CameraIcon, { size: 12, color: "rgba(255,255,255,0.7)" })),
            React.createElement("span", { style: { fontWeight: 500 } }, v || row?.name || "Untitled"));
        }},
        { key: "campaign", label: "Campaign", sortable: true, render: function(v) { return v ? React.createElement(Badge, { variant: "outline" }, v) : null; } },
        { key: "format", label: "Format", sortable: true },
        { key: "status", label: "Status", sortable: true, render: function(v) { return v ? React.createElement(Badge, { variant: STATUS_VARIANTS[v || ""] ?? "default" }, v) : null; } },
        { key: "dateAdded", label: "Added", sortable: true }
      ],
      data: filteredItems.map(function(item) { return Object.assign({}, item, { title: item.title || item.name || "Untitled" }); }),
      pageSize: 15, striped: true
    });
    return React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 } },
      filteredItems.map(function(item, i) { return React.createElement(ItemCard, { key: item?.id || i, item: item, index: i }); }));
  }),
  lightboxItem ? React.createElement(Dialog, { open: true, onClose: function() { setLightboxIdx(-1); }, title: lightboxItem.title || lightboxItem.name || "Asset Detail" },
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
      React.createElement("div", { style: { position: "relative" } },
        React.createElement("div", { style: { background: lightboxItem.color || "#3b82f6", borderRadius: 8, height: 180, display: "flex", alignItems: "center", justifyContent: "center" } },
          lightboxItem.mediaUrl ? React.createElement("img", { src: lightboxItem.mediaUrl, alt: "", style: { width: "100%", height: "100%", objectFit: "contain" }, loading: "lazy" }) : React.createElement(CameraIcon, { size: 48, color: "rgba(255,255,255,0.4)", strokeWidth: 1 })),
        lightboxItems.length > 1 ? React.createElement(Fragment, null,
          React.createElement("button", { onClick: function() { setLightboxIdx(function(p) { return p <= 0 ? lightboxItems.length - 1 : p - 1; }); }, style: { position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" } }, React.createElement(ChevronLeft, { size: 14 })),
          React.createElement("button", { onClick: function() { setLightboxIdx(function(p) { return p >= lightboxItems.length - 1 ? 0 : p + 1; }); }, style: { position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" } }, React.createElement(ChevronRight, { size: 14 })),
          React.createElement("div", { style: { position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.5)", padding: "2px 8px", borderRadius: 4, fontSize: 11, color: "#fff" } }, (lightboxIdx + 1) + " / " + lightboxItems.length)
        ) : null
      ),
      React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
        lightboxItem.campaign ? React.createElement(Badge, { variant: "outline" }, lightboxItem.campaign) : null,
        lightboxItem.status ? React.createElement(Badge, { variant: STATUS_VARIANTS[lightboxItem.status || ""] ?? "default" }, lightboxItem.status) : null,
        lightboxItem.format ? React.createElement(Badge, { variant: "outline" }, lightboxItem.format) : null),
      (lightboxItem.tags || []).length > 0 ? React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
        (lightboxItem.tags || []).map(function(t, i) { return React.createElement(Badge, { key: i, variant: "info" }, t || ""); })) : null,
      React.createElement("div", { style: { display: "flex", gap: 8 } },
        React.createElement(Button, { variant: "primary", onClick: function() { setLightboxIdx(-1); onAction("view", { id: lightboxItem.id || "" }); }, icon: React.createElement(EyeIcon, { size: 14 }) }, "Full Detail"),
        React.createElement(Button, { variant: "ghost", onClick: function() { setLightboxIdx(-1); } }, "Close"))
    )
  ) : null
);
