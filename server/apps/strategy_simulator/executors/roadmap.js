var startMonth = params.startMonth || "";

// Default to current month if not provided
if (!startMonth) {
  var now = new Date();
  startMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

// Parse start year/month
var parts = startMonth.split("-");
var startYear = parseInt(parts[0]) || 2026;
var startMo = parseInt(parts[1]) || 4;

// Helper to add months
var addMonths = function(year, month, add) {
  var totalMonths = (year - 1) * 12 + (month - 1) + add;
  var newYear = Math.floor(totalMonths / 12) + 1;
  var newMonth = (totalMonths % 12) + 1;
  return newYear + "-" + String(newMonth).padStart(2, "0");
};

var phases = [
  {
    id: 1,
    name: "Data Pipeline",
    months: "1-2",
    startDate: addMonths(startYear, startMo, 0),
    endDate: addMonths(startYear, startMo, 1),
    status: "active",
    color: "#3b82f6",
    icon: "database",
    deliverables: [
      "Clean price/volume feeds (daily OHLCV for 3000+ US stocks)",
      "Fundamental data pipeline (quarterly financials, ratios)",
      "Alternative data ingestion (sentiment, options flow)",
      "Data quality monitoring and anomaly detection",
      "Historical data backfill (20+ years)"
    ],
    successCriteria: [
      "99.5% data availability across all feeds",
      "< 5 min latency for daily updates",
      "Automated anomaly detection live",
      "No survivorship bias in historical data"
    ],
    risks: ["Vendor reliability", "Data licensing costs", "Historical data gaps"],
    isGate: false
  },
  {
    id: 2,
    name: "Model Development",
    months: "2-4",
    startDate: addMonths(startYear, startMo, 1),
    endDate: addMonths(startYear, startMo, 3),
    status: "upcoming",
    color: "#8b5cf6",
    icon: "brain",
    deliverables: [
      "Feature engineering pipeline (15-20 alpha signals)",
      "ML ensemble architecture (GBM + Neural Net + Linear)",
      "Backtesting framework with transaction cost modeling",
      "Factor exposure analysis and decomposition",
      "Hyperparameter optimization pipeline"
    ],
    successCriteria: [
      "Information Coefficient (IC) > 0.03 across 5+ features",
      "Turnover-adjusted returns positive over all regimes",
      "No single-factor dominance (max 30% attribution)",
      "Backtest Sharpe > 1.0 before costs"
    ],
    risks: ["Overfitting to historical data", "Feature multicollinearity", "Regime dependency"],
    isGate: false
  },
  {
    id: 3,
    name: "Walk-Forward Validation",
    months: "4-6",
    startDate: addMonths(startYear, startMo, 3),
    endDate: addMonths(startYear, startMo, 5),
    status: "upcoming",
    color: "#ef4444",
    icon: "shield-check",
    deliverables: [
      "Walk-forward test harness (expanding window)",
      "Out-of-sample validation across 3+ market regimes",
      "Regime stress tests (2008, 2020, 2022 scenarios)",
      "Monte Carlo simulation of return paths",
      "GO/NO-GO decision document with quantitative criteria"
    ],
    successCriteria: [
      "Out-of-sample Sharpe > 0.8",
      "Max drawdown < 30% across all stress scenarios",
      "IC consistent across bull, bear, and sideways regimes",
      "Return degradation from in-sample < 40%"
    ],
    risks: ["Strategy fails OOS validation", "Insufficient data for regime testing"],
    isGate: true,
    gateLabel: "GO / NO-GO DECISION",
    gateDescription: "Critical decision point. If OOS performance doesn't meet criteria, return to Phase 2 for model revision or terminate project."
  },
  {
    id: 4,
    name: "Paper Trading",
    months: "6-18",
    startDate: addMonths(startYear, startMo, 5),
    endDate: addMonths(startYear, startMo, 17),
    status: "upcoming",
    color: "#f59e0b",
    icon: "file-text",
    deliverables: [
      "Paper trading infrastructure with realistic fills",
      "Real-time signal generation pipeline",
      "Execution simulation with slippage modeling",
      "Monthly performance reports with attribution",
      "Automated risk monitoring and alerting",
      "Quarterly model recalibration process"
    ],
    successCriteria: [
      "12-month realized Sharpe > 1.0",
      "Live IC matches backtest IC within ±20%",
      "No systematic execution gaps or signal decay",
      "Max drawdown within 1.2x of backtest worst case",
      "Consistent alpha generation across 4 quarters"
    ],
    risks: ["Signal decay over time", "Market regime shift", "Execution gap vs simulation"],
    isGate: false
  },
  {
    id: 5,
    name: "Live Deployment",
    months: "18+",
    startDate: addMonths(startYear, startMo, 17),
    endDate: "ongoing",
    status: "upcoming",
    color: "#10b981",
    icon: "rocket",
    deliverables: [
      "Broker API integration (IB/Alpaca)",
      "Position management system with limits",
      "Real-time risk monitoring dashboard",
      "Automated alerting (drawdown, exposure, liquidity)",
      "Tax-loss harvesting module",
      "Quarterly strategy review cycle"
    ],
    successCriteria: [
      "Average slippage < 10bps",
      "Risk limits never breached",
      "Quarterly review cycle established",
      "Net Sharpe > 1.0 after all costs",
      "Operational uptime > 99.9%"
    ],
    risks: ["Broker API reliability", "Flash crash scenarios", "Regulatory changes"],
    isGate: false
  }
];

// Calculate total timeline
var totalMonths = 18;
var estimatedCompletion = addMonths(startYear, startMo, totalMonths);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_strategy_simulator_roadmap",
      startMonth: startMonth,
      phases: phases,
      totalMonths: totalMonths,
      estimatedLiveDate: estimatedCompletion,
      methodology: "Sequential phases with validation gates. Paper trading (12 months) is the longest phase by design — it provides statistical confidence before risking real capital."
    })
  }]
};
