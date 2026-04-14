---
name: alpharank_roadmap
description: "Interactive development roadmap and progress tracker for the AlphaRank quant project. Shows phases, milestones, metrics, tech stack, and risk register with persistent state."
---

Interactive development roadmap and progress tracker for the AlphaRank quant project. Shows phases, milestones, metrics, tech stack, and risk register with persistent state.

## Tool Reference

### enso_alpharank_roadmap_overview (primary)

Show the full AlphaRank development roadmap with phase cards, metrics dashboard, tech stack checklist, and risk register. Use when the user says: 'show AlphaRank roadmap', 'open roadmap', 'AlphaRank progress', 'show development tracker'.

### enso_alpharank_roadmap_update_phase

Update the status of a development phase. Use when the user says: 'start phase 1', 'mark foundation complete', 'update phase status'.

Parameters:
- `phaseId` (string): Phase ID: foundation, alpha_research, portfolio, or production
- `status` (string): New status: not_started, in_progress, or complete

### enso_alpharank_roadmap_toggle_milestone

Toggle a milestone's completion status within a phase. Use when the user says: 'complete Qlib setup', 'mark milestone done', 'toggle milestone'.

Parameters:
- `phaseId` (string): Phase ID: foundation, alpha_research, portfolio, or production
- `milestoneId` (string): Milestone ID within the phase (e.g., qlib_setup, data_pipeline)

### enso_alpharank_roadmap_toggle_tech

Toggle a technology stack item's readiness status. Use when the user says: 'mark Python ready', 'toggle Qlib', 'update tech stack'.

Parameters:
- `techId` (string): Tech stack item ID: python, qlib, lightgbm, shap, fastapi, postgresql, or market_data

### enso_alpharank_roadmap_update_metric

Update a key performance metric's current value. Use when the user says: 'update CAGR to 8%', 'set Sharpe ratio', 'update metrics'.

Parameters:
- `metricId` (string): Metric ID: cagr, sharpe, max_dd, or ic
- `value` (string): Current value as string (e.g., '8.2%', '0.85', 'N/A')
