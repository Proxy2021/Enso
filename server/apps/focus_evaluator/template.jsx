export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var fmtDate = function(d) {
    if (!d) return "—";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d).substring(0, 10);
      return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch(e) { return String(d).substring(0, 10); }
  };

  var fmtPct = function(v) { return (v || 0) + "%"; };

  var driftColors = {
    healthy: { bg: "#14532d", text: "#4ade80", label: "Healthy" },
    stalling: { bg: "#78350f", text: "#fbbf24", label: "Stalling" },
    regressing: { bg: "#7f1d1d", text: "#f87171", label: "Regressing" },
    disengaged: { bg: "#1c1917", text: "#a8a29e", label: "Disengaged" },
    accelerating: { bg: "#1e3a5f", text: "#60a5fa", label: "Accelerating" },
    confidence_drop: { bg: "#3b1f6e", text: "#c084fc", label: "Conf. Drop" }
  };

  var severityColors = {
    critical: { bg: "#7f1d1d", text: "#f87171", border: "#ef4444" },
    warning: { bg: "#78350f", text: "#fbbf24", border: "#f59e0b" },
    info: { bg: "#1e3a5f", text: "#60a5fa", border: "#3b82f6" }
  };

  var categoryColors = {
    strength: { bg: "#14532d", text: "#4ade80", icon: "\u2714" },
    gap: { bg: "#78350f", text: "#fbbf24", icon: "\u26A0" },
    risk: { bg: "#7f1d1d", text: "#f87171", icon: "\u26A1" },
    opportunity: { bg: "#1e3a5f", text: "#60a5fa", icon: "\u2728" }
  };

  var focusTypeIcons = {
    project: "\u{1F4BB}",
    creative: "\u{1F3A8}",
    learning: "\u{1F4DA}",
    lifestyle: "\u{1F331}",
    general: "\u{1F4CC}"
  };

  // ── All hooks at top level ──
  var tabState = useState("overview");
  var activeTab = tabState[0];
  var setActiveTab = tabState[1];

  // ── View detection ──
  var tool = data && data.tool ? data.tool : "";
  var isDashboard = tool === "enso_focus_evaluator_dashboard";
  var isTrend = tool === "enso_focus_evaluator_trend_analysis";
  var isSignal = tool === "enso_focus_evaluator_signal_scan";
  var isDrift = tool === "enso_focus_evaluator_drift_scan";
  var isEvalReport = tool === "enso_focus_evaluator_evaluation_report";
  var isCompare = tool === "enso_focus_evaluator_compare";

  // ── Error state ──
  if (data && data.error) {
    return (
      <UICard accent="red" header="Error">
        <p style={{ color: "#f87171" }}>{data.message || "An error occurred"}</p>
        <div style={{ marginTop: 12 }}>
          <Button variant="outline" onClick={function() { onAction("dashboard", {}); }}>Back to Dashboard</Button>
        </div>
      </UICard>
    );
  }

  // ═════════════════════════════════════════════
  // ── DASHBOARD VIEW ──
  // ═════════════════════════════════════════════
  if (isDashboard) {
    var areas = data.areas || [];
    var metrics = data.globalMetrics || {};
    var alerts = data.driftAlerts || [];

    return (
      <div className="space-y-4">
        <UICard accent="blue" header="Focus Area Evaluation Dashboard">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <Stat label="Active Areas" value={data.activeAreas || 0} accent="blue" />
            <Stat label="Avg Understanding" value={fmtPct(metrics.avgUnderstanding)} accent="emerald" />
            <Stat label="Avg Progress" value={fmtPct(metrics.avgProgress)} accent="purple" />
            <Stat label="Avg Engagement" value={fmtPct(metrics.avgEngagement)} accent="amber" />
            <Stat label="Drift Alerts" value={metrics.areasWithDrift || 0} accent={metrics.areasWithDrift > 0 ? "red" : "emerald"} />
          </div>
        </UICard>

        {alerts.length > 0 && (
          <UICard accent="amber" header={"Drift Alerts (" + alerts.length + ")"}>
            {alerts.map(function(alert, idx) {
              var sev = severityColors[alert.severity] || severityColors.warning;
              return (
                <div key={idx} style={{ padding: "10px 14px", marginBottom: 8, borderRadius: 8, background: sev.bg, borderLeft: "3px solid " + sev.border }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ color: sev.text, fontWeight: 600, fontSize: 13 }}>
                      {alert.type.toUpperCase()} — {alert.focusTitle}
                    </span>
                    <Badge variant={alert.severity === "critical" ? "danger" : "warning"}>
                      {alert.severity}
                    </Badge>
                  </div>
                  <p style={{ color: "#d1d5db", fontSize: 12, margin: "4px 0" }}>{alert.message}</p>
                  <p style={{ color: "#9ca3af", fontSize: 11, fontStyle: "italic" }}>{alert.suggestedAction}</p>
                </div>
              );
            })}
          </UICard>
        )}

        <UICard accent="gray" header="Focus Areas">
          {areas.map(function(area, idx) {
            var dc = driftColors[area.driftStatus] || driftColors.healthy;
            return (
              <div key={idx} style={{ padding: "14px 16px", marginBottom: 10, borderRadius: 10, background: "#1a1a2e", border: "1px solid #2a2a4a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{focusTypeIcons[area.focusType] || "\u{1F4CC}"}</span>
                      <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>{area.title}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 12, background: dc.bg, color: dc.text, fontSize: 11, fontWeight: 500 }}>
                        {dc.label}
                      </span>
                      <span style={{ padding: "2px 8px", borderRadius: 12, background: "#1e293b", color: "#94a3b8", fontSize: 11 }}>
                        {area.clarity}
                      </span>
                      {area.progressVelocity > 0 && (
                        <span style={{ padding: "2px 8px", borderRadius: 12, background: "#0f3460", color: "#60a5fa", fontSize: 11 }}>
                          {area.progressVelocity > 0 ? "+" : ""}{area.progressVelocity}pts/day
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 60 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: area.engagementScore >= 60 ? "#4ade80" : area.engagementScore >= 35 ? "#fbbf24" : "#f87171" }}>
                      {area.engagementScore}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>engagement</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ color: "#94a3b8", fontSize: 11 }}>Understanding</span>
                      <span style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 600 }}>{area.understanding}%</span>
                    </div>
                    <Progress value={area.understanding} max={100} variant="emerald" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ color: "#94a3b8", fontSize: 11 }}>Progress</span>
                      <span style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 600 }}>{area.progress}%</span>
                    </div>
                    <Progress value={area.progress} max={100} variant="purple" />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Button variant="ghost" onClick={function() { onAction("trend_analysis", { focusId: area.id }); }}>
                    Trends
                  </Button>
                  <Button variant="ghost" onClick={function() { onAction("signal_scan", { focusId: area.id }); }}>
                    Signals
                  </Button>
                  <Button variant="ghost" onClick={function() { onAction("evaluation_report", { focusId: area.id }); }}>
                    Evaluate
                  </Button>
                </div>
              </div>
            );
          })}
        </UICard>

        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" onClick={function() { onAction("drift_scan", {}); }}>
            Run Drift Scan
          </Button>
          <Button variant="outline" onClick={function() { onAction("compare", {}); }}>
            Compare All
          </Button>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // ── TREND ANALYSIS VIEW ──
  // ═════════════════════════════════════════════
  if (isTrend) {
    var history = data.history || [];
    var trendData = data.trend || {};
    var current = data.current || {};
    var areaSelector = data.allAreas || [];

    return (
      <div className="space-y-4">
        <UICard accent="emerald" header={"Assessment Trends — " + (data.focusTitle || "")}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <Stat label="Understanding" value={fmtPct(current.understanding)} accent="emerald" />
            <Stat label="Progress" value={fmtPct(current.progress)} accent="purple" />
            <Stat label="Evaluations" value={trendData.evaluationCount || 0} accent="blue" />
            <Stat label="Velocity" value={(trendData.progressVelocity || 0) + " pts/day"} accent={trendData.progressVelocity > 3 ? "emerald" : trendData.progressVelocity > 0 ? "amber" : "red"} />
            <Stat label="Acceleration" value={(trendData.progressAcceleration >= 0 ? "+" : "") + (trendData.progressAcceleration || 0)} accent={trendData.progressAcceleration >= 0 ? "emerald" : "red"} />
            <Stat label="Projected" value={fmtPct(trendData.projectedProgress)} accent="cyan" />
          </div>
        </UICard>

        {history.length > 1 ? (
          <UICard accent="gray" header="Score History">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={history} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#888" fontSize={11} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="understanding" stroke="#4ade80" strokeWidth={2} dot={{ r: 4 }} name="Understanding" />
                <Line type="monotone" dataKey="progress" stroke="#a855f7" strokeWidth={2} dot={{ r: 4 }} name="Progress" />
                <Line type="monotone" dataKey="confidence" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" name="Confidence" />
              </LineChart>
            </ResponsiveContainer>
          </UICard>
        ) : (
          <UICard accent="gray" header="Score History">
            <EmptyState icon="chart" title="Not enough data points" description="Assessment history will build up as the Team Leader runs evaluations. At least 2 data points are needed for trend charts." />
          </UICard>
        )}

        {history.length > 0 && (
          <UICard accent="gray" header="Assessment Log">
            <DataTable
              columns={[
                { key: "date", label: "Date", sortable: true },
                { key: "understanding", label: "U%", sortable: true },
                { key: "progress", label: "P%", sortable: true },
                { key: "confidence", label: "Conf%", sortable: true },
                { key: "source", label: "Source" }
              ]}
              data={history}
              striped
              pageSize={10}
            />
          </UICard>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="outline" onClick={function() { onAction("dashboard", {}); }}>
            Back to Dashboard
          </Button>
          <Button variant="ghost" onClick={function() { onAction("signal_scan", { focusId: data.focusId }); }}>
            View Signals
          </Button>
          <Button variant="ghost" onClick={function() { onAction("evaluation_report", { focusId: data.focusId }); }}>
            Evaluation Report
          </Button>
          {areaSelector.length > 1 && areaSelector.map(function(aa) {
            if (aa.id === data.focusId) return null;
            return (
              <Button key={aa.id} variant="ghost" onClick={function() { onAction("trend_analysis", { focusId: aa.id }); }}>
                {aa.title.length > 20 ? aa.title.substring(0, 18) + "..." : aa.title}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // ── SIGNAL SCAN VIEW ──
  // ═════════════════════════════════════════════
  if (isSignal) {
    var breakdown = data.breakdown || {};
    var signalKeys = ["cortexGrowth", "gitVelocity", "contentCreation", "conversationDepth", "deliverableActivation", "evidenceDepth"];
    var signalLabels = {
      cortexGrowth: "Cortex Growth",
      gitVelocity: "Git Velocity",
      contentCreation: "Content Creation",
      conversationDepth: "Conversation Depth",
      deliverableActivation: "Deliverable Activation",
      evidenceDepth: "Evidence Depth"
    };
    var signalIcons = {
      cortexGrowth: "\u{1F9E0}",
      gitVelocity: "\u{1F4BB}",
      contentCreation: "\u{270F}\uFE0F",
      conversationDepth: "\u{1F4AC}",
      deliverableActivation: "\u{1F680}",
      evidenceDepth: "\u{1F4DA}"
    };

    var chartData = [];
    for (var si = 0; si < signalKeys.length; si++) {
      var sk = signalKeys[si];
      var sv = breakdown[sk];
      if (sv) {
        chartData.push({ name: signalLabels[sk], score: sv.score, weight: sv.weight });
      }
    }

    return (
      <div className="space-y-4">
        <UICard accent="amber" header={"Behavioral Signals — " + (data.focusTitle || "")}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, fontWeight: 700,
                background: data.engagementScore >= 70 ? "#14532d" : data.engagementScore >= 40 ? "#78350f" : "#7f1d1d",
                color: data.engagementScore >= 70 ? "#4ade80" : data.engagementScore >= 40 ? "#fbbf24" : "#f87171",
                border: "3px solid " + (data.engagementScore >= 70 ? "#22c55e" : data.engagementScore >= 40 ? "#f59e0b" : "#ef4444")
              }}>
                {data.engagementScore}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Engagement</div>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: "#d1d5db", fontSize: 13, margin: 0 }}>{data.summary || "No summary available"}</p>
              <p style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>Period: last {data.periodDays || 14} days</p>
            </div>
          </div>
        </UICard>

        <UICard accent="gray" header="Signal Breakdown">
          {chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#888" fontSize={10} angle={-20} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} stroke="#888" fontSize={11} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }} />
                <Bar dataKey="score" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          <div style={{ marginTop: 12 }}>
            {signalKeys.map(function(sk) {
              var sv = breakdown[sk];
              if (!sv) return null;
              var detailText = "";
              if (sk === "cortexGrowth") detailText = sv.count + " entities";
              else if (sk === "gitVelocity") detailText = sv.commits + " commits";
              else if (sk === "contentCreation") detailText = sv.count + " items";
              else if (sk === "conversationDepth") detailText = sv.wordCount + " words";
              else if (sk === "deliverableActivation") detailText = sv.activated + "/" + sv.total + " activated";
              else if (sk === "evidenceDepth") detailText = sv.count + " sources";

              return (
                <div key={sk} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #1e293b" }}>
                  <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{signalIcons[sk]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 500 }}>{signalLabels[sk]}</span>
                      <span style={{ color: "#94a3b8", fontSize: 11 }}>{detailText} · {sv.weight}% weight</span>
                    </div>
                    <Progress value={sv.score} max={100} variant={sv.score >= 60 ? "emerald" : sv.score >= 30 ? "amber" : "rose"} />
                  </div>
                  <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, minWidth: 30, textAlign: "right" }}>{sv.score}</span>
                </div>
              );
            })}
          </div>
        </UICard>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="outline" onClick={function() { onAction("dashboard", {}); }}>Back to Dashboard</Button>
          <Button variant="ghost" onClick={function() { onAction("trend_analysis", { focusId: data.focusId }); }}>Trends</Button>
          <Button variant="ghost" onClick={function() { onAction("evaluation_report", { focusId: data.focusId }); }}>Evaluate</Button>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // ── DRIFT SCAN VIEW ──
  // ═════════════════════════════════════════════
  if (isDrift) {
    var driftAlerts = data.alerts || [];
    var areaStatuses = data.areaStatuses || [];

    return (
      <div className="space-y-4">
        <UICard accent="amber" header="Drift Detection Report">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <Stat label="Total Areas" value={data.totalAreas || 0} accent="blue" />
            <Stat label="Healthy" value={data.healthyCount || 0} accent="emerald" />
            <Stat label="Alerts" value={data.alertCount || 0} accent={data.alertCount > 0 ? "red" : "emerald"} />
          </div>
        </UICard>

        {driftAlerts.length > 0 && (
          <UICard accent="red" header="Active Alerts">
            {driftAlerts.map(function(alert, idx) {
              var sev = severityColors[alert.severity] || severityColors.warning;
              return (
                <div key={idx} style={{ padding: "12px 14px", marginBottom: 10, borderRadius: 10, background: sev.bg, borderLeft: "4px solid " + sev.border }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ color: sev.text, fontWeight: 600, fontSize: 13 }}>
                      {alert.type.replace("_", " ").toUpperCase()}
                    </span>
                    <Badge variant={alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warning" : "info"}>
                      {alert.severity}
                    </Badge>
                  </div>
                  <p style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500, margin: "4px 0" }}>{alert.focusTitle}</p>
                  <p style={{ color: "#d1d5db", fontSize: 12, margin: "4px 0" }}>{alert.message}</p>
                  {alert.evidence && alert.evidence.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {alert.evidence.map(function(ev, ei) {
                        return <p key={ei} style={{ color: "#94a3b8", fontSize: 11, margin: "2px 0", paddingLeft: 8, borderLeft: "2px solid #4b5563" }}>{ev}</p>;
                      })}
                    </div>
                  )}
                  <p style={{ color: "#6b7280", fontSize: 11, fontStyle: "italic", marginTop: 6 }}>{alert.suggestedAction}</p>
                  <div style={{ marginTop: 8 }}>
                    <Button variant="ghost" onClick={function() { onAction("trend_analysis", { focusId: alert.focusId }); }}>
                      View Trends
                    </Button>
                  </div>
                </div>
              );
            })}
          </UICard>
        )}

        <UICard accent="gray" header="Area Health Status">
          <DataTable
            columns={[
              { key: "title", label: "Focus Area", sortable: true },
              { key: "status", label: "Status", sortable: true, render: function(row) {
                var dc = driftColors[row.status] || driftColors.healthy;
                return (
                  <span style={{ padding: "2px 8px", borderRadius: 12, background: dc.bg, color: dc.text, fontSize: 11, fontWeight: 500 }}>
                    {dc.label}
                  </span>
                );
              }},
              { key: "velocity", label: "Velocity", sortable: true, render: function(row) {
                return <span style={{ color: row.velocity > 3 ? "#4ade80" : row.velocity > 0 ? "#fbbf24" : "#f87171" }}>{row.velocity} pts/day</span>;
              }},
              { key: "engagementScore", label: "Engagement", sortable: true },
              { key: "progress", label: "Progress", sortable: true, render: function(row) {
                return <span>{row.progress}%</span>;
              }}
            ]}
            data={areaStatuses}
            striped
          />
        </UICard>

        <Button variant="outline" onClick={function() { onAction("dashboard", {}); }}>Back to Dashboard</Button>
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // ── EVALUATION REPORT VIEW ──
  // ═════════════════════════════════════════════
  if (isEvalReport) {
    var findings = data.findings || [];
    var evalMetrics = data.metrics || {};
    var delta = data.delta;
    var strengthCount = 0, gapCount = 0, riskCount = 0, oppCount = 0;
    for (var fi = 0; fi < findings.length; fi++) {
      if (findings[fi].category === "strength") strengthCount++;
      else if (findings[fi].category === "gap") gapCount++;
      else if (findings[fi].category === "risk") riskCount++;
      else if (findings[fi].category === "opportunity") oppCount++;
    }

    return (
      <div className="space-y-4">
        <UICard accent="purple" header={"Evaluation Report — " + (data.focusTitle || "")}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <Stat label="Understanding" value={fmtPct(evalMetrics.understanding)} accent="emerald" />
            <Stat label="Progress" value={fmtPct(evalMetrics.progress)} accent="purple" />
            <Stat label="Confidence" value={fmtPct(evalMetrics.confidence)} accent="blue" />
            <Stat label="Sprints" value={evalMetrics.sprintCount || 0} accent="cyan" />
            <Stat label="Age" value={(evalMetrics.daysSinceCreation || 0) + "d"} accent="gray" />
          </div>
          {delta && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "#0f172a", border: "1px solid #1e293b", marginBottom: 8 }}>
              <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>{delta.summary || "No previous evaluation to compare"}</p>
              {delta.metricsChange && (
                <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                  {Object.keys(delta.metricsChange).map(function(mk) {
                    var change = delta.metricsChange[mk];
                    if (!change) return null;
                    return (
                      <span key={mk} style={{ color: change > 0 ? "#4ade80" : change < 0 ? "#f87171" : "#94a3b8", fontSize: 11, fontWeight: 500 }}>
                        {mk}: {change > 0 ? "+" : ""}{change}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </UICard>

        <UICard accent="gray" header={"Findings (" + findings.length + ")"}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Badge variant="success">{strengthCount} Strengths</Badge>
            <Badge variant="warning">{gapCount} Gaps</Badge>
            <Badge variant="danger">{riskCount} Risks</Badge>
            <Badge variant="info">{oppCount} Opportunities</Badge>
          </div>

          {findings.map(function(f, idx) {
            var cc = categoryColors[f.category] || categoryColors.gap;
            return (
              <div key={idx} style={{ padding: "10px 14px", marginBottom: 8, borderRadius: 8, background: cc.bg, borderLeft: "3px solid " + cc.text }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ color: cc.text, fontWeight: 600, fontSize: 13 }}>
                    {cc.icon} {f.id}: {f.title}
                  </span>
                  <Badge variant={f.impact === "high" ? "danger" : f.impact === "medium" ? "warning" : "default"}>
                    {f.impact}
                  </Badge>
                </div>
                <p style={{ color: "#d1d5db", fontSize: 12, margin: "4px 0" }}>{f.detail}</p>
              </div>
            );
          })}
        </UICard>

        {data.textBriefing && (
          <Accordion items={[{
            value: "briefing",
            title: "Full Text Briefing",
            content: (
              <div style={{ color: "#d1d5db", fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {data.textBriefing}
              </div>
            )
          }]} type="single" />
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="outline" onClick={function() { onAction("dashboard", {}); }}>Back to Dashboard</Button>
          <Button variant="ghost" onClick={function() { onAction("trend_analysis", { focusId: data.focusId }); }}>Trends</Button>
          <Button variant="ghost" onClick={function() { onAction("signal_scan", { focusId: data.focusId }); }}>Signals</Button>
          {(data.allAreas || []).map(function(aa) {
            if (aa.id === data.focusId) return null;
            return (
              <Button key={aa.id} variant="ghost" onClick={function() { onAction("evaluation_report", { focusId: aa.id }); }}>
                {aa.title.length > 20 ? aa.title.substring(0, 18) + "..." : aa.title}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // ── COMPARE VIEW ──
  // ═════════════════════════════════════════════
  if (isCompare) {
    var compAreas = data.areas || [];
    var rankings = data.rankings || {};
    var radarData = data.radarData || [];

    // Build chart-friendly data
    var barData = compAreas.map(function(a) {
      return {
        name: a.title.length > 18 ? a.title.substring(0, 15) + "..." : a.title,
        Understanding: a.understanding,
        Progress: a.progress,
        Engagement: a.engagementScore
      };
    });

    return (
      <div className="space-y-4">
        <UICard accent="indigo" header="Cross-Area Comparison">
          <p style={{ color: "#94a3b8", fontSize: 12 }}>Comparing {compAreas.length} active focus areas side-by-side</p>
        </UICard>

        {barData.length > 0 && (
          <UICard accent="gray" header="Scores Overview">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} margin={{ top: 10, right: 20, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#888" fontSize={10} angle={-15} textAnchor="end" height={60} />
                <YAxis domain={[0, 100]} stroke="#888" fontSize={11} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="Understanding" fill="#4ade80" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Progress" fill="#a855f7" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Engagement" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </UICard>
        )}

        <UICard accent="gray" header="Detailed Comparison">
          <DataTable
            columns={[
              { key: "title", label: "Focus Area", sortable: true, render: function(row) {
                return <span style={{ fontSize: 12 }}>{row.title.length > 25 ? row.title.substring(0, 22) + "..." : row.title}</span>;
              }},
              { key: "understanding", label: "U%", sortable: true },
              { key: "progress", label: "P%", sortable: true },
              { key: "engagementScore", label: "Eng", sortable: true, render: function(row) {
                return <span style={{ color: row.engagementScore >= 60 ? "#4ade80" : row.engagementScore >= 35 ? "#fbbf24" : "#f87171", fontWeight: 600 }}>{row.engagementScore}</span>;
              }},
              { key: "velocity", label: "Vel", sortable: true, render: function(row) {
                return <span style={{ color: row.velocity > 3 ? "#4ade80" : "#fbbf24" }}>{row.velocity}</span>;
              }},
              { key: "driftStatus", label: "Drift", sortable: true, render: function(row) {
                var dc = driftColors[row.driftStatus] || driftColors.healthy;
                return <span style={{ padding: "2px 6px", borderRadius: 10, background: dc.bg, color: dc.text, fontSize: 10 }}>{dc.label}</span>;
              }},
              { key: "sprintCount", label: "Sprints", sortable: true }
            ]}
            data={compAreas}
            striped
          />
        </UICard>

        {rankings.byProgress && (
          <UICard accent="gray" header="Rankings">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "By Progress", key: "byProgress", icon: "\u{1F3C6}" },
                { label: "By Understanding", key: "byUnderstanding", icon: "\u{1F9E0}" },
                { label: "By Engagement", key: "byEngagement", icon: "\u{1F525}" },
                { label: "By Velocity", key: "byVelocity", icon: "\u{1F680}" }
              ].map(function(rank) {
                var ids = rankings[rank.key] || [];
                return (
                  <div key={rank.key} style={{ padding: "10px 12px", borderRadius: 8, background: "#0f172a", border: "1px solid #1e293b" }}>
                    <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>{rank.icon} {rank.label}</div>
                    {ids.map(function(id, idx) {
                      var area = compAreas.find(function(a) { return a.id === id; });
                      var name = area ? (area.title.length > 22 ? area.title.substring(0, 19) + "..." : area.title) : id;
                      return (
                        <div key={id} style={{ color: idx === 0 ? "#4ade80" : "#d1d5db", fontSize: 12, padding: "2px 0" }}>
                          {idx + 1}. {name}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" onClick={function() { onAction("dashboard", {}); }}>Back to Dashboard</Button>
          <Button variant="outline" onClick={function() { onAction("drift_scan", {}); }}>Run Drift Scan</Button>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // ── FALLBACK ──
  // ═════════════════════════════════════════════
  return (
    <UICard accent="blue" header="Focus Evaluator">
      <p style={{ color: "#94a3b8" }}>Loading evaluation dashboard...</p>
      <Button variant="primary" onClick={function() { onAction("dashboard", {}); }}>
        Open Dashboard
      </Button>
    </UICard>
  );
}
