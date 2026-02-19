import type { ToolTemplate } from "../registry.js";

const ALPHARANK_SIGNATURES = new Set([
  "ranked_predictions_table",
  "market_regime_snapshot",
  "routine_execution_report",
  "ticker_detail",
]);

export function isAlphaRankSignature(signatureId: string): boolean {
  return ALPHARANK_SIGNATURES.has(signatureId);
}

function predictionsTemplate(): string {
  return `export default function GeneratedUI({ data, onAction }) {
  const [view, setView] = useState("table");
  const picks = Array.isArray(data?.rows)
    ? data.rows
    : Array.isArray(data?.picks)
      ? data.picks
      : Array.isArray(data?.predictions)
        ? data.predictions
        : [];
  const top = picks.slice(0, 12);
  const summary = {
    count: Number(data?.totalStocksScanned ?? data?.total_stocks ?? data?.total ?? picks.length || 0),
    date: String(data?.asOf ?? data?.date ?? "Latest run"),
  };
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">AlphaRank Tool Mode</div>
          <div className="text-sm font-semibold text-gray-100">Prediction Command Center</div>
          <div className="text-[11px] text-gray-500">{summary.date} • {summary.count} stocks scanned</div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => onAction("refresh", {})} className="px-2.5 py-1 text-xs rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 cursor-pointer">Refresh</button>
          <button onClick={() => onAction("market_regime", {})} className="px-2.5 py-1 text-xs rounded-full bg-indigo-600/30 border border-indigo-500/60 hover:bg-indigo-600/45 cursor-pointer">Market Regime</button>
          <button onClick={() => onAction("daily_routine", {})} className="px-2.5 py-1 text-xs rounded-full bg-emerald-600/30 border border-emerald-500/60 hover:bg-emerald-600/45 cursor-pointer">Run Daily Routine</button>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => setView("table")} className={\`px-2.5 py-1 text-xs rounded-md border \${view === "table" ? "bg-blue-600/30 border-blue-500/60 text-blue-200" : "bg-gray-800 border-gray-600 text-gray-300"}\`}>Top Picks</button>
        <button onClick={() => setView("grid")} className={\`px-2.5 py-1 text-xs rounded-md border \${view === "grid" ? "bg-blue-600/30 border-blue-500/60 text-blue-200" : "bg-gray-800 border-gray-600 text-gray-300"}\`}>Signals Grid</button>
      </div>
      {view === "table" ? (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {top.map((row, idx) => {
            const ticker = String(row?.ticker ?? row?.symbol ?? "N/A");
            const rank = Number(row?.rank ?? idx + 1);
            const score = Number(row?.rf_score ?? row?.compositeRank ?? row?.composite_rank ?? row?.score ?? 0);
            return (
              <button
                key={ticker + idx}
                onClick={() => onAction("predictions", { ticker })}
                className="w-full text-left bg-gray-800 border border-gray-600/50 rounded-md px-2.5 py-2 hover:bg-gray-700/60 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-100 font-medium">{rank}. {ticker}</div>
                  <div className="text-[11px] text-emerald-300">score {score.toFixed(2)}</div>
                </div>
                <div className="text-[11px] text-gray-500 mt-1">Tap for ticker-level prediction details.</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {top.slice(0, 8).map((row, idx) => {
            const ticker = String(row?.ticker ?? row?.symbol ?? "N/A");
            const signal = Number(row?.ranker_score ?? row?.rankerScore ?? row?.score ?? 0);
            const isPositive = signal >= 0;
            return (
              <button
                key={ticker + idx}
                onClick={() => onAction("predictions", { ticker })}
                className={\`text-left rounded-md border px-2.5 py-2 cursor-pointer transition-colors \${isPositive ? "bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/20" : "bg-rose-500/10 border-rose-500/40 hover:bg-rose-500/20"}\`}
              >
                <div className="text-xs text-gray-100 font-medium">{ticker}</div>
                <div className="text-[11px] text-gray-300 mt-0.5">signal {signal.toFixed(3)}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}`;
}

