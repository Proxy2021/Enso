function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var isBrowse = tool === "enso_bookmarks_browse";
  var isScan = tool === "enso_bookmarks_scan";

  // ── Scan result ──
  if (isScan) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>🔖</div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Bookmarks Scanned</div>
          {data.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{data.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {data.data && ("Found " + (data.data.totalBookmarks || "?") + " bookmarks")}
            </div>
          )}
          <div style={{ marginTop: "12px" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse Bookmarks</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse (primary view) ──
  if (isBrowse) {
    var [searchInput, setSearchInput] = React.useState(data.query || "");
    var [expandedFolders, setExpandedFolders] = React.useState({});
    var folders = data.folders || [];

    function toggleFolder(name) {
      var next = {};
      for (var k in expandedFolders) next[k] = expandedFolders[k];
      next[name] = !next[name];
      setExpandedFolders(next);
    }

    function truncateUrl(url) {
      try {
        var u = new URL(url);
        var display = u.hostname + u.pathname;
        return display.length > 50 ? display.slice(0, 47) + "..." : display;
      } catch (e) {
        return url && url.length > 50 ? url.slice(0, 47) + "..." : (url || "");
      }
    }

    // Count total visible bookmarks
    var visibleCount = 0;
    for (var fi = 0; fi < folders.length; fi++) {
      visibleCount += (folders[fi].bookmarks || []).length;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🔖</span>
            <span style={{ fontWeight: 600 }}>Bookmarks</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
              {data.totalBookmarks + " bookmarks in " + folders.length + " folders"}
              {data.query ? (" · showing " + visibleCount) : ""}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>🔄 Scan</Button>
        </div>

        {/* Search bar */}
        <Input
          placeholder="Search bookmarks by title or URL..."
          value={searchInput}
          onChange={function(e) { setSearchInput(e.target.value); }}
          onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput }); }}
        />

        {/* Folder list */}
        {folders.length === 0 && (
          <EmptyState
            title="No bookmarks"
            description={data.query ? "No bookmarks matching \"" + data.query + "\"" : data.folder ? "No bookmarks in folder \"" + data.folder + "\"" : "No bookmarks cached. Run a scan first."}
          />
        )}

        {folders.map(function(folder) {
          var isExpanded = expandedFolders[folder.folder];
          var items = folder.bookmarks || [];

          return (
            <UICard key={folder.folder} style={{ padding: "0", overflow: "hidden" }}>
              {/* Folder header */}
              <div
                onClick={function() { toggleFolder(folder.folder); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px", cursor: "pointer",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "14px", transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                  <span style={{ fontWeight: 500, fontSize: "13px" }}>{folder.folder}</span>
                </div>
                <Badge variant="secondary" style={{ fontSize: "11px" }}>{items.length}</Badge>
              </div>

              {/* Bookmark items */}
              {isExpanded && items.length > 0 && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {items.map(function(bm, i) {
                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "7px 12px 7px 32px",
                        borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {bm.title || "Untitled"}
                          </div>
                          <div style={{ fontSize: "11px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {truncateUrl(bm.url)}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                            onClick={function() { window.open(bm.url, "_blank"); }}
                          >🌐</Button>
                          <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                            onClick={function() { onAction("send_message", { message: "/research " + (bm.title || bm.url) }); }}
                          >🔍</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </UICard>
          );
        })}
      </div>
    );
  }

  return <EmptyState title="Bookmarks" description="Use Browse or Scan to explore your bookmarks." />;
}
