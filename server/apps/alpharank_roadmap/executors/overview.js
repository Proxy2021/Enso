// Default data structure for AlphaRank roadmap
var defaultPhases = [
  {
    id: "foundation",
    name: "Foundation",
    timeline: "Months 1-3",
    status: "not_started",
    milestones: [
      { id: "qlib_setup", label: "Qlib setup & configuration", done: false },
      { id: "data_pipeline", label: "Data pipeline (ingest, clean, store)", done: false },
      { id: "first_model", label: "First LightGBM model trained", done: false },
      { id: "basic_backtest", label: "Basic backtest framework", done: false }
    ],
    targetMetrics: "IC > 0.03, basic Sharpe > 0.5"
  },
  {
    id: "alpha_research",
    name: "Alpha Research",
    timeline: "Months 4-6",
    status: "not_started",
    milestones: [
      { id: "factor_library", label: "Factor library expansion (50+ factors)", done: false },
      { id: "feature_eng", label: "Feature engineering pipeline", done: false },
      { id: "regime_detect", label: "Regime detection module", done: false },
      { id: "walk_forward", label: "Walk-forward validation", done: false }
    ],
    targetMetrics: "IC > 0.05, Sharpe > 0.8"
  },
  {
    id: "portfolio",
    name: "Portfolio Construction",
    timeline: "Months 7-10",
    status: "not_started",
    milestones: [
      { id: "position_sizing", label: "Position sizing engine", done: false },
      { id: "risk_mgmt", label: "Risk management framework", done: false },
      { id: "tx_cost", label: "Transaction cost optimization", done: false },
      { id: "multi_strategy", label: "Multi-strategy ensemble", done: false }
    ],
    targetMetrics: "CAGR > 10%, Max DD < 25%"
  },
  {
    id: "production",
    name: "Production",
    timeline: "Months 11-14",
    status: "not_started",
    milestones: [
      { id: "paper_trading", label: "Live paper trading system", done: false },
      { id: "monitoring", label: "Monitoring dashboard", done: false },
      { id: "user_api", label: "User API (FastAPI)", done: false },
      { id: "shap_layer", label: "Transparency layer (SHAP)", done: false }
    ],
    targetMetrics: "CAGR 12-14%, Sharpe > 1.0, Max DD < 20%"
  }
];

var defaultMetrics = [
  { id: "cagr", label: "CAGR", target: "12-14%", current: "N/A", phase: 0 },
  { id: "sharpe", label: "Sharpe Ratio", target: ">1.0", current: "N/A", phase: 0 },
  { id: "max_dd", label: "Max Drawdown", target: "<20%", current: "N/A", phase: 0 },
  { id: "ic", label: "Information Coefficient", target: ">0.05", current: "N/A", phase: 0 }
];

var defaultTechStack = [
  { id: "python", label: "Python 3.10+", done: false },
  { id: "qlib", label: "Qlib", done: false },
  { id: "lightgbm", label: "LightGBM", done: false },
  { id: "shap", label: "SHAP", done: false },
  { id: "fastapi", label: "FastAPI", done: false },
  { id: "postgresql", label: "PostgreSQL", done: false },
  { id: "market_data", label: "Market data API subscription", done: false }
];

var defaultRisks = [
  { id: "data_quality", label: "Data quality issues", severity: "High", mitigation: "Multiple data source validation, automated quality checks" },
  { id: "overfitting", label: "Model overfitting", severity: "High", mitigation: "Walk-forward validation, out-of-sample testing, regularization" },
  { id: "regulatory", label: "Regulatory uncertainty", severity: "Medium", mitigation: "Legal review, compliance framework, conservative position limits" },
  { id: "regime_change", label: "Market regime change", severity: "Medium", mitigation: "Regime detection, adaptive models, ensemble strategies" },
  { id: "infra_cost", label: "Infrastructure costs", severity: "Low", mitigation: "Cloud cost optimization, spot instances, efficient data pipeline" }
];

// Load persisted state or use defaults
var phases = await ctx.store.get("phases");
if (!phases) {
  phases = defaultPhases;
  await ctx.store.set("phases", phases);
}

var metrics = await ctx.store.get("metrics");
if (!metrics) {
  metrics = defaultMetrics;
  await ctx.store.set("metrics", metrics);
}

var techStack = await ctx.store.get("techStack");
if (!techStack) {
  techStack = defaultTechStack;
  await ctx.store.set("techStack", techStack);
}

var risks = await ctx.store.get("risks");
if (!risks) {
  risks = defaultRisks;
}

// Compute overall progress
var totalMilestones = 0;
var doneMilestones = 0;
for (var i = 0; i < phases.length; i++) {
  var ms = phases[i].milestones || [];
  for (var j = 0; j < ms.length; j++) {
    totalMilestones++;
    if (ms[j].done) doneMilestones++;
  }
}

var techReady = 0;
for (var t = 0; t < techStack.length; t++) {
  if (techStack[t].done) techReady++;
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_alpharank_roadmap_overview",
      phases: phases,
      metrics: metrics,
      techStack: techStack,
      risks: risks,
      overallProgress: {
        milestonesDone: doneMilestones,
        milestonesTotal: totalMilestones,
        percent: totalMilestones > 0 ? Math.round((doneMilestones / totalMilestones) * 100) : 0,
        techReady: techReady,
        techTotal: techStack.length
      }
    })
  }]
};
