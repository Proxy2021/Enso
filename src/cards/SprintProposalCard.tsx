import React, { useState } from "react";
import MarkdownText from "../components/MarkdownText";
import { useChatStore } from "../store/chat";
import type { CardRendererProps } from "./types";

interface SprintProposalData {
  kind: "sprint-proposal";
  focusId: string;
  focusTitle: string;
  scope: string;
  deliverables: string[];
  briefing: string;
  estimatedCost: string;
  estimatedHours: string;
  reasoning: string;
}

function isSprintProposal(data: unknown): data is SprintProposalData {
  return Boolean(
    data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).kind === "sprint-proposal"
  );
}

function SprintProposalCardInner({ card }: CardRendererProps) {
  const [launched, setLaunched] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const sendFocusEvolve = useChatStore(s => s.sendFocusEvolve);

  const data = card.data;
  if (!isSprintProposal(data)) {
    return (
      <div className="px-3 py-2 text-sm text-gray-400">
        <MarkdownText text={card.text ?? ""} />
      </div>
    );
  }

  const handleLaunch = () => {
    if (launched) return;
    setLaunched(true);
    sendFocusEvolve(data.focusId, data.briefing);
  };

  if (dismissed) {
    return (
      <div className="px-3 py-2 text-xs text-gray-500 italic">
        Sprint proposal dismissed.
      </div>
    );
  }

  return (
    <div className="px-3 py-3">
      <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-violet-300/80 font-semibold">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Sprint Proposal
        </div>

        <div className="text-sm leading-relaxed text-gray-100">
          <MarkdownText text={card.text ?? ""} />
        </div>

        {data.reasoning && (
          <div className="text-[12px] text-violet-200/70 italic border-l-2 border-violet-500/40 pl-3">
            {data.reasoning}
          </div>
        )}

        {data.deliverables.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-gray-400">Proposed deliverables</div>
            <ul className="space-y-1">
              {data.deliverables.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-gray-200">
                  <span className="text-violet-400 mt-0.5 shrink-0">{"\u2022"}</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-4 text-[11px] text-gray-400 pt-1">
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{data.estimatedHours}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span>{data.estimatedCost}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              <path d="M1 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
            </svg>
            <span>4-6 parallel agents</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleLaunch}
            disabled={launched}
            className="flex items-center gap-1.5 text-[12px] px-4 py-2 rounded-md border border-violet-500/60 bg-violet-500/25 text-violet-100 hover:bg-violet-500/35 active:bg-violet-500/50 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 font-medium"
          >
            {launched ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Launching sprint...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Launch Sprint
              </>
            )}
          </button>
          <button
            onClick={() => setDismissed(true)}
            disabled={launched}
            className="text-[12px] px-3 py-2 rounded-md border border-gray-600/40 text-gray-400 hover:text-gray-200 hover:border-gray-500/60 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

const SprintProposalCard = React.memo(SprintProposalCardInner);
export default SprintProposalCard;
