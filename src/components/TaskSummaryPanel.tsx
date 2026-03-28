/**
 * TaskSummaryPanel — Shared rich summary component for orchestration tasks.
 *
 * Renders verdict badges, key findings with impact dots, rating bars,
 * and recommendations with priority tags. Used by OrchestrationCard
 * for task-level summaries and the completion overview.
 */

import { useState } from "react";
import type { TaskStructuredResult } from "@shared/types";

// ── Shared helpers ──

export function verdictColor(verdict?: string): string {
  if (!verdict) return "text-gray-400 bg-gray-500/15 border-gray-500/30";
  const v = verdict.toUpperCase();
  if (v === "PASS" || v.includes("STRONG") || v.includes("GOOD")) return "text-green-400 bg-green-500/15 border-green-500/30";
  if (v === "FAIL" || v.includes("CRITICAL") || v.includes("POOR")) return "text-red-400 bg-red-500/15 border-red-500/30";
  return "text-amber-400 bg-amber-500/15 border-amber-500/30";
}

export function ratingColor(val: number): string {
  if (val >= 7) return "bg-green-500";
  if (val >= 5) return "bg-amber-500";
  return "bg-red-500";
}

export const IMPACT_DOT: Record<string, string> = {
  high: "bg-red-400",
  medium: "bg-amber-400",
  low: "bg-gray-500",
};

export const PRIORITY_STYLE: Record<string, string> = {
  P0: "text-red-400 bg-red-500/15",
  P1: "text-amber-400 bg-amber-500/15",
  P2: "text-gray-400 bg-gray-500/15",
};

// ── TaskSummaryPanel ──

export default function TaskSummaryPanel({ structuredResult, resultSummary, expanded }: {
  structuredResult?: TaskStructuredResult;
  resultSummary?: string;
  expanded: boolean;
}) {
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [showAllRecs, setShowAllRecs] = useState(false);

  if (!expanded) {
    // Collapsed: one-line teaser
    if (structuredResult) {
      const findingCount = structuredResult.keyFindings?.length || 0;
      const recCount = structuredResult.recommendations?.length || 0;
      return (
        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
          {structuredResult.verdict && (
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${verdictColor(structuredResult.verdict)}`}>
              {structuredResult.verdict}
            </span>
          )}
          {findingCount > 0 && <span>{findingCount} findings</span>}
          {recCount > 0 && <span>{"\u00B7"} {recCount} recommendations</span>}
        </div>
      );
    }
    if (resultSummary) {
      return (
        <div className="text-[10px] text-green-500/70 mt-0.5 truncate">
          {resultSummary.slice(0, 120)}
        </div>
      );
    }
    return null;
  }

  // Expanded: full panel
  if (!structuredResult) {
    return resultSummary ? (
      <div className="mt-2 p-2 rounded-lg bg-gray-800/30 border border-gray-700/40 text-[10px] text-gray-400 leading-relaxed whitespace-pre-wrap">
        {resultSummary.slice(0, 500)}
      </div>
    ) : null;
  }

  const findings = structuredResult.keyFindings || [];
  const visibleFindings = showAllFindings ? findings : findings.slice(0, 5);
  const recs = structuredResult.recommendations || [];
  const visibleRecs = showAllRecs ? recs : recs.slice(0, 3);
  const ratings = structuredResult.ratings ? Object.entries(structuredResult.ratings) : [];

  return (
    <div className="mt-2 space-y-2">
      {/* Verdict */}
      {structuredResult.verdict && (
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${verdictColor(structuredResult.verdict)}`}>
            {structuredResult.verdict}
          </span>
          {structuredResult.confidence && (
            <span className="text-[9px] text-gray-500">({structuredResult.confidence} confidence)</span>
          )}
        </div>
      )}

      {/* Key Findings */}
      {findings.length > 0 && (
        <div className="p-2 rounded-lg bg-gray-800/30 border border-gray-700/40">
          <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Key Findings</div>
          <div className="space-y-1">
            {visibleFindings.map((f, i) => (
              <div key={f.id || i} className="flex items-start gap-1.5 text-[10px]">
                <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${IMPACT_DOT[f.impact || "low"]}`} />
                <span className="text-gray-300">{f.title}</span>
              </div>
            ))}
          </div>
          {findings.length > 5 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowAllFindings(!showAllFindings); }}
              className="text-[9px] text-blue-400 hover:text-blue-300 mt-1"
            >
              {showAllFindings ? "Show less" : `Show ${findings.length - 5} more`}
            </button>
          )}
        </div>
      )}

      {/* Ratings */}
      {ratings.length > 0 && (
        <div className="p-2 rounded-lg bg-gray-800/30 border border-gray-700/40">
          <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Ratings</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {ratings.map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[9px] text-gray-400 w-24 truncate capitalize">
                  {key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}
                </span>
                <div className="flex-1 h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${ratingColor(val as number)}`}
                    style={{ width: `${Math.min((val as number) / 10 * 100, 100)}%` }}
                  />
                </div>
                <span className="text-[9px] text-gray-400 w-6 text-right tabular-nums">{String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="p-2 rounded-lg bg-gray-800/30 border border-gray-700/40">
          <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Recommendations</div>
          <div className="space-y-1">
            {visibleRecs.map((r, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px]">
                {r.priority && (
                  <span className={`px-1 py-0.5 rounded text-[8px] font-medium flex-shrink-0 ${PRIORITY_STYLE[r.priority] || "text-gray-400 bg-gray-500/15"}`}>
                    {r.priority}
                  </span>
                )}
                <span className="text-gray-300 flex-1">{r.title}</span>
                {r.effort && (
                  <span className="text-[8px] text-gray-500 flex-shrink-0">{r.effort}</span>
                )}
              </div>
            ))}
          </div>
          {recs.length > 3 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowAllRecs(!showAllRecs); }}
              className="text-[9px] text-blue-400 hover:text-blue-300 mt-1"
            >
              {showAllRecs ? "Show less" : `Show ${recs.length - 3} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
