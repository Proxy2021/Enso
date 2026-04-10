function GeneratedUI({ data, onAction }) {
  var tool = data.tool || "";
  var isBrowse = tool === "enso_system_info_browse";
  var isScan = tool === "enso_system_info_scan";

  // ── Scan result ──
  if (isScan) {
    return (
      <UICard>
        <div style={{ padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>🖥️</div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>System Scanned</div>
          {data.error ? (
            <div style={{ color: "#ef4444", fontSize: "13px" }}>{data.error}</div>
          ) : (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>Scan complete</div>
          )}
          <div style={{ marginTop: "12px" }}>
            <Button size="sm" onClick={function() { onAction("browse", {}); }}>Browse System Info</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ── Browse (primary view) ──
  if (isBrowse) {
    var [searchInput, setSearchInput] = React.useState(data.query || "");
    var installedApps = data.installedApps || [];
    var runningProcesses = data.runningProcesses || [];
    var platform = data.platform || "unknown";
    var hostname = data.hostname || "unknown";

    if (data.error && installedApps.length === 0) {
      return (
        <EmptyState
          title="No System Data"
          description={data.error}
        />
      );
    }

    var platformLabels = {
      win32: "Windows",
      darwin: "macOS",
      linux: "Linux",
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "20px", marginRight: "8px" }}>🖥️</span>
            <span style={{ fontWeight: 600 }}>System Info</span>
          </div>
          <Button variant="outline" size="sm" onClick={function() { onAction("scan", {}); }}>🔄 Scan</Button>
        </div>

        {/* System overview */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Stat label="Platform" value={platformLabels[platform] || platform} />
          <Stat label="Hostname" value={hostname} />
          <Stat label="Installed Apps" value={String(data.totalApps || installedApps.length)} />
          {runningProcesses.length > 0 && <Stat label="Processes" value={String(runningProcesses.length)} />}
        </div>

        {/* Search bar */}
        <Input
          placeholder="Search applications..."
          value={searchInput}
          onChange={function(v) { setSearchInput(v); }}
          onKeyDown={function(e) { if (e.key === "Enter") onAction("browse", { query: searchInput }); }}
        />

        <Tabs defaultValue="apps">
          <Tabs.List>
            <Tabs.Trigger value="apps">Installed Apps ({installedApps.length})</Tabs.Trigger>
            {runningProcesses.length > 0 && <Tabs.Trigger value="processes">Running Processes ({runningProcesses.length})</Tabs.Trigger>}
          </Tabs.List>

          {/* Installed Apps tab */}
          <Tabs.Content value="apps">
            <div style={{ marginTop: "8px" }}>
              {installedApps.length === 0 && <EmptyState title="No apps found" description={data.query ? "No apps matching \"" + data.query + "\"" : "Run a scan to detect installed applications."} />}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "6px" }}>
                {installedApps.slice(0, 200).map(function(app, i) {
                  var appName = (typeof app === "string") ? app : (app.name || "Unknown");
                  var appVersion = (typeof app === "object" && app.version) ? app.version : null;

                  return (
                    <UICard key={i} style={{ padding: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{appName}</div>
                          {appVersion && <div style={{ fontSize: "10px", color: "#64748b" }}>v{appVersion}</div>}
                        </div>
                        <Button variant="outline" size="sm" style={{ fontSize: "10px", flexShrink: 0 }}
                          onClick={function() { onAction("send_message", { message: "/research " + appName }); }}
                        >🔍</Button>
                      </div>
                    </UICard>
                  );
                })}
              </div>
              {installedApps.length > 200 && (
                <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                  Showing 200 of {installedApps.length} apps. Use search to narrow down.
                </div>
              )}
            </div>
          </Tabs.Content>

          {/* Running Processes tab */}
          {runningProcesses.length > 0 && (
            <Tabs.Content value="processes">
              <div style={{ marginTop: "8px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {runningProcesses.slice(0, 100).map(function(proc, i) {
                    var procName = (typeof proc === "string") ? proc : (proc.name || proc.processName || "Unknown");
                    var pid = (typeof proc === "object") ? (proc.pid || proc.PID || "") : "";
                    var memory = (typeof proc === "object") ? (proc.memory || proc.memoryMB || "") : "";

                    return (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "4px 8px", borderRadius: "4px",
                        background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                        fontSize: "12px",
                      }}>
                        <span style={{ fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{procName}</span>
                        {pid && <span style={{ color: "#64748b", fontSize: "10px", marginLeft: "8px" }}>PID {pid}</span>}
                        {memory && <span style={{ color: "#64748b", fontSize: "10px", marginLeft: "8px" }}>{memory} MB</span>}
                      </div>
                    );
                  })}
                </div>
                {runningProcesses.length > 100 && (
                  <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                    Showing 100 of {runningProcesses.length} processes.
                  </div>
                )}
              </div>
            </Tabs.Content>
          )}
        </Tabs>
      </div>
    );
  }

  return <EmptyState title="System Info" description="Use Browse or Scan to view system information." />;
}
