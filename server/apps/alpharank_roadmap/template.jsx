export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var statusColor = function(s) {
    if (s === "complete") return "emerald";
    if (s === "in_progress") return "amber";
    return "gray";
  };
  var statusLabel = function(s) {
    if (s === "complete") return "Complete";
    if (s === "in_progress") return "In Progress";
    return "Not Started";
  };
  var statusBadge = function(s) {
    if (s === "complete") return "success";
    if (s === "in_progress") return "warning";
    return "default";
  };
  var severityBadge = function(s) {
    if (s === "High") return "danger";
    if (s === "Medium") return "warning";
    return "info";
  };
  var phaseIcon = function(idx) {
    var icons = [
      LucideReact.Layers,
      LucideReact.Search,
      LucideReact.Briefcase,
      LucideReact.Rocket
    ];
    return icons[idx] || LucideReact.Circle;
  };

  // ── State ──
  var tabState = useState("roadmap");
  var activeTab = tabState[0];
  var setActiveTab = tabState[1];

  // ── Detect tool view ──
  var isOverview = data && data.tool === "enso_alpharank_roadmap_overview";
  var isUpdatePhase = data && data.tool === "enso_alpharank_roadmap_update_phase";
  var isToggleMilestone = data && data.tool === "enso_alpharank_roadmap_toggle_milestone";
  var isToggleTech = data && data.tool === "enso_alpharank_roadmap_toggle_tech";
  var isUpdateMetric = data && data.tool === "enso_alpharank_roadmap_update_metric";
  var isMutation = isUpdatePhase || isToggleMilestone || isToggleTech || isUpdateMetric;

  // ── Mutation confirmation view ──
  if (isMutation) {
    return (
      <div style={{ padding: "16px" }}>
        <UICard accent={data.success ? "emerald" : "rose"}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            {data.success
              ? React.createElement(LucideReact.CheckCircle, { size: 20, style: { color: "#10b981" } })
              : React.createElement(LucideReact.XCircle, { size: 20, style: { color: "#f43f5e" } })
            }
            <span style={{ fontWeight: 600, fontSize: "15px", color: "#e2e8f0" }}>
              {data.success ? "Updated Successfully" : "Update Failed"}
            </span>
          </div>
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
            {data.message || data.error || "Operation completed"}
          </p>
          <div style={{ marginTop: "16px" }}>
            <Button variant="primary" onClick={function() { onAction("overview", {}); }}>
              Back to Roadmap
            </Button>
          </div>
        </UICard>
      </div>
    );
  }

  // ── Main overview ──
  if (!isOverview || !data.phases) {
    return (
      <EmptyState
        icon={LucideReact.Map}
        title="AlphaRank Roadmap"
        description="No roadmap data loaded yet."
        action={<Button variant="primary" onClick={function() { onAction("overview", {}); }}>Load Roadmap</Button>}
      />
    );
  }

  var phases = data.phases || [];
  var metrics = data.metrics || [];
  var techStack = data.techStack || [];
  var risks = data.risks || [];
  var progress = data.overallProgress || {};

  // ── Phase card renderer ──
  var renderPhaseCard = function(phase, idx) {
    var Icon = phaseIcon(idx);
    var ms = phase.milestones || [];
    var doneCount = 0;
    for (var k = 0; k < ms.length; k++) { if (ms[k].done) doneCount++; }
    var phasePct = ms.length > 0 ? Math.round((doneCount / ms.length) * 100) : 0;

    return (
      <UICard key={phase.id} accent={statusColor(phase.status)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {React.createElement(Icon, { size: 20, style: { color: phase.status === "complete" ? "#10b981" : phase.status === "in_progress" ? "#f59e0b" : "#64748b" } })}
            <div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#e2e8f0" }}>
                {"Phase " + (idx + 1) + ": " + phase.name}
              </div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                {phase.timeline}
              </div>
            </div>
          </div>
          <Badge variant={statusBadge(phase.status)}>{statusLabel(phase.status)}</Badge>
        </div>

        <Progress value={phasePct} max={100} variant={statusColor(phase.status)} showLabel />

        <div style={{ marginTop: "12px" }}>
          {ms.map(function(m) {
            return (
              <div
                key={m.id}
                onClick={function() { onAction("toggle_milestone", { phaseId: phase.id, milestoneId: m.id }); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 4px",
                  cursor: "pointer",
                  borderRadius: "4px"
                }}
              >
                {m.done
                  ? React.createElement(LucideReact.CheckSquare, { size: 16, style: { color: "#10b981", flexShrink: 0 } })
                  : React.createElement(LucideReact.Square, { size: 16, style: { color: "#475569", flexShrink: 0 } })
                }
                <span style={{
                  fontSize: "13px",
                  color: m.done ? "#64748b" : "#cbd5e1",
                  textDecoration: m.done ? "line-through" : "none"
                }}>
                  {m.label}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "11px", color: "#475569" }}>
            {"Target: " + phase.targetMetrics}
          </span>
          <Select
            options={[
              { value: "not_started", label: "Not Started" },
              { value: "in_progress", label: "In Progress" },
              { value: "complete", label: "Complete" }
            ]}
            value={phase.status}
            onChange={function(v) { onAction("update_phase", { phaseId: phase.id, status: v }); }}
          />
        </div>
      </UICard>
    );
  };

  // ── Tab content renderers ──
  var renderRoadmapTab = function() {
    return (
      <div>
        <div style={{ marginBottom: "16px" }}>
          <UICard accent="blue">
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              {React.createElement(LucideReact.BarChart3, { size: 20, style: { color: "#3b82f6" } })}
              <span style={{ fontWeight: 700, fontSize: "16px", color: "#e2e8f0" }}>Overall Progress</span>
            </div>
            <Progress
              value={progress.percent || 0}
              max={100}
              variant="blue"
              showLabel
            />
            <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                {(progress.milestonesDone || 0) + " / " + (progress.milestonesTotal || 0) + " milestones"}
              </span>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                {(progress.techReady || 0) + " / " + (progress.techTotal || 0) + " tech ready"}
              </span>
            </div>
          </UICard>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          {phases.map(function(phase, idx) {
            return renderPhaseCard(phase, idx);
          })}
        </div>
      </div>
    );
  };

  var renderMetricsTab = function() {
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          {metrics.map(function(m) {
            var isActive = m.current && m.current !== "N/A";
            return (
              <UICard key={m.id} accent={isActive ? "emerald" : "gray"}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: isActive ? "#10b981" : "#475569", fontFamily: "monospace" }}>
                    {m.current || "N/A"}
                  </div>
                  <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                    {"Target: " + m.target}
                  </div>
                </div>
              </UICard>
            );
          })}
        </div>

        <UICard header="Performance Targets by Phase" accent="blue">
          <DataTable
            columns={[
              { key: "phase", label: "Phase", sortable: true },
              { key: "cagr", label: "CAGR" },
              { key: "sharpe", label: "Sharpe" },
              { key: "maxDD", label: "Max DD" },
              { key: "ic", label: "IC" }
            ]}
            data={[
              { phase: "1 — Foundation", cagr: "—", sharpe: ">0.5", maxDD: "—", ic: ">0.03" },
              { phase: "2 — Alpha Research", cagr: "—", sharpe: ">0.8", maxDD: "—", ic: ">0.05" },
              { phase: "3 — Portfolio", cagr: ">10%", sharpe: ">0.9", maxDD: "<25%", ic: ">0.05" },
              { phase: "4 — Production", cagr: "12-14%", sharpe: ">1.0", maxDD: "<20%", ic: ">0.05" }
            ]}
            striped
          />
        </UICard>
      </div>
    );
  };

  var renderTechTab = function() {
    var readyCount = 0;
    for (var i = 0; i < techStack.length; i++) { if (techStack[i].done) readyCount++; }

    return (
      <div>
        <div style={{ marginBottom: "16px" }}>
          <Progress
            value={readyCount}
            max={techStack.length}
            variant="cyan"
            showLabel
          />
          <span style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px", display: "block" }}>
            {readyCount + " of " + techStack.length + " technologies ready"}
          </span>
        </div>

        <UICard accent="cyan">
          {techStack.map(function(tech) {
            return (
              <div
                key={tech.id}
                onClick={function() { onAction("toggle_tech", { techId: tech.id }); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 8px",
                  cursor: "pointer",
                  borderBottom: "1px solid rgba(100,116,139,0.15)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {tech.done
                    ? React.createElement(LucideReact.CheckCircle, { size: 18, style: { color: "#10b981" } })
                    : React.createElement(LucideReact.Circle, { size: 18, style: { color: "#475569" } })
                  }
                  <span style={{
                    fontSize: "14px",
                    color: tech.done ? "#94a3b8" : "#e2e8f0",
                    fontWeight: tech.done ? 400 : 500
                  }}>
                    {tech.label}
                  </span>
                </div>
                <Badge variant={tech.done ? "success" : "outline"}>
                  {tech.done ? "Ready" : "Pending"}
                </Badge>
              </div>
            );
          })}
        </UICard>
      </div>
    );
  };

  var renderRisksTab = function() {
    return (
      <div>
        <DataTable
          columns={[
            {
              key: "label",
              label: "Risk",
              sortable: true,
              render: function(v) {
                return (
                  <span style={{ fontWeight: 500, color: "#e2e8f0" }}>{v}</span>
                );
              }
            },
            {
              key: "severity",
              label: "Severity",
              sortable: true,
              render: function(v) {
                return <Badge variant={severityBadge(v)}>{v}</Badge>;
              }
            },
            {
              key: "mitigation",
              label: "Mitigation Strategy",
              render: function(v) {
                return (
                  <span style={{ fontSize: "13px", color: "#94a3b8" }}>{v}</span>
                );
              }
            }
          ]}
          data={risks}
          striped
        />
      </div>
    );
  };

  // ── Main layout ──
  return (
    <div style={{ padding: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
        {React.createElement(LucideReact.TrendingUp, { size: 24, style: { color: "#3b82f6" } })}
        <div>
          <div style={{ fontWeight: 800, fontSize: "18px", color: "#e2e8f0" }}>AlphaRank Development Roadmap</div>
          <div style={{ fontSize: "12px", color: "#64748b" }}>Market-Beating Quant Tool — 14-Month Plan</div>
        </div>
      </div>

      <Tabs
        tabs={[
          { value: "roadmap", label: "Roadmap" },
          { value: "metrics", label: "Metrics" },
          { value: "tech", label: "Tech Stack" },
          { value: "risks", label: "Risks" }
        ]}
        defaultValue="roadmap"
        variant="boxed"
      >
        {function(tab) {
          if (tab === "roadmap") return renderRoadmapTab();
          if (tab === "metrics") return renderMetricsTab();
          if (tab === "tech") return renderTechTab();
          if (tab === "risks") return renderRisksTab();
          return null;
        }}
      </Tabs>
    </div>
  );
}
