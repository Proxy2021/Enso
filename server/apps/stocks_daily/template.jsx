export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var fmtDate = function(s) {
    if (!s) return "—";
    try { var d = new Date(s); if (isNaN(d.getTime())) return s; return d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" }); }
    catch(e) { return s; }
  };
  var fmtMoney = function(v) {
    if (v == null) return "—";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    return "$" + v.toFixed(2);
  };

  var tool = data && data.tool ? data.tool : "";

  // ── ADD_TO_WATCHLIST result toast → snap back to dashboard ──
  if (tool === "enso_stocks_daily_add_to_watchlist") {
    return (
      <div style={{ padding: "12px 16px", background: "#0f172a", border: "1px solid " + (data.watching ? "#10b981" : "#6b7280"), borderRadius: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ fontSize: "18px" }}>{data.watching ? "★" : "☆"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#f1f5f9", fontSize: "14px", fontWeight: 600 }}>{data.message}</div>
          <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "2px" }}>Watchlist size: {data.watchlistSize}</div>
        </div>
        <button onClick={function() { onAction("today", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← Picks</button>
      </div>
    );
  }

  // ── FACTOR_INFO modal-style display ──
  if (tool === "enso_stocks_daily_factor_info") {
    return (
      <div style={{ padding: "16px", background: "#0a0e1a", borderRadius: "12px", border: "1px solid #1e293b" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
          <div>
            <div style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px" }}>Factor methodology</div>
            <div style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: 600, marginTop: "2px" }}>{data.label}</div>
          </div>
          <button onClick={function() { onAction("today", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← Picks</button>
        </div>
        <div style={{ color: "#cbd5e1", fontSize: "13px", lineHeight: 1.5, marginBottom: "16px", padding: "12px", background: "#0f172a", borderRadius: "8px", border: "1px solid #1e293b" }}>{data.blendDescription}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {(data.factors || []).map(function(f) {
            return (
              <div key={f.id} style={{ padding: "12px", background: "#0f172a", borderRadius: "8px", border: "1px solid #1e293b" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ background: "#312e81", color: "#c4b5fd", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, fontFamily: "monospace" }}>{f.id}</span>
                    <span style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: 600 }}>{f.theme}</span>
                  </div>
                  {f.oosSharpe != null && (
                    <span style={{ color: "#10b981", fontSize: "11px", fontFamily: "monospace" }}>OOS Sharpe {f.oosSharpe.toFixed(2)}</span>
                  )}
                </div>
                {f.formula && f.formula !== "—" && (
                  <div style={{ color: "#64748b", fontSize: "11px", fontFamily: "monospace", marginTop: "6px", padding: "6px 8px", background: "#020617", borderRadius: "4px", overflowX: "auto" }}>{f.formula}</div>
                )}
                {f.intuition && (
                  <div style={{ color: "#94a3b8", fontSize: "12px", lineHeight: 1.5, marginTop: "8px" }}>{f.intuition}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── STOCK_DETAIL view ──
  if (tool === "enso_stocks_daily_stock_detail") {
    if (data.error) {
      return (
        <div style={{ padding: "16px", background: "#0a0e1a", borderRadius: "12px", border: "1px solid #1e293b" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ color: "#f1f5f9", fontSize: "16px", fontWeight: 600 }}>{data.ticker}</div>
            <button onClick={function() { onAction("today", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← Picks</button>
          </div>
          <EmptyState icon="alert-circle" title="No detail data" description={data.message} />
        </div>
      );
    }

    var f = data.fundamentals || {};
    var a = data.analyst || {};
    var counts = a.counts || {};
    var totalAnalysts = a.total || 0;
    var bullPct = totalAnalysts > 0 ? Math.round(((counts.strongBuy || 0) + (counts.buy || 0)) / totalAnalysts * 100) : 0;
    var bearPct = totalAnalysts > 0 ? Math.round(((counts.sell || 0) + (counts.strongSell || 0)) / totalAnalysts * 100) : 0;

    return (
      <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: "12px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={function() { onAction("today", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← Back to picks</button>
          <button
            onClick={function() { onAction("add_to_watchlist", { ticker: data.ticker, action: data.watching ? "remove" : "add" }); }}
            style={{ padding: "6px 12px", background: data.watching ? "#422006" : "#1e293b", color: data.watching ? "#fbbf24" : "#cbd5e1", border: "1px solid " + (data.watching ? "#92400e" : "#334155"), borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
          >
            {data.watching ? "★ Watching" : "☆ Add to watchlist"}
          </button>
        </div>

        <div style={{ background: "linear-gradient(135deg,#0f172a,#1e1b4b)", borderRadius: "12px", padding: "18px 22px", border: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ color: "#f8fafc", fontSize: "26px", fontWeight: 700, fontFamily: "monospace" }}>{data.ticker}</span>
            <span style={{ color: "#cbd5e1", fontSize: "16px" }}>{data.name}</span>
          </div>
          <div style={{ display: "flex", gap: "12px", marginTop: "6px", flexWrap: "wrap", color: "#94a3b8", fontSize: "12px" }}>
            {data.sector && <span style={{ background: "#1e293b", padding: "2px 8px", borderRadius: "4px" }}>{data.sector}</span>}
            {data.industry && <span>{data.industry}</span>}
            {data.marketCap && <span>· Mkt cap {data.marketCap}</span>}
            {data.exchange && <span>· {data.exchange}</span>}
          </div>
          {data.description && (
            <div style={{ color: "#cbd5e1", fontSize: "13px", lineHeight: 1.6, marginTop: "12px" }}>{data.description}</div>
          )}
        </div>

        {/* Fundamentals grid */}
        <div style={{ background: "#0f172a", borderRadius: "10px", padding: "14px 16px", border: "1px solid #1e293b" }}>
          <div style={{ color: "#94a3b8", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: "10px" }}>Fundamentals</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
            {[
              { label: "P/E", value: f.pe != null ? f.pe.toFixed(2) : "—" },
              { label: "P/B", value: f.pb != null ? f.pb.toFixed(2) : "—" },
              { label: "EPS", value: f.eps != null ? "$" + f.eps.toFixed(2) : "—" },
              { label: "ROE", value: f.roe != null ? f.roe.toFixed(1) + "%" : "—" },
              { label: "Profit margin", value: f.profitMargin != null ? f.profitMargin.toFixed(1) + "%" : "—" },
              { label: "Earnings growth (YoY)", value: f.earningsGrowthYoy != null ? (f.earningsGrowthYoy > 0 ? "+" : "") + f.earningsGrowthYoy.toFixed(1) + "%" : "—" },
              { label: "Revenue growth (YoY)", value: f.revenueGrowthYoy != null ? (f.revenueGrowthYoy > 0 ? "+" : "") + f.revenueGrowthYoy.toFixed(1) + "%" : "—" },
              { label: "Dividend yield", value: f.dividendYield != null ? f.dividendYield.toFixed(2) + "%" : "—" },
              { label: "Beta", value: f.beta != null ? f.beta.toFixed(2) : "—" },
              { label: "52W range", value: (f.w52Low != null && f.w52High != null) ? "$" + f.w52Low.toFixed(0) + "–$" + f.w52High.toFixed(0) : "—" }
            ].map(function(s) {
              return (
                <div key={s.label}>
                  <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>{s.label}</div>
                  <div style={{ color: "#f1f5f9", fontSize: "14px", fontFamily: "monospace", marginTop: "2px" }}>{s.value}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Analyst signal */}
        {totalAnalysts > 0 && (
          <div style={{ background: "#0f172a", borderRadius: "10px", padding: "14px 16px", border: "1px solid #1e293b" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ color: "#94a3b8", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>Analyst signal · {totalAnalysts} analysts</div>
              {a.targetPrice != null && (
                <div style={{ color: "#10b981", fontSize: "13px", fontFamily: "monospace" }}>Target ${a.targetPrice.toFixed(2)}</div>
              )}
            </div>
            <div style={{ display: "flex", height: "10px", borderRadius: "5px", overflow: "hidden", background: "#1e293b" }}>
              <div style={{ width: bullPct + "%", background: "#10b981" }} title={"Buy " + bullPct + "%"}></div>
              <div style={{ width: (100 - bullPct - bearPct) + "%", background: "#6b7280" }} title="Hold"></div>
              <div style={{ width: bearPct + "%", background: "#dc2626" }} title={"Sell " + bearPct + "%"}></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", color: "#94a3b8", fontSize: "11px" }}>
              <span style={{ color: "#10b981" }}>● Buy {(counts.strongBuy || 0) + (counts.buy || 0)}</span>
              <span>● Hold {counts.hold || 0}</span>
              <span style={{ color: "#fca5a5" }}>● Sell {(counts.sell || 0) + (counts.strongSell || 0)}</span>
            </div>
          </div>
        )}

        {/* Presets containing this stock */}
        {data.presetsContaining && data.presetsContaining.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: "10px", padding: "14px 16px", border: "1px solid #1e293b" }}>
            <div style={{ color: "#10b981", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: "8px" }}>
              Held by {data.inPresetCount} of {data.totalPresets} presets today
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {data.presetsContaining.map(function(p) {
                return (
                  <span key={p.presetId} style={{ padding: "4px 10px", background: "#1e293b", borderRadius: "6px", color: "#cbd5e1", fontSize: "11px", fontFamily: "monospace" }}>
                    {p.presetId} · #{p.rank} · {p.weightPct}%
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── PORTFOLIO_CHECKIN result view ──
  if (tool === "enso_stocks_daily_portfolio_checkin") {
    var ok = data.success;
    var s = data.summary || {};
    var swaps = s.swaps || [];

    return (
      <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={function() { onAction("today", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← Picks</button>
          {data.dryRun && <span style={{ color: "#fbbf24", fontSize: "11px", padding: "2px 8px", background: "#422006", borderRadius: "4px", border: "1px solid #92400e" }}>DRY RUN · no trades</span>}
        </div>

        <div style={{ background: ok ? "linear-gradient(135deg,#064e3b,#0f172a)" : "linear-gradient(135deg,#7f1d1d,#0f172a)", borderRadius: "12px", padding: "16px 20px", border: "1px solid " + (ok ? "#10b981" : "#dc2626") }}>
          <div style={{ color: ok ? "#a7f3d0" : "#fecaca", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>{ok ? "Check-in complete" : "Check-in failed"}</div>
          <div style={{ color: "#f8fafc", fontSize: "16px", fontWeight: 600, marginTop: "4px" }}>{data.message}</div>
          <div style={{ display: "flex", gap: "16px", marginTop: "10px", flexWrap: "wrap", fontSize: "12px", color: "#cbd5e1" }}>
            <span>Account: <b style={{ color: "#f1f5f9", fontFamily: "monospace" }}>{data.account}</b></span>
            {s.currentValue != null && <span>Value: <b style={{ color: "#10b981", fontFamily: "monospace" }}>{fmtMoney(s.currentValue)}</b></span>}
            {s.totalReturnPct != null && <span>Return: <b style={{ color: s.totalReturnPct >= 0 ? "#10b981" : "#fca5a5", fontFamily: "monospace" }}>{(s.totalReturnPct >= 0 ? "+" : "") + s.totalReturnPct.toFixed(2)}%</b></span>}
            <span>Duration: {(data.durationMs / 1000).toFixed(1)}s</span>
          </div>
        </div>

        {swaps.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: "10px", padding: "14px 16px", border: "1px solid #4c1d95" }}>
            <div style={{ color: "#c4b5fd", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: "8px" }}>Swaps detected ({swaps.length})</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {swaps.map(function(sw, idx) {
                var isBuy = sw.action === "buy";
                return (
                  <span key={idx} style={{ padding: "4px 10px", background: isBuy ? "#064e3b" : "#7f1d1d", color: isBuy ? "#a7f3d0" : "#fecaca", borderRadius: "6px", fontSize: "12px", fontFamily: "monospace", fontWeight: 600 }}>
                    {isBuy ? "BUY " : "SELL "}{sw.ticker}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <details style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
          <summary style={{ padding: "10px 14px", color: "#94a3b8", fontSize: "12px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>Full transcript ({data.outputLength} bytes)</summary>
          <pre style={{ margin: 0, padding: "12px 14px", color: "#cbd5e1", fontSize: "11px", fontFamily: "ui-monospace,SFMono-Regular,Consolas,monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "420px", overflow: "auto", background: "#020617", borderTop: "1px solid #1e293b", borderRadius: "0 0 10px 10px" }}>{data.output || "(no output)"}</pre>
        </details>
      </div>
    );
  }

  // ── ERROR / empty ──
  if (data && data.error) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <EmptyState icon="alert-circle" title="No picks available" description={data.message || "Daily holdings file not found."} />
      </div>
    );
  }

  // ═════════════════════════════════════════
  // ── TODAY view (primary) — picks-focused ─
  // ═════════════════════════════════════════
  var presets = (data && Array.isArray(data.presets)) ? data.presets : [];
  var watchlist = (data && Array.isArray(data.watchlist)) ? data.watchlist : [];

  if (presets.length === 0) {
    return (
      <div style={{ padding: "20px" }}>
        <EmptyState icon="bar-chart-2" title="Daily Stock Picks" description="No presets in today's holdings file." />
      </div>
    );
  }

  // Active preset is enriched server-side. Fallback: first preset.
  var active = data.activePreset || presets.find(function(p) { return p.isActive; }) || presets[0];

  return (
    <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Header band */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)", borderRadius: "12px", padding: "16px 20px", border: "1px solid #1e293b" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ color: "#a5b4fc", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600 }}>Daily Stock Picks</div>
            <div style={{ color: "#f8fafc", fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>{fmtDate(data.panelDate)}</div>
            <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "4px" }}>
              Top {active.holdings.length} from <span style={{ color: "#cbd5e1", fontFamily: "monospace" }}>{active.id}</span>
              {data.universeSize ? <span> · {data.universeSize}-ticker universe</span> : null}
            </div>
          </div>
          {watchlist.length > 0 && (
            <div style={{ background: "#1e293b", padding: "8px 14px", borderRadius: "8px", border: "1px solid #334155" }}>
              <div style={{ color: "#94a3b8", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>Your watchlist</div>
              <div style={{ color: "#fbbf24", fontSize: "14px", marginTop: "2px", fontWeight: 600 }}>★ {watchlist.length}</div>
            </div>
          )}
        </div>
      </div>

      {/* Preset switcher — dropdown. Defaults to latest (M-number descending). */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600 }}>Strategy preset</span>
        <select
          value={active.id}
          onChange={function(e) { onAction("today", { preset: e.target.value }); }}
          style={{
            flex: 1,
            minWidth: "240px",
            padding: "8px 12px",
            background: "#0f172a",
            color: "#e0e7ff",
            border: "1px solid #4c1d95",
            borderRadius: "8px",
            fontSize: "13px",
            fontFamily: "monospace",
            fontWeight: 600,
            cursor: "pointer",
            appearance: "auto"
          }}
        >
          {presets.map(function(p) {
            return (
              <option key={p.id} value={p.id} style={{ background: "#0f172a", color: "#e0e7ff" }}>
                {(p.isFlagship ? "◆ " : "  ") + p.id + " · " + p.holdings.length + " holdings · " + p.theme}
              </option>
            );
          })}
        </select>
      </div>

      {/* Active preset header */}
      <div style={{ background: "#0f172a", borderRadius: "10px", padding: "12px 16px", border: "1px solid " + (active.isFlagship ? "#4c1d95" : "#1e293b") }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ flex: 1, minWidth: "240px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              {active.isFlagship && <span style={{ background: "#92400e", color: "#fbbf24", padding: "1px 6px", borderRadius: "4px", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>Flagship</span>}
              <span style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px" }}>{active.theme}</span>
            </div>
            <div style={{ color: "#cbd5e1", fontSize: "13px", lineHeight: 1.5 }}>{active.factorBlend}</div>
            <div style={{ display: "flex", gap: "14px", marginTop: "8px", fontSize: "11px", color: "#94a3b8", flexWrap: "wrap" }}>
              <span><b style={{ color: "#10b981" }}>{active.nFilled}/{active.nTarget}</b> filled</span>
              <span><b style={{ color: "#cbd5e1" }}>{active.nQualify}</b> qualifying</span>
              {active.cashFraction > 0 && <span><b style={{ color: "#fbbf24" }}>{active.cashPct}%</b> cash</span>}
            </div>
          </div>
          <button
            onClick={function() { onAction("factor_info", { presetId: active.id }); }}
            style={{ padding: "8px 14px", background: "#1e1b4b", color: "#c4b5fd", border: "1px solid #4c1d95", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Why this blend? →
          </button>
        </div>
      </div>

      {/* Picks list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {active.holdings.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>No qualifying holdings today — full cash position.</div>
        ) : (
          active.holdings.map(function(h) {
            return (
              <div key={h.ticker} style={{ background: "#0f172a", border: "1px solid " + (h.watching ? "#92400e" : "#1e293b"), borderRadius: "10px", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ width: "36px", textAlign: "center", flexShrink: 0 }}>
                    <div style={{ color: "#475569", fontSize: "10px", fontFamily: "monospace" }}>#{h.rank}</div>
                    <div style={{ color: "#a5b4fc", fontSize: "13px", fontWeight: 700, fontFamily: "monospace", marginTop: "2px" }}>{h.weightPct}%</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ color: "#f1f5f9", fontSize: "16px", fontWeight: 700, fontFamily: "monospace" }}>{h.ticker}</span>
                      {h.companyName && <span style={{ color: "#cbd5e1", fontSize: "13px" }}>{h.companyName}</span>}
                      {h.sector && <span style={{ background: "#1e293b", color: "#94a3b8", padding: "1px 7px", borderRadius: "4px", fontSize: "10px" }}>{h.sector}</span>}
                    </div>
                    {h.description ? (
                      <div style={{ color: "#cbd5e1", fontSize: "12px", lineHeight: 1.5, marginTop: "6px" }}>{h.description}</div>
                    ) : (
                      <div style={{ color: "#475569", fontSize: "12px", marginTop: "6px", fontStyle: "italic" }}>No company description on file.</div>
                    )}
                    <div style={{ color: "#a5b4fc", fontSize: "11px", lineHeight: 1.5, marginTop: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ color: "#64748b" }}>WHY:</span>
                      <span>{h.whyChosen}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
                    {h.hasDetail && (
                      <button
                        onClick={function() { onAction("stock_detail", { ticker: h.ticker }); }}
                        style={{ padding: "6px 10px", background: "#1e1b4b", color: "#c4b5fd", border: "1px solid #4c1d95", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Detail →
                      </button>
                    )}
                    <button
                      onClick={function() { onAction("add_to_watchlist", { ticker: h.ticker, action: h.watching ? "remove" : "add" }); }}
                      style={{ padding: "6px 10px", background: h.watching ? "#422006" : "transparent", color: h.watching ? "#fbbf24" : "#475569", border: "1px solid " + (h.watching ? "#92400e" : "#334155"), borderRadius: "6px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}
                      title={h.watching ? "Remove from watchlist" : "Add to watchlist"}
                    >
                      {h.watching ? "★ Watching" : "☆ Watch"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Portfolio check-in CTA */}
      <div style={{ background: "linear-gradient(135deg, #1e1b4b, #0f172a)", borderRadius: "12px", padding: "18px 20px", border: "1px solid #4c1d95", marginTop: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div style={{ color: "#c4b5fd", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>💰 Portfolio check-in</div>
            <div style={{ color: "#f1f5f9", fontSize: "14px", marginTop: "4px" }}>Compare KK_Live's current holdings against today's consensus and surface any swaps.</div>
            <div style={{ color: "#a5b4fc", fontSize: "11px", marginTop: "4px" }}>Runs <code style={{ background: "#020617", padding: "1px 6px", borderRadius: "3px", fontFamily: "monospace" }}>portfolio_manager.py checkin KK_Live</code> · 20-60s</div>
          </div>
          <button
            onClick={function() { onAction("portfolio_checkin", {}); }}
            style={{ padding: "10px 18px", background: "#10b981", color: "#022c22", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Run Check-in →
          </button>
        </div>
      </div>

      <div style={{ color: "#475569", fontSize: "10px", textAlign: "center", padding: "4px" }}>
        Compute panel as of {fmtDate(data.panelDate)} · FactorStrategies local engine
      </div>
    </div>
  );
}
