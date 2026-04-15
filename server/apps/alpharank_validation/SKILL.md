---
name: alpharank_validation
description: "AlphaRank validation dashboard: model scorecard with IC/ICIR/PBO/DSR gates, feature importance analysis, overfitting diagnostics, validation checklist tracker, and model comparison"
---

AlphaRank validation dashboard: model scorecard with IC/ICIR/PBO/DSR gates, feature importance analysis, overfitting diagnostics, validation checklist tracker, and model comparison

## Tool Reference

### enso_alpharank_validation_scorecard (primary)

Display AlphaRank model validation scorecard with key metrics (IC, ICIR, PBO, DSR, Sharpe, drawdown) and pass/fail gates for each model horizon M1-M12. Accepts metrics as JSON input or reads from a results file. Use when the user says: 'show validation scorecard', 'model metrics', 'how are my models doing', 'validation dashboard', 'AlphaRank scorecard'.

Parameters:
- `metrics` (string): JSON string of model metrics. Each model should have: name, trainIC, testIC, icir, pbo, dsr, sharpe, annualReturn, maxDrawdown. If omitted, reads from state or uses sample data.
- `filePath` (string): Path to a JSON results file containing model metrics. Optional.

### enso_alpharank_validation_features

View feature importance analysis for AlphaRank models: top features by SHAP/MDI importance, category breakdown, stability scores, and keep/cut recommendations. Accept feature data as JSON input. Use when the user says: 'show feature importance', 'which features matter', 'feature analysis', 'SHAP values'.

Parameters:
- `features` (string): JSON string of feature importance data. Each feature should have: name, importance, category, stability, recommendation. If omitted, uses sample data.
- `model` (string): Model name to show features for (e.g. 'M1', 'M6'). Defaults to best model.
- `topN` (number): Number of top features to display (default: 20)

### enso_alpharank_validation_diagnose

Run overfitting diagnostic analysis: train vs test comparison, IC decay curve, rolling IC, degrees of freedom, and LLM-powered recommendation engine. Use when the user says: 'diagnose overfitting', 'why is my model overfitting', 'overfitting analysis', 'train vs test gap'.

Parameters:
- `diagnostics` (string): JSON string of diagnostic data including train/test metrics over time. If omitted, uses sample data.
- `model` (string): Model name to diagnose (e.g. 'M1', 'M6'). Defaults to worst performing model.

### enso_alpharank_validation_checklist

Track AlphaRank validation progress: PBO test, CPCV implementation, DSR computation, transaction cost modeling, OOS test, paper trading. Persistent state saved to disk. Use when the user says: 'validation checklist', 'what validation steps remain', 'track validation progress', 'update checklist'.

Parameters:
- `action` (string): Action: 'view' to see checklist, 'update' to change an item's status. Default: view.
- `itemId` (string): Checklist item ID to update (e.g. 'pbo_test', 'cpcv', 'dsr', 'txcosts', 'oos_test', 'paper_trading')
- `status` (string): New status: 'not_started', 'in_progress', 'done'
- `notes` (string): Optional notes for the checklist item

### enso_alpharank_validation_compare

Compare two or more AlphaRank model configurations side by side. Show delta in key metrics, highlight which is better. Use when the user says: 'compare models', 'which model is better', 'model comparison', 'A vs B'.

Parameters:
- `configurations` (string): JSON string of model configurations to compare. Each should have: name, testIC, icir, pbo, sharpe, annualReturn, maxDrawdown, features, turnover. If omitted, uses sample data.
