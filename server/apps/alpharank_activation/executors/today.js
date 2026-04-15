// 30-day activation plan definition
var plan = [
  { day: 1, title: "Python environment setup", week: 1, weekLabel: "Environment + Data", category: "setup", estimatedHours: 3, description: "Create conda environment with Python 3.10+. Install core packages: numpy, pandas, scikit-learn, jupyter. Verify GPU availability for model training.", prerequisites: [], deliverables: ["Conda env created", "Core packages installed", "GPU check passed"], resources: ["conda docs", "Python 3.10 release notes"] },
  { day: 2, title: "Qlib + LightGBM + DuckDB install", week: 1, weekLabel: "Environment + Data", category: "setup", estimatedHours: 3, description: "Install Qlib framework, LightGBM, and DuckDB. Configure Qlib provider settings. Run Qlib smoke tests to verify installation.", prerequisites: ["Python environment ready"], deliverables: ["Qlib installed & configured", "LightGBM verified", "DuckDB operational"], resources: ["Qlib quickstart guide", "LightGBM Python API docs"] },
  { day: 3, title: "Qlib data download — S&P 500", week: 1, weekLabel: "Environment + Data", category: "data", estimatedHours: 3, description: "Download S&P 500 market data via Qlib data provider. Configure date range (2010-present). Verify data completeness and storage format.", prerequisites: ["Qlib installed"], deliverables: ["S&P 500 data downloaded", "Date range 2010-2026 verified", "Storage path configured"], resources: ["Qlib data provider docs", "Yahoo Finance API"] },
  { day: 4, title: "S&P 500 universe definition", week: 1, weekLabel: "Environment + Data", category: "data", estimatedHours: 2.5, description: "Define the investable universe: current S&P 500 constituents with survivorship bias handling. Create universe filter for Qlib.", prerequisites: ["Market data downloaded"], deliverables: ["Universe filter created", "Constituent list validated", "Survivorship bias addressed"], resources: ["S&P 500 constituent history", "Qlib universe docs"] },
  { day: 5, title: "Data quality verification", week: 1, weekLabel: "Environment + Data", category: "data", estimatedHours: 3, description: "Run comprehensive data quality checks: missing values, outliers, corporate actions (splits/dividends), volume anomalies. Generate data quality report.", prerequisites: ["Universe defined", "Data downloaded"], deliverables: ["Quality report generated", "Missing data cataloged", "Outlier thresholds set"], resources: ["pandas-profiling", "Data quality best practices"] },
  { day: 6, title: "Alpha158 feature set activation", week: 1, weekLabel: "Environment + Data", category: "features", estimatedHours: 4, description: "Enable Qlib's Alpha158 feature set — 158 pre-built technical factors. Configure feature computation pipeline and verify output shapes.", prerequisites: ["Data quality verified"], deliverables: ["Alpha158 features computing", "Feature shapes validated", "Pipeline timing benchmarked"], resources: ["Qlib Alpha158 reference", "Feature engineering handbook"] },
  { day: 7, title: "Alpha158 validation & EDA", week: 1, weekLabel: "Environment + Data", category: "features", estimatedHours: 3, description: "Exploratory data analysis on Alpha158 features: correlation matrix, distribution analysis, missing value patterns. Identify top predictive candidates.", prerequisites: ["Alpha158 activated"], deliverables: ["Correlation heatmap", "Feature distribution plots", "Top 30 candidates identified"], resources: ["Feature selection techniques", "Qlib analysis tools"] },
  { day: 8, title: "First LightGBM model — data split", week: 2, weekLabel: "Features + First Model", category: "model", estimatedHours: 3, description: "Set up time-series aware train/validation/test splits. Implement rolling window approach. Configure LightGBM with conservative baseline hyperparameters.", prerequisites: ["Alpha158 features ready"], deliverables: ["Train/val/test splits defined", "Rolling window configured", "Baseline hyperparams set"], resources: ["LightGBM tuning guide", "Time-series cross-validation"] },
  { day: 9, title: "First LightGBM model — training", week: 2, weekLabel: "Features + First Model", category: "model", estimatedHours: 4, description: "Train first LightGBM model on Alpha158 features. Monitor training curves, check for overfitting. Generate initial feature importance rankings.", prerequisites: ["Data splits ready"], deliverables: ["Model trained", "Training curves saved", "Feature importance ranked"], resources: ["LightGBM best practices", "Overfitting detection"] },
  { day: 10, title: "First model evaluation", week: 2, weekLabel: "Features + First Model", category: "model", estimatedHours: 3, description: "Evaluate first model: IC, ICIR, rank correlation. Compare predictions vs. actual returns. Analyze prediction distribution and calibration.", prerequisites: ["Model trained"], deliverables: ["IC/ICIR calculated", "Prediction vs actual plots", "Calibration analysis"], resources: ["Qlib evaluation metrics", "Model diagnostics"] },
  { day: 11, title: "Walk-forward backtest setup", week: 2, weekLabel: "Features + First Model", category: "backtest", estimatedHours: 4, description: "Implement walk-forward backtesting framework: rolling retrain windows, prediction generation, signal-to-portfolio pipeline. No lookahead bias verification.", prerequisites: ["First model evaluated"], deliverables: ["Walk-forward framework built", "Lookahead bias checks passed", "Pipeline end-to-end verified"], resources: ["Walk-forward validation paper", "Qlib backtest module"] },
  { day: 12, title: "Walk-forward backtest — tuning", week: 2, weekLabel: "Features + First Model", category: "backtest", estimatedHours: 3, description: "Tune walk-forward parameters: retrain frequency, lookback window, prediction horizon. Test sensitivity to parameter choices.", prerequisites: ["Walk-forward setup complete"], deliverables: ["Optimal retrain frequency found", "Lookback window calibrated", "Parameter sensitivity report"], resources: ["Rolling window optimization", "Backtest parameter sensitivity"] },
  { day: 13, title: "First backtest run", week: 2, weekLabel: "Features + First Model", category: "backtest", estimatedHours: 4, description: "Run full walk-forward backtest 2015-2025. Generate equity curve, monthly returns, drawdown series. Calculate Sharpe, max drawdown, CAGR.", prerequisites: ["Walk-forward tuned"], deliverables: ["Equity curve plotted", "Monthly returns table", "Key metrics calculated"], resources: ["Portfolio analytics", "Backtest visualization"] },
  { day: 14, title: "Backtest analysis & reporting", week: 2, weekLabel: "Features + First Model", category: "backtest", estimatedHours: 3, description: "Deep analysis of backtest results: regime-specific performance, turnover analysis, sector exposure, worst drawdown periods. Generate comprehensive report.", prerequisites: ["Backtest completed"], deliverables: ["Regime analysis done", "Turnover measured", "Analysis report written"], resources: ["Portfolio analytics tools", "Regime detection methods"] },
  { day: 15, title: "GO/NO-GO Gate #1 — evaluation", week: 3, weekLabel: "Backtest + Validate", category: "gate", estimatedHours: 2, description: "Gate #1 criteria check: IC > 0.03, Sharpe > 0.5. Review all metrics, identify strengths and weaknesses. Decision: proceed, pivot, or iterate.", prerequisites: ["Backtest analysis complete"], deliverables: ["Gate criteria evaluated", "Decision documented", "Next steps defined"], resources: ["Quant strategy evaluation framework"] },
  { day: 16, title: "Gate #1 — iteration plan", week: 3, weekLabel: "Backtest + Validate", category: "gate", estimatedHours: 3, description: "Based on Gate #1 results: if PASS, plan Week 3-4 feature additions. If FAIL, identify top improvement levers and re-plan. Update activation tracker.", prerequisites: ["Gate #1 decision made"], deliverables: ["Iteration plan created", "Improvement priorities ranked", "Tracker updated"], resources: ["Model improvement strategies"] },
  { day: 17, title: "Custom features — FCF yield", week: 3, weekLabel: "Backtest + Validate", category: "features", estimatedHours: 3.5, description: "Implement Free Cash Flow yield feature: FCF/market cap ratio with quarterly updating. Handle missing data, sector normalization.", prerequisites: ["Gate #1 passed"], deliverables: ["FCF yield feature built", "Sector normalization applied", "Missing data handled"], resources: ["Fundamental data APIs", "FCF calculation methods"] },
  { day: 18, title: "Custom features — earnings momentum", week: 3, weekLabel: "Backtest + Validate", category: "features", estimatedHours: 3.5, description: "Build earnings momentum features: EPS surprise, estimate revisions trend, earnings acceleration. Integrate analyst consensus data.", prerequisites: ["Gate #1 passed"], deliverables: ["Earnings features implemented", "Analyst data integrated", "Feature validation complete"], resources: ["Earnings data providers", "Momentum factor research"] },
  { day: 19, title: "Custom features — analyst revisions", week: 3, weekLabel: "Backtest + Validate", category: "features", estimatedHours: 3, description: "Implement analyst revision signals: consensus change velocity, breadth of revisions, revision ratio (up/down). Test predictive power individually.", prerequisites: ["Gate #1 passed"], deliverables: ["Revision features built", "Individual IC measured", "Feature docs updated"], resources: ["Analyst revision alpha research"] },
  { day: 20, title: "Random Forest model", week: 3, weekLabel: "Backtest + Validate", category: "model", estimatedHours: 4, description: "Train Random Forest model as ensemble complement to LightGBM. Tune hyperparameters (n_estimators, max_depth, min_samples). Compare feature importance vs LightGBM.", prerequisites: ["Custom features ready"], deliverables: ["RF model trained", "Hyperparams tuned", "Feature importance compared"], resources: ["scikit-learn RF docs", "Ensemble methods for finance"] },
  { day: 21, title: "Ensemble configuration", week: 3, weekLabel: "Backtest + Validate", category: "model", estimatedHours: 3, description: "Configure model ensemble: LightGBM + Random Forest. Test weighting schemes (equal, performance-based, stacked). Validate ensemble improves over single model.", prerequisites: ["Both models trained"], deliverables: ["Ensemble weights determined", "Improvement quantified", "Ensemble pipeline automated"], resources: ["Ensemble learning methods", "Model stacking techniques"] },
  { day: 22, title: "Transaction cost model", week: 4, weekLabel: "Ensemble + Polish", category: "backtest", estimatedHours: 3.5, description: "Build realistic transaction cost model: spread costs (bid-ask), market impact (square-root model), slippage. Calibrate using historical spread data.", prerequisites: ["Ensemble configured"], deliverables: ["Cost model implemented", "Spread data calibrated", "Impact function validated"], resources: ["Transaction cost analysis", "Market microstructure"] },
  { day: 23, title: "Full ensemble backtest with costs", week: 4, weekLabel: "Ensemble + Polish", category: "backtest", estimatedHours: 4, description: "Run full ensemble backtest including transaction costs. Compare gross vs net returns. Optimize turnover constraints to maximize net Sharpe.", prerequisites: ["Cost model ready"], deliverables: ["Net equity curve", "Gross vs net comparison", "Optimal turnover found"], resources: ["Portfolio optimization with costs"] },
  { day: 24, title: "Backtest robustness checks", week: 4, weekLabel: "Ensemble + Polish", category: "backtest", estimatedHours: 3, description: "Run robustness checks: different time periods, market regimes (bull/bear/sideways), parameter perturbation, out-of-sample stability.", prerequisites: ["Ensemble backtest done"], deliverables: ["Regime-split results", "Parameter sensitivity plots", "Stability score"], resources: ["Backtest robustness testing", "PBO methodology"] },
  { day: 25, title: "SHAP explainability integration", week: 4, weekLabel: "Ensemble + Polish", category: "analysis", estimatedHours: 3.5, description: "Integrate SHAP for model explainability: feature importance waterfall charts, interaction effects, time-varying feature contributions.", prerequisites: ["Ensemble model ready"], deliverables: ["SHAP values computed", "Waterfall charts generated", "Key drivers identified"], resources: ["SHAP library docs", "ML explainability in finance"] },
  { day: 26, title: "SHAP analysis & documentation", week: 4, weekLabel: "Ensemble + Polish", category: "analysis", estimatedHours: 3, description: "Deep SHAP analysis: per-stock explanations, sector-level patterns, temporal stability of feature importance. Document findings.", prerequisites: ["SHAP integrated"], deliverables: ["Per-stock explanations sampled", "Sector patterns documented", "Temporal stability assessed"], resources: ["SHAP advanced usage"] },
  { day: 27, title: "Results documentation", week: 4, weekLabel: "Ensemble + Polish", category: "docs", estimatedHours: 3, description: "Comprehensive documentation: methodology, feature descriptions, model architecture, backtest results, risk analysis. Create presentation-ready charts.", prerequisites: ["All analysis complete"], deliverables: ["Methodology doc written", "Results charts finalized", "Risk appendix created"], resources: ["Quant research paper templates"] },
  { day: 28, title: "Results analysis & review", week: 4, weekLabel: "Ensemble + Polish", category: "docs", estimatedHours: 2.5, description: "Review all results end-to-end. Identify potential improvements for Phase 2. Prepare Gate #2 evaluation materials. Peer review checklist.", prerequisites: ["Documentation complete"], deliverables: ["End-to-end review done", "Phase 2 candidates listed", "Gate #2 materials ready"], resources: ["Code review checklist for ML"] },
  { day: 29, title: "GO/NO-GO Gate #2 — evaluation", week: 4, weekLabel: "Ensemble + Polish", category: "gate", estimatedHours: 2, description: "Gate #2 criteria check: IC > 0.05, Sharpe > 0.8, Max DD < 25%, PBO score acceptable. Comprehensive readiness assessment for Phase 2.", prerequisites: ["All materials ready"], deliverables: ["Gate criteria evaluated", "Final decision documented", "Phase 2 go/no-go"], resources: ["Strategy deployment criteria"] },
  { day: 30, title: "Phase 2 planning", week: 4, weekLabel: "Ensemble + Polish", category: "planning", estimatedHours: 3, description: "Plan Phase 2 based on Gate #2 results: live trading integration (Alpaca/IBKR), alternative data sources, regime-adaptive allocation, paper trading setup.", prerequisites: ["Gate #2 complete"], deliverables: ["Phase 2 roadmap drafted", "Priority stack ranked", "Timeline estimated"], resources: ["Alpaca API docs", "IBKR API docs"] }
];

