export default function GeneratedUI({ data, onAction }) {
  // ── Hooks (always at top level) ──
  var expandedState = useState({});
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];

  var editingNotesState = useState(null);
  var editingNotes = editingNotesState[0];
  var setEditingNotes = editingNotesState[1];

  var notesTextState = useState("");
  var notesText = notesTextState[0];
  var setNotesText = notesTextState[1];

  // ── Tool detection ──
  var tool = data && data.tool ? data.tool : "";
  var isStatusView = tool === "enso_pkg_tracker_get_status";
  var isUpdateView = tool === "enso_pkg_tracker_update_status";
  var isNotesView = tool === "enso_pkg_tracker_update_notes";
  var isConnectionsView = tool === "enso_pkg_tracker_check_connections";
  var isGraphView = tool === "enso_pkg_tracker_graph_stats";
  var isActionView = tool === "enso_pkg_tracker_run_action";

  // ── Helpers ──
  var statusColor = function(s) {
    if (s === "verified") return "success";
    if (s === "deployed") return "info";
    if (s === "in_progress") return "warning";
    return "default";
  };

  var statusLabel = function(s) {
    if (s === "not_started") return "Not Started";
    if (s === "in_progress") return "In Progress";
    if (s === "deployed") return "Deployed";
    if (s === "verified") return "Verified";
    return s || "Unknown";
  };

  var healthColor = function(h) {
    if (h === "healthy") return "success";
    if (h === "unhealthy" || h === "unreachable") return "danger";
    if (h === "degraded") return "warning";
    return "outline";
  };

  var connColor = function(s) {
    if (s === "connected") return "success";
    if (s === "error" || s === "disconnected") return "danger";
    return "outline";
  };

  var phaseIcon = function(phase) {
    if (phase === 1) return LucideReact.BookOpen;
    if (phase === 2) return LucideReact.Network;
    if (phase === 3) return LucideReact.Film;
    if (phase === 4) return LucideReact.Camera;
    return LucideReact.Circle;
  };

  var fmtDate = function(d) {
    if (!d) return "Never";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return "Unknown";
      return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch(e) { return "Unknown"; }
  };

  var fmtNum = function(n) {
    if (!n && n !== 0) return "0";
    return Number(n).toLocaleString();
  };

  // ── Update Status Confirmation View ──
  if (isUpdateView) {
    if (data.error) {
      return (
        <UICard accent="red" header="Update Failed">
          <p style={{ color: "#f87171" }}>{data.error}</p>
          <Button onClick={function() { onAction("get_status", {}); }} icon={LucideReact.ArrowLeft}>Back to Dashboard</Button>
        </UICard>
      );
    }
    return (
      <UICard accent="emerald" header="Status Updated">
        <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
          <Badge variant={statusColor(data.oldStatus)}>{statusLabel(data.oldStatus)}</Badge>
          <span style={{ color: "#9ca3af" }}>→</span>
          <Badge variant={statusColor(data.newStatus)}>{statusLabel(data.newStatus)}</Badge>
        </div>
        <Stat label={data.toolName || data.toolId} value={data.phaseName || ""} accent="blue" />
        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <Progress value={data.phaseProgress || 0} max={100} variant="emerald" showLabel />
          <span style={{ color: "#9ca3af", fontSize: "12px", whiteSpace: "nowrap" }}>Phase: {data.phaseProgress || 0}%</span>
        </div>
        <div style={{ marginTop: "12px" }}>
          <Button onClick={function() { onAction("get_status", {}); }} icon={LucideReact.ArrowLeft}>Back to Dashboard</Button>
        </div>
      </UICard>
    );
  }

  // ── Notes Update Confirmation ──
  if (isNotesView) {
    if (data.error) {
      return (
        <UICard accent="red" header="Update Failed">
          <p style={{ color: "#f87171" }}>{data.error}</p>
          <Button onClick={function() { onAction("get_status", {}); }} icon={LucideReact.ArrowLeft}>Back</Button>
        </UICard>
      );
    }
    return (
      <UICard accent="purple" header={"Notes: " + (data.toolName || data.toolId)}>
        {data.notes ? <p style={{ color: "#d1d5db", marginBottom: "8px" }}>{data.notes}</p> : null}
        {data.checklist && data.checklist.length > 0 ? (
          <div style={{ marginBottom: "12px" }}>
            {data.checklist.map(function(c, i) {
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0", color: c.done ? "#34d399" : "#9ca3af" }}>
                  {c.done ? <LucideReact.CheckSquare size={16} /> : <LucideReact.Square size={16} />}
                  <span style={{ textDecoration: c.done ? "line-through" : "none" }}>{c.item}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        <Button onClick={function() { onAction("get_status", {}); }} icon={LucideReact.ArrowLeft}>Back to Dashboard</Button>
      </UICard>
    );
  }

  // ── Action Result View ──
  if (isActionView) {
    if (data.error) {
      return (
        <UICard accent="red" header="Action Failed">
          <p style={{ color: "#f87171" }}>{data.error}</p>
          <Button onClick={function() { onAction("get_status", {}); }} icon={LucideReact.ArrowLeft}>Back</Button>
        </UICard>
      );
    }
    return (
      <UICard accent="cyan" header={"Action: " + (data.action || "").replace(/_/g, " ").replace(/\b\w/g, function(c) { return c.toUpperCase(); })}>
        <p style={{ color: "#d1d5db", marginBottom: "12px" }}>{data.result}</p>
        {data.syncResults ? (
          <DataTable
            columns={[
              { key: "source", label: "Source" },
              { key: "status", label: "Status", render: function(row) { return <Badge variant={row.status === "synced" ? "success" : "danger"}>{row.status}</Badge>; } },
              { key: "records", label: "Records" }
            ]}
            data={data.syncResults}
          />
        ) : null}
        {data.exportData ? (
          <div style={{ marginTop: "8px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              <Stat label="Overall" value={data.exportData.overallProgress + "%"} accent="emerald" />
              <Stat label="Deployed" value={data.exportData.deployedTools + "/" + data.exportData.totalTools} accent="blue" />
              <Stat label="Sources" value={data.exportData.connectedSources + "/" + data.exportData.totalSources} accent="cyan" />
            </div>
          </div>
        ) : null}
        <div style={{ marginTop: "12px" }}>
          <Button onClick={function() { onAction("get_status", {}); }} icon={LucideReact.ArrowLeft}>Back to Dashboard</Button>
        </div>
      </UICard>
    );
  }

  // ── Connections View ──
  if (isConnectionsView) {
    var srcs = data.sources || [];
    return (
      <div>
        <UICard accent="cyan" header="Data Source Connections">
          <p style={{ color: "#9ca3af", fontSize: "12px", marginBottom: "12px" }}>Checked: {fmtDate(data.checkedAt)}</p>
          <div style={{ display: "grid", gap: "8px" }}>
            {srcs.map(function(s) {
              return (
                <div key={s.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontWeight: 600, color: "#e5e7eb" }}>{s.name}</span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <Badge variant={connColor(s.status)}>{s.status}</Badge>
                      <Badge variant={healthColor(s.health)}>{s.health}</Badge>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#9ca3af" }}>
                    <span>Records: {fmtNum(s.recordCount)}</span>
                    <span>Last sync: {fmtDate(s.lastSync)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </UICard>
        <div style={{ marginTop: "12px" }}>
          <Button onClick={function() { onAction("get_status", {}); }} icon={LucideReact.ArrowLeft}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  // ── Graph Stats View ──
  if (isGraphView) {
    var nodes = data.nodesByType || [];
    var rels = data.relationshipsByType || [];
    var connected = data.mostConnected || [];

    return (
      <div>
        <UICard accent="violet" header="Knowledge Graph Statistics">
          {data.isPlaceholder ? (
            <Badge variant="warning" style={{ marginBottom: "12px" }}>Placeholder — awaiting Neo4j deployment</Badge>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            <Stat label="Total Nodes" value={fmtNum(data.totalNodes)} accent="violet" />
            <Stat label="Total Relationships" value={fmtNum(data.totalRelationships)} accent="purple" />
          </div>
          {nodes.length > 0 ? (
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ color: "#e5e7eb", marginBottom: "8px", fontSize: "13px", fontWeight: 600 }}>Nodes by Type</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={nodes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="type" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          {rels.length > 0 ? (
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ color: "#e5e7eb", marginBottom: "8px", fontSize: "13px", fontWeight: 600 }}>Relationships</h4>
              <DataTable
                columns={[
                  { key: "type", label: "Type" },
                  { key: "count", label: "Count", sortable: true },
                  { key: "description", label: "Description" }
                ]}
                data={rels}
              />
            </div>
          ) : null}
          {connected.length > 0 && connected[0].name !== "(awaiting data)" ? (
            <div>
              <h4 style={{ color: "#e5e7eb", marginBottom: "8px", fontSize: "13px", fontWeight: 600 }}>Most Connected</h4>
              {connected.map(function(c, i) {
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ color: "#d1d5db" }}>{c.name}</span>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <Badge variant="outline">{c.type}</Badge>
                      <span style={{ color: "#8b5cf6", fontWeight: 600 }}>{c.connections}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </UICard>
        <div style={{ marginTop: "12px" }}>
          <Button onClick={function() { onAction("get_status", {}); }} icon={LucideReact.ArrowLeft}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // ── MAIN DASHBOARD VIEW (get_status or default) ──
  // ══════════════════════════════════════════════════════
  var phases = (data && data.phases) || [];
  var sources = (data && data.sources) || [];
  var overallProgress = (data && data.overallProgress) || 0;
  var totalTools = (data && data.totalTools) || 0;
  var deployedTools = (data && data.deployedTools) || 0;
  var verifiedTools = (data && data.verifiedTools) || 0;

  var connectedSources = sources.filter(function(s) { return s.status === "connected"; }).length;

  // Phase card renderer
  var renderPhase = function(phase) {
    var Icon = phaseIcon(phase.phase);
    var isExpanded = expanded["phase_" + phase.id];
    var phaseAccent = phase.progress >= 100 ? "emerald" : phase.progress > 0 ? "blue" : "gray";

    return (
      <UICard key={phase.id} accent={phaseAccent}>
        <div
          style={{ cursor: "pointer" }}
          onClick={function() {
            var next = Object.assign({}, expanded);
            next["phase_" + phase.id] = !next["phase_" + phase.id];
            setExpanded(next);
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon size={18} style={{ color: phaseAccent === "emerald" ? "#34d399" : phaseAccent === "blue" ? "#60a5fa" : "#6b7280" }} />
              <span style={{ fontWeight: 700, color: "#e5e7eb", fontSize: "14px" }}>Phase {phase.phase}: {phase.name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#9ca3af", fontSize: "12px" }}>{phase.progress || 0}%</span>
              {isExpanded
                ? <LucideReact.ChevronUp size={16} style={{ color: "#9ca3af" }} />
                : <LucideReact.ChevronDown size={16} style={{ color: "#9ca3af" }} />
              }
            </div>
          </div>
          <Progress value={phase.progress || 0} max={100} variant={phaseAccent} />
          {phase.description ? <p style={{ color: "#6b7280", fontSize: "11px", marginTop: "4px" }}>{phase.description}</p> : null}
        </div>
        {isExpanded && phase.tools ? (
          <div style={{ marginTop: "12px" }}>
            {phase.tools.map(function(t) {
              var isToolExpanded = expanded["tool_" + t.id];
              return (
                <div key={t.id} style={{ background: "rgba(255,255,255,0.02)", borderRadius: "6px", padding: "10px", marginBottom: "8px", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 600, color: "#d1d5db", fontSize: "13px" }}>{t.name}</span>
                      <Badge variant={statusColor(t.status)}>{statusLabel(t.status)}</Badge>
                    </div>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {t.status !== "verified" ? (
                        <Select
                          options={[
                            { value: "not_started", label: "Not Started" },
                            { value: "in_progress", label: "In Progress" },
                            { value: "deployed", label: "Deployed" },
                            { value: "verified", label: "Verified" }
                          ]}
                          value={t.status}
                          onChange={function(v) { onAction("update_status", { toolId: t.id, status: v }); }}
                          placeholder="Status"
                        />
                      ) : <Badge variant="success">Complete</Badge>}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={function() {
                          var next = Object.assign({}, expanded);
                          next["tool_" + t.id] = !next["tool_" + t.id];
                          setExpanded(next);
                        }}
                      >
                        {isToolExpanded ? <LucideReact.ChevronUp size={14} /> : <LucideReact.Settings size={14} />}
                      </Button>
                    </div>
                  </div>
                  {t.notes ? <p style={{ color: "#9ca3af", fontSize: "11px", marginTop: "4px" }}>{t.notes}</p> : null}
                  {isToolExpanded ? (
                    <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <h5 style={{ color: "#9ca3af", fontSize: "11px", marginBottom: "6px", fontWeight: 600 }}>CHECKLIST</h5>
                      {(t.checklist || []).map(function(c, ci) {
                        return (
                          <div
                            key={ci}
                            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", cursor: "pointer", color: c.done ? "#34d399" : "#9ca3af" }}
                            onClick={function() { onAction("update_notes", { toolId: t.id, toggleCheckItem: ci }); }}
                          >
                            {c.done ? <LucideReact.CheckSquare size={14} /> : <LucideReact.Square size={14} />}
                            <span style={{ fontSize: "12px", textDecoration: c.done ? "line-through" : "none" }}>{c.item}</span>
                          </div>
                        );
                      })}
                      <div style={{ marginTop: "8px", display: "flex", gap: "4px" }}>
                        {editingNotes === t.id ? (
                          <div style={{ display: "flex", gap: "4px", flex: 1 }}>
                            <Input
                              value={notesText}
                              onChange={function(e) { setNotesText(e.target.value); }}
                              placeholder="Add notes..."
                              style={{ flex: 1 }}
                            />
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={function() {
                                onAction("update_notes", { toolId: t.id, notes: notesText });
                                setEditingNotes(null);
                                setNotesText("");
                              }}
                            >
                              Save
                            </Button>
                            <Button variant="ghost" size="sm" onClick={function() { setEditingNotes(null); }}>Cancel</Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={LucideReact.Pencil}
                            onClick={function() { setEditingNotes(t.id); setNotesText(t.notes || ""); }}
                          >
                            {t.notes ? "Edit Notes" : "Add Notes"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </UICard>
    );
  };

  // ── Quick source cards ──
  var renderSourceMini = function(s) {
    return (
      <div key={s.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "6px", padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#d1d5db", fontSize: "12px", fontWeight: 500 }}>{s.name}</span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {s.recordCount > 0 ? <span style={{ color: "#6b7280", fontSize: "11px" }}>{fmtNum(s.recordCount)}</span> : null}
          <Badge variant={connColor(s.status)}>{s.status === "connected" ? "OK" : s.status === "unknown" ? "?" : "OFF"}</Badge>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* ── Header Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
        <Stat label="Overall" value={overallProgress + "%"} accent="emerald" />
        <Stat label="Deployed" value={deployedTools + "/" + totalTools} accent="blue" />
        <Stat label="Verified" value={verifiedTools + ""} accent="cyan" />
        <Stat label="Sources" value={connectedSources + "/" + sources.length} accent="purple" />
      </div>
      <Progress value={overallProgress} max={100} variant="emerald" showLabel style={{ marginBottom: "16px" }} />

      <Tabs
        tabs={[
          { value: "deploy", label: "Deployment" },
          { value: "sources", label: "Sources" },
          { value: "graph", label: "Graph" },
          { value: "actions", label: "Actions" }
        ]}
        defaultValue="deploy"
        variant="pills"
      >
        {function(tab) {
          if (tab === "deploy") {
            return (
              <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                {phases.map(renderPhase)}
              </div>
            );
          }

          if (tab === "sources") {
            return (
              <div style={{ marginTop: "12px" }}>
                <div style={{ display: "grid", gap: "6px", marginBottom: "12px" }}>
                  {sources.map(renderSourceMini)}
                </div>
                <Button variant="primary" icon={LucideReact.RefreshCw} onClick={function() { onAction("check_connections", {}); }}>
                  Check All Connections
                </Button>
              </div>
            );
          }

          if (tab === "graph") {
            return (
              <div style={{ marginTop: "12px" }}>
                <EmptyState
                  icon={LucideReact.Network}
                  title="Knowledge Graph"
                  description="View node counts, relationships, and most connected entities"
                  action={
                    <Button variant="primary" icon={LucideReact.BarChart3} onClick={function() { onAction("graph_stats", {}); }}>
                      Load Graph Stats
                    </Button>
                  }
                />
              </div>
            );
          }

          if (tab === "actions") {
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "12px" }}>
                <Button variant="primary" icon={LucideReact.RefreshCw} onClick={function() { onAction("run_action", { action: "full_sync" }); }}>
                  Run Full Sync
                </Button>
                <Button variant="default" icon={LucideReact.Wifi} onClick={function() { onAction("check_connections", {}); }}>
                  Check Connections
                </Button>
                <Button variant="default" icon={LucideReact.Download} onClick={function() { onAction("run_action", { action: "export_status" }); }}>
                  Export Status
                </Button>
                <Button variant="danger" icon={LucideReact.RotateCcw} onClick={function() { onAction("run_action", { action: "reset_tracker" }); }}>
                  Reset Tracker
                </Button>
              </div>
            );
          }

          return null;
        }}
      </Tabs>
    </div>
  );
}
