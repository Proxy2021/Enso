export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var fmtPct = function(v) {
    if (v === null || v === undefined) return "—";
    return (v * 100).toFixed(2) + "%";
  };
  var fmtDec = function(v, d) {
    if (v === null || v === undefined) return "—";
    return Number(v).toFixed(d || 3);
  };
  var fmtDate = function(d) {
    if (!d) return "";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d).substring(0, 10);
      return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch(e) { return String(d).substring(0, 10); }
  };

  // ── All hooks at top level ──
  var selectedModelState = useState(null);
  var selectedModel = selectedModelState[0];
  var setSelectedModel = selectedModelState[1];

  var checkNotesState = useState({});
  var checkNotes = checkNotesState[0];
  var setCheckNotes = checkNotesState[1];

  var editingNoteState = useState(null);
  var editingNote = editingNoteState[0];
  var setEditingNote = editingNoteState[1];

  var expandedGateState = useState(null);
  var expandedGate = expandedGateState[0];
  var setExpandedGate = expandedGateState[1];

  // ── View detection ──
  var isScorecard = data && data.tool === "enso_alpharank_validation_scorecard";
  var isFeatures = data && data.tool === "enso_alpharank_validation_features";
  var isDiagnose = data && data.tool === "enso_alpharank_validation_diagnose";
  var isChecklist = data && data.tool === "enso_alpharank_validation_checklist";
  var isCompare = data && data.tool === "enso_alpharank_validation_compare";
  var isGates = data && data.tool === "enso_alpharank_validation_gates";

  // ── Error view ──
  if (data && data.error) {
    return (
      <UICard accent="red" header="Error">
        <p style={{ color: "#f87171" }}>{data.error}</p>
        <Button variant="outline" onClick={function() { onAction("scorecard", {}); }}>Back to Scorecard</Button>
      </UICard>
    );
  }

  // ════════════════════════════════════════════
  // SCORECARD VIEW
  // ════════════════════════════════════════════
  if (isScorecard) {
    var models = data.models || [];
    var summary = data.summary || {};
    var isPass = summary.passingModels === summary.totalModels;

    // Prepare chart data for train vs test IC
    var chartData = [];
    for (var ci = 0; ci < models.length; ci++) {
      chartData.push({
        name: models[ci].name,
        trainIC: models[ci].trainIC,
        testIC: models[ci].testIC
      });
    }

    // Gate check helper
    var gateIcon = function(pass) {
      return pass
        ? React.createElement("span", { style: { color: "#22c55e", fontWeight: "bold" } }, "✓")
        : React.createElement("span", { style: { color: "#ef4444", fontWeight: "bold" } }, "✗");
    };

    return (
      <div className="space-y-4">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#f1f5f9", margin: 0 }}>AlphaRank Validation Scorecard</h2>
            <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "4px 0 0" }}>Updated: {fmtDate(data.updatedAt)}</p>
          </div>
          <Badge variant={isPass ? "success" : "danger"}>{isPass ? "ALL PASS" : "FAILING"}</Badge>
        </div>

        {/* Summary Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          <Stat label="Models" value={summary.totalModels || 0} accent="blue" />
          <Stat label="Passing" value={summary.passingModels || 0} accent={summary.passingModels > 0 ? "emerald" : "red"} />
          <Stat label="Avg Test IC" value={fmtDec(summary.avgTestIC, 4)} accent={summary.avgTestIC >= 0.03 ? "emerald" : "red"} />
          <Stat label="Avg Gap" value={fmtDec(summary.avgTrainTestGap, 1) + "x"} accent={summary.avgTrainTestGap < 3 ? "emerald" : "red"} />
        </div>

        {/* Verdict */}
        <UICard accent={isPass ? "emerald" : "red"}>
          <p style={{ fontSize: "0.875rem", fontWeight: "600", color: isPass ? "#22c55e" : "#ef4444" }}>
            {summary.overallVerdict || "No verdict"}
          </p>
        </UICard>

        {/* Train vs Test IC Chart */}
        <UICard header="Train vs Test IC by Model">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "6px" }} />
              <Bar dataKey="trainIC" name="Train IC" fill="#60a5fa" radius={[4, 4, 0, 0]} />
              <Bar dataKey="testIC" name="Test IC" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        </UICard>

        {/* Model Details Table */}
        <UICard header="Model Horizons">
          <DataTable
            columns={[
              { key: "name", label: "Model", sortable: true },
              { key: "horizon", label: "Horizon" },
              { key: "testIC", label: "Test IC", sortable: true, render: function(row) {
                return React.createElement("span", { style: { color: row.testIC >= 0.03 ? "#22c55e" : "#ef4444", fontWeight: "600" } }, fmtDec(row.testIC, 4));
              }},
              { key: "icir", label: "ICIR", sortable: true, render: function(row) {
                return React.createElement("span", { style: { color: row.icir >= 0.5 ? "#22c55e" : "#ef4444" } }, fmtDec(row.icir, 2));
              }},
              { key: "pbo", label: "PBO", sortable: true, render: function(row) {
                return React.createElement("span", { style: { color: row.pbo < 0.5 ? "#22c55e" : "#ef4444" } }, fmtDec(row.pbo, 2));
              }},
              { key: "sharpe", label: "Sharpe", sortable: true, render: function(row) {
                return React.createElement("span", { style: { color: row.sharpe >= 0.5 ? "#22c55e" : "#ef4444" } }, fmtDec(row.sharpe, 2));
              }},
              { key: "annualReturn", label: "Return", render: function(row) {
                return React.createElement("span", { style: { color: row.annualReturn >= 0 ? "#22c55e" : "#ef4444" } }, fmtPct(row.annualReturn));
              }},
              { key: "gates", label: "Gates", render: function(row) {
                var g = row.gates || {};
                var passCount = 0;
                if (g.ic && g.ic.pass) passCount++;
                if (g.icir && g.icir.pass) passCount++;
                if (g.pbo && g.pbo.pass) passCount++;
                if (g.sharpe && g.sharpe.pass) passCount++;
                return React.createElement(Badge, { variant: passCount === 4 ? "success" : passCount >= 2 ? "warning" : "danger" }, passCount + "/4");
              }}
            ]}
            data={models}
            pageSize={12}
            striped
          />
        </UICard>

        {/* Navigation */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button variant="outline" onClick={function() { onAction("features", {}); }}>
            Feature Analysis
          </Button>
          <Button variant="outline" onClick={function() { onAction("diagnose", {}); }}>
            Diagnose Overfitting
          </Button>
          <Button variant="outline" onClick={function() { onAction("checklist", {}); }}>
            Validation Checklist
          </Button>
          <Button variant="outline" onClick={function() { onAction("compare", {}); }}>
            Compare Models
          </Button>
          <Button variant="primary" onClick={function() { onAction("gates", {}); }}>
            Kill-Gate Protocol
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════
  // FEATURES VIEW
  // ════════════════════════════════════════════
  if (isFeatures) {
    var features = data.features || [];
    var catBreakdown = data.categoryBreakdown || [];
    var featSummary = data.summary || {};

    // Category colors
    var catColors = {
      value: "#22c55e", momentum: "#f97316", quality: "#60a5fa",
      volatility: "#a855f7", sentiment: "#ec4899", growth: "#eab308",
      liquidity: "#06b6d4", unknown: "#94a3b8"
    };

    // Prepare importance chart data (top 10 for bar)
    var impChartData = [];
    for (var fi = 0; fi < Math.min(features.length, 10); fi++) {
      impChartData.push({
        name: features[fi].name.replace(/_/g, " "),
        importance: features[fi].importance,
        stability: features[fi].stability
      });
    }

    // Prepare pie data for categories
    var pieData = [];
    for (var pi = 0; pi < catBreakdown.length; pi++) {
      pieData.push({
        name: catBreakdown[pi].category,
        value: catBreakdown[pi].count,
        fill: catColors[catBreakdown[pi].category] || "#94a3b8"
      });
    }

    var recColor = function(r) {
      if (r === "keep") return "#22c55e";
      if (r === "cut") return "#ef4444";
      return "#eab308";
    };

    return (
      <div className="space-y-4">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#f1f5f9", margin: 0 }}>
            Feature Importance — {data.model || "Model"}
          </h2>
          <Button variant="ghost" onClick={function() { onAction("scorecard", {}); }}>← Scorecard</Button>
        </div>

        {/* Summary row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          <Stat label="Keep" value={featSummary.keepCount || 0} accent="emerald" />
          <Stat label="Cut" value={featSummary.cutCount || 0} accent="red" />
          <Stat label="Review" value={featSummary.reviewCount || 0} accent="amber" />
          <Stat label="Top Category" value={featSummary.dominantCategory || "—"} accent="blue" />
        </div>

        {/* Unstable features warning */}
        {featSummary.unstableFeatures && featSummary.unstableFeatures.length > 0 && (
          <UICard accent="red">
            <p style={{ fontSize: "0.8rem", color: "#fca5a5", margin: 0 }}>
              <strong>Unstable features (stability &lt; 0.5):</strong> {featSummary.unstableFeatures.join(", ")}
            </p>
          </UICard>
        )}

        {/* Importance bar chart */}
        <UICard header="Top 10 by Importance">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={impChartData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" stroke="#94a3b8" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={80} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "6px" }} />
              <Bar dataKey="importance" name="Importance" fill="#60a5fa" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </UICard>

        {/* Category breakdown pie */}
        <UICard header="Category Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={function(entry) { return entry.name; }} fontSize={11}>
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "6px" }} />
            </PieChart>
          </ResponsiveContainer>
        </UICard>

        {/* Full feature table */}
        <UICard header={"All Features (" + features.length + ")"}>
          <DataTable
            columns={[
              { key: "rank", label: "#", sortable: true },
              { key: "name", label: "Feature", sortable: true },
              { key: "importance", label: "Importance", sortable: true, render: function(row) {
                return fmtDec(row.importance, 3);
              }},
              { key: "category", label: "Category", render: function(row) {
                return React.createElement(Badge, { variant: "outline" }, row.category);
              }},
              { key: "stability", label: "Stability", sortable: true, render: function(row) {
                var stab = row.stability || 0;
                var color = stab >= 0.7 ? "#22c55e" : stab >= 0.5 ? "#eab308" : "#ef4444";
                return React.createElement("span", { style: { color: color, fontWeight: "600" } }, fmtDec(stab, 2));
              }},
              { key: "recommendation", label: "Action", render: function(row) {
                var v = row.recommendation === "keep" ? "success" : row.recommendation === "cut" ? "danger" : "warning";
                return React.createElement(Badge, { variant: v }, row.recommendation);
              }}
            ]}
            data={features}
            pageSize={10}
            striped
          />
        </UICard>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button variant="outline" onClick={function() { onAction("diagnose", {}); }}>Diagnose Overfitting</Button>
          <Button variant="outline" onClick={function() { onAction("compare", {}); }}>Compare Models</Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════
  // DIAGNOSE VIEW
  // ════════════════════════════════════════════
  if (isDiagnose) {
    var ttc = data.trainTestComparison || {};
    var decayCurve = data.icDecayCurve || [];
    var rollingIC = data.rollingIC || [];
    var dof = data.degreesOfFreedom || {};
    var recs = data.recommendations || [];

    var sevColor = function(sev) {
      if (sev === "critical") return "#ef4444";
      if (sev === "high") return "#f97316";
      return "#eab308";
    };
    var sevBadge = function(sev) {
      if (sev === "critical") return "danger";
      if (sev === "high") return "warning";
      return "info";
    };

    // Rolling IC chart data
    var rollingChartData = [];
    for (var ri = 0; ri < rollingIC.length; ri++) {
      rollingChartData.push({
        date: rollingIC[ri].date,
        ic: rollingIC[ri].ic,
        upper: rollingIC[ri].upper,
        lower: rollingIC[ri].lower
      });
    }

    // IC Decay chart data
    var decayChartData = [];
    for (var di = 0; di < decayCurve.length; di++) {
      decayChartData.push({
        period: decayCurve[di].period,
        ic: decayCurve[di].ic
      });
    }

    return (
      <div className="space-y-4">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#f1f5f9", margin: 0 }}>
            Overfitting Diagnostic — {data.model || "Model"}
          </h2>
          <Button variant="ghost" onClick={function() { onAction("scorecard", {}); }}>← Scorecard</Button>
        </div>

        {/* Train vs Test comparison */}
        <UICard accent="red" header="Train vs Test Gap">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            <div>
              <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>Train IC</p>
              <p style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#60a5fa", margin: "2px 0" }}>{fmtDec(ttc.trainIC, 4)}</p>
            </div>
            <div>
              <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>Test IC</p>
              <p style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#f97316", margin: "2px 0" }}>{fmtDec(ttc.testIC, 4)}</p>
            </div>
            <div>
              <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>Gap</p>
              <p style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#ef4444", margin: "2px 0" }}>{fmtDec(ttc.gap, 1)}x</p>
            </div>
          </div>
          <Separator />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginTop: "8px" }}>
            <div>
              <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>Train Sharpe</p>
              <p style={{ fontSize: "0.9rem", color: "#60a5fa", margin: "2px 0" }}>{fmtDec(ttc.trainSharpe, 2)}</p>
            </div>
            <div>
              <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>Test Sharpe</p>
              <p style={{ fontSize: "0.9rem", color: "#f97316", margin: "2px 0" }}>{fmtDec(ttc.testSharpe, 2)}</p>
            </div>
            <div>
              <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>Test Return</p>
              <p style={{ fontSize: "0.9rem", color: (ttc.testReturn || 0) >= 0 ? "#22c55e" : "#ef4444", margin: "2px 0" }}>{fmtPct(ttc.testReturn)}</p>
            </div>
          </div>
        </UICard>

        {/* Degrees of Freedom */}
        <UICard header="Degrees of Freedom">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
            <Stat label="Features" value={dof.numFeatures || "—"} accent={dof.numFeatures > 100 ? "red" : "blue"} />
            <Stat label="Trials" value={dof.numTrials || "—"} accent="blue" />
            <Stat label="Effective" value={dof.effectiveTrials || "—"} accent={dof.effectiveTrials < 20 ? "red" : "emerald"} />
            <Stat label="Data Points" value={dof.dataPoints || "—"} accent="blue" />
          </div>
        </UICard>

        {/* IC Decay Curve */}
        {decayChartData.length > 0 && (
          <UICard header="IC Decay Over Time">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={decayChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="period" stroke="#94a3b8" fontSize={10} angle={-30} textAnchor="end" height={50} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "6px" }} />
                <Line type="monotone" dataKey="ic" name="IC" stroke="#ef4444" strokeWidth={2} dot={{ fill: "#ef4444", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </UICard>
        )}

        {/* Rolling IC with confidence bands */}
        {rollingChartData.length > 0 && (
          <UICard header="Rolling IC (6-month window)">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rollingChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "6px" }} />
                <Line type="monotone" dataKey="upper" name="Upper Band" stroke="#334155" strokeDasharray="3 3" dot={false} />
                <Line type="monotone" dataKey="ic" name="IC" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316", r: 3 }} />
                <Line type="monotone" dataKey="lower" name="Lower Band" stroke="#334155" strokeDasharray="3 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </UICard>
        )}

        {/* LLM Insight */}
        {data.llmInsight && (
          <UICard accent="purple" header="AI Insight">
            <p style={{ fontSize: "0.85rem", color: "#e2e8f0", margin: 0, fontStyle: "italic" }}>{data.llmInsight}</p>
          </UICard>
        )}

        {/* Recommendations */}
        <UICard header={"Recommendations (" + recs.length + ")"}>
          <div className="space-y-2">
            {recs.map(function(rec, idx) {
              return (
                <div key={idx} style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid " + sevColor(rec.severity) + "40", backgroundColor: sevColor(rec.severity) + "10" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <Badge variant={sevBadge(rec.severity)}>{rec.severity}</Badge>
                    <span style={{ fontSize: "0.8rem", color: "#e2e8f0" }}>{rec.issue}</span>
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "4px 0 0", paddingLeft: "4px" }}>→ {rec.action}</p>
                </div>
              );
            })}
          </div>
        </UICard>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button variant="outline" onClick={function() { onAction("features", {}); }}>Feature Analysis</Button>
          <Button variant="outline" onClick={function() { onAction("checklist", {}); }}>Validation Checklist</Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════
  // CHECKLIST VIEW
  // ════════════════════════════════════════════
  if (isChecklist) {
    var items = data.items || [];
    var progress = data.progress || {};

    var statusColor = function(s) {
      if (s === "done") return "#22c55e";
      if (s === "in_progress") return "#eab308";
      return "#64748b";
    };
    var statusLabel = function(s) {
      if (s === "done") return "Done";
      if (s === "in_progress") return "In Progress";
      return "Not Started";
    };
    var nextStatus = function(s) {
      if (s === "not_started") return "in_progress";
      if (s === "in_progress") return "done";
      return "not_started";
    };

    return (
      <div className="space-y-4">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#f1f5f9", margin: 0 }}>Validation Checklist</h2>
          <Button variant="ghost" onClick={function() { onAction("scorecard", {}); }}>← Scorecard</Button>
        </div>

        {/* Progress bar */}
        <UICard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.85rem", color: "#e2e8f0" }}>Overall Progress</span>
            <Badge variant={progress.percentComplete === 100 ? "success" : progress.percentComplete > 0 ? "warning" : "outline"}>
              {progress.done || 0}/{progress.total || 0} complete
            </Badge>
          </div>
          <Progress value={progress.percentComplete || 0} max={100} variant={progress.percentComplete === 100 ? "emerald" : "blue"} showLabel />
        </UICard>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          <Stat label="Done" value={progress.done || 0} accent="emerald" />
          <Stat label="In Progress" value={progress.inProgress || 0} accent="amber" />
          <Stat label="Not Started" value={progress.notStarted || 0} accent="gray" />
        </div>

        {/* Checklist items */}
        <div className="space-y-2">
          {items.map(function(item, idx) {
            return (
              <UICard key={item.id || idx} accent={item.status === "done" ? "emerald" : item.status === "in_progress" ? "amber" : "gray"}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: "600" }}>#{item.priority || idx + 1}</span>
                      <span style={{ fontSize: "0.9rem", fontWeight: "600", color: "#f1f5f9", textDecoration: item.status === "done" ? "line-through" : "none" }}>
                        {item.label}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "2px 0" }}>{item.description}</p>
                    {item.notes && (
                      <p style={{ fontSize: "0.7rem", color: "#60a5fa", margin: "4px 0 0", fontStyle: "italic" }}>Note: {item.notes}</p>
                    )}
                    {item.completedAt && (
                      <p style={{ fontSize: "0.65rem", color: "#64748b", margin: "2px 0 0" }}>Completed: {fmtDate(item.completedAt)}</p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <Badge variant={item.status === "done" ? "success" : item.status === "in_progress" ? "warning" : "outline"}>
                      {statusLabel(item.status)}
                    </Badge>
                    <Button
                      variant="ghost"
                      onClick={function() {
                        var ns = nextStatus(item.status);
                        onAction("checklist", { action: "update", itemId: item.id, status: ns });
                      }}
                    >
                      →
                    </Button>
                  </div>
                </div>
              </UICard>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button variant="outline" onClick={function() { onAction("diagnose", {}); }}>Diagnose Overfitting</Button>
          <Button variant="outline" onClick={function() { onAction("compare", {}); }}>Compare Models</Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════
  // COMPARE VIEW
  // ════════════════════════════════════════════
  if (isCompare) {
    var configs = data.configurations || [];
    var deltas = data.deltas || [];
    var recommendation = data.recommendation || "";

    // Chart data: multi-bar for key metrics
    var compareChartData = [];
    for (var cci = 0; cci < configs.length; cci++) {
      compareChartData.push({
        name: configs[cci].version || configs[cci].name,
        testIC: configs[cci].testIC,
        sharpe: configs[cci].sharpe,
        pbo: configs[cci].pbo
      });
    }

    return (
      <div className="space-y-4">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#f1f5f9", margin: 0 }}>Model Comparison</h2>
          <Button variant="ghost" onClick={function() { onAction("scorecard", {}); }}>← Scorecard</Button>
        </div>

        {/* Recommendation */}
        {recommendation && (
          <UICard accent="emerald">
            <p style={{ fontSize: "0.85rem", color: "#bbf7d0", margin: 0, fontWeight: "500" }}>{recommendation}</p>
          </UICard>
        )}

        {/* Config summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + Math.min(configs.length, 3) + ", 1fr)", gap: "8px" }}>
          {configs.map(function(cfg, idx) {
            var passCount = 0;
            if (cfg.testIC >= 0.03) passCount++;
            if (cfg.icir >= 0.5) passCount++;
            if (cfg.pbo < 0.5) passCount++;
            if (cfg.sharpe >= 0.5) passCount++;
            var accent = passCount === 4 ? "emerald" : passCount >= 2 ? "amber" : "red";
            return (
              <UICard key={idx} accent={accent}>
                <p style={{ fontSize: "0.8rem", fontWeight: "bold", color: "#f1f5f9", margin: "0 0 6px" }}>{cfg.name}</p>
                <p style={{ fontSize: "0.65rem", color: "#94a3b8", margin: "0 0 4px" }}>{cfg.version} • {cfg.date}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                  <div>
                    <p style={{ fontSize: "0.6rem", color: "#94a3b8", margin: 0 }}>IC</p>
                    <p style={{ fontSize: "0.85rem", fontWeight: "600", color: cfg.testIC >= 0.03 ? "#22c55e" : "#ef4444", margin: 0 }}>{fmtDec(cfg.testIC, 3)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.6rem", color: "#94a3b8", margin: 0 }}>Sharpe</p>
                    <p style={{ fontSize: "0.85rem", fontWeight: "600", color: cfg.sharpe >= 0.5 ? "#22c55e" : "#ef4444", margin: 0 }}>{fmtDec(cfg.sharpe, 2)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.6rem", color: "#94a3b8", margin: 0 }}>PBO</p>
                    <p style={{ fontSize: "0.85rem", fontWeight: "600", color: cfg.pbo < 0.5 ? "#22c55e" : "#ef4444", margin: 0 }}>{fmtDec(cfg.pbo, 2)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.6rem", color: "#94a3b8", margin: 0 }}>Return</p>
                    <p style={{ fontSize: "0.85rem", fontWeight: "600", color: cfg.annualReturn >= 0 ? "#22c55e" : "#ef4444", margin: 0 }}>{fmtPct(cfg.annualReturn)}</p>
                  </div>
                </div>
                <div style={{ marginTop: "6px" }}>
                  <Badge variant={passCount === 4 ? "success" : passCount >= 2 ? "warning" : "danger"}>{passCount}/4 gates</Badge>
                </div>
              </UICard>
            );
          })}
        </div>

        {/* Comparison chart */}
        <UICard header="Key Metrics Comparison">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={compareChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "6px" }} />
              <Bar dataKey="testIC" name="Test IC" fill="#60a5fa" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sharpe" name="Sharpe" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pbo" name="PBO" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        </UICard>

        {/* Deltas table */}
        <UICard header="Metric Deltas (vs Baseline)">
          <DataTable
            columns={[
              { key: "metric", label: "Metric", sortable: true },
              { key: "baseline", label: "Baseline", render: function(row) {
                var isP = row.metric === "Annual Return" || row.metric === "Max Drawdown";
                return isP ? fmtPct(row.baseline) : fmtDec(row.baseline, 3);
              }},
              { key: "best", label: "Best", render: function(row) {
                var isP = row.metric === "Annual Return" || row.metric === "Max Drawdown";
                return React.createElement("span", { style: { color: "#22c55e", fontWeight: "600" } }, isP ? fmtPct(row.best) : fmtDec(row.best, 3));
              }},
              { key: "delta", label: "Δ", render: function(row) {
                return React.createElement("span", { style: { fontWeight: "600", color: "#60a5fa" } }, row.delta);
              }},
              { key: "winner", label: "Winner" }
            ]}
            data={deltas}
            striped
          />
        </UICard>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button variant="outline" onClick={function() { onAction("scorecard", {}); }}>Scorecard</Button>
          <Button variant="outline" onClick={function() { onAction("features", {}); }}>Feature Analysis</Button>
          <Button variant="outline" onClick={function() { onAction("checklist", {}); }}>Checklist</Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════
  // GATES VIEW (Kill-Gate Protocol)
  // ════════════════════════════════════════════
  if (isGates) {
    var gates = data.gates || [];
    var gateSummary = data.summary || {};

    var gateStatusColor = function(s) {
      if (s === "pass") return "#22c55e";
      if (s === "fail") return "#ef4444";
      if (s === "active") return "#60a5fa";
      return "#475569";
    };
    var gateStatusBadge = function(s) {
      if (s === "pass") return "success";
      if (s === "fail") return "danger";
      if (s === "active") return "info";
      return "outline";
    };
    var gateStatusLabel = function(s) {
      if (s === "pass") return "PASS";
      if (s === "fail") return "FAIL";
      if (s === "active") return "ACTIVE";
      if (s === "locked") return "LOCKED";
      return s;
    };
    var gateAccent = function(s) {
      if (s === "pass") return "emerald";
      if (s === "fail") return "red";
      if (s === "active") return "blue";
      return "gray";
    };

    var metricDisplay = function(met) {
      if (met.value === null || met.value === undefined) return "—";
      if (met.unit === "bool") return met.value === 0 ? "None" : "Detected";
      if (met.unit === "%") return fmtDec(met.value, 1) + "%";
      if (met.unit === "wk") return met.value + " wk";
      return fmtDec(met.value, 4);
    };
    var thresholdDisplay = function(met) {
      var comp = met.comparison || ">=";
      var val = met.threshold;
      if (met.unit === "bool") return comp + " None";
      if (met.unit === "%") return comp + " " + val + "%";
      if (met.unit === "wk") return comp + " " + val + " wk";
      return comp + " " + val;
    };

    // Progress bar data
    var gateProgress = gateSummary.totalGates > 0 ? Math.round((gateSummary.passed / gateSummary.totalGates) * 100) : 0;

    // Gate pipeline visualization data for chart
    var pipelineChartData = [];
    for (var gci = 0; gci < gates.length; gci++) {
      pipelineChartData.push({
        name: "G" + gates[gci].id,
        value: gates[gci].status === "pass" ? 1 : gates[gci].status === "fail" ? -1 : 0,
        fill: gateStatusColor(gates[gci].status)
      });
    }

    return (
      <div className="space-y-4">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#f1f5f9", margin: 0 }}>Kill-Gate Protocol</h2>
            <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: "4px 0 0" }}>Updated: {fmtDate(data.updatedAt)}</p>
          </div>
          <Badge variant={gateSummary.overallStatus === "all_pass" ? "success" : gateSummary.overallStatus === "blocked" ? "danger" : "info"}>
            {gateSummary.overallStatus === "all_pass" ? "ALL PASS" : gateSummary.overallStatus === "blocked" ? "BLOCKED" : "IN PROGRESS"}
          </Badge>
        </div>

        {/* Overall verdict */}
        <UICard accent={gateSummary.overallStatus === "all_pass" ? "emerald" : gateSummary.overallStatus === "blocked" ? "red" : "blue"}>
          <p style={{ fontSize: "0.85rem", fontWeight: "600", color: gateSummary.overallStatus === "all_pass" ? "#22c55e" : gateSummary.overallStatus === "blocked" ? "#ef4444" : "#60a5fa" }}>
            {gateSummary.overallVerdict || "Pipeline initialized"}
          </p>
        </UICard>

        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          <Stat label="Passed" value={gateSummary.passed || 0} accent="emerald" />
          <Stat label="Failed" value={gateSummary.failed || 0} accent={gateSummary.failed > 0 ? "red" : "gray"} />
          <Stat label="Active" value={gateSummary.activeGate ? "Gate " + gateSummary.activeGate : "—"} accent="blue" />
          <Stat label="Locked" value={gateSummary.locked || 0} accent="gray" />
        </div>

        {/* Progress bar */}
        <UICard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.85rem", color: "#e2e8f0" }}>Gate Progress</span>
            <Badge variant={gateProgress === 100 ? "success" : gateProgress > 0 ? "warning" : "outline"}>
              {gateSummary.passed || 0}/5 gates
            </Badge>
          </div>
          <Progress value={gateProgress} max={100} variant={gateProgress === 100 ? "emerald" : "blue"} showLabel />
        </UICard>

        {/* Pipeline visualization — horizontal status bar */}
        <UICard header="Gate Pipeline">
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            {gates.map(function(gate, gi) {
              var isLast = gi === gates.length - 1;
              return (
                <Fragment key={gate.id}>
                  <div
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "8px 4px",
                      borderRadius: "6px",
                      backgroundColor: gateStatusColor(gate.status) + "20",
                      border: "2px solid " + gateStatusColor(gate.status),
                      cursor: "pointer",
                      transition: "transform 0.1s"
                    }}
                    onClick={function() {
                      var gId = gate.id;
                      setExpandedGate(function(prev) { return prev === gId ? null : gId; });
                    }}
                  >
                    <p style={{ fontSize: "0.65rem", color: "#94a3b8", margin: 0 }}>Gate {gate.id}</p>
                    <p style={{ fontSize: "0.75rem", fontWeight: "bold", color: gateStatusColor(gate.status), margin: "2px 0 0" }}>
                      {gateStatusLabel(gate.status)}
                    </p>
                  </div>
                  {!isLast && (
                    <span style={{ color: "#475569", fontSize: "0.9rem" }}>→</span>
                  )}
                </Fragment>
              );
            })}
          </div>
        </UICard>

        {/* Individual Gate Cards */}
        <div className="space-y-3">
          {gates.map(function(gate, gIdx) {
            var mKeys = Object.keys(gate.metrics || {});
            var isExpanded = expandedGate === gate.id;
            var isActive = gate.status === "active";
            var isFailed = gate.status === "fail";

            return (
              <UICard key={gate.id} accent={gateAccent(gate.status)}>
                {/* Gate header row */}
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  onClick={function() {
                    var gId = gate.id;
                    setExpandedGate(function(prev) { return prev === gId ? null : gId; });
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "50%",
                      backgroundColor: gateStatusColor(gate.status) + "30",
                      border: "2px solid " + gateStatusColor(gate.status),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.85rem", fontWeight: "bold", color: gateStatusColor(gate.status)
                    }}>
                      {gate.status === "pass" ? "✓" : gate.status === "fail" ? "✗" : gate.status === "locked" ? React.createElement(LucideReact.Lock, { size: 14 }) : gate.id}
                    </div>
                    <div>
                      <p style={{ fontSize: "0.9rem", fontWeight: "600", color: "#f1f5f9", margin: 0 }}>
                        Gate {gate.id}: {gate.name}
                      </p>
                      <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: "2px 0 0" }}>{gate.description}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Badge variant={gateStatusBadge(gate.status)}>{gateStatusLabel(gate.status)}</Badge>
                    <span style={{ color: "#64748b", fontSize: "0.8rem" }}>{isExpanded ? "▼" : "▶"}</span>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ marginTop: "12px" }}>
                    <Separator />

                    {/* Metrics table */}
                    <div style={{ marginTop: "10px" }}>
                      <p style={{ fontSize: "0.75rem", fontWeight: "600", color: "#94a3b8", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Metrics</p>
                      <div className="space-y-2">
                        {mKeys.map(function(mk) {
                          var met = gate.metrics[mk];
                          return (
                            <div key={mk} style={{
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                              padding: "6px 10px", borderRadius: "4px",
                              backgroundColor: met.pass === true ? "#22c55e10" : met.pass === false ? "#ef444410" : "#1e293b"
                            }}>
                              <span style={{ fontSize: "0.8rem", color: "#e2e8f0" }}>{met.label}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                                  {thresholdDisplay(met)}
                                </span>
                                <span style={{
                                  fontSize: "0.85rem", fontWeight: "600",
                                  color: met.pass === true ? "#22c55e" : met.pass === false ? "#ef4444" : "#94a3b8"
                                }}>
                                  {metricDisplay(met)}
                                </span>
                                {met.pass !== null && (
                                  <span style={{ fontSize: "0.75rem" }}>
                                    {met.pass ? React.createElement("span", { style: { color: "#22c55e" } }, "✓") : React.createElement("span", { style: { color: "#ef4444" } }, "✗")}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Verdict */}
                    {gate.verdict && (
                      <div style={{ marginTop: "8px" }}>
                        <p style={{
                          fontSize: "0.8rem", fontWeight: "600", margin: 0,
                          color: gate.status === "pass" ? "#22c55e" : "#ef4444"
                        }}>
                          {gate.verdict}
                        </p>
                        {gate.timestamp && (
                          <p style={{ fontSize: "0.65rem", color: "#64748b", margin: "2px 0 0" }}>
                            Evaluated: {fmtDate(gate.timestamp)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Pivot action on failure */}
                    {isFailed && gate.pivotAction && (
                      <UICard accent="amber" header="Pivot Action">
                        <p style={{ fontSize: "0.8rem", color: "#fde68a", margin: 0 }}>{gate.pivotAction}</p>
                      </UICard>
                    )}

                    {/* Notes */}
                    {gate.notes && (
                      <div style={{ marginTop: "8px" }}>
                        <p style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: "600", margin: "0 0 4px" }}>Notes:</p>
                        <p style={{ fontSize: "0.75rem", color: "#60a5fa", margin: 0, fontStyle: "italic", whiteSpace: "pre-line" }}>{gate.notes}</p>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
                      {(isActive || isFailed) && (
                        <Button variant="primary" onClick={function() {
                          var gId = gate.id;
                          onAction("gates", { action: "submit", gate: gId, metrics: "{}" });
                        }}>
                          Submit Results
                        </Button>
                      )}
                      {(gate.status === "pass" || isFailed) && (
                        <Button variant="outline" onClick={function() {
                          var gId = gate.id;
                          onAction("gates", { action: "reset", gate: gId });
                        }}>
                          Reset Gate
                        </Button>
                      )}
                      <Button variant="ghost" onClick={function() {
                        var gId = gate.id;
                        onAction("gates", { action: "notes", gate: gId, notes: "Observation added from dashboard" });
                      }}>
                        Add Note
                      </Button>
                    </div>
                  </div>
                )}
              </UICard>
            );
          })}
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button variant="outline" onClick={function() { onAction("scorecard", {}); }}>Scorecard</Button>
          <Button variant="outline" onClick={function() { onAction("checklist", {}); }}>Checklist</Button>
          <Button variant="outline" onClick={function() { onAction("diagnose", {}); }}>Diagnose</Button>
          <Button variant="outline" onClick={function() { onAction("compare", {}); }}>Compare</Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════
  // DEFAULT / UNKNOWN VIEW
  // ════════════════════════════════════════════
  return (
    <div className="space-y-3">
      <EmptyState
        icon={React.createElement(LucideReact.BarChart3, { size: 40 })}
        title="AlphaRank Validation"
        description="Open the validation scorecard to see model metrics and diagnostics."
        action={React.createElement(Button, { variant: "primary", onClick: function() { onAction("scorecard", {}); } }, "Open Scorecard")}
      />
    </div>
  );
}
