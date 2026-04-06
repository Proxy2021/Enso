function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var isBrowse = tool === "enso_browser_data_browse";
  var isScanHistory = tool === "enso_browser_data_scan_history";
  var isScanBookmarks = tool === "enso_browser_data_scan_bookmarks";

  if (isScanHistory || isScanBookmarks) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>🌐</div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>
            {isScanHistory ? "Browser History Scanned" : "Bookmarks Scanned"}
          </div>
          {data.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{data.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>Scan complete</div>
          )}
          <div style={{ marginTop: "12px" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse Data</Button>
          </div>
        </div>
      </UICard>
    );
  }

  if (isBrowse) {
    var currentView = data.view || "history";
    var [searchInput, setSearchInput] = React.useState(data.query || "");

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header with view toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button
              variant={currentView === "history" ? "default" : "outline"} size="sm"
              onClick={function() { onAction("browse", { view: "history" }); }}
            >🕐 History</Button>
            <Button
              variant={currentView === "bookmarks" ? "default" : "outline"} size="sm"
              onClick={function() { onAction("browse", { view: "bookmarks" }); }}
            >🔖 Bookmarks</Button>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <Button variant="outline" size="sm" onClick={function() { onAction("scan_history", {}); }}>🔄 Scan History</Button>
            <Button variant="outline" size="sm" onClick={function() { onAction("scan_bookmarks", {}); }}>🔄 Scan Bookmarks</Button>
          </div>
        </div>

        {/* Search */}
        <Input
          placeholder={currentView === "history" ? "Search domains, searches, pages..." : "Search bookmarks..."}
          value={searchInput}
          onChange={function(e) { setSearchInput(e.target.value); }}
          onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { view: currentView, query: searchInput }); }}
        />

        {/* History View */}
        {currentView === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Top Domains */}
            {data.topDomains && data.topDomains.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px" }}>Top Domains</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {data.topDomains.slice(0, 20).map(function(d, i) {
                    var maxVisits = data.topDomains[0].visits || 1;
                    var barWidth = Math.max(10, Math.round((d.visits / maxVisits) * 100));
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "140px", fontSize: "12px", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.domain}</div>
                        <div style={{ flex: 1, height: "16px", background: "#1e293b", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ width: barWidth + "%", height: "100%", background: "linear-gradient(90deg, #6366f1, #8b5cf6)", borderRadius: "4px" }} />
                        </div>
                        <div style={{ width: "50px", fontSize: "11px", color: "#64748b", textAlign: "right" }}>{d.visits}</div>
                        <Button variant="outline" size="sm" style={{ fontSize: "10px", padding: "2px 6px" }}
                          onClick={function() { onAction("send_message", { message: "/research " + d.domain }); }}
                        >🔍</Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Searches */}
            {data.recentSearches && data.recentSearches.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px" }}>Recent Searches</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {data.recentSearches.slice(0, 20).map(function(s, i) {
                    var text = (typeof s === "string") ? s : (s.query || "");
                    return (
                      <Badge key={i} variant="secondary" style={{ cursor: "pointer" }}
                        onClick={function() { onAction("send_message", { message: "/research " + text }); }}
                      >{text}</Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Pages */}
            {data.recentPages && data.recentPages.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "8px" }}>Recent Pages</div>
                {data.recentPages.slice(0, 15).map(function(p, i) {
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0", borderBottom: "1px solid #1e293b" }}>
                      <div style={{ flex: 1, fontSize: "12px", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || p.domain}</div>
                      <Badge variant="secondary" style={{ fontSize: "9px" }}>{p.domain}</Badge>
                    </div>
                  );
                })}
              </div>
            )}

            {!data.topDomains?.length && !data.recentSearches?.length && (
              <EmptyState title="No history" description="Scan your browser history first." />
            )}
          </div>
        )}

        {/* Bookmarks View */}
        {currentView === "bookmarks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.folders && data.folders.length > 0 ? (
              data.folders.map(function(f, i) {
                return (
                  <Accordion key={i} title={f.folder + " (" + (f.count || f.bookmarks.length) + ")"}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingLeft: "8px" }}>
                      {(f.bookmarks || []).map(function(bm, j) {
                        return (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0" }}>
                            <div style={{ flex: 1, fontSize: "12px", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bm.title}</div>
                            <Button variant="outline" size="sm" style={{ fontSize: "10px", padding: "2px 6px" }}
                              onClick={function() { window.open(bm.url, "_blank"); }}
                            >🔗</Button>
                            <Button variant="outline" size="sm" style={{ fontSize: "10px", padding: "2px 6px" }}
                              onClick={function() { onAction("send_message", { message: "/research " + bm.title }); }}
                            >🔍</Button>
                          </div>
                        );
                      })}
                    </div>
                  </Accordion>
                );
              })
            ) : (
              <EmptyState title="No bookmarks" description="Scan your bookmarks first." />
            )}
            {data.totalBookmarks > 0 && (
              <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b" }}>{data.totalBookmarks} bookmarks total</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return <EmptyState title="Browser Data" description="Browse your history and bookmarks." />;
}