function regimeTemplate(): string {
  return `export default function GeneratedUI({ data, onAction }) {
  const regime = String(data?.regime ?? data?.state ?? "Unknown");
  const confidence = Number(data?.confidence ?? data?.regimeConfidence ?? 0);
  const guidance = Array.isArray(data?.guidance) ? data.guidance : [];
  const isRiskOn = /risk\\s*on|bull/i.test(regime);
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">AlphaRank Tool Mode</div>
          <div className="text-sm font-semibold text-gray-100">Market Regime Radar</div>
        </div>
        <button onClick={() => onAction("refresh", {})} className="px-2.5 py-1 text-xs rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 cursor-pointer">Refresh</button>
      </div>
      <div className={\`rounded-lg border px-3 py-2 \${isRiskOn ? "bg-emerald-500/10 border-emerald-500/40" : "bg-amber-500/10 border-amber-500/40"}\`}>
        <div className="text-xs text-gray-200 font-medium">Regime: {regime}</div>
        <div className="text-[11px] text-gray-400 mt-0.5">Confidence {confidence.toFixed(2)}</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => onAction("predictions", {})} className="px-2.5 py-1.5 text-xs rounded-md bg-blue-600/30 border border-blue-500/60 hover:bg-blue-600/45 cursor-pointer">View Predictions</button>
        <button onClick={() => onAction("daily_routine", {})} className="px-2.5 py-1.5 text-xs rounded-md bg-emerald-600/30 border border-emerald-500/60 hover:bg-emerald-600/45 cursor-pointer">Run Routine</button>
      </div>
      <div className="space-y-1.5">
        {(guidance.length > 0 ? guidance : ["Rotate exposure based on regime shifts.", "Prefer high-liquidity names in uncertainty."]).slice(0, 4).map((item, idx) => (
          <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-1.5 text-xs text-gray-300">{String(item)}</div>
        ))}
      </div>
    </div>
  );
}`;
}

function routineTemplate(): string {
  return `export default function GeneratedUI({ data, onAction }) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const status = String(data?.status ?? "completed");
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">AlphaRank Tool Mode</div>
          <div className="text-sm font-semibold text-gray-100">Daily Routine Execution</div>
          <div className="text-[11px] text-gray-500">{status}</div>
        </div>
        <button onClick={() => onAction("daily_routine", {})} className="px-2.5 py-1 text-xs rounded-full bg-emerald-600/30 border border-emerald-500/60 hover:bg-emerald-600/45 cursor-pointer">Run Again</button>
      </div>
      <div className="space-y-1.5">
        {(steps.length > 0 ? steps : [{ step: "Load market data", status: "done" }, { step: "Generate ranking", status: "done" }, { step: "Publish picks", status: "done" }]).map((s, idx) => (
          <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-1.5 flex items-center justify-between">
            <div className="text-xs text-gray-200">{String(s?.step ?? s?.name ?? "Step")}</div>
            <div className="text-[11px] text-emerald-300">{String(s?.status ?? "done")}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => onAction("predictions", {})} className="px-2.5 py-1.5 text-xs rounded-md bg-blue-600/30 border border-blue-500/60 hover:bg-blue-600/45 cursor-pointer">See Picks</button>
        <button onClick={() => onAction("market_regime", {})} className="px-2.5 py-1.5 text-xs rounded-md bg-indigo-600/30 border border-indigo-500/60 hover:bg-indigo-600/45 cursor-pointer">Regime Check</button>
      </div>
    </div>
  );
}`;
}