// Load persisted state
var state = await ctx.store.get("activation_state");
if (!state) {
  state = {
    startDate: null,
    currentDay: 1,
    checkins: {},
    streak: 0,
    lastCheckinDate: null
  };
  await ctx.store.set("activation_state", state);
}

// If no start date set, use today
if (!state.startDate) {
  state.startDate = new Date().toISOString().split("T")[0];
  await ctx.store.set("activation_state", state);
}

// Calculate current active day (first incomplete day)
var currentDay = state.currentDay || 1;
for (var d = 1; d <= 30; d++) {
  var ci = state.checkins[String(d)];
  if (!ci || ci.status !== "done") {
    currentDay = d;
    break;
  }
  if (d === 30) currentDay = 30;
}

// Count completed days
var daysCompleted = 0;
for (var k = 1; k <= 30; k++) {
  if (state.checkins[String(k)] && state.checkins[String(k)].status === "done") {
    daysCompleted++;
  }
}

// Get today's task from plan
var taskIndex = currentDay - 1;
var task = plan[taskIndex] || plan[0];

// Check prerequisites
var prerequisitesMet = true;
if (task.prerequisites && task.prerequisites.length > 0 && currentDay > 1) {
  var prevCheckin = state.checkins[String(currentDay - 1)];
  if (!prevCheckin || prevCheckin.status !== "done") {
    prerequisitesMet = false;
  }
}

// Calculate streak
var streak = 0;
for (var s = currentDay - 1; s >= 1; s--) {
  var sc = state.checkins[String(s)];
  if (sc && sc.status === "done") {
    streak++;
  } else {
    break;
  }
}

var percentComplete = Math.round((daysCompleted / 30) * 100);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_alpharank_activation_today",
      currentDay: currentDay,
      totalDays: 30,
      daysCompleted: daysCompleted,
      streak: streak,
      task: task,
      prerequisitesMet: prerequisitesMet,
      percentComplete: percentComplete,
      startDate: state.startDate
    })
  }]
};
