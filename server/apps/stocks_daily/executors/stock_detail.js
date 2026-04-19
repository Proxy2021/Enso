// Per-ticker detail view — reads the FactorStrategies overview JSON and
// surfaces fundamentals + which presets currently hold the stock.

var fs = require("fs");
var path = require("path");

var FS_BASE = "D:/Github/FactorStrategies";
var holdingsPath = FS_BASE + "/data/development/daily_holdings/latest.json";
var financialsDir = FS_BASE + "/data/development/financials";
var watchlistPath = (process.env.HOME || process.env.USERPROFILE || "~") + "/.enso/data/factor-strategies/watchlist.json";

var ticker = (params && typeof params.ticker === "string") ? params.ticker.trim().toUpperCase() : "";
if (!ticker) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_stocks_daily_stock_detail",
    error: true,
    message: "ticker is required"
  }) }] };
}

function readJsonDirect(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) { return null; }
}

function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
function fmtMarketCap(raw) {
  var v = num(raw);
  if (v == null) return null;
  if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(0) + "M";
  return "$" + v.toFixed(0);
}

var ov = readJsonDirect(path.join(financialsDir, ticker + "_overview.json"));
if (!ov) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_stocks_daily_stock_detail",
    ticker: ticker,
    error: true,
    message: "No overview data available for " + ticker + " — file " + ticker + "_overview.json not found in FactorStrategies financials."
  }) }] };
}

// Which presets currently include this ticker?
var holdings = readJsonDirect(holdingsPath);
var presetsContaining = [];
if (holdings && holdings.presets) {
  var pids = Object.keys(holdings.presets);
  for (var i = 0; i < pids.length; i++) {
    var p = holdings.presets[pids[i]];
    if (p && Array.isArray(p.holdings) && p.holdings.indexOf(ticker) >= 0) {
      var w = (p.weights && typeof p.weights[ticker] === "number") ? p.weights[ticker] : 0;
      presetsContaining.push({
        presetId: pids[i],
        weight: w,
        weightPct: Math.round(w * 1000) / 10,
        rank: p.holdings.indexOf(ticker) + 1
      });
    }
  }
}

var watchlistData = readJsonDirect(watchlistPath);
var watchlist = (watchlistData && Array.isArray(watchlistData.tickers)) ? watchlistData.tickers : [];
var watching = watchlist.indexOf(ticker) >= 0;

// Distill fundamentals + analyst signal
var pe = num(ov.PERatio);
var pb = num(ov.PriceToBookRatio);
var eps = num(ov.EPS);
var divYield = num(ov.DividendYield);
var profMargin = num(ov.ProfitMargin);
var roe = num(ov.ReturnOnEquityTTM);
var revGrowth = num(ov.QuarterlyRevenueGrowthYOY);
var earningsGrowth = num(ov.QuarterlyEarningsGrowthYOY);
var beta = num(ov.Beta);
var w52High = num(ov["52WeekHigh"]);
var w52Low = num(ov["52WeekLow"]);
var target = num(ov.AnalystTargetPrice);

var analystCounts = {
  strongBuy: parseInt(ov.AnalystRatingStrongBuy || "0", 10),
  buy: parseInt(ov.AnalystRatingBuy || "0", 10),
  hold: parseInt(ov.AnalystRatingHold || "0", 10),
  sell: parseInt(ov.AnalystRatingSell || "0", 10),
  strongSell: parseInt(ov.AnalystRatingStrongSell || "0", 10)
};
var analystTotal = analystCounts.strongBuy + analystCounts.buy + analystCounts.hold + analystCounts.sell + analystCounts.strongSell;

var result = {
  tool: "enso_stocks_daily_stock_detail",
  ticker: ticker,
  watching: watching,
  name: ov.Name || ticker,
  description: ov.Description || "",
  sector: ov.Sector || "",
  industry: ov.Industry || "",
  exchange: ov.Exchange || "",
  country: ov.Country || "",
  officialSite: ov.OfficialSite || "",
  marketCap: fmtMarketCap(ov.MarketCapitalization),
  fundamentals: {
    pe: pe, pb: pb, eps: eps,
    dividendYield: divYield != null ? Math.round(divYield * 10000) / 100 : null,
    profitMargin: profMargin != null ? Math.round(profMargin * 10000) / 100 : null,
    roe: roe != null ? Math.round(roe * 10000) / 100 : null,
    revenueGrowthYoy: revGrowth != null ? Math.round(revGrowth * 10000) / 100 : null,
    earningsGrowthYoy: earningsGrowth != null ? Math.round(earningsGrowth * 10000) / 100 : null,
    beta: beta,
    w52High: w52High,
    w52Low: w52Low
  },
  analyst: {
    targetPrice: target,
    counts: analystCounts,
    total: analystTotal
  },
  presetsContaining: presetsContaining,
  inPresetCount: presetsContaining.length,
  totalPresets: holdings && holdings.presets ? Object.keys(holdings.presets).length : 0
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
