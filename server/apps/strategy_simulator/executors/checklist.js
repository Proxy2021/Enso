var action = params.action || "view";
var itemId = params.itemId || "";

// Default checklist items
var defaultItems = [
  { id: "data_sources", label: "Data sources selected and tested", phase: "Data Pipeline", order: 1, checked: false, notes: "", tooltip: "Identify and validate price, fundamental, and alternative data providers" },
  { id: "feature_universe", label: "Feature universe defined (15-20 signals)", phase: "Model Development", order: 2, checked: false, notes: "", tooltip: "Define alpha signals: value, momentum, quality, sentiment, technical" },
  { id: "walkforward_protocol", label: "Walk-forward validation protocol designed", phase: "Validation", order: 3, checked: false, notes: "", tooltip: "Expanding window backtest with proper train/test splits" },
  { id: "backtest_ic", label: "Backtest shows IC > 0.03 sustained", phase: "Validation", order: 4, checked: false, notes: "", tooltip: "Information Coefficient measures prediction accuracy. IC > 0.03 is a typical threshold for viable alpha signals" },
  { id: "oos_validation", label: "Out-of-sample Sharpe > 0.8", phase: "Validation", order: 5, checked: false, notes: "", tooltip: "Walk-forward out-of-sample performance must exceed this minimum to proceed" },
  { id: "paper_launched", label: "Paper trading launched", phase: "Paper Trading", order: 6, checked: false, notes: "", tooltip: "Begin simulated trading with realistic fills, slippage, and costs" },
  { id: "paper_6m_review", label: "6-month paper trading results reviewed", phase: "Paper Trading", order: 7, checked: false, notes: "", tooltip: "Mid-point review of paper trading performance and model stability" },
  { id: "paper_12m_sharpe", label: "12-month paper trading Sharpe > 1.0", phase: "Paper Trading", order: 8, checked: false, notes: "", tooltip: "Full year of paper trading must achieve Sharpe > 1.0 to justify live capital" },
  { id: "risk_rules", label: "Risk management rules coded and tested", phase: "Risk Management", order: 9, checked: false, notes: "", tooltip: "Position limits, sector limits, drawdown stops, and portfolio-level circuit breakers" },
  { id: "live_deploy", label: "Live deployment with position limits", phase: "Deployment", order: 10, checked: false, notes: "", tooltip: "Start with reduced position sizes (25-50% of target) for initial live period" }
];

// Load saved state
var storeKey = "checklist_state";
var savedState = await ctx.store.get(storeKey);
var items = defaultItems;

if (savedState) {
  try {
    var parsed = JSON.parse(savedState);
    // Merge saved state with defaults (preserves new items added to defaults)
    items = defaultItems.map(function(item) {
      var saved = parsed.find(function(s) { return s.id === item.id; });
      if (saved) {
        item.checked = saved.checked;
        item.notes = saved.notes || "";
      }
      return item;
    });
  } catch(e) {
    // Use defaults on parse error
  }
}

// Handle actions
if (action === "toggle" && itemId) {
  items = items.map(function(item) {
    if (item.id === itemId) {
      item.checked = !item.checked;
    }
    return item;
  });
  // Save updated state
  await ctx.store.set(storeKey, JSON.stringify(items.map(function(i) { return { id: i.id, checked: i.checked, notes: i.notes }; })));
} else if (action === "reset") {
  items = defaultItems;
  await ctx.store.delete(storeKey);
}

// Compute progress
var completedCount = items.filter(function(i) { return i.checked; }).length;
var totalCount = items.length;
var progressPct = Math.round(completedCount / totalCount * 100);

// Group by phase
var phases = [];
var phaseMap = {};
items.forEach(function(item) {
  if (!phaseMap[item.phase]) {
    phaseMap[item.phase] = { phase: item.phase, items: [], completedCount: 0 };
    phases.push(phaseMap[item.phase]);
  }
  phaseMap[item.phase].items.push(item);
  if (item.checked) phaseMap[item.phase].completedCount++;
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_strategy_simulator_checklist",
      items: items,
      phases: phases,
      completedCount: completedCount,
      totalCount: totalCount,
      progressPct: progressPct,
      action: action,
      lastUpdated: new Date().toISOString()
    })
  }]
};
