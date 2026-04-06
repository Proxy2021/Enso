function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var isBrowse = tool === "enso_browser_history_browse";
  var isScan = tool === "enso_browser_history_scan";

  // ── Scan result ──
  if (isScan) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>🌐</div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Browser History Scanned</div>
          {data.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{data.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {data.data && ("Found " + (data.data.totalEntries || "?") + " entries")}
            </div>
          )}
          <div style={{ marginTop: "12px" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse History</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse (primary view) ──
  if (isBrowse) {
    var [searchInput, setSearchInput] = React.useState(data.query || "");
    var [activeTab, setActiveTab] = React.useState("domains");
    var topDomains = data.topDomains || [];
    var recentSearches = data.recentSearches || [];
    var recentPages = data.recentPages || [];

    // Find max visits for bar scaling
    var maxVisits = 1;
    for (var i = 0; i < topDomains.length; i++) {
      if (topDomains[i].visits > maxVisits) maxVisits = topDomains[i].visits;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🌐</span>
            <span style={{ fontWeight: 600 }}>Browser History</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
              {data.totalEntries + " entries"}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>🔄 Scan</Button>
        </div>

        {/* Search bar */}
        <Input
          placeholder="Filter domains, searches, or pages..."
          value={searchInput}
          onChange={function(e) { setSearchInput(e.target.value); }}
          onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput }); }}
        />

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: "6px" }}>
          {[
            { key: "domains", label: "Top Domains", count: topDomains.length },
            { key: "searches", label: "Searches", count: recentSearches.length },
            { key: "pages", label: "Recent Pages", count: recentPages.length },
          ].map(function(tab) {
            return (
              <Badge
                key={tab.key}
                variant={activeTab === tab.key ? "default" : "secondary"}
                style={{ cursor: "pointer" }}
                onClick={function() { setActiveTab(tab.key); }}
              >{tab.label} ({tab.count})</Badge>
            );
          })}
        </div>

        {/* Top Domains */}
        {activeTab === "domains" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {topDomains.length === 0 && <EmptyState title="No domains" description="No browsing data found." />}
            {topDomains.map(function(d, i) {
              var pct = Math.round((d.visits / maxVisits) * 100);
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "6px 10px", borderRadius: "6px",
                  background: "rgba(255,255,255,0.03)",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 500 }}>{d.domain}</span>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>{d.visits} visits</span>
                      {d.hasWikiPage && (
                        <Badge variant="secondary" style={{ fontSize: "9px", padding: "1px 4px" }}>Wiki</Badge>
                      )}
                    </div>
                    <div style={{
                      height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.06)",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: "2px",
                        background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                        width: pct + "%",
                      }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                      onClick={function() { onAction("send_message", { message: "/research " + d.domain }); }}
                    >🔍</Button>
                    <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                      onClick={function() { window.open("https://" + d.domain, "_blank"); }}
                    >🌐</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Recent Searches */}
        {activeTab === "searches" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {recentSearches.length === 0 && <EmptyState title="No searches" description="No search queries found." />}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {recentSearches.map(function(s, i) {
                var text = (typeof s === "string") ? s : (s.query || "");
                return (
                  <Badge
                    key={i}
                    variant="secondary"
                    style={{ cursor: "pointer", padding: "4px 10px", fontSize: "12px" }}
                    onClick={function() { onAction("send_message", { message: "/research " + text }); }}
                  >🔍 {text}</Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Pages */}
        {activeTab === "pages" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {recentPages.length === 0 && <EmptyState title="No pages" description="No recent pages found." />}
            {recentPages.map(function(p, i) {
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "6px 10px", borderRadius: "6px",
                  background: "rgba(255,255,255,0.03)",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.title || p.domain}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>
                      {p.domain}{p.visits ? " · " + p.visits + " visits" : ""}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" style={{ fontSize: "10px", flexShrink: 0 }}
                    onClick={function() { onAction("send_message", { message: "/research " + (p.title || p.domain) }); }}
                  >🔍</Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return <EmptyState title="Browser History" description="Use Browse or Scan to explore your browsing history." />;
}
