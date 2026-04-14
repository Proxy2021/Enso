export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var fmtPct = function(v) { return v != null ? v + "%" : "—"; };
  var fmtDollar = function(v) {
    if (!v && v !== 0) return "$0";
    if (v >= 1000000) return "$" + (v / 1000000).toFixed(1) + "M";
    if (v >= 1000) return "$" + (v / 1000).toFixed(0) + "K";
    return "$" + v.toLocaleString();
  };

  // ── Hooks (must all be at top level) ──
  var tabState = useState("configure");
  var activeTab = tabState[0];
  var setActiveTab = tabState[1];

  // Strategy configuration state
  var holdingsState = useState(data?.config?.holdings || 30);
  var holdings = holdingsState[0];
  var setHoldings = holdingsState[1];

  var rebalState = useState(data?.config?.rebalanceFrequency || "monthly");
  var rebalFreq = rebalState[0];
  var setRebalFreq = rebalState[1];

  var weightState = useState(data?.config?.weightingScheme || "equal_weight");
  var weightScheme = weightState[0];
  var setWeightScheme = weightState[1];

  var maxWeightState = useState(data?.config?.maxSingleWeight || 5);
  var maxWeight = maxWeightState[0];
  var setMaxWeight = maxWeightState[1];

  var maxSectorState = useState(data?.config?.maxSectorConcentration || 25);
  var maxSector = maxSectorState[0];
  var setMaxSector = maxSectorState[1];

  var regimeState = useState(data?.config?.regimeBuffer || false);
  var regimeBuffer = regimeState[0];
  var setRegimeBuffer = regimeState[1];

  // Risk calculator state
  var portfolioState = useState(data?.inputs?.portfolioSize || 100000);
  var portfolioSize = portfolioState[0];
  var setPortfolioSize = portfolioState[1];

  var returnState = useState(data?.inputs?.returnTarget || 18);
  var returnTarget = returnState[0];
  var setReturnTarget = returnState[1];

  var ddState = useState(data?.inputs?.maxDrawdown || 25);
  var maxDD = ddState[0];
  var setMaxDD = ddState[1];

  var turnoverState = useState(data?.inputs?.turnoverEstimate || 150);
  var turnoverEst = turnoverState[0];
  var setTurnoverEst = turnoverState[1];

  var commState = useState(data?.inputs?.commissionBps || 5);
  var commBps = commState[0];
  var setCommBps = commState[1];

  // Formula expand state for risk calc
  var formulaExpandState = useState(false);
  var showFormulas = formulaExpandState[0];
  var setShowFormulas = formulaExpandState[1];

  // Period state for benchmark
  var periodState = useState(data?.period || "20yr");
  var period = periodState[0];
  var setPeriod = periodState[1];

  // ── View detection ──
  var isConfigure = data?.tool === "enso_strategy_simulator_configure";
  var isBenchmark = data?.tool === "enso_strategy_simulator_benchmark";
  var isRiskCalc = data?.tool === "enso_strategy_simulator_risk_calc";
  var isRoadmap = data?.tool === "enso_strategy_simulator_roadmap";
  var isChecklist = data?.tool === "enso_strategy_simulator_checklist";

  // Update local state when data changes
  useEffect(function() {
    if (isConfigure && data.config) {
      setHoldings(data.config.holdings);
      setRebalFreq(data.config.rebalanceFrequency);
      setWeightScheme(data.config.weightingScheme);
      setMaxWeight(data.config.maxSingleWeight);
      setMaxSector(data.config.maxSectorConcentration);
      setRegimeBuffer(data.config.regimeBuffer);
    }
    if (isRiskCalc && data.inputs) {
      setPortfolioSize(data.inputs.portfolioSize);
      setReturnTarget(data.inputs.returnTarget);
      setMaxDD(data.inputs.maxDrawdown);
      setTurnoverEst(data.inputs.turnoverEstimate);
      setCommBps(data.inputs.commissionBps);
    }
    if (isBenchmark && data.period) {
      setPeriod(data.period);
    }
  }, [data?.tool]);

  // ── Shared styles ──
  var sectionStyle = { padding: "16px", background: "#F8FAFC", borderRadius: 10, border: "1px solid #E2E8F0", marginBottom: 12 };
  var labelStyle = { fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6, display: "block" };
  var valueStyle = { fontSize: 15, fontWeight: 700, color: "#1E293B" };
  var smallText = { fontSize: 11, color: "#94A3B8" };
  var warningStyle = { padding: "8px 12px", background: "#FEF3C7", borderRadius: 8, border: "1px solid #FCD34D", fontSize: 12, color: "#92400E", marginTop: 8 };
  var cardGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
  var metricCard = { padding: "12px", background: "#FFFFFF", borderRadius: 8, border: "1px solid #E2E8F0", textAlign: "center" };

  // ── Navigation tabs ──
  var navTabs = [
    { value: "configure", label: "Strategy" },
    { value: "benchmark", label: "Benchmarks" },
    { value: "risk_calc", label: "Risk Budget" },
    { value: "roadmap", label: "Roadmap" },
    { value: "checklist", label: "Checklist" }
  ];

  // ── Render helpers ──
  var renderConfigureView = function() {
    var metrics = data?.metrics || {};
    var warnings = data?.warnings || [];

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>Strategy Configuration</div>
          <div style={smallText}>Adjust portfolio construction parameters to see computed impact metrics.</div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>Number of Holdings</span>
            <div style={{ display: "flex", gap: 8 }}>
              {[10, 20, 30, 50].map(function(n) {
                return (
                  <Button key={n} size="sm" variant={holdings === n ? "primary" : "outline"} onClick={function() { setHoldings(n); }}>
                    {n}
                  </Button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>Rebalance Frequency</span>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ v: "weekly", l: "Weekly" }, { v: "monthly", l: "Monthly" }, { v: "quarterly", l: "Quarterly" }].map(function(opt) {
                return (
                  <Button key={opt.v} size="sm" variant={rebalFreq === opt.v ? "primary" : "outline"} onClick={function() { setRebalFreq(opt.v); }}>
                    {opt.l}
                  </Button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>Weighting Scheme</span>
            <Select
              options={[
                { value: "equal_weight", label: "Equal Weight" },
                { value: "rank_weighted", label: "Rank-Weighted" },
                { value: "volatility_scaled", label: "Volatility-Scaled" }
              ]}
              value={weightScheme}
              onChange={function(v) { setWeightScheme(v); }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>Max Single-Stock Weight: {maxWeight}%</span>
            <Slider min={1} max={10} step={1} value={maxWeight} onChange={function(v) { setMaxWeight(v); }} showValue />
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>Max Sector Concentration: {maxSector}%</span>
            <Slider min={15} max={40} step={5} value={maxSector} onChange={function(v) { setMaxSector(v); }} showValue />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <Switch checked={regimeBuffer} onChange={function(v) { setRegimeBuffer(v); }} label="Regime-Conditional Cash Buffer" />
          </div>

          <Button variant="primary" onClick={function() {
            onAction("configure", {
              holdings: holdings,
              rebalanceFrequency: rebalFreq,
              weightingScheme: weightScheme,
              maxSingleWeight: maxWeight,
              maxSectorConcentration: maxSector,
              regimeBuffer: regimeBuffer
            });
          }}>
            {React.createElement(LucideReact.RefreshCw, { size: 14, style: { marginRight: 6 } })}
            Compute Metrics
          </Button>
        </div>

        {data?.metrics && (
          <div style={sectionStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", marginBottom: 12 }}>Computed Metrics</div>
            <div style={cardGrid}>
              <div style={metricCard}>
                <div style={smallText}>Est. Turnover</div>
                <div style={valueStyle}>{metrics.estimatedTurnover || "—"}</div>
              </div>
              <div style={metricCard}>
                <div style={smallText}>Diversification</div>
                <div style={valueStyle}>{metrics.diversificationScore || "—"}<span style={{ fontSize: 11, color: "#94A3B8" }}>/10</span></div>
              </div>
              <div style={metricCard}>
                <div style={smallText}>Concentration Risk</div>
                <div style={{ ...valueStyle, color: metrics.concentrationRisk === "High" ? "#EF4444" : metrics.concentrationRisk === "Medium" ? "#F59E0B" : "#10B981" }}>
                  {metrics.concentrationRisk || "—"}
                </div>
              </div>
              <div style={metricCard}>
                <div style={smallText}>Rebalance Cost</div>
                <div style={valueStyle}>{metrics.rebalanceCostImpact || "—"}</div>
              </div>
              <div style={metricCard}>
                <div style={smallText}>Effective Positions</div>
                <div style={valueStyle}>{metrics.effectivePositions || "—"}</div>
              </div>
              <div style={metricCard}>
                <div style={smallText}>HHI</div>
                <div style={valueStyle}>{metrics.herfindahlIndex || "—"}</div>
              </div>
            </div>

            {warnings.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {warnings.map(function(w, i) {
                  return (
                    <div key={i} style={warningStyle}>
                      {React.createElement(LucideReact.AlertTriangle, { size: 12, style: { marginRight: 6, display: "inline" } })}
                      {w}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  var renderBenchmarkView = function() {
    var strategies = data?.strategies || [];
    var notes = data?.notes || "";

    var categoryColors = {
      passive: "#3B82F6",
      factor: "#8B5CF6",
      ml: "#F59E0B",
      target: "#10B981"
    };

    var categoryLabels = {
      passive: "Passive",
      factor: "Factor",
      ml: "ML Backtest",
      target: "Target"
    };

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>Historical Performance Reference</div>
          <div style={smallText}>Benchmark data from published research. ML backtests are in-sample.</div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[{ v: "10yr", l: "10 Year" }, { v: "20yr", l: "20 Year" }, { v: "full", l: "Full History" }].map(function(p) {
            return (
              <Button key={p.v} size="sm" variant={period === p.v ? "primary" : "outline"} onClick={function() {
                setPeriod(p.v);
                onAction("benchmark", { period: p.v });
              }}>
                {p.l}
              </Button>
            );
          })}
        </div>

        <DataTable
          columns={[
            { key: "name", label: "Strategy", sortable: true, render: function(v, row) {
              var color = categoryColors[row.category] || "#64748B";
              return (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
                  <Badge variant="outline" style={{ fontSize: 9, marginTop: 2, borderColor: color, color: color }}>{categoryLabels[row.category] || row.category}</Badge>
                </div>
              );
            }},
            { key: "cagr", label: "CAGR", sortable: true, render: function(v, row) {
              var isTarget = row.category === "target";
              return (
                <span style={{ fontWeight: 700, color: isTarget ? "#10B981" : "#1E293B" }}>
                  {isTarget ? ">" : ""}{v}%
                </span>
              );
            }},
            { key: "sharpe", label: "Sharpe", sortable: true, render: function(v, row) {
              var color = v >= 1.0 ? "#10B981" : v >= 0.7 ? "#F59E0B" : "#EF4444";
              return <span style={{ fontWeight: 700, color: color }}>{row.category === "target" ? ">" : ""}{v}</span>;
            }},
            { key: "maxDrawdown", label: "Max DD", sortable: true, render: function(v, row) {
              return <span style={{ color: "#EF4444", fontWeight: 600 }}>{row.category === "target" ? "<" : ""}{v}%</span>;
            }},
            { key: "turnover", label: "Turnover", sortable: true, render: function(v, row) {
              return <span style={{ color: "#64748B" }}>~{v}%</span>;
            }}
          ]}
          data={strategies}
          striped
        />

        {strategies.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>CAGR Comparison</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={strategies} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Bar dataKey="cagr" name="CAGR %" radius={[4, 4, 0, 0]}>
                  {strategies.map(function(s, i) {
                    var fill = categoryColors[s.category] || "#94A3B8";
                    return React.createElement("Cell", { key: i, fill: fill });
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {notes && (
          <div style={{ ...smallText, marginTop: 12, padding: "8px 12px", background: "#F1F5F9", borderRadius: 6, lineHeight: 1.5 }}>
            {React.createElement(LucideReact.Info, { size: 11, style: { marginRight: 4, display: "inline" } })}
            {notes}
          </div>
        )}
      </div>
    );
  };

  var renderRiskCalcView = function() {
    var outputs = data?.outputs || {};
    var formulas = data?.formulas || {};

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>Risk Budget Calculator</div>
          <div style={smallText}>Compute required risk parameters from your target portfolio characteristics.</div>
        </div>

        <div style={sectionStyle}>
          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>Portfolio Size: {fmtDollar(portfolioSize)}</span>
            <div style={{ display: "flex", gap: 8 }}>
              {[10000, 50000, 100000, 500000, 1000000].map(function(v) {
                return (
                  <Button key={v} size="sm" variant={portfolioSize === v ? "primary" : "outline"} onClick={function() { setPortfolioSize(v); }}>
                    {fmtDollar(v)}
                  </Button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>Annual Return Target: {returnTarget}%</span>
            <Slider min={5} max={40} step={1} value={returnTarget} onChange={function(v) { setReturnTarget(v); }} showValue />
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>Max Acceptable Drawdown: {maxDD}%</span>
            <Slider min={5} max={50} step={5} value={maxDD} onChange={function(v) { setMaxDD(v); }} showValue />
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>Est. Annual Turnover: {turnoverEst}%</span>
            <Slider min={50} max={400} step={25} value={turnoverEst} onChange={function(v) { setTurnoverEst(v); }} showValue />
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>Commission: {commBps} bps</span>
            <Slider min={1} max={20} step={1} value={commBps} onChange={function(v) { setCommBps(v); }} showValue />
          </div>

          <Button variant="primary" onClick={function() {
            onAction("risk_calc", {
              portfolioSize: portfolioSize,
              returnTarget: returnTarget,
              maxDrawdown: maxDD,
              turnoverEstimate: turnoverEst,
              commissionBps: commBps
            });
          }}>
            {React.createElement(LucideReact.Calculator, { size: 14, style: { marginRight: 6 } })}
            Calculate
          </Button>
        </div>

        {data?.outputs && (
          <div style={sectionStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B", marginBottom: 12 }}>Results</div>
            <div style={cardGrid}>
              <div style={{ ...metricCard, borderLeft: "3px solid #3B82F6" }}>
                <div style={smallText}>Required Sharpe</div>
                <div style={{ ...valueStyle, color: outputs.requiredSharpe > 2 ? "#EF4444" : outputs.requiredSharpe > 1.5 ? "#F59E0B" : "#10B981" }}>
                  {outputs.requiredSharpe}
                </div>
              </div>
              <div style={{ ...metricCard, borderLeft: "3px solid #8B5CF6" }}>
                <div style={smallText}>Implied Volatility</div>
                <div style={valueStyle}>{outputs.impliedVolatility}%</div>
              </div>
              <div style={{ ...metricCard, borderLeft: "3px solid #10B981" }}>
                <div style={smallText}>Suggested Positions</div>
                <div style={valueStyle}>{outputs.suggestedPositions}</div>
              </div>
              <div style={{ ...metricCard, borderLeft: "3px solid #F59E0B" }}>
                <div style={smallText}>Annual Transaction Costs</div>
                <div style={valueStyle}>{fmtDollar(outputs.annualTransactionCosts)}</div>
                <div style={smallText}>{outputs.transactionCostPct}% of portfolio</div>
              </div>
              <div style={{ ...metricCard, borderLeft: "3px solid #EF4444" }}>
                <div style={smallText}>Break-Even Win Rate</div>
                <div style={valueStyle}>{outputs.breakEvenWinRate}%</div>
              </div>
              <div style={{ ...metricCard, borderLeft: "3px solid #06B6D4" }}>
                <div style={smallText}>Kelly Fraction</div>
                <div style={valueStyle}>{outputs.kellyFraction}</div>
              </div>
              <div style={{ ...metricCard, borderLeft: "3px solid #EC4899" }}>
                <div style={smallText}>Risk of Ruin</div>
                <div style={{ ...valueStyle, color: outputs.riskOfRuin > 10 ? "#EF4444" : outputs.riskOfRuin > 5 ? "#F59E0B" : "#10B981" }}>
                  {outputs.riskOfRuin}%
                </div>
              </div>
              <div style={{ ...metricCard, borderLeft: "3px solid #10B981" }}>
                <div style={smallText}>Net Return After Costs</div>
                <div style={{ ...valueStyle, color: outputs.netReturnAfterCosts > 0 ? "#10B981" : "#EF4444" }}>
                  {outputs.netReturnAfterCosts}%
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <Button variant="ghost" size="sm" onClick={function() { setShowFormulas(!showFormulas); }}>
                {React.createElement(LucideReact.BookOpen, { size: 12, style: { marginRight: 4 } })}
                {showFormulas ? "Hide" : "Show"} Formulas
              </Button>
              {showFormulas && formulas && (
                <div style={{ marginTop: 8, padding: "12px", background: "#F1F5F9", borderRadius: 8, fontFamily: "monospace", fontSize: 11, lineHeight: 2 }}>
                  {Object.keys(formulas).map(function(key) {
                    return <div key={key} style={{ borderBottom: "1px solid #E2E8F0", paddingBottom: 4, marginBottom: 4 }}>{formulas[key]}</div>;
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  var renderRoadmapView = function() {
    var phases = data?.phases || [];
    var startMonth = data?.startMonth || "";

    var statusColors = {
      active: "#3B82F6",
      upcoming: "#94A3B8",
      completed: "#10B981"
    };

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>Development Roadmap</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={smallText}>Start: {startMonth}</span>
            {data?.estimatedLiveDate && <span style={smallText}>Est. Live: {data.estimatedLiveDate}</span>}
            {data?.totalMonths && <Badge variant="outline" accent="blue">{data.totalMonths} months total</Badge>}
          </div>
        </div>

        <div style={{ position: "relative" }}>
          {phases.map(function(phase, idx) {
            var isLast = idx === phases.length - 1;
            var statusColor = statusColors[phase.status] || "#94A3B8";
            var bgColor = phase.isGate ? "#FEF2F2" : phase.status === "active" ? "#EFF6FF" : "#F8FAFC";
            var borderColor = phase.isGate ? "#FCA5A5" : phase.status === "active" ? "#93C5FD" : "#E2E8F0";

            return (
              <div key={phase.id} style={{ display: "flex", gap: 12, marginBottom: isLast ? 0 : 0, position: "relative" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: phase.isGate ? "#EF4444" : statusColor,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#FFF", fontSize: 11, fontWeight: 700
                  }}>
                    {phase.isGate ? "!" : phase.id}
                  </div>
                  {!isLast && <div style={{ width: 2, flex: 1, background: "#E2E8F0", minHeight: 20 }} />}
                </div>

                <div style={{ flex: 1, padding: "12px 16px", background: bgColor, borderRadius: 10, border: "1px solid " + borderColor, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#1E293B" }}>{phase.name}</span>
                      {phase.isGate && (
                        <Badge variant="danger" style={{ marginLeft: 8, fontSize: 10 }}>{phase.gateLabel || "GATE"}</Badge>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Badge variant={phase.status === "active" ? "info" : "outline"} accent={phase.status === "active" ? "blue" : "gray"}>
                        {phase.status === "active" ? "In Progress" : phase.status === "completed" ? "Done" : "Upcoming"}
                      </Badge>
                      <span style={{ fontSize: 11, color: "#64748B" }}>Mo {phase.months}</span>
                    </div>
                  </div>

                  {phase.isGate && phase.gateDescription && (
                    <div style={{ ...warningStyle, background: "#FEE2E2", borderColor: "#FCA5A5", color: "#991B1B", marginTop: 0, marginBottom: 8 }}>
                      {React.createElement(LucideReact.ShieldAlert, { size: 12, style: { marginRight: 4, display: "inline" } })}
                      {phase.gateDescription}
                    </div>
                  )}

                  <Accordion type="single" items={[
                    {
                      value: "deliverables-" + phase.id,
                      title: "Deliverables (" + phase.deliverables.length + ")",
                      content: (
                        <div style={{ fontSize: 12 }}>
                          {phase.deliverables.map(function(d, i) {
                            return <div key={i} style={{ padding: "3px 0", color: "#334155" }}>• {d}</div>;
                          })}
                        </div>
                      )
                    },
                    {
                      value: "criteria-" + phase.id,
                      title: "Success Criteria (" + phase.successCriteria.length + ")",
                      content: (
                        <div style={{ fontSize: 12 }}>
                          {phase.successCriteria.map(function(c, i) {
                            return (
                              <div key={i} style={{ padding: "3px 0", color: "#334155" }}>
                                {React.createElement(LucideReact.CheckCircle, { size: 11, style: { marginRight: 4, color: "#10B981", display: "inline" } })}
                                {c}
                              </div>
                            );
                          })}
                        </div>
                      )
                    },
                    {
                      value: "risks-" + phase.id,
                      title: "Risks (" + (phase.risks || []).length + ")",
                      content: (
                        <div style={{ fontSize: 12 }}>
                          {(phase.risks || []).map(function(r, i) {
                            return (
                              <div key={i} style={{ padding: "3px 0", color: "#92400E" }}>
                                {React.createElement(LucideReact.AlertTriangle, { size: 11, style: { marginRight: 4, display: "inline" } })}
                                {r}
                              </div>
                            );
                          })}
                        </div>
                      )
                    }
                  ]} />
                </div>
              </div>
            );
          })}
        </div>

        {data?.methodology && (
          <div style={{ ...smallText, marginTop: 12, padding: "8px 12px", background: "#F1F5F9", borderRadius: 6, lineHeight: 1.5 }}>
            {React.createElement(LucideReact.Info, { size: 11, style: { marginRight: 4, display: "inline" } })}
            {data.methodology}
          </div>
        )}
      </div>
    );
  };

  var renderChecklistView = function() {
    var items = data?.items || [];
    var phaseGroups = data?.phases || [];
    var completedCount = data?.completedCount || 0;
    var totalCount = data?.totalCount || items.length || 9;
    var progressPct = data?.progressPct || 0;

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1E293B", marginBottom: 4 }}>Decision Checklist</div>
          <div style={smallText}>Track key milestones for your quantitative strategy development.</div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <Stat label="Completed" value={completedCount + " / " + totalCount} accent={progressPct >= 80 ? "emerald" : progressPct >= 40 ? "amber" : "blue"} />
          <div style={{ flex: 1 }}>
            <Progress value={progressPct} max={100} variant={progressPct >= 80 ? "success" : progressPct >= 40 ? "warning" : "default"} showLabel />
          </div>
        </div>

        {phaseGroups.length > 0 ? (
          <div>
            {phaseGroups.map(function(group) {
              var phaseComplete = group.completedCount === group.items.length;
              return (
                <div key={group.phase} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>{group.phase}</span>
                    <Badge variant={phaseComplete ? "success" : "outline"} accent={phaseComplete ? "emerald" : "gray"}>
                      {group.completedCount}/{group.items.length}
                    </Badge>
                  </div>
                  {group.items.map(function(item) {
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 12px", marginBottom: 6,
                          background: item.checked ? "#F0FDF4" : "#FFFFFF",
                          borderRadius: 8, border: "1px solid " + (item.checked ? "#BBF7D0" : "#E2E8F0"),
                          cursor: "pointer"
                        }}
                        onClick={function() { onAction("checklist", { action: "toggle", itemId: item.id }); }}
                      >
                        <div style={{
                          width: 22, height: 22, borderRadius: 6,
                          border: item.checked ? "none" : "2px solid #CBD5E1",
                          background: item.checked ? "#10B981" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0
                        }}>
                          {item.checked && React.createElement(LucideReact.Check, { size: 14, color: "#FFFFFF" })}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 600,
                            color: item.checked ? "#16A34A" : "#1E293B",
                            textDecoration: item.checked ? "line-through" : "none"
                          }}>
                            {item.label}
                          </div>
                          {item.tooltip && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{item.tooltip}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            {items.map(function(item) {
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", marginBottom: 6,
                    background: item.checked ? "#F0FDF4" : "#FFFFFF",
                    borderRadius: 8, border: "1px solid " + (item.checked ? "#BBF7D0" : "#E2E8F0"),
                    cursor: "pointer"
                  }}
                  onClick={function() { onAction("checklist", { action: "toggle", itemId: item.id }); }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 6,
                    border: item.checked ? "none" : "2px solid #CBD5E1",
                    background: item.checked ? "#10B981" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0
                  }}>
                    {item.checked && React.createElement(LucideReact.Check, { size: 14, color: "#FFFFFF" })}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: item.checked ? "#16A34A" : "#1E293B",
                      textDecoration: item.checked ? "line-through" : "none"
                    }}>
                      {item.label}
                    </div>
                    {item.tooltip && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{item.tooltip}</div>}
                  </div>
                  <Badge variant="outline" accent="gray" style={{ fontSize: 9 }}>{item.phase}</Badge>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="outline" size="sm" onClick={function() { onAction("checklist", { action: "view" }); }}>
            {React.createElement(LucideReact.RefreshCw, { size: 12, style: { marginRight: 4 } })}
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={function() { onAction("checklist", { action: "reset" }); }}>
            {React.createElement(LucideReact.RotateCcw, { size: 12, style: { marginRight: 4 } })}
            Reset All
          </Button>
        </div>
      </div>
    );
  };

  // ── Main render ──
  return (
    <div className="space-y-3">
      <UICard header={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {React.createElement(LucideReact.TrendingUp, { size: 20, color: "#3B82F6" })}
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1E293B" }}>AlphaRank Strategy Simulator</div>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 400 }}>Portfolio construction planning and risk analysis</div>
          </div>
        </div>
      }>
        <Tabs
          tabs={navTabs}
          defaultValue={isConfigure ? "configure" : isBenchmark ? "benchmark" : isRiskCalc ? "risk_calc" : isRoadmap ? "roadmap" : isChecklist ? "checklist" : "configure"}
          variant="pills"
        >
          {function(tab) {
            if (tab === "configure") return renderConfigureView();
            if (tab === "benchmark") return renderBenchmarkView();
            if (tab === "risk_calc") return renderRiskCalcView();
            if (tab === "roadmap") return renderRoadmapView();
            if (tab === "checklist") return renderChecklistView();
            return null;
          }}
        </Tabs>
      </UICard>
    </div>
  );
}
