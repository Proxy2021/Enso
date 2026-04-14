var portfolioSize = params.portfolioSize || 100000;
var returnTarget = params.returnTarget || 18;
var maxDrawdown = params.maxDrawdown || 25;
var turnoverEstimate = params.turnoverEstimate || 150;
var commissionBps = params.commissionBps || 5;

// Validate
if (portfolioSize < 1000) portfolioSize = 1000;
if (portfolioSize > 100000000) portfolioSize = 100000000;
if (returnTarget < 1) returnTarget = 1;
if (returnTarget > 100) returnTarget = 100;
if (maxDrawdown < 5) maxDrawdown = 5;
if (maxDrawdown > 80) maxDrawdown = 80;

// --- Core Calculations ---

// Implied volatility from max drawdown
// Using approximation: MaxDD ≈ volatility × drawdown_multiplier × sqrt(T)
// For a multi-year horizon, drawdown_multiplier ≈ 2.0-2.5 for normal markets
var drawdownMultiplier = 2.0;
var impliedVolatility = Math.round(maxDrawdown / drawdownMultiplier * 100) / 100;

// Required Sharpe ratio
// Sharpe = (Return - RiskFreeRate) / Volatility
var riskFreeRate = 4.5; // Current approximate risk-free rate
var excessReturn = returnTarget - riskFreeRate;
var requiredSharpe = Math.round(excessReturn / impliedVolatility * 100) / 100;

// Suggested position count
// Using 1/N heuristic adjusted for concentration targets
var suggestedPositions = Math.round(100 / (maxDrawdown / 5));
if (suggestedPositions < 10) suggestedPositions = 10;
if (suggestedPositions > 100) suggestedPositions = 100;

// Annual transaction costs
// Costs = Portfolio × Turnover × 2 (buy+sell) × Commission(bps)/10000
// Plus estimated market impact
var commissionCosts = portfolioSize * (turnoverEstimate / 100) * 2 * (commissionBps / 10000);
var marketImpactBps = Math.min(20, portfolioSize > 1000000 ? 8 : 3); // larger portfolios have more impact
var marketImpactCosts = portfolioSize * (turnoverEstimate / 100) * 2 * (marketImpactBps / 10000);
var annualTransactionCosts = Math.round(commissionCosts + marketImpactCosts);
var transactionCostPct = Math.round(annualTransactionCosts / portfolioSize * 10000) / 100;

// Break-even win rate
// Assuming equal-sized wins and losses: WinRate = 0.5 + costs / (2 × gross_return)
var grossReturn = portfolioSize * returnTarget / 100;
var breakEvenWinRate = Math.round((0.5 + annualTransactionCosts / (2 * grossReturn)) * 10000) / 100;
if (breakEvenWinRate > 99) breakEvenWinRate = 99;

// Kelly fraction
// Kelly = (p × b - q) / b where p = win rate, b = avg win/avg loss, q = 1-p
// Using simplified: Kelly ≈ (Sharpe² / vol) for normal returns
var kellyFraction = Math.round(requiredSharpe * requiredSharpe / (impliedVolatility / 100) * 100) / 100;
if (kellyFraction > 1) kellyFraction = 1;
if (kellyFraction < 0) kellyFraction = 0;

// Risk of ruin (simplified)
// Using approximation: P(ruin) ≈ ((1-edge)/(1+edge))^(capital/unit)
var edge = (returnTarget - transactionCostPct) / 100;
var riskOfRuin = 0;
if (edge > 0) {
  riskOfRuin = Math.round(Math.pow((1 - edge) / (1 + edge), suggestedPositions) * 10000) / 100;
} else {
  riskOfRuin = 99.9;
}
if (riskOfRuin < 0.01) riskOfRuin = 0.01;

// Net return after costs
var netReturn = Math.round((returnTarget - transactionCostPct) * 100) / 100;

var inputs = {
  portfolioSize: portfolioSize,
  returnTarget: returnTarget,
  maxDrawdown: maxDrawdown,
  turnoverEstimate: turnoverEstimate,
  commissionBps: commissionBps,
  riskFreeRate: riskFreeRate
};

var outputs = {
  requiredSharpe: requiredSharpe,
  impliedVolatility: impliedVolatility,
  suggestedPositions: suggestedPositions,
  annualTransactionCosts: annualTransactionCosts,
  transactionCostPct: transactionCostPct,
  breakEvenWinRate: breakEvenWinRate,
  kellyFraction: kellyFraction,
  riskOfRuin: riskOfRuin,
  netReturnAfterCosts: netReturn,
  excessReturn: excessReturn
};

var formulas = {
  sharpe: "Required Sharpe = (Return Target - Risk Free Rate) / Implied Volatility = (" + returnTarget + "% - " + riskFreeRate + "%) / " + impliedVolatility + "% = " + requiredSharpe,
  volatility: "Implied Vol = Max Drawdown / Drawdown Multiplier = " + maxDrawdown + "% / " + drawdownMultiplier + " = " + impliedVolatility + "%",
  positions: "Suggested Positions = 100 / (Max DD / 5) = 100 / " + (maxDrawdown / 5).toFixed(1) + " = " + suggestedPositions,
  costs: "Annual Costs = Portfolio × Turnover × 2 × (Commission + Impact) = $" + portfolioSize.toLocaleString() + " × " + turnoverEstimate + "% × 2 × " + (commissionBps + marketImpactBps) + "bps = $" + annualTransactionCosts.toLocaleString(),
  winRate: "Break-even Win Rate = 50% + Costs / (2 × Gross Return) = 50% + $" + annualTransactionCosts.toLocaleString() + " / (2 × $" + grossReturn.toLocaleString() + ") = " + breakEvenWinRate + "%"
};

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_strategy_simulator_risk_calc",
      inputs: inputs,
      outputs: outputs,
      formulas: formulas
    })
  }]
};
