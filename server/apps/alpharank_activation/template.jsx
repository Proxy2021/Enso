export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var categoryColor = function(cat) {
    var map = { setup: "cyan", data: "blue", features: "purple", model: "amber", backtest: "orange", gate: "rose", analysis: "emerald", docs: "gray", planning: "indigo" };
    return map[cat] || "gray";
  };
  var categoryIcon = function(cat) {
    var map = {
      setup: LucideReact.Settings,
      data: LucideReact.Database,
      features: LucideReact.Layers,
      model: LucideReact.Brain,
      backtest: LucideReact.LineChart,
      gate: LucideReact.ShieldCheck,
      analysis: LucideReact.Search,
      docs: LucideReact.FileText,
      planning: LucideReact.Map
    };
    return map[cat] || LucideReact.Circle;
  };
  var statusStyle = function(st) {
    if (st === "done") return { bg: "rgba(16,185,129,0.15)", border: "#10b981", text: "#10b981" };
    if (st === "today") return { bg: "rgba(59,130,246,0.15)", border: "#3b82f6", text: "#3b82f6" };
    if (st === "partial") return { bg: "rgba(245,158,11,0.15)", border: "#f59e0b", text: "#f59e0b" };
    if (st === "blocked") return { bg: "rgba(244,63,94,0.15)", border: "#f43f5e", text: "#f43f5e" };
    return { bg: "rgba(100,116,139,0.08)", border: "#334155", text: "#64748b" };
  };
  var fmtHours = function(h) {
    if (!h && h !== 0) return "—";
    return h + "h";
  };
  var fmtPct = function(v) {
    if (v === null || v === undefined) return "—";
    if (typeof v === "number" && Math.abs(v) < 1) return (v * 100).toFixed(1) + "%";
    return String(v);
  };

  // ── Tool detection ──
  var tool = data && data.tool ? data.tool : "";
  var isToday = tool === "enso_alpharank_activation_today";
  var isProgress = tool === "enso_alpharank_activation_progress";
  var isCheckin = tool === "enso_alpharank_activation_checkin";
  var isMetrics = tool === "enso_alpharank_activation_metrics";
  var isBlockers = tool === "enso_alpharank_activation_blockers";
  var isMutationCheckin = isCheckin && data.success !== undefined;
  var isMutationMetric = isMetrics && data.action === "update";
  var isMutationBlocker = isBlockers && (data.action === "add" || data.action === "resolve");

  // ── Mutation confirmations ──
  if (isMutationCheckin) {
    var CheckIcon = data.success ? LucideReact.CheckCircle : LucideReact.XCircle;
    return (
      <div style={{ padding: "12px" }}>
        <UICard accent={data.success ? "emerald" : "rose"}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            {React.createElement(CheckIcon, { size: 20, style: { color: data.success ? "#10b981" : "#f43f5e" } })}
            <span style={{ fontWeight: 600, fontSize: "15px", color: "#e2e8f0" }}>
              {data.success ? "Check-in Recorded" : "Check-in Failed"}
            </span>
          </div>
          {data.success && (
            <div>
              <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                <Stat label="Day" value={"Day " + data.day} accent="blue" />
                <Stat label="Status" value={data.status} accent={data.status === "done" ? "emerald" : "amber"} />
                <Stat label="Streak" value={data.streak + " days"} accent="purple" />
              </div>
              {data.notes && (
                <div style={{ background: "rgba(100,116,139,0.1)", borderRadius: "8px", padding: "10px", marginBottom: "12px" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "4px" }}>NOTES</div>
                  <div style={{ fontSize: "13px", color: "#cbd5e1" }}>{data.notes}</div>
                </div>
              )}
              {data.hoursSpent > 0 && (
                <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>
                  {"Time spent: " + data.hoursSpent + "h (velocity ratio: " + data.velocity.ratio + "x)"}
                </div>
              )}
              {data.nextDay && (
                <div style={{ background: "rgba(59,130,246,0.1)", borderRadius: "8px", padding: "10px", marginBottom: "12px" }}>
                  <div style={{ fontSize: "11px", color: "#3b82f6", marginBottom: "2px" }}>NEXT UP</div>
                  <div style={{ fontSize: "14px", color: "#e2e8f0", fontWeight: 500 }}>
                    {"Day " + data.nextDay + ": " + data.nextTitle}
                  </div>
                </div>
              )}
            </div>
          )}
          {data.error && <p style={{ color: "#f43f5e", fontSize: "13px" }}>{data.error}</p>}
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <Button variant="primary" onClick={function() { onAction("today", {}); }}>Today's Task</Button>
            <Button variant="ghost" onClick={function() { onAction("progress", {}); }}>Full Progress</Button>
          </div>
        </UICard>
      </div>
    );
  }

  if (isMutationMetric) {
    return (
      <div style={{ padding: "12px" }}>
        <UICard accent={data.success ? "emerald" : "rose"}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            {React.createElement(data.success ? LucideReact.CheckCircle : LucideReact.XCircle, { size: 20, style: { color: data.success ? "#10b981" : "#f43f5e" } })}
            <span style={{ fontWeight: 600, fontSize: "15px", color: "#e2e8f0" }}>
              {data.success ? "Metric Updated" : "Update Failed"}
            </span>
          </div>
          <p style={{ color: "#94a3b8", fontSize: "14px" }}>{data.message || data.error}</p>
          <Button variant="primary" onClick={function() { onAction("metrics", {}); }} style={{ marginTop: "12px" }}>View All Metrics</Button>
        </UICard>
      </div>
    );
  }

  if (isMutationBlocker) {
    return (
      <div style={{ padding: "12px" }}>
        <UICard accent={data.success ? "emerald" : "rose"}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            {React.createElement(data.success ? LucideReact.CheckCircle : LucideReact.XCircle, { size: 20, style: { color: data.success ? "#10b981" : "#f43f5e" } })}
            <span style={{ fontWeight: 600, fontSize: "15px", color: "#e2e8f0" }}>
              {data.message || data.error}
            </span>
          </div>
          <Button variant="primary" onClick={function() { onAction("blockers", {}); }} style={{ marginTop: "8px" }}>View All Blockers</Button>
        </UICard>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // TODAY VIEW
  // ══════════════════════════════════════════════
  if (isToday && data.task) {
    var task = data.task;
    var CatIcon = categoryIcon(task.category);
    var dayPct = data.percentComplete || 0;

    return (
      <div style={{ padding: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          {React.createElement(LucideReact.Zap, { size: 22, style: { color: "#f59e0b" } })}
          <div>
            <div style={{ fontWeight: 800, fontSize: "17px", color: "#e2e8f0" }}>AlphaRank Activation</div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>30-Day Phase 1 Sprint</div>
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              {"Day " + data.currentDay + " of 30 — " + dayPct + "% complete"}
            </span>
            {data.streak > 0 && (
              <Badge variant="warning">{"Streak: " + data.streak + " days"}</Badge>
            )}
          </div>
          <Progress value={dayPct} max={100} variant="blue" showLabel />
        </div>

        <UICard accent={categoryColor(task.category)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {React.createElement(CatIcon, { size: 20, style: { color: "#e2e8f0" } })}
              <div>
                <div style={{ fontWeight: 700, fontSize: "16px", color: "#e2e8f0" }}>
                  {"Day " + task.day + ": " + task.title}
                </div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                  {"Week " + task.week + " — " + task.weekLabel}
                </div>
              </div>
            </div>
            <Badge variant="info">{fmtHours(task.estimatedHours)}</Badge>
          </div>

          <p style={{ fontSize: "13px", color: "#cbd5e1", lineHeight: "1.5", margin: "0 0 16px 0" }}>
            {task.description}
          </p>

          {!data.prerequisitesMet && (
            <div style={{ background: "rgba(244,63,94,0.1)", borderRadius: "8px", padding: "10px", marginBottom: "12px", border: "1px solid rgba(244,63,94,0.3)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {React.createElement(LucideReact.AlertTriangle, { size: 14, style: { color: "#f43f5e" } })}
                <span style={{ fontSize: "12px", color: "#f43f5e", fontWeight: 600 }}>Prerequisites not complete</span>
              </div>
            </div>
          )}

          {task.prerequisites && task.prerequisites.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>PREREQUISITES</div>
              {task.prerequisites.map(function(p, i) {
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "3px 0" }}>
                    {React.createElement(data.prerequisitesMet ? LucideReact.CheckCircle : LucideReact.Circle, { size: 14, style: { color: data.prerequisitesMet ? "#10b981" : "#64748b" } })}
                    <span style={{ fontSize: "13px", color: data.prerequisitesMet ? "#94a3b8" : "#cbd5e1" }}>{p}</span>
                  </div>
                );
              })}
            </div>
          )}

          {task.deliverables && task.deliverables.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>DELIVERABLES</div>
              {task.deliverables.map(function(d, i) {
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "3px 0" }}>
                    {React.createElement(LucideReact.Target, { size: 14, style: { color: "#3b82f6" } })}
                    <span style={{ fontSize: "13px", color: "#cbd5e1" }}>{d}</span>
                  </div>
                );
              })}
            </div>
          )}

          <Separator />

          <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
            <Button variant="primary" onClick={function() { onAction("checkin", { status: "done", day: task.day }); }}>
              Mark Complete
            </Button>
            <Button variant="outline" onClick={function() { onAction("checkin", { status: "partial", day: task.day }); }}>
              Partial
            </Button>
            <Button variant="danger" onClick={function() { onAction("checkin", { status: "blocked", day: task.day }); }}>
              Blocked
            </Button>
            <Button variant="ghost" onClick={function() { onAction("progress", {}); }}>
              Full Plan
            </Button>
          </div>
        </UICard>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // PROGRESS VIEW
  // ══════════════════════════════════════════════
  if (isProgress && data.weeks) {
    var weeks = data.weeks || [];

    return (
      <div style={{ padding: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          {React.createElement(LucideReact.BarChart3, { size: 22, style: { color: "#3b82f6" } })}
          <div>
            <div style={{ fontWeight: 800, fontSize: "17px", color: "#e2e8f0" }}>30-Day Activation Progress</div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>
              {"Started: " + (data.startDate || "Not started") + " | Est. completion: " + (data.estimatedCompletion || "TBD")}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          <Stat label="Completed" value={data.daysCompleted + "/30"} accent="emerald" />
          <Stat label="Progress" value={data.percentComplete + "%"} accent="blue" />
          <Stat label="Streak" value={data.streak + " days"} accent="amber" />
          <Stat label="Velocity" value={data.velocity ? (data.velocity.ratio + "x") : "—"} accent={data.velocity && data.velocity.ratio >= 0.9 ? "emerald" : "rose"} />
        </div>

        <Progress value={data.percentComplete || 0} max={100} variant="blue" showLabel />

        <div style={{ marginTop: "4px", marginBottom: "16px", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            {data.totalActualHours ? ("Actual: " + data.totalActualHours + "h") : ""}
          </span>
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            {"Total planned: " + (data.totalPlannedHours || 95) + "h"}
          </span>
        </div>

        {weeks.map(function(week) {
          var weekDone = 0;
          var weekTotal = week.days.length;
          for (var wd = 0; wd < week.days.length; wd++) {
            if (week.days[wd].status === "done") weekDone++;
          }
          var weekPct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;

          return (
            <UICard key={week.number} accent={weekPct === 100 ? "emerald" : weekPct > 0 ? "blue" : "gray"} style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#e2e8f0" }}>
                    {"Week " + week.number + ": " + week.label}
                  </span>
                </div>
                <Badge variant={weekPct === 100 ? "success" : weekPct > 0 ? "info" : "outline"}>
                  {weekDone + "/" + weekTotal}
                </Badge>
              </div>

              <Progress value={weekPct} max={100} variant={weekPct === 100 ? "emerald" : "blue"} />

              <div style={{ marginTop: "8px" }}>
                {week.days.map(function(dayItem) {
                  var st = statusStyle(dayItem.status);
                  return (
                    <div
                      key={dayItem.day}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        marginTop: "4px",
                        borderRadius: "6px",
                        background: st.bg,
                        borderLeft: "3px solid " + st.border,
                        cursor: dayItem.status === "today" ? "pointer" : "default"
                      }}
                      onClick={dayItem.status === "today" ? function() { onAction("today", {}); } : undefined}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {dayItem.status === "done" && React.createElement(LucideReact.CheckCircle, { size: 14, style: { color: "#10b981" } })}
                        {dayItem.status === "today" && React.createElement(LucideReact.Play, { size: 14, style: { color: "#3b82f6" } })}
                        {dayItem.status === "partial" && React.createElement(LucideReact.Clock, { size: 14, style: { color: "#f59e0b" } })}
                        {dayItem.status === "blocked" && React.createElement(LucideReact.XCircle, { size: 14, style: { color: "#f43f5e" } })}
                        {dayItem.status === "upcoming" && React.createElement(LucideReact.Circle, { size: 14, style: { color: "#475569" } })}
                        <span style={{ fontSize: "13px", color: st.text === "#64748b" ? "#94a3b8" : st.text, fontWeight: dayItem.status === "today" ? 600 : 400 }}>
                          {"Day " + dayItem.day + ": " + dayItem.title}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Badge variant={categoryColor(dayItem.category)} style={{ fontSize: "10px" }}>
                          {dayItem.category}
                        </Badge>
                        <span style={{ fontSize: "11px", color: "#64748b", minWidth: "24px", textAlign: "right" }}>
                          {dayItem.actualHours ? (dayItem.actualHours + "h") : (dayItem.estimatedHours + "h")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </UICard>
          );
        })}

        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <Button variant="primary" onClick={function() { onAction("today", {}); }}>Today's Task</Button>
          <Button variant="ghost" onClick={function() { onAction("metrics", {}); }}>Metrics</Button>
          <Button variant="ghost" onClick={function() { onAction("blockers", {}); }}>Blockers</Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // METRICS VIEW
  // ══════════════════════════════════════════════
  if (isMetrics && data.metrics) {
    var mKeys = ["ic", "icir", "sharpe", "max_dd", "pbo", "cagr", "turnover"];
    var mData = data.metrics;
    var gates = data.gates || [];

    // Build chart data from history
    var hasHistory = false;
    var chartData = [];
    for (var mi = 0; mi < mKeys.length; mi++) {
      var mk = mKeys[mi];
      if (mData[mk] && mData[mk].history && mData[mk].history.length > 0) {
        hasHistory = true;
      }
    }

    if (hasHistory) {
      // Merge all dates
      var dateSet = {};
      for (var di = 0; di < mKeys.length; di++) {
        var dm = mData[mKeys[di]];
        if (dm && dm.history) {
          for (var dh = 0; dh < dm.history.length; dh++) {
            dateSet[dm.history[dh].date] = true;
          }
        }
      }
      var dates = Object.keys(dateSet).sort();
      for (var dd = 0; dd < dates.length; dd++) {
        var point = { date: dates[dd] };
        for (var pk = 0; pk < mKeys.length; pk++) {
          var pm = mData[mKeys[pk]];
          if (pm && pm.history) {
            for (var ph = 0; ph < pm.history.length; ph++) {
              if (pm.history[ph].date === dates[dd]) {
                point[mKeys[pk]] = pm.history[ph].value;
              }
            }
          }
        }
        chartData.push(point);
      }
    }

    return (
      <div style={{ padding: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          {React.createElement(LucideReact.Activity, { size: 22, style: { color: "#10b981" } })}
          <div>
            <div style={{ fontWeight: 800, fontSize: "17px", color: "#e2e8f0" }}>Performance Metrics</div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>GO/NO-GO gate tracking and metric evolution</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          {mKeys.map(function(mk) {
            var m = mData[mk];
            if (!m) return null;
            var hasVal = m.current !== null && m.current !== undefined;
            var isGood = false;
            if (hasVal) {
              if (m.lowerIsBetter) {
                isGood = m.current <= m.target;
              } else {
                isGood = m.current >= m.target;
              }
            }
            return (
              <UICard key={mk} accent={hasVal ? (isGood ? "emerald" : "amber") : "gray"}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: hasVal ? (isGood ? "#10b981" : "#f59e0b") : "#475569", fontFamily: "monospace" }}>
                    {hasVal ? fmtPct(m.current) : "—"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                    {"Target: " + fmtPct(m.target)}
                  </div>
                </div>
              </UICard>
            );
          })}
        </div>

        {hasHistory && chartData.length > 1 && (
          <UICard accent="blue" style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", marginBottom: "8px" }}>Metric Evolution</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip />
                <Line type="monotone" dataKey="ic" stroke="#3b82f6" name="IC" dot={false} />
                <Line type="monotone" dataKey="sharpe" stroke="#10b981" name="Sharpe" dot={false} />
                <Line type="monotone" dataKey="cagr" stroke="#f59e0b" name="CAGR" dot={false} />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </UICard>
        )}

        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", marginBottom: "10px" }}>GO/NO-GO Gates</div>
          {gates.map(function(gate) {
            var gateColor = gate.status === "pass" ? "emerald" : gate.status === "fail" ? "rose" : "gray";
            var GateIcon = gate.status === "pass" ? LucideReact.CheckCircle : gate.status === "fail" ? LucideReact.XCircle : LucideReact.Clock;
            return (
              <UICard key={gate.id} accent={gateColor} style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  {React.createElement(GateIcon, { size: 18, style: { color: gate.status === "pass" ? "#10b981" : gate.status === "fail" ? "#f43f5e" : "#64748b" } })}
                  <span style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>{gate.label}</span>
                  <Badge variant={gate.status === "pass" ? "success" : gate.status === "fail" ? "danger" : "outline"}>
                    {gate.status === "pass" ? "PASS" : gate.status === "fail" ? "NOT MET" : "PENDING"}
                  </Badge>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                  {gate.criteria.map(function(c, ci) {
                    return (
                      <div key={ci} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0" }}>
                        {c.pass
                          ? React.createElement(LucideReact.CheckCircle, { size: 14, style: { color: "#10b981" } })
                          : React.createElement(LucideReact.Circle, { size: 14, style: { color: "#475569" } })
                        }
                        <span style={{ fontSize: "12px", color: c.pass ? "#10b981" : "#94a3b8" }}>
                          {c.metric + " " + c.target}
                        </span>
                        {c.current !== null && c.current !== undefined && (
                          <span style={{ fontSize: "11px", color: "#64748b", fontFamily: "monospace" }}>
                            {"(" + fmtPct(c.current) + ")"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </UICard>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <Button variant="primary" onClick={function() { onAction("today", {}); }}>Today</Button>
          <Button variant="ghost" onClick={function() { onAction("progress", {}); }}>Progress</Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // BLOCKERS VIEW
  // ══════════════════════════════════════════════
  if (isBlockers) {
    var blockerList = data.blockers || [];
    var stats = data.stats || {};
    var catLabels = { data_quality: "Data Quality", package_compat: "Package Compat", config: "Config", performance: "Performance", api: "API", other: "Other" };

    return (
      <div style={{ padding: "4px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          {React.createElement(LucideReact.AlertTriangle, { size: 22, style: { color: "#f59e0b" } })}
          <div>
            <div style={{ fontWeight: 800, fontSize: "17px", color: "#e2e8f0" }}>Blocker Log</div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>Track and resolve technical blockers</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          <Stat label="Total" value={stats.total || 0} accent="gray" />
          <Stat label="Open" value={stats.open || 0} accent={stats.open > 0 ? "rose" : "emerald"} />
          <Stat label="Resolved" value={stats.resolved || 0} accent="emerald" />
          <Stat label="Hours Lost" value={fmtHours(stats.totalHoursLost || 0)} accent="amber" />
        </div>

        {stats.byCategory && Object.keys(stats.byCategory).length > 0 && (
          <UICard accent="gray" style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0", marginBottom: "8px" }}>By Category</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {Object.keys(stats.byCategory).map(function(cat) {
                return (
                  <Badge key={cat} variant="info">
                    {(catLabels[cat] || cat) + ": " + stats.byCategory[cat]}
                  </Badge>
                );
              })}
            </div>
          </UICard>
        )}

        {blockerList.length === 0 && (
          <EmptyState
            icon={LucideReact.CheckCircle}
            title="No Blockers"
            description="No blockers logged yet. That's great progress!"
          />
        )}

        {blockerList.map(function(b) {
          var isOpen = b.status === "open";
          return (
            <UICard key={b.id} accent={isOpen ? "rose" : "emerald"} style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    {React.createElement(isOpen ? LucideReact.AlertCircle : LucideReact.CheckCircle, { size: 16, style: { color: isOpen ? "#f43f5e" : "#10b981" } })}
                    <span style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>{b.title}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
                    <Badge variant="info">{catLabels[b.category] || b.category}</Badge>
                    <Badge variant={isOpen ? "danger" : "success"}>{isOpen ? "Open" : "Resolved"}</Badge>
                    {b.hoursLost > 0 && <Badge variant="warning">{b.hoursLost + "h lost"}</Badge>}
                  </div>
                  {b.description && (
                    <p style={{ fontSize: "13px", color: "#94a3b8", margin: "4px 0" }}>{b.description}</p>
                  )}
                  {b.solution && (
                    <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: "6px", padding: "8px", marginTop: "6px" }}>
                      <div style={{ fontSize: "11px", color: "#10b981", fontWeight: 600, marginBottom: "2px" }}>SOLUTION</div>
                      <div style={{ fontSize: "13px", color: "#cbd5e1" }}>{b.solution}</div>
                    </div>
                  )}
                </div>
                {isOpen && (
                  <Button variant="outline" onClick={function() { onAction("blockers", { action: "resolve", blockerId: b.id, solution: "Resolved" }); }} style={{ flexShrink: 0, marginLeft: "8px" }}>
                    Resolve
                  </Button>
                )}
              </div>
            </UICard>
          );
        })}

        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <Button variant="primary" onClick={function() { onAction("today", {}); }}>Today</Button>
          <Button variant="ghost" onClick={function() { onAction("progress", {}); }}>Progress</Button>
          <Button variant="ghost" onClick={function() { onAction("metrics", {}); }}>Metrics</Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // FALLBACK / EMPTY STATE
  // ══════════════════════════════════════════════
  return (
    <EmptyState
      icon={LucideReact.Zap}
      title="AlphaRank Activation Tracker"
      description="30-day Phase 1 execution dashboard. Start by viewing today's task."
      action={<Button variant="primary" onClick={function() { onAction("today", {}); }}>Start Today</Button>}
    />
  );
}
