var action = (params.action || "").trim() || "view";
var itemId = (params.itemId || "").trim();
var newStatus = (params.status || "").trim();
var notes = (params.notes || "").trim();

// Default checklist items
var defaultItems = [
  { id: "pbo_test", label: "PBO Test Run", description: "Run Probability of Backtest Overfitting test using pypbo", status: "not_started", completedAt: null, notes: "", priority: 1 },
  { id: "cpcv", label: "CPCV Implementation", description: "Implement Combinatorial Purged Cross-Validation (10 folds, 2 test groups)", status: "not_started", completedAt: null, notes: "", priority: 2 },
  { id: "dsr", label: "DSR Computation", description: "Compute Deflated Sharpe Ratio to account for multiple testing", status: "not_started", completedAt: null, notes: "", priority: 3 },
  { id: "txcosts", label: "Transaction Cost Model", description: "Add 50bps round-trip + 20bps slippage to all backtests", status: "not_started", completedAt: null, notes: "", priority: 4 },
  { id: "feature_prune", label: "Feature Pruning", description: "Prune unstable features (stability < 0.7), target top 30-50 features", status: "not_started", completedAt: null, notes: "", priority: 5 },
  { id: "oos_test", label: "OOS Validation Pass", description: "Achieve IC > 0.03, ICIR > 0.5 on out-of-sample data", status: "not_started", completedAt: null, notes: "", priority: 6 },
  { id: "paper_trading", label: "Paper Trading Started", description: "Deploy to Alpaca paper trading for 21+ trading days of live IC", status: "not_started", completedAt: null, notes: "", priority: 7 }
];

// Load existing state
var items = null;
try {
  var stored = await ctx.store.get("validation_checklist");
  if (stored && Array.isArray(stored) && stored.length > 0) {
    items = stored;
  }
} catch(e) {}

// Use defaults if nothing stored
if (!items) {
  items = defaultItems;
}

// Handle update action
if (action === "update" && itemId) {
  var found = false;
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === itemId) {
      found = true;
      if (newStatus) {
        items[i].status = newStatus;
        if (newStatus === "done") {
          items[i].completedAt = new Date().toISOString();
        } else if (newStatus === "not_started") {
          items[i].completedAt = null;
        }
      }
      if (notes) {
        items[i].notes = notes;
      }
      break;
    }
  }

  if (!found) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_alpharank_validation_checklist",
          error: "Item not found: " + itemId,
          validIds: items.map(function(it) { return it.id; })
        })
      }]
    };
  }
}

// Persist state
try {
  await ctx.store.set("validation_checklist", items);
} catch(e) {}

// Compute progress
var doneCount = 0;
var inProgressCount = 0;
var notStartedCount = 0;
for (var j = 0; j < items.length; j++) {
  if (items[j].status === "done") doneCount++;
  else if (items[j].status === "in_progress") inProgressCount++;
  else notStartedCount++;
}

var total = items.length;
var percentComplete = total > 0 ? Math.round((doneCount / total) * 100) : 0;

var result = {
  tool: "enso_alpharank_validation_checklist",
  action: action,
  items: items,
  progress: {
    total: total,
    done: doneCount,
    inProgress: inProgressCount,
    notStarted: notStartedCount,
    percentComplete: percentComplete
  },
  updatedAt: new Date().toISOString()
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
