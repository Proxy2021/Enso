export default function GeneratedUI({ data, onAction }) {
  var fmtMoney = function(v, currency) {
    if (v == null || isNaN(v)) return "—";
    var c = currency || "USD";
    return c + " " + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var fmtDate = function(s) {
    if (!s) return "—";
    try { var d = new Date(s); if (isNaN(d.getTime())) return s; return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
    catch (e) { return s; }
  };
  var fmtTime = function(s) {
    if (!s) return "";
    try { var d = new Date(s); if (isNaN(d.getTime())) return ""; return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
    catch (e) { return ""; }
  };

  var tool = data && data.tool ? data.tool : "";

  // ── RM EMAIL REFRESH result ──
  if (tool === "enso_finances_refresh_rm_emails") {
    return (
      <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={function() { onAction("list_accounts", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← Accounts</button>
        </div>
        <div style={{ background: "linear-gradient(135deg,#0f172a,#1e1b4b)", borderRadius: "12px", padding: "16px 20px", border: "1px solid " + (data.success ? "#10b981" : "#dc2626") }}>
          <div style={{ color: data.success ? "#a7f3d0" : "#fecaca", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>{data.success ? "RM emails refreshed" : "Refresh failed"}</div>
          <div style={{ color: "#f8fafc", fontSize: "16px", fontWeight: 600, marginTop: "4px" }}>{data.message}</div>
          <div style={{ display: "flex", gap: "16px", marginTop: "10px", fontSize: "12px", color: "#cbd5e1" }}>
            <span>Banks: <b>{data.banksProcessed || 0}</b></span>
            <span>Scanned: <b>{data.totalScanned || 0}</b></span>
            <span>Matched: <b>{data.totalMatched || 0}</b></span>
            <span>Extracted: <b style={{ color: "#10b981" }}>{data.totalExtracted || 0}</b></span>
            {data.totalCached ? <span>Cached: <b>{data.totalCached}</b></span> : null}
          </div>
        </div>
        {(data.bankResults || []).map(function(b) {
          return (
            <div key={b.bankId} style={{ background: "#0f172a", borderRadius: "10px", padding: "12px 16px", border: "1px solid " + (b.error ? "#7f1d1d" : "#1e293b") }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ color: "#f1f5f9", fontSize: "14px", fontWeight: 700 }}>{b.displayName || b.bankId}</div>
                  <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: 2 }}>
                    {b.error ? <span style={{ color: "#fca5a5" }}>✗ {b.error}</span> : (
                      <span>{b.scanned} scanned · {b.matched} matched · <b style={{ color: "#10b981" }}>{b.extracted}</b> extracted{b.latestPeriod ? " · latest " + b.latestPeriod : ""}</span>
                    )}
                  </div>
                </div>
              </div>
              {b.extracts && b.extracts.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {b.extracts.slice(0, 6).map(function(e, idx) {
                    return (
                      <div key={idx} style={{ fontSize: 11, color: e.error ? "#fca5a5" : "#94a3b8", fontFamily: "monospace" }}>
                        · {(e.date || "").slice(0,10)} {e.period ? "[" + e.period + "]" : ""} {e.error ? ("ERR: " + e.error.slice(0,80)) : (e.holdingsCount + "h")} · {(e.subject || "").slice(0,60)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── REFRESH KK_LIVE result toast ──
  if (tool === "enso_finances_refresh_kk_live") {
    return (
      <div style={{ padding: "12px 16px", background: "#0f172a", border: "1px solid " + (data.success ? "#10b981" : "#dc2626"), borderRadius: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ fontSize: "18px" }}>{data.success ? "✓" : "✗"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#f1f5f9", fontSize: "14px", fontWeight: 600 }}>{data.message}</div>
          {data.success && (
            <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "2px" }}>
              {data.totalAccountsInIndex} accounts in index · {data.statementsWritten} new statement pages
            </div>
          )}
        </div>
        <button onClick={function() { onAction("list_accounts", {}); }} style={{ padding: "6px 12px", background: "#312e81", border: "1px solid #4c1d95", borderRadius: "6px", color: "#e0e7ff", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>View accounts →</button>
      </div>
    );
  }

  // ── ACCOUNT_DETAIL view ──
  if (tool === "enso_finances_account_detail") {
    if (data.error) {
      return (
        <div style={{ padding: "16px" }}>
          <EmptyState icon="alert-circle" title={data.message || "Account not found"} description="" />
          <div style={{ marginTop: 12 }}>
            <button onClick={function() { onAction("list_accounts", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← Accounts</button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={function() { onAction("list_accounts", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← Accounts</button>
          <span style={{ color: "#64748b", fontSize: "11px" }}>Updated {fmtTime(data.lastUpdated)}</span>
        </div>

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#0f172a,#1e1b4b)", borderRadius: "12px", padding: "18px 22px", border: "1px solid #1e293b" }}>
          <div style={{ color: "#a5b4fc", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>{(data.institution || "—").toUpperCase()} · {(data.accountType || "account").toUpperCase()}</div>
          <div style={{ color: "#f8fafc", fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>{data.displayName}</div>
          <div style={{ display: "flex", gap: "20px", marginTop: "10px", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>Current value</div>
              <div style={{ color: "#10b981", fontSize: "20px", fontWeight: 700, fontFamily: "monospace" }}>{fmtMoney(data.currentValue, data.baseCurrency)}</div>
            </div>
            <div>
              <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>Cash</div>
              <div style={{ color: "#fbbf24", fontSize: "16px", fontWeight: 600, fontFamily: "monospace", marginTop: "2px" }}>{fmtMoney(data.cash, data.baseCurrency)}</div>
            </div>
            {data.lastRebalanceDate && (
              <div>
                <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>Last rebalance</div>
                <div style={{ color: "#cbd5e1", fontSize: "14px", marginTop: "4px" }}>{fmtDate(data.lastRebalanceDate)}</div>
              </div>
            )}
            {data.strategyType && (
              <div>
                <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>Strategy</div>
                <div style={{ color: "#c4b5fd", fontSize: "14px", marginTop: "4px", fontFamily: "monospace" }}>{data.strategyType}</div>
              </div>
            )}
          </div>
        </div>

        {/* Holdings */}
        <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>
            Current Holdings · {data.holdings.length}
          </div>
          {data.holdings.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>No open positions — full cash.</div>
          ) : (
            data.holdings.map(function(h, i) {
              return (
                <div key={h.ticker} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: "12px" }}>
                  <div style={{ width: "60px", color: "#f1f5f9", fontWeight: 700, fontSize: "13px", fontFamily: "monospace" }}>{h.ticker}</div>
                  <div style={{ flex: 1, fontSize: "12px", color: "#94a3b8" }}>
                    {h.shares ? h.shares + " shares" : "—"}
                    {h.buyPrice ? " @ " + fmtMoney(h.buyPrice, data.baseCurrency) : ""}
                  </div>
                  <div style={{ width: "120px", textAlign: "right", color: "#cbd5e1", fontSize: "13px", fontFamily: "monospace" }}>{fmtMoney(h.value, data.baseCurrency)}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Statements list */}
        <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>
            Periodic Statements · most recent {data.statements.length}
          </div>
          {data.statements.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>No statements recorded yet.</div>
          ) : (
            data.statements.map(function(s, i) {
              return (
                <div key={s.statementId} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: "12px" }}>
                  <div style={{ width: "100px", color: "#cbd5e1", fontSize: "13px", fontFamily: "monospace" }}>{s.period}</div>
                  <div style={{ flex: 1, fontSize: "12px", color: "#94a3b8" }}>
                    <span style={{ color: "#a5b4fc" }}>{s.action}</span>
                    {s.preset ? <span> · <code style={{ background: "#1e293b", padding: "1px 6px", borderRadius: "3px", fontSize: "11px" }}>{s.preset}</code></span> : null}
                    {s.plannedBoughtCount > 0 ? <span> · +{s.plannedBoughtCount} buys</span> : null}
                    {s.plannedSoldCount > 0 ? <span> · −{s.plannedSoldCount} sells</span> : null}
                  </div>
                  <div style={{ width: "120px", textAlign: "right", color: "#10b981", fontSize: "12px", fontFamily: "monospace" }}>{fmtMoney(s.totalValue, data.baseCurrency)}</div>
                  <button
                    onClick={function() { onAction("statement_detail", { statementId: s.statementId }); }}
                    style={{ padding: "4px 10px", background: "#1e1b4b", color: "#c4b5fd", border: "1px solid #4c1d95", borderRadius: "5px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}
                  >View →</button>
                </div>
              );
            })
          )}
        </div>

        {/* Recent activity */}
        {data.recentActivity && data.recentActivity.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>
              Recent Activity
            </div>
            {data.recentActivity.map(function(t, i) {
              return (
                <div key={i} style={{ display: "flex", padding: "8px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: "12px", fontSize: "12px" }}>
                  <div style={{ width: "100px", color: "#94a3b8", fontFamily: "monospace" }}>{fmtDate(t.date)}</div>
                  <div style={{ width: "60px", color: t.action === "buy" || t.action === "BUY" ? "#10b981" : "#fca5a5", fontWeight: 600, fontFamily: "monospace" }}>{t.action}</div>
                  <div style={{ flex: 1, color: "#cbd5e1", fontFamily: "monospace" }}>{t.ticker}{t.shares ? " · " + t.shares + "sh" : ""}</div>
                  <div style={{ color: "#cbd5e1", fontFamily: "monospace" }}>{fmtMoney(t.value || t.price, data.baseCurrency)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── STATEMENT_DETAIL view ──
  if (tool === "enso_finances_statement_detail") {
    if (data.error) {
      return (
        <div style={{ padding: "16px" }}>
          <EmptyState icon="alert-circle" title={data.message || "Statement not found"} description="" />
        </div>
      );
    }

    return (
      <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={function() { onAction("account_detail", { accountId: data.accountId }); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← {data.accountName}</button>
          <span style={{ color: "#64748b", fontSize: "11px" }}>{data.action}</span>
        </div>

        <div style={{ background: "linear-gradient(135deg,#0f172a,#1e1b4b)", borderRadius: "12px", padding: "16px 20px", border: "1px solid #4c1d95" }}>
          <div style={{ color: "#a5b4fc", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>Statement · {data.action}</div>
          <div style={{ color: "#f8fafc", fontSize: "20px", fontWeight: 700, marginTop: "4px" }}>{data.period}</div>
          <div style={{ display: "flex", gap: "16px", marginTop: "10px", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase" }}>Closing value</div>
              <div style={{ color: "#10b981", fontSize: "16px", fontWeight: 700, fontFamily: "monospace" }}>{fmtMoney(data.closingValue, data.baseCurrency)}</div>
            </div>
            <div>
              <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase" }}>Cash</div>
              <div style={{ color: "#fbbf24", fontSize: "14px", fontFamily: "monospace" }}>{fmtMoney(data.cash, data.baseCurrency)}</div>
            </div>
            {data.preset && (
              <div>
                <div style={{ color: "#64748b", fontSize: "10px", textTransform: "uppercase" }}>Preset</div>
                <div style={{ color: "#c4b5fd", fontSize: "14px", fontFamily: "monospace" }}>{data.preset}</div>
              </div>
            )}
          </div>
          {data.presetMeta && data.presetMeta.factors && data.presetMeta.factors.length > 0 && (
            <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {data.presetMeta.factors.map(function(f) {
                return <span key={f} style={{ background: "#312e81", color: "#c4b5fd", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontFamily: "monospace", fontWeight: 700 }}>{f}</span>;
              })}
            </div>
          )}
        </div>

        {/* Net change panel (RM-extracted statements typically have this) */}
        {(data.netChange != null || data.netChangePct != null || data.fees != null || data.dividends != null) && (
          <div style={{ background: "#0f172a", borderRadius: "10px", padding: "12px 16px", border: "1px solid #1e293b", display: "flex", gap: "20px", flexWrap: "wrap", fontSize: "12px" }}>
            {data.openingValue != null && (
              <div><div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase" }}>Opening</div><div style={{ color: "#cbd5e1", fontFamily: "monospace" }}>{fmtMoney(data.openingValue, data.baseCurrency)}</div></div>
            )}
            {data.netChange != null && (
              <div><div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase" }}>Net change</div><div style={{ color: data.netChange >= 0 ? "#10b981" : "#fca5a5", fontFamily: "monospace" }}>{(data.netChange >= 0 ? "+" : "") + fmtMoney(data.netChange, data.baseCurrency)}{data.netChangePct != null ? " (" + (data.netChangePct >= 0 ? "+" : "") + data.netChangePct + "%)" : ""}</div></div>
            )}
            {data.fees != null && (
              <div><div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase" }}>Fees</div><div style={{ color: "#fca5a5", fontFamily: "monospace" }}>{fmtMoney(data.fees, data.baseCurrency)}</div></div>
            )}
            {data.dividends != null && (
              <div><div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase" }}>Dividends</div><div style={{ color: "#10b981", fontFamily: "monospace" }}>{fmtMoney(data.dividends, data.baseCurrency)}</div></div>
            )}
          </div>
        )}

        {/* RM commentary */}
        {data.rmCommentary && (
          <div style={{ background: "#0f172a", borderRadius: "10px", padding: "14px 18px", border: "1px solid #4c1d95" }}>
            <div style={{ color: "#c4b5fd", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: "6px" }}>RM Commentary</div>
            <div style={{ color: "#cbd5e1", fontSize: "13px", lineHeight: 1.6, fontStyle: "italic" }}>"{data.rmCommentary}"</div>
          </div>
        )}

        {/* Holdings (RM-extracted) */}
        {data.holdings && data.holdings.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>
              Holdings · {data.holdings.length}
            </div>
            {data.holdings.map(function(h, i) {
              var w = h.weight != null ? Math.round(h.weight * 1000) / 10 : null;
              return (
                <div key={i} style={{ display: "flex", padding: "8px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: "12px", fontSize: "12px" }}>
                  <div style={{ width: "30px", color: "#475569", fontFamily: "monospace" }}>#{i + 1}</div>
                  <div style={{ flex: 1, color: "#f1f5f9", fontWeight: 600, fontFamily: "monospace" }}>{h.ticker || "—"}</div>
                  {h.value != null && <div style={{ color: "#cbd5e1", fontFamily: "monospace" }}>{fmtMoney(h.value, data.baseCurrency)}</div>}
                  {w != null && <div style={{ color: "#a5b4fc", fontFamily: "monospace", width: 50, textAlign: "right" }}>{w}%</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Target holdings (KK_Live) */}
        {data.targetHoldings && data.targetHoldings.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>
              Target Holdings · {data.targetHoldings.length}
            </div>
            {data.targetHoldings.map(function(h, i) {
              return (
                <div key={h.ticker} style={{ display: "flex", padding: "8px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: "12px", fontSize: "12px" }}>
                  <div style={{ width: "30px", color: "#475569", fontFamily: "monospace" }}>#{i + 1}</div>
                  <div style={{ flex: 1, color: "#f1f5f9", fontWeight: 600, fontFamily: "monospace" }}>{h.ticker}</div>
                  <div style={{ color: "#cbd5e1", fontFamily: "monospace" }}>{h.weightPct != null ? h.weightPct + "%" : "—"}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Transactions (RM-extracted) */}
        {data.transactions && data.transactions.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>
              Transactions · {data.transactions.length}
            </div>
            {data.transactions.map(function(t, i) {
              var isPositive = t.action === "buy" || t.action === "deposit" || t.action === "dividend";
              return (
                <div key={i} style={{ display: "flex", padding: "8px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: "12px", fontSize: "12px" }}>
                  <div style={{ width: "85px", color: "#94a3b8", fontFamily: "monospace" }}>{t.date || "?"}</div>
                  <div style={{ width: "70px", color: isPositive ? "#10b981" : "#fca5a5", fontWeight: 600, fontFamily: "monospace" }}>{t.action || "?"}</div>
                  <div style={{ flex: 1, color: "#cbd5e1", fontFamily: "monospace" }}>{t.ticker || ""}</div>
                  <div style={{ color: "#cbd5e1", fontFamily: "monospace" }}>{fmtMoney(t.amount, data.baseCurrency)}</div>
                </div>
              );
            })}
          </div>
        )}

        {((data.plannedBought && data.plannedBought.length > 0) || (data.plannedSold && data.plannedSold.length > 0)) && (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {data.plannedBought && data.plannedBought.length > 0 && (
              <div style={{ flex: 1, minWidth: "240px", background: "#0f172a", borderRadius: "10px", padding: "12px 14px", border: "1px solid #064e3b" }}>
                <div style={{ color: "#a7f3d0", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: "8px" }}>Planned buys · {data.plannedBought.length}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {data.plannedBought.map(function(t) {
                    return <span key={t} style={{ background: "#064e3b", color: "#a7f3d0", padding: "3px 8px", borderRadius: "4px", fontFamily: "monospace", fontSize: "12px" }}>{t}</span>;
                  })}
                </div>
              </div>
            )}
            {data.plannedSold && data.plannedSold.length > 0 && (
              <div style={{ flex: 1, minWidth: "240px", background: "#0f172a", borderRadius: "10px", padding: "12px 14px", border: "1px solid #7f1d1d" }}>
                <div style={{ color: "#fecaca", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: "8px" }}>Planned sells · {data.plannedSold.length}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {data.plannedSold.map(function(t) {
                    return <span key={t} style={{ background: "#7f1d1d", color: "#fecaca", padding: "3px 8px", borderRadius: "4px", fontFamily: "monospace", fontSize: "12px" }}>{t}</span>;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── WEALTH_STATUS dashboard ──
  if (tool === "enso_finances_wealth_status") {
    var accts = data.accounts || [];
    var alerts = data.alerts || [];
    var refreshes = data.recentRefreshes || [];
    var spark = (data.sparkline || []).filter(function(p) { return p.value > 0; });
    var cfg = data.config || {};
    var rs = data.refreshStatus || {};
    var sevColors = { ok: "#10b981", warn: "#fbbf24", alert: "#f97316", critical: "#ef4444" };
    var sevBg = { ok: "#064e3b", warn: "#713f12", alert: "#7c2d12", critical: "#7f1d1d" };
    var alertIcons = { "daily-swing": "↕", "milestone-crossed": "⬆", "concentration": "⚖", "staleness": "⏰", "refresh-failure": "✗" };

    return (
      <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <button onClick={function() { onAction("list_accounts", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← Accounts</button>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={function() { onAction("refresh_log", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>Refresh Log</button>
            <button onClick={function() { onAction("wealth_config", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>Settings</button>
          </div>
        </div>

        {/* Net worth hero */}
        <div style={{ background: "linear-gradient(135deg,#0f172a,#1e1b4b)", borderRadius: "14px", padding: "20px 24px", border: "1px solid #1e293b" }}>
          <div style={{ color: "#a5b4fc", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>Wealth Monitor</div>
          <div style={{ color: "#f8fafc", fontSize: "28px", fontWeight: 800, marginTop: "4px", fontFamily: "monospace" }}>{fmtMoney(data.primaryTotal, data.primaryCurrency)}</div>
          {data.delta != null && (
            <div style={{ marginTop: 4, fontSize: 13, fontFamily: "monospace" }}>
              <span style={{ color: data.delta >= 0 ? "#10b981" : "#fca5a5", fontWeight: 700 }}>{data.delta >= 0 ? "▲" : "▼"} {fmtMoney(Math.abs(data.delta), data.primaryCurrency)}{data.deltaPct != null ? " (" + (data.delta >= 0 ? "+" : "") + data.deltaPct + "%)" : ""}</span>
              <span style={{ color: "#64748b", marginLeft: 8 }}>vs. {data.deltaPeriod}</span>
            </div>
          )}
          <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "6px" }}>
            {data.totalAccounts} account{data.totalAccounts === 1 ? "" : "s"}
            {" · "}{accts.filter(function(a) { return a.severity === "ok"; }).length} fresh
            {" · "}{accts.filter(function(a) { return a.severity !== "ok"; }).length} stale
          </div>

          {/* Sparkline */}
          {spark.length >= 2 && (function() {
            var maxV = spark.reduce(function(m, p) { return p.value > m ? p.value : m; }, 0) || 1;
            var minV = spark.reduce(function(m, p) { return p.value < m ? p.value : m; }, maxV);
            var rng = Math.max(1, maxV - minV);
            return (
              <div style={{ marginTop: 14 }}>
                <svg width="100%" height="40" viewBox={"0 0 " + (spark.length * 36) + " 40"} preserveAspectRatio="none" style={{ width: "100%", height: 40 }}>
                  <polyline fill="none" stroke="#a5b4fc" strokeWidth="2"
                    points={spark.map(function(p, i) { return (i * 36 + 18) + "," + (36 - ((p.value - minV) / rng) * 32); }).join(" ")} />
                  {spark.map(function(p, i) { return <circle key={i} cx={i * 36 + 18} cy={36 - ((p.value - minV) / rng) * 32} r="2" fill="#c4b5fd" />; })}
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#475569", fontSize: 9, fontFamily: "monospace" }}>
                  <span>{spark[0].date}</span><span>{spark[spark.length - 1].date}</span>
                </div>
              </div>
            );
          })()}

          <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
            <button onClick={function() { onAction("refresh_kk_live", {}); }} style={{ padding: "7px 14px", background: "#312e81", color: "#e0e7ff", border: "1px solid #4c1d95", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>↻ KK_Live</button>
            <button onClick={function() { onAction("refresh_rm_emails", {}); }} style={{ padding: "7px 14px", background: "#1e1b4b", color: "#c4b5fd", border: "1px solid #4c1d95", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>↻ RM Emails</button>
          </div>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #7f1d1d" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e293b", color: "#fca5a5", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>
              Active Alerts · {alerts.length}
            </div>
            {alerts.map(function(a, i) {
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: "10px" }}>
                  <span style={{ width: 24, height: 24, borderRadius: "50%", background: sevBg[a.severity] || "#1e293b", color: sevColors[a.severity] || "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{alertIcons[a.type] || "!"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: 600 }}>{a.title}</div>
                    <div style={{ color: "#64748b", fontSize: "11px", marginTop: 1 }}>{a.type} · {a.severity}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {alerts.length === 0 && (
          <div style={{ background: "#0f172a", borderRadius: "10px", padding: "16px 20px", border: "1px solid #064e3b", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#10b981", fontSize: 18 }}>✓</span>
            <span style={{ color: "#a7f3d0", fontSize: 13, fontWeight: 600 }}>No active alerts — all accounts healthy</span>
          </div>
        )}

        {/* Account health matrix */}
        <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>
            Account Health · {accts.length}
          </div>
          {accts.map(function(a, i) {
            return (
              <div key={a.accountId} onClick={function() { onAction("account_detail", { accountId: a.accountId }); }} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: "10px", cursor: "pointer" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColors[a.severity] || "#64748b", flexShrink: 0 }}></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#f1f5f9", fontSize: "13px", fontWeight: 600 }}>{a.displayName}</div>
                  <div style={{ color: "#64748b", fontSize: "11px" }}>
                    {a.institution ? a.institution.toUpperCase() + " · " : ""}{a.accountType}
                    {a.lastUpdated ? " · updated " + fmtDate(a.lastUpdated) : " · never updated"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#10b981", fontSize: "13px", fontWeight: 700, fontFamily: "monospace" }}>{fmtMoney(a.currentValue, a.baseCurrency)}</div>
                  <div style={{ color: sevColors[a.severity] || "#64748b", fontSize: "10px", fontFamily: "monospace" }}>
                    {a.severity === "ok" ? (Math.round(a.daysSinceUpdate) + "d ago") : (Math.round(a.daysSinceUpdate) + "d stale")}
                  </div>
                </div>
                <div style={{ color: "#64748b", fontSize: 14 }}>›</div>
              </div>
            );
          })}
        </div>

        {/* Refresh schedule */}
        <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>Refresh Schedule</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { label: "KK Live", info: rs.kkLive || {} },
              { label: "RM Emails", info: rs.rmEmails || {} }
            ].map(function(r, i) {
              return (
                <div key={r.label} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.info.enabled ? "#10b981" : "#64748b", flexShrink: 0 }}></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                    <div style={{ color: "#64748b", fontSize: 11, fontFamily: "monospace" }}>{r.info.cron || "—"}</div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "#94a3b8" }}>
                    {r.info.lastRefresh ? fmtTime(r.info.lastRefresh) : "Never"}
                    {r.info.lastSuccess === false && <span style={{ color: "#fca5a5", marginLeft: 4 }}>FAILED</span>}
                    {r.info.lastSuccess === true && <span style={{ color: "#10b981", marginLeft: 4 }}>OK</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Notification channels */}
        {cfg.channels && (
          <div style={{ background: "#0f172a", borderRadius: "10px", padding: "12px 16px", border: "1px solid #1e293b", display: "flex", gap: 16, flexWrap: "wrap" }}>
            {[
              { label: "Email", on: cfg.channels.email },
              { label: "WeChat", on: cfg.channels.wechat },
              { label: "In-App", on: cfg.channels.inApp }
            ].map(function(ch) {
              return (
                <div key={ch.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: ch.on ? "#10b981" : "#475569" }}></span>
                  <span style={{ color: ch.on ? "#cbd5e1" : "#64748b" }}>{ch.label}</span>
                </div>
              );
            })}
            <button onClick={function() { onAction("wealth_config", {}); }} style={{ marginLeft: "auto", padding: "4px 10px", background: "#1e293b", border: "1px solid #334155", borderRadius: "5px", color: "#94a3b8", fontSize: "11px", cursor: "pointer" }}>Configure →</button>
          </div>
        )}

        {/* Recent refreshes */}
        {refreshes.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>Recent Refreshes</span>
              <button onClick={function() { onAction("refresh_log", {}); }} style={{ padding: "3px 8px", background: "#1e293b", border: "1px solid #334155", borderRadius: "4px", color: "#94a3b8", fontSize: "10px", cursor: "pointer" }}>View all →</button>
            </div>
            {refreshes.slice(0, 5).map(function(r, i) {
              return (
                <div key={i} style={{ display: "flex", padding: "8px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: 10, fontSize: 11, fontFamily: "monospace", alignItems: "center" }}>
                  <span style={{ color: r.success ? "#10b981" : "#fca5a5", fontWeight: 700 }}>{r.success ? "✓" : "✗"}</span>
                  <span style={{ color: "#94a3b8", width: 120 }}>{fmtTime(r.ts)}</span>
                  <span style={{ color: "#cbd5e1" }}>{r.source}</span>
                  <span style={{ color: "#64748b", marginLeft: "auto" }}>{(r.duration / 1000).toFixed(1)}s · {r.trigger}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── REFRESH_LOG view ──
  if (tool === "enso_finances_refresh_log") {
    var entries = data.entries || [];
    return (
      <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={function() { onAction("wealth_status", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← Monitor</button>
        </div>

        {/* Stats header */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 100, background: "#0f172a", borderRadius: 10, padding: "12px 16px", border: "1px solid #1e293b" }}>
            <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px" }}>Total</div>
            <div style={{ color: "#f8fafc", fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>{data.totalRefreshes}</div>
          </div>
          <div style={{ flex: 1, minWidth: 100, background: "#0f172a", borderRadius: 10, padding: "12px 16px", border: "1px solid #064e3b" }}>
            <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px" }}>Success Rate</div>
            <div style={{ color: "#10b981", fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>{data.successRate}%</div>
          </div>
          <div style={{ flex: 1, minWidth: 100, background: "#0f172a", borderRadius: 10, padding: "12px 16px", border: "1px solid #1e293b" }}>
            <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px" }}>Avg Duration</div>
            <div style={{ color: "#cbd5e1", fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>{(data.avgDurationMs / 1000).toFixed(1)}s</div>
          </div>
          <div style={{ flex: 1, minWidth: 100, background: "#0f172a", borderRadius: 10, padding: "12px 16px", border: "1px solid #1e293b" }}>
            <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px" }}>Last 7 Days</div>
            <div style={{ color: "#a5b4fc", fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>
              {data.last7Days ? data.last7Days.success : 0}<span style={{ color: "#10b981" }}>✓</span> {data.last7Days ? data.last7Days.failures : 0}<span style={{ color: "#fca5a5" }}>✗</span>
            </div>
          </div>
        </div>

        {/* Entries table */}
        <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>
            Refresh History · {entries.length} entries
          </div>
          {entries.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: 13 }}>No refresh history yet.</div>
          ) : entries.map(function(e, i) {
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: 8, fontSize: 12 }}>
                <span style={{ color: e.success ? "#10b981" : "#ef4444", fontWeight: 700, fontSize: 14, width: 20, textAlign: "center" }}>{e.success ? "✓" : "✗"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: "#f1f5f9", fontWeight: 600, fontFamily: "monospace" }}>{e.source}</span>
                    <span style={{ color: "#64748b", fontFamily: "monospace" }}>{fmtTime(e.ts)}</span>
                    <span style={{ background: "#1e293b", color: "#94a3b8", padding: "1px 6px", borderRadius: 3, fontSize: 10 }}>{e.trigger}</span>
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2, fontFamily: "monospace" }}>
                    {e.success ? (
                      <span>{e.accountsUpdated} account{e.accountsUpdated === 1 ? "" : "s"} · {e.newStatements || 0} statements · {(e.duration / 1000).toFixed(1)}s
                        {e.netWorthDelta != null ? " · Δ " + (e.netWorthDelta >= 0 ? "+" : "") + Math.round(e.netWorthDelta).toLocaleString() : ""}
                      </span>
                    ) : (
                      <span style={{ color: "#fca5a5" }}>{e.error || "Unknown error"}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── WEALTH_CONFIG view ──
  if (tool === "enso_finances_wealth_config") {
    var c = data.config || {};
    var sched = c.refreshSchedule || {};
    var stale = c.staleness || {};
    var thresh = c.thresholds || {};
    var chan = c.channels || {};
    return (
      <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={function() { onAction("wealth_status", {}); }} style={{ padding: "6px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: "6px", color: "#e2e8f0", fontSize: "12px", cursor: "pointer" }}>← Monitor</button>
          {data.updated && <span style={{ color: "#10b981", fontSize: 12, fontWeight: 600 }}>✓ Settings saved</span>}
        </div>

        {/* Refresh schedule */}
        <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>Refresh Schedule</div>
          {[
            { label: "KK Live", info: sched.kkLive || {}, enableKey: "kkLiveEnabled", cronKey: "kkLiveCron" },
            { label: "RM Emails", info: sched.rmEmails || {}, enableKey: "rmEmailsEnabled", cronKey: "rmEmailsCron" }
          ].map(function(r, i) {
            return (
              <div key={r.label} style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.info.enabled ? "#10b981" : "#475569", flexShrink: 0 }}></span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                  <div style={{ color: "#64748b", fontSize: 11, fontFamily: "monospace" }}>cron: {r.info.cron || "—"}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={function() {
                    var p = { action: "update" };
                    p[r.enableKey] = !r.info.enabled;
                    onAction("wealth_config", p);
                  }} style={{ padding: "4px 10px", background: r.info.enabled ? "#064e3b" : "#1e293b", border: "1px solid " + (r.info.enabled ? "#10b981" : "#334155"), borderRadius: 5, color: r.info.enabled ? "#a7f3d0" : "#94a3b8", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                    {r.info.enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Staleness thresholds */}
        <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>Staleness Thresholds</div>
          <div style={{ padding: "12px 16px", display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12 }}>
            <div>
              <div style={{ color: "#fbbf24", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px" }}>Warn</div>
              <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>{stale.warnDays || 7}d</div>
            </div>
            <div>
              <div style={{ color: "#f97316", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px" }}>Alert</div>
              <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>{stale.alertDays || 14}d</div>
            </div>
            <div>
              <div style={{ color: "#ef4444", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px" }}>Critical</div>
              <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>{stale.criticalDays || 30}d</div>
            </div>
          </div>
        </div>

        {/* Alert thresholds */}
        <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>Alert Thresholds</div>
          <div style={{ padding: "12px 16px", display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12 }}>
            <div>
              <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px" }}>Daily Swing</div>
              <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>{thresh.dailyChangePct || 3}%</div>
            </div>
            <div>
              <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px" }}>Concentration</div>
              <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>{thresh.concentrationPct || 25}%</div>
            </div>
          </div>
        </div>

        {/* Notification channels */}
        <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>Notification Channels</div>
          {[
            { label: "Email", on: chan.email, key: "emailEnabled" },
            { label: "WeChat", on: chan.wechat, key: "wechatEnabled" },
            { label: "In-App", on: chan.inApp, key: "inAppEnabled" }
          ].map(function(ch, i) {
            return (
              <div key={ch.label} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid #1e293b", gap: 10 }}>
                <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 600, flex: 1 }}>{ch.label}</span>
                <button onClick={function() {
                  var p = { action: "update" };
                  p[ch.key] = !ch.on;
                  onAction("wealth_config", p);
                }} style={{ padding: "5px 14px", background: ch.on ? "#064e3b" : "#1e293b", border: "1px solid " + (ch.on ? "#10b981" : "#334155"), borderRadius: 6, color: ch.on ? "#a7f3d0" : "#94a3b8", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                  {ch.on ? "ON" : "OFF"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── LIST_ACCOUNTS view (primary) ──
  if (data.error) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <EmptyState icon="alert-circle" title="Could not load accounts" description={data.message} />
      </div>
    );
  }

  var accounts = (data && Array.isArray(data.accounts)) ? data.accounts : [];
  var totals = data.totalValueByCurrency || {};

  return (
    <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: "16px" }}>

      {(function() {
        var nw = data.netWorth || { primaryCurrency: "USD", primaryTotal: 0, byCurrency: {}, breakdown: [] };
        var spark = (data.sparkline || []).filter(function(p) { return p.value > 0; });
        var maxVal = spark.reduce(function(m, p) { return p.value > m ? p.value : m; }, 0) || 1;
        var minVal = spark.reduce(function(m, p) { return p.value < m ? p.value : m; }, maxVal);
        var range = Math.max(1, maxVal - minVal);
        var deltaPositive = nw.delta != null && nw.delta >= 0;
        var deltaColor = nw.delta == null ? "#64748b" : (deltaPositive ? "#10b981" : "#fca5a5");
        return (
          <div style={{ background: "linear-gradient(135deg,#0f172a,#1e1b4b)", borderRadius: "14px", padding: "20px 24px", border: "1px solid #1e293b" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ color: "#a5b4fc", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>Net Worth</div>
                <div style={{ color: "#f8fafc", fontSize: "30px", fontWeight: 800, marginTop: "4px", fontFamily: "monospace", letterSpacing: "-0.5px" }}>{fmtMoney(nw.primaryTotal, nw.primaryCurrency)}</div>
                {nw.delta != null && (
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: "monospace" }}>
                    <span style={{ color: deltaColor, fontWeight: 700 }}>{deltaPositive ? "▲" : "▼"} {fmtMoney(Math.abs(nw.delta), nw.primaryCurrency)}{nw.deltaPct != null ? "  (" + (deltaPositive ? "+" : "") + nw.deltaPct + "%)" : ""}</span>
                    <span style={{ color: "#64748b" }}>vs. {nw.deltaPeriod}</span>
                  </div>
                )}
                <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "6px" }}>
                  Across <b style={{ color: "#cbd5e1" }}>{data.totalAccounts || 0}</b> account{data.totalAccounts === 1 ? "" : "s"}
                  {data.lastRefreshAt && <span> · refreshed {fmtTime(data.lastRefreshAt)}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={function() { onAction("refresh_kk_live", {}); }} style={{ padding: "8px 14px", background: "#312e81", color: "#e0e7ff", border: "1px solid #4c1d95", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>↻ KK_Live</button>
                <button onClick={function() { onAction("refresh_rm_emails", {}); }} style={{ padding: "8px 14px", background: "#1e1b4b", color: "#c4b5fd", border: "1px solid #4c1d95", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>↻ RM emails</button>
              </div>
            </div>

            {/* Sparkline */}
            {spark.length >= 2 && (
              <div style={{ marginTop: 16, position: "relative", height: 44 }}>
                <svg width="100%" height="44" viewBox={"0 0 " + (spark.length * 40) + " 44"} preserveAspectRatio="none" style={{ width: "100%", height: 44 }}>
                  <polyline
                    fill="none"
                    stroke="#a5b4fc"
                    strokeWidth="2"
                    points={spark.map(function(p, i) {
                      var x = i * 40 + 20;
                      var y = 40 - ((p.value - minVal) / range) * 36;
                      return x + "," + y;
                    }).join(" ")}
                  />
                  {spark.map(function(p, i) {
                    var x = i * 40 + 20;
                    var y = 40 - ((p.value - minVal) / range) * 36;
                    return <circle key={i} cx={x} cy={y} r="2.5" fill="#c4b5fd" />;
                  })}
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#475569", fontSize: 9, fontFamily: "monospace", marginTop: 2 }}>
                  <span>{spark[0].date}</span><span>{spark[spark.length - 1].date}</span>
                </div>
              </div>
            )}

            {/* Per-currency totals (if multiple) */}
            {Object.keys(nw.byCurrency).length > 1 && (
              <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid #1e293b" }}>
                {Object.keys(nw.byCurrency).filter(function(c) { return c !== nw.primaryCurrency; }).map(function(c) {
                  return (
                    <div key={c}>
                      <div style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px" }}>{c} Total</div>
                      <div style={{ color: "#cbd5e1", fontSize: 14, fontFamily: "monospace", fontWeight: 600 }}>{fmtMoney(nw.byCurrency[c], c)}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Breakdown by account type */}
            {nw.breakdown && nw.breakdown.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
                {nw.breakdown.map(function(b) {
                  var share = nw.primaryTotal > 0 ? Math.round((b.primaryValue / nw.primaryTotal) * 100) : 0;
                  return (
                    <div key={b.type} style={{ background: "#0f172a", border: "1px solid #1e293b", padding: "6px 12px", borderRadius: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ color: "#94a3b8", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px" }}>{b.type} · {b.accountCount}</div>
                      <div style={{ color: "#a5b4fc", fontSize: 12, fontFamily: "monospace", fontWeight: 600 }}>{fmtMoney(b.primaryValue, nw.primaryCurrency)} <span style={{ color: "#64748b" }}>({share}%)</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Consolidated top holdings across all accounts */}
      {data.consolidatedHoldings && data.consolidatedHoldings.length > 0 && (
        <div style={{ background: "#0f172a", borderRadius: "10px", border: "1px solid #1e293b" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e293b", color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
            <span>Consolidated Holdings · top {data.consolidatedHoldings.length}</span>
            <span style={{ color: "#64748b" }}>across all accounts</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 14px" }}>
            {data.consolidatedHoldings.map(function(h) {
              var multi = h.accountCount > 1;
              return (
                <span key={h.ticker} style={{
                  padding: "5px 10px",
                  background: multi ? "#1e1b4b" : "#1e293b",
                  border: "1px solid " + (multi ? "#4c1d95" : "#334155"),
                  borderRadius: 6,
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: multi ? "#e0e7ff" : "#cbd5e1"
                }} title={h.accounts.join(", ")}>
                  <b>{h.ticker}</b>
                  {multi ? <span style={{ color: "#a5b4fc", marginLeft: 4 }}>×{h.accountCount}</span> : null}
                  {h.totalValue > 0 ? <span style={{ color: "#64748b", marginLeft: 6, fontWeight: 400 }}>{fmtMoney(h.totalValue, h.currency)}</span> : null}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div style={{ background: "#0f172a", borderRadius: "10px", padding: "32px 20px", border: "1px solid #1e293b", textAlign: "center" }}>
          <div style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "8px" }}>{data.message || "No accounts indexed yet."}</div>
          <div style={{ color: "#64748b", fontSize: "12px", marginBottom: "16px" }}>Click <b>Refresh</b> above to scan local accounts.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {accounts.map(function(a) {
            return (
              <div
                key={a.accountId}
                onClick={function() { onAction("account_detail", { accountId: a.accountId }); }}
                style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "10px", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: "16px" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ color: "#f1f5f9", fontSize: "16px", fontWeight: 700 }}>{a.displayName}</span>
                    <span style={{ background: "#1e293b", color: "#94a3b8", padding: "1px 7px", borderRadius: "4px", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>{a.accountType}</span>
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "4px" }}>
                    {(a.institution || "—").toUpperCase()} · {a.holdingsCount || 0} holdings · {a.statementCount || 0} statements
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#10b981", fontSize: "16px", fontWeight: 700, fontFamily: "monospace" }}>{fmtMoney(a.currentValue, a.baseCurrency)}</div>
                  {a.cash != null && a.cash > 0 && (
                    <div style={{ color: "#fbbf24", fontSize: "11px", fontFamily: "monospace", marginTop: "2px" }}>{fmtMoney(a.cash, a.baseCurrency)} cash</div>
                  )}
                </div>
                <div style={{ color: "#64748b", fontSize: "16px" }}>›</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ color: "#475569", fontSize: "10px", textAlign: "center", padding: "4px" }}>
        All financial data lives in ~/.enso/wiki/ and ~/.enso/data/finances/ — local only, never committed.
      </div>
    </div>
  );
}