function tickerDetailTemplate(): string {
  return `export default function GeneratedUI({ data, onAction }) {
  const ticker = String(data?.ticker ?? data?.symbol ?? "Ticker");
  const rank = data?.rank != null ? Number(data.rank) : null;
  const compositeRank = data?.compositeRank != null ? Number(data.compositeRank) : null;
  const predDate = String(data?.predictionDate ?? data?.date ?? "");
  const factors = Array.isArray(data?.factors) ? data.factors : [];
  const rfRank = data?.rfRank != null ? Number(data.rfRank) : null;
  const lgbRank = data?.lgbRank != null ? Number(data.lgbRank) : null;
  const rankerRank = data?.rankerRank != null ? Number(data.rankerRank) : null;
  const totalStocks = data?.total_stocks != null ? Number(data.total_stocks) : null;
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">AlphaRank Tool Mode</div>
          <div className="text-sm font-semibold text-gray-100">{ticker}</div>
          <div className="text-[11px] text-gray-500">{predDate}{totalStocks != null ? \` • \${totalStocks} stocks in universe\` : ""}</div>
        </div>
        <button onClick={() => onAction("predictions", {})} className="px-2.5 py-1 text-xs rounded-full bg-blue-600/30 border border-blue-500/60 hover:bg-blue-600/45 cursor-pointer">Back to Picks</button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {rank != null && (
          <div className="bg-indigo-500/10 border border-indigo-500/40 rounded-md px-2.5 py-2">
            <div className="text-[11px] text-gray-400">Overall Rank</div>
            <div className="text-lg font-bold text-indigo-200">#{rank}{totalStocks != null ? <span className="text-[11px] text-gray-500 font-normal"> / {totalStocks}</span> : ""}</div>
          </div>
        )}
        {compositeRank != null && (
          <div className="bg-gray-800 border border-gray-600/50 rounded-md px-2.5 py-2">
            <div className="text-[11px] text-gray-400">Composite Rank</div>
            <div className="text-lg font-bold text-gray-200">#{compositeRank}</div>
          </div>
        )}
      </div>
      {factors.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide">Model Scores</div>
          {factors.map((f, idx) => {
            const v = Number(f?.value ?? 0);
            const isPositive = v >= 0;
            return (
              <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-1.5 flex items-center justify-between">
                <div className="text-xs text-gray-300">{String(f?.name ?? "Score")}</div>
                <div className={\`text-xs font-mono \${isPositive ? "text-emerald-300" : "text-rose-300"}\`}>{v.toFixed(6)}</div>
              </div>
            );
          })}
        </div>
      )}
      {(rfRank != null || lgbRank != null || rankerRank != null) && (
        <div className="space-y-1">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide">Model Rankings</div>
          <div className="grid grid-cols-3 gap-1.5">
            {rfRank != null && (
              <div className="bg-gray-800 border border-gray-600/50 rounded-md px-2 py-1.5 text-center">
                <div className="text-[10px] text-gray-500">RF</div>
                <div className="text-xs font-semibold text-gray-200">#{rfRank}</div>
              </div>
            )}
            {lgbRank != null && (
              <div className="bg-gray-800 border border-gray-600/50 rounded-md px-2 py-1.5 text-center">
                <div className="text-[10px] text-gray-500">LGB</div>
                <div className="text-xs font-semibold text-gray-200">#{lgbRank}</div>
              </div>
            )}
            {rankerRank != null && (
              <div className="bg-gray-800 border border-gray-600/50 rounded-md px-2 py-1.5 text-center">
                <div className="text-[10px] text-gray-500">Ranker</div>
                <div className="text-xs font-semibold text-gray-200">#{rankerRank}</div>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => onAction("market_regime", {})} className="px-2.5 py-1.5 text-xs rounded-md bg-indigo-600/30 border border-indigo-500/60 hover:bg-indigo-600/45 cursor-pointer">Market Regime</button>
        <button onClick={() => onAction("refresh", {})} className="px-2.5 py-1.5 text-xs rounded-md bg-gray-700 border border-gray-600 hover:bg-gray-600 cursor-pointer">Refresh</button>
      </div>
    </div>
  );
}`;
}

export function getAlphaRankTemplateCode(signature: ToolTemplate): string {
  switch (signature.signatureId) {
    case "market_regime_snapshot":
      return regimeTemplate();
    case "routine_execution_report":
      return routineTemplate();
    case "ticker_detail":
      return tickerDetailTemplate();
    case "ranked_predictions_table":
    default:
      return predictionsTemplate();
  }
}
