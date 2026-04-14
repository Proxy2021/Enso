---
name: strategy_simulator
description: "Portfolio strategy simulator for exploring construction parameters, risk budgeting, performance benchmarks, development roadmaps, and decision tracking for quantitative trading strategies"
---

Portfolio strategy simulator for exploring construction parameters, risk budgeting, performance benchmarks, development roadmaps, and decision tracking for quantitative trading strategies

## Tool Reference

### enso_strategy_simulator_configure (primary)

Configure portfolio construction parameters and see computed impact metrics. Adjusts holdings count, rebalance frequency, weighting scheme, concentration limits, and regime buffer. Use when the user says: 'configure strategy', 'set portfolio parameters', 'adjust holdings', 'strategy settings'.

Parameters:
- `holdings` (number): Number of holdings (10, 20, 30, or 50)
- `rebalanceFrequency` (string): Rebalance frequency: weekly, monthly, or quarterly
- `weightingScheme` (string): Weighting scheme: equal_weight, rank_weighted, or volatility_scaled
- `maxSingleWeight` (number): Maximum single-stock weight percentage (1-10)
- `maxSectorConcentration` (number): Maximum sector concentration percentage (15-40)
- `regimeBuffer` (boolean): Enable regime-conditional cash buffer

### enso_strategy_simulator_benchmark

Show historical performance reference table comparing benchmark strategies with CAGR, Sharpe ratio, max drawdown, and turnover data. Use when the user says: 'show benchmarks', 'performance comparison', 'historical returns', 'strategy comparison'.

Parameters:
- `period` (string): Historical period: 10yr, 20yr, or full (default: 20yr)

### enso_strategy_simulator_risk_calc

Interactive risk budget calculator. Given portfolio size, return target, and max drawdown, computes required Sharpe ratio, volatility budget, position count, transaction costs, and break-even win rate. Use when the user says: 'calculate risk budget', 'risk analysis', 'how much can I lose', 'position sizing'.

Parameters:
- `portfolioSize` (number): Portfolio size in dollars
- `returnTarget` (number): Annual return target percentage
- `maxDrawdown` (number): Maximum acceptable drawdown percentage
- `turnoverEstimate` (number): Estimated annual turnover percentage (default: 150)
- `commissionBps` (number): Commission in basis points per trade (default: 5)

### enso_strategy_simulator_roadmap

Show the development roadmap timeline with phases, deliverables, success criteria, and GO/NO-GO gates for building a quantitative trading strategy. Use when the user says: 'show roadmap', 'development timeline', 'project phases', 'what comes next'.

Parameters:
- `startMonth` (string): Start month in YYYY-MM format (default: current month)

### enso_strategy_simulator_checklist

Interactive decision checklist for tracking key milestones and go/no-go criteria in quantitative strategy development. Persists state across sessions. Use when the user says: 'show checklist', 'track progress', 'decision checklist', 'what have I completed'.

Parameters:
- `action` (string): Action: view, toggle, or reset
- `itemId` (string): Item ID to toggle (for toggle action)
