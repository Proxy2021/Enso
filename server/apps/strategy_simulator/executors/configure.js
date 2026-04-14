var holdings = params.holdings || 30;
var rebalanceFrequency = params.rebalanceFrequency || "monthly";
var weightingScheme = params.weightingScheme || "equal_weight";
var maxSingleWeight = params.maxSingleWeight || 5;
var maxSectorConcentration = params.maxSectorConcentration || 25;
var regimeBuffer = params.regimeBuffer === true;

// Validate inputs
var validHoldings = [10, 20, 30, 50];
if (validHoldings.indexOf(holdings) === -1) {
  holdings = 30;
}
if (maxSingleWeight < 1) maxSingleWeight = 1;
if (maxSingleWeight > 10) maxSingleWeight = 10;
if (maxSectorConcentration < 15) maxSectorConcentration = 15;
if (maxSectorConcentration > 40) maxSectorConcentration = 40;

// Compute metrics based on configuration
var rebalanceMultiplier = rebalanceFrequency === "weekly" ? 3.0 : rebalanceFrequency === "monthly" ? 1.0 : 0.4;
var estimatedTurnover = Math.round(holdings * rebalanceMultiplier * (weightingScheme === "volatility_scaled" ? 1.3 : 1.0) * 4.5);
if (estimatedTurnover > 400) estimatedTurnover = 400;

// Diversification score (1-10 scale)
var diversificationBase = holdings >= 50 ? 9 : holdings >= 30 ? 7.5 : holdings >= 20 ? 6 : 4.5;
var sectorPenalty = (maxSectorConcentration - 15) / 25 * 2; // higher concentration = lower diversification
var diversificationScore = Math.round((diversificationBase - sectorPenalty) * 10) / 10;
if (diversificationScore < 1) diversificationScore = 1;
if (diversificationScore > 10) diversificationScore = 10;

// Concentration risk
var concentrationRisk = maxSingleWeight > 7 ? "High" : maxSingleWeight > 4 ? "Medium" : "Low";

// Rebalance cost impact
var costPerRebalance = weightingScheme === "equal_weight" ? 0.08 : weightingScheme === "rank_weighted" ? 0.12 : 0.15;
var rebalancesPerYear = rebalanceFrequency === "weekly" ? 52 : rebalanceFrequency === "monthly" ? 12 : 4;
var rebalanceCostImpact = Math.round(costPerRebalance * rebalancesPerYear * 100) / 100;

// Effective positions (HHI-adjusted)
var weightPerStock = weightingScheme === "equal_weight" ? 1 / holdings :
  weightingScheme === "rank_weighted" ? 1.5 / holdings : 1.2 / holdings;
var hhi = weightingScheme === "equal_weight" ? 1 / holdings :
  weightingScheme === "rank_weighted" ? 1.5 / holdings : 1.3 / holdings;
var effectivePositions = Math.round(1 / hhi * 10) / 10;

// Warnings
var warnings = [];
if (maxSingleWeight > 7) warnings.push("High single-stock concentration increases idiosyncratic risk");
if (rebalanceFrequency === "weekly" && holdings < 20) warnings.push("Weekly rebalancing with few holdings may cause excessive transaction costs");
if (maxSectorConcentration > 35) warnings.push("Sector concentration above 35% exposes portfolio to sector-specific shocks");
if (regimeBuffer) warnings.push("Regime buffer can reduce returns by 2-4% in sustained bull markets");
if (estimatedTurnover > 250) warnings.push("High estimated turnover (" + estimatedTurnover + "%) will significantly impact net returns via transaction costs");

var config = {
  holdings: holdings,
  rebalanceFrequency: rebalanceFrequency,
  weightingScheme: weightingScheme,
  maxSingleWeight: maxSingleWeight,
  maxSectorConcentration: maxSectorConcentration,
  regimeBuffer: regimeBuffer
};

var metrics = {
  estimatedTurnover: "~" + estimatedTurnover + "%",
  diversificationScore: diversificationScore,
  concentrationRisk: concentrationRisk,
  rebalanceCostImpact: rebalanceCostImpact + "%",
  effectivePositions: effectivePositions,
  herfindahlIndex: Math.round(hhi * 1000) / 1000
};

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_strategy_simulator_configure",
      config: config,
      metrics: metrics,
      warnings: warnings
    })
  }]
};
