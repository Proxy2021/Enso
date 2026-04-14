var period = params.period || "20yr";

// Published benchmark data from academic research and index providers
// Sources: S&P Dow Jones Indices, Kenneth French Data Library, AQR, published ML backtests
var strategies = [];

if (period === "10yr") {
  strategies = [
    { name: "S&P 500 Buy & Hold", cagr: 12.8, sharpe: 0.78, maxDrawdown: -23.9, turnover: 5, category: "passive", description: "Market-cap weighted US large-cap index" },
    { name: "S&P 500 Equal Weight", cagr: 13.5, sharpe: 0.75, maxDrawdown: -27.2, turnover: 22, category: "passive", description: "Equal-weighted version with quarterly rebalance" },
    { name: "Value Factor Top 20", cagr: 11.8, sharpe: 0.68, maxDrawdown: -31.5, turnover: 95, category: "factor", description: "High book-to-market, monthly rebalance" },
    { name: "Momentum Factor Top 20", cagr: 15.1, sharpe: 0.88, maxDrawdown: -29.8, turnover: 180, category: "factor", description: "12-1 month momentum, monthly rebalance" },
    { name: "Quality Factor Top 30", cagr: 14.5, sharpe: 0.92, maxDrawdown: -22.1, turnover: 65, category: "factor", description: "ROE + low leverage + earnings stability" },
    { name: "Multi-Factor Composite", cagr: 15.8, sharpe: 1.02, maxDrawdown: -25.3, turnover: 130, category: "factor", description: "Value + Momentum + Quality blend" },
    { name: "ML Ensemble Top 30 (Backtest)", cagr: 19.2, sharpe: 1.18, maxDrawdown: -26.1, turnover: 155, category: "ml", description: "Gradient boosting + neural net ensemble, in-sample" },
    { name: "Target AlphaRank", cagr: 18.0, sharpe: 1.5, maxDrawdown: -25.0, turnover: 200, category: "target", description: "Our target performance with disciplined risk management" }
  ];
} else if (period === "full") {
  strategies = [
    { name: "S&P 500 Buy & Hold", cagr: 9.8, sharpe: 0.58, maxDrawdown: -50.9, turnover: 5, category: "passive", description: "Market-cap weighted US large-cap (1963-present)" },
    { name: "Equal-Weight Top 20 (Value)", cagr: 13.8, sharpe: 0.76, maxDrawdown: -52.3, turnover: 120, category: "factor", description: "High BM quintile, equal-weight, monthly" },
    { name: "Momentum Factor Top 20", cagr: 14.5, sharpe: 0.80, maxDrawdown: -55.1, turnover: 190, category: "factor", description: "12-1 month momentum — crashes in reversals" },
    { name: "Quality Factor Top 30", cagr: 12.2, sharpe: 0.82, maxDrawdown: -38.5, turnover: 60, category: "factor", description: "Defensive quality — lower drawdowns" },
    { name: "Multi-Factor Composite", cagr: 14.9, sharpe: 0.91, maxDrawdown: -42.1, turnover: 125, category: "factor", description: "Diversified factor exposure across regimes" },
    { name: "ML Ensemble Top 30 (Backtest)", cagr: 18.5, sharpe: 1.15, maxDrawdown: -28.4, turnover: 150, category: "ml", description: "Backtest-only — survivorship and look-ahead bias risk" },
    { name: "Target AlphaRank", cagr: 18.0, sharpe: 1.5, maxDrawdown: -25.0, turnover: 200, category: "target", description: "Aspirational target with ML + risk management" }
  ];
} else {
  // Default 20yr
  strategies = [
    { name: "S&P 500 Buy & Hold", cagr: 10.5, sharpe: 0.65, maxDrawdown: -33.9, turnover: 5, category: "passive", description: "Market-cap weighted US large-cap index" },
    { name: "Equal-Weight Top 20 (Value)", cagr: 14.2, sharpe: 0.82, maxDrawdown: -38.1, turnover: 120, category: "factor", description: "Top book-to-market quintile, equal-weight, monthly" },
    { name: "Momentum Factor Top 20", cagr: 14.8, sharpe: 0.84, maxDrawdown: -42.5, turnover: 185, category: "factor", description: "12-1 month momentum, monthly rebalance" },
    { name: "Quality Factor Top 30", cagr: 13.1, sharpe: 0.88, maxDrawdown: -28.9, turnover: 62, category: "factor", description: "ROE + low leverage + stable earnings" },
    { name: "Multi-Factor Composite", cagr: 15.2, sharpe: 0.95, maxDrawdown: -32.5, turnover: 128, category: "factor", description: "Value + Momentum + Quality blend" },
    { name: "ML Ensemble Top 30 (Backtest)", cagr: 18.5, sharpe: 1.15, maxDrawdown: -28.4, turnover: 150, category: "ml", description: "Gradient boosting + neural net ensemble, in-sample backtest" },
    { name: "Target AlphaRank", cagr: 18.0, sharpe: 1.5, maxDrawdown: -25.0, turnover: 200, category: "target", description: "Our target: ML ensemble + disciplined risk management" }
  ];
}

var notes = "Historical data sourced from published academic research (Fama-French, AQR). ML backtest results are in-sample and subject to overfitting bias. Target AlphaRank figures represent aspirational goals, not guaranteed returns. Past performance does not predict future results.";

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_strategy_simulator_benchmark",
      period: period,
      strategies: strategies,
      notes: notes
    })
  }]
};
