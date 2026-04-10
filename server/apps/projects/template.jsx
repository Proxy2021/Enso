function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var isBrowse = tool === "enso_projects_scanner_browse";
  var isScan = tool === "enso_projects_scanner_scan";

  // ── Scan result ──
  if (isScan) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>💻</div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Projects Scanned</div>
          {data.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{data.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>
              {data.data && data.data.projectCount ? "Found " + data.data.projectCount + " projects" : "Scan complete"}
            </div>
          )}
          <div style={{ marginTop: "12px" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse Projects</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse (primary view) ──
  if (isBrowse) {
    var [searchInput, setSearchInput] = React.useState(data.query || "");
    var projects = data.projects || [];
    var typeList = data.typeList || [];
    var topFileTypes = data.topFileTypes || [];
    var groups = data.groups || {};

    if (data.error) {
      return (
        <EmptyState
          title="No Project Data"
          description={data.error}
        />
      );
    }

    var typeColors = {
      node: "#68a063",
      python: "#3776ab",
      rust: "#dea584",
      go: "#00add8",
      java: "#f89820",
      ruby: "#cc342d",
      dotnet: "#512bd4",
      php: "#777bb4",
      swift: "#fa7343",
      kotlin: "#7f52ff",
      other: "#64748b",
    };

    function getTypeColor(type) {
      return typeColors[type] || typeColors.other;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>💻</span>
            <span style={{ fontWeight: 600 }}>Projects Scanner</span>
            <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
              {data.filteredCount === data.totalProjects
                ? data.totalProjects + " project" + (data.totalProjects !== 1 ? "s" : "")
                : data.filteredCount + " of " + data.totalProjects + " projects"}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>🔄 Scan</Button>
        </div>

        {/* Search bar */}
        <Input
          placeholder="Search projects by name..."
          value={searchInput}
          onChange={function(v) { setSearchInput(v); }}
          onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput, type: data.typeFilter }); }}
        />

        {/* Type filter pills */}
        {typeList.length > 0 && (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <Badge
              variant={!data.typeFilter ? "default" : "secondary"}
              style={{ cursor: "pointer" }}
              onClick={function() { onAction("browse", { query: data.query }); }}
            >All ({data.totalProjects})</Badge>
            {typeList.map(function(t) {
              return (
                <Badge
                  key={t.name}
                  variant={data.typeFilter === t.name ? "default" : "secondary"}
                  style={{ cursor: "pointer", borderLeft: "3px solid " + getTypeColor(t.name) }}
                  onClick={function() { onAction("browse", { type: t.name, query: data.query }); }}
                >{t.name} ({t.count})</Badge>
              );
            })}
          </div>
        )}

        <Tabs defaultValue="projects">
          <Tabs.List>
            <Tabs.Trigger value="projects">Projects</Tabs.Trigger>
            <Tabs.Trigger value="filetypes">File Types</Tabs.Trigger>
          </Tabs.List>

          {/* Projects tab */}
          <Tabs.Content value="projects">
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
              {Object.keys(groups).length === 0 && <EmptyState title="No projects found" description="No projects matching your criteria." />}
              {Object.entries(groups).sort(function(a, b) { return b[1].length - a[1].length; }).map(function(entry) {
                var groupType = entry[0];
                var groupProjects = entry[1];
                return (
                  <div key={groupType}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: getTypeColor(groupType) }} />
                      <span style={{ fontWeight: 600, fontSize: "14px", textTransform: "capitalize" }}>{groupType}</span>
                      <span style={{ fontSize: "11px", color: "#64748b" }}>({groupProjects.length})</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "8px" }}>
                      {groupProjects.map(function(proj, i) {
                        return (
                          <UICard key={i} style={{ padding: "10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: "13px" }}>{proj.name || "Unknown"}</div>
                                <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proj.path}</div>
                              </div>
                              <Badge variant="secondary" style={{ borderLeft: "3px solid " + getTypeColor(proj.type), flexShrink: 0, fontSize: "10px" }}>{proj.type}</Badge>
                            </div>
                            {/* Tech stack badges */}
                            {proj.technologies && proj.technologies.length > 0 && (
                              <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", marginTop: "6px" }}>
                                {proj.technologies.slice(0, 6).map(function(tech) {
                                  return <Badge key={tech} variant="secondary" style={{ fontSize: "9px", padding: "1px 5px" }}>{tech}</Badge>;
                                })}
                              </div>
                            )}
                            {/* Actions */}
                            <div style={{ display: "flex", gap: "5px", marginTop: "8px", flexWrap: "wrap" }}>
                              <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                                onClick={function() { onAction("send_message", { message: "/code " + proj.path }); }}
                              >💻 Open in Code</Button>
                              <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                                onClick={function() { onAction("send_message", { message: "/research " + (proj.name || "") + " " + (proj.technologies ? proj.technologies.join(" ") : "") }); }}
                              >🔍 Research</Button>
                              {proj.hasWikiPage && (
                                <Button variant="outline" size="sm" style={{ fontSize: "10px" }}
                                  onClick={function() { onAction("send_message", { message: "/wiki read " + proj.wikiPath }); }}
                                >📄 Wiki</Button>
                              )}
                            </div>
                          </UICard>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Tabs.Content>

          {/* File Types tab */}
          <Tabs.Content value="filetypes">
            <div style={{ marginTop: "8px" }}>
              {topFileTypes.length === 0 && <EmptyState title="No file type data" description="Run a scan to detect file types." />}
              {topFileTypes.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "6px" }}>
                  {topFileTypes.slice(0, 30).map(function(ft, i) {
                    return (
                      <UICard key={i} style={{ padding: "8px", textAlign: "center" }}>
                        <div style={{ fontWeight: 600, fontSize: "13px", fontFamily: "monospace" }}>{ft.ext || ft.extension || ft.name}</div>
                        <div style={{ fontSize: "11px", color: "#94a3b8" }}>{ft.count} file{ft.count !== 1 ? "s" : ""}</div>
                      </UICard>
                    );
                  })}
                </div>
              )}
            </div>
          </Tabs.Content>
        </Tabs>
      </div>
    );
  }

  return <EmptyState title="Projects Scanner" description="Use Browse or Scan to discover software projects on your machine." />;
}
