// Static factor library lookup — explains the methodology behind a preset.
// Pure data return, no LLM, no network. Safe for public landing-page actions.

var FACTORS = {
  "F1": { theme: "Value × Quality × Short Reversal", formula: "zscore(rank(-PB) × rank(ROIC) × rank(-ret_10d))", oosSharpe: 1.07, intuition: "Cheap stocks with high return-on-capital that just sold off." },
  "F2": { theme: "Quality-conditional Growth", formula: "where(ROIC > 60th pct, rank(earnings_growth_yoy), NaN)", oosSharpe: 0.86, intuition: "Earnings growth, but only among already-profitable businesses." },
  "F4": { theme: "Long-term Risk-adjusted Momentum", formula: "mean(ret_252) / std(ret_252)", oosSharpe: 0.86, intuition: "Year-long uptrends with low volatility along the way." },
  "F5": { theme: "Book-value Growth × Quality", formula: "zscore(book_value_growth) × rank(ROIC)", oosSharpe: 1.16, intuition: "Companies that compound book value while earning high returns on capital." },
  "F7": { theme: "Pure Defensive", formula: "rank(-beta) × rank(-max_drawdown_60)", oosSharpe: 0.87, intuition: "Low-beta stocks with shallow recent drawdowns." },
  "F8": { theme: "Asset Efficiency × Quality", formula: "zscore(asset_turnover) × rank(ROIC)", oosSharpe: 0.94, intuition: "Capital-light operators with strong returns." },
  "F13": { theme: "Conditional Low-beta × Efficiency", formula: "where(beta < median, zscore(asset_turnover))", oosSharpe: 1.20, intuition: "Defensive efficient operators — works best in late-cycle." },
  "F14": { theme: "Contrarian EPS", formula: "rank(-eps_revision_3m) × rank(-ret_60d)", oosSharpe: 1.00, intuition: "Bet against falling-estimate names that have already bled — a pure mean-reversion factor." },
  "F16": { theme: "GARP variant", formula: "rank(earnings_growth) / rank(PE)", oosSharpe: 1.30, intuition: "Growth at a reasonable price, classical." },
  "F17": { theme: "Deep Value", formula: "rank(-PB) × rank(-EV/EBITDA)", oosSharpe: 1.45, intuition: "Pure cheapness on multiple metrics — patient value." },
  "F20": { theme: "GARP", formula: "rank(earnings_yield) × rank(roe_growth)", oosSharpe: 1.93, intuition: "Highest-Sharpe factor in the library — yield × improving ROE." },
  "F21": { theme: "Value-momentum hybrid", formula: "zscore(book_yield) + zscore(ret_252)", oosSharpe: 1.10, intuition: "Cheap and trending — captures both styles when they align." },
  "F22": { theme: "Deep-value × Quality screen", formula: "where(roic > 0, rank(-PB))", oosSharpe: 1.25, intuition: "Cheap, but only profitable cheap." }
};

var PRESET_BLENDS = {
  "M9_4f_consensus":           { label: "M9 · 4-factor consensus (top 10)", factorIds: ["F1","F2","F4","F7"], blendDescription: "Four-factor voting across value (F1), quality-conditional growth (F2), long-term momentum (F4), and defensiveness (F7). A stock joins the portfolio when at least 2 of 4 factors rank it in their top decile." },
  "M11_6f_consensus":          { label: "M11 · 6-factor consensus (top 10)", factorIds: ["F1","F2","F4","F5","F7","F8"], blendDescription: "M9 blend extended with book-value growth × quality (F5) and asset efficiency × quality (F8). Wider voting base reduces single-factor drawdowns." },
  "M19_voltgt_QQQ_v2":         { label: "M19 · QQQ vol-targeted", factorIds: [], blendDescription: "Single-asset overlay: holds QQQ scaled inversely to its realized volatility. Cash buffers absorb regime shifts." },
  "M21_trend_QQQ_cash":        { label: "M21 · QQQ trend / cash", factorIds: [], blendDescription: "Trend-following: holds QQQ when price > 200-day MA, otherwise sits in cash. A simple regime filter." },
  "M22_F13F14_consensus":      { label: "M22 · F13+F14 consensus (top 5)", factorIds: ["F13","F14"], blendDescription: "Two-factor consensus: conditional low-beta × efficiency (F13) plus contrarian EPS (F14). Defensive bias with mean-reversion edge." },
  "M23_4f_TTM_top10":          { label: "M23 · 4-factor TTM (top 10)", factorIds: ["F1","F2","F4","F7"], blendDescription: "M9 blend rebuilt on trailing-twelve-month financial signals — smoother factor ranks at the cost of slower regime adaptation." },
  "M23_4f_top5":               { label: "M23 · 4-factor (top 5)", factorIds: ["F1","F2","F4","F7"], blendDescription: "Same blend as M23_top10, concentrated to the 5 highest-conviction names. Higher idiosyncratic risk, higher expected alpha per dollar." },
  "M24_5f_consensus":          { label: "M24 · 5-factor consensus (top 10)", factorIds: ["F1","F2","F4","F5","F7"], blendDescription: "Flagship blend: value (F1), quality-growth (F2), momentum (F4), book-growth (F5), and defensive (F7). Five complementary axes vote — a stock needs 3-of-5 agreement to enter." },
  "M25_F2F13F20F22_consensus": { label: "M25 · 4-factor consensus (top 5)", factorIds: ["F2","F13","F20","F22"], blendDescription: "Conditional + GARP cluster: quality-growth, low-beta×efficiency, GARP, and quality-screened deep value. All four favor profitable names." },
  "M26_F1F13F16F20F22_consensus": { label: "M26 · 5-factor consensus (top 5)", factorIds: ["F1","F13","F16","F20","F22"], blendDescription: "Wide conditional value: M25 plus value × quality × reversal (F1) and a GARP variant (F16). Most diversified value blend in the catalog." },
  "M27_F16F17F20F21_consensus":   { label: "M27 · 4-factor consensus (top 5)", factorIds: ["F16","F17","F20","F21"], blendDescription: "Pure value cluster: GARP variant, deep value, GARP, and value-momentum hybrid. All four style cousins — concentrated style bet." }
};

var presetId = (params && typeof params.presetId === "string") ? params.presetId : "";
if (!presetId) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_stocks_daily_factor_info",
    error: true,
    message: "presetId is required"
  }) }] };
}

var blend = PRESET_BLENDS[presetId];
if (!blend) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_stocks_daily_factor_info",
    presetId: presetId,
    label: presetId,
    blendDescription: "Unknown preset — see FactorStrategies/core/strategy/strategies.py for composition.",
    factors: []
  }) }] };
}

var factors = [];
for (var fi = 0; fi < blend.factorIds.length; fi++) {
  var fid = blend.factorIds[fi];
  var fdef = FACTORS[fid];
  if (fdef) {
    factors.push({ id: fid, theme: fdef.theme, formula: fdef.formula, oosSharpe: fdef.oosSharpe, intuition: fdef.intuition });
  } else {
    factors.push({ id: fid, theme: "Unknown factor", formula: "—", oosSharpe: null, intuition: "" });
  }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_stocks_daily_factor_info",
  presetId: presetId,
  label: blend.label,
  blendDescription: blend.blendDescription,
  factors: factors
}) }] };
