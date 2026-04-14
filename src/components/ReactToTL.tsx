/**
 * ReactToTL — Shared popup for sending instructions/feedback to Team Leader or any agent.
 *
 * Used from: CardShareMenu, FocusView, OrchestrationCard, TasksView (inline variant).
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { pushToast } from "../lib/notifications";

// ── Types ──

export interface ReactContext {
  type: "card" | "focus" | "entity" | "sprint" | "deliverable" | "direct";
  summary: string;
  focusId?: string;
  /** Extra detail merged into context for TL */
  detail?: string;
}

export interface AgentOption {
  id: string;
  name: string;
  role?: string;
  type: "tl" | "expert";
  focusTitle?: string;
  focusId?: string;
  expertId?: string;
}

interface Props {
  context: ReactContext;
  onClose: () => void;
  /** Pre-select a specific agent (defaults to TL) */
  defaultAgentId?: string;
  /** Show as popup (absolute positioned) or inline */
  mode?: "popup" | "inline";
}

// ── Agent Cache ──

let _agentCache: AgentOption[] | null = null;
let _agentCacheAt = 0;
const CACHE_TTL = 60_000; // 1 minute

async function fetchAgents(): Promise<AgentOption[]> {
  if (_agentCache && Date.now() - _agentCacheAt < CACHE_TTL) return _agentCache;
  try {
    const res = await fetch(`${getBackendBaseUrl()}/api/agents`, { headers: authHeaders() });
    if (res.ok) {
      const { agents } = await res.json();
      _agentCache = agents;
      _agentCacheAt = Date.now();
      return agents;
    }
  } catch { /* fallback */ }
  return [{ id: "tl", name: "Team Leader", type: "tl" as const }];
}

/** Invalidate agent cache (call after focus area changes) */
export function invalidateAgentCache(): void { _agentCache = null; }

// ── Component ──

export default function ReactToTL({ context, onClose, defaultAgentId, mode = "popup" }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([{ id: "tl", name: "Team Leader", type: "tl" }]);
  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgentId || "tl");
  const ref = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load agents
  useEffect(() => { fetchAgents().then(setAgents); }, []);

  // Auto-focus textarea
  useEffect(() => { textareaRef.current?.focus(); }, []);

  // Click outside to close (popup mode only)
  useEffect(() => {
    if (mode !== "popup") return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, mode]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const submit = useCallback(async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const selected = agents.find(a => a.id === selectedAgentId);
      const fullSummary = context.detail ? `${context.summary} | ${context.detail}` : context.summary;

      // Build agentTarget for backend
      let agentTarget: { agent: "tl" } | { agent: "expert"; focusId: string; expertId: string } | undefined;
      if (selected?.type === "expert" && selected.focusId && selected.expertId) {
        agentTarget = { agent: "expert", focusId: selected.focusId, expertId: selected.expertId };
      }

      await fetch(`${getBackendBaseUrl()}/api/reacts`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          action: "custom",
          context: { type: context.type, summary: fullSummary, focusId: context.focusId },
          agentTarget,
        }),
      });

      const targetName = selected?.name || "Team Leader";
      pushToast(`Sent to ${targetName}`, context.summary.slice(0, 60), true, 3000);
      onClose();
    } catch {
      pushToast("Failed to send", "Please try again", false);
    } finally {
      setSending(false);
    }
  }, [text, sending, agents, selectedAgentId, context, onClose]);

  const containerClass = mode === "popup"
    ? "absolute top-full right-0 mt-1 w-80 bg-gray-900 border border-violet-500/30 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)] z-[200] p-3"
    : "w-full bg-gray-900/40 border border-violet-500/20 rounded-lg p-3";

  return (
    <div ref={ref} className={containerClass} onClick={(e) => e.stopPropagation()}>
      {/* Context preview */}
      <p className="text-[10px] text-gray-500 mb-2 leading-snug line-clamp-2">
        Re: {context.summary}
      </p>

      {/* Agent selector + textarea */}
      <div className="flex items-center gap-2 mb-2">
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          className="text-[11px] bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-300 focus:outline-none focus:border-violet-500 flex-1 min-w-0"
        >
          {agents.map(a => (
            <option key={a.id} value={a.id}>
              {a.type === "tl" ? `👔 ${a.name}` : `✦ ${a.name}${a.focusTitle ? ` (${a.focusTitle})` : ""}`}
            </option>
          ))}
        </select>
      </div>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Your instruction or feedback..."
        className="w-full h-16 text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500 resize-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && text.trim()) {
            e.preventDefault();
            submit();
          }
        }}
      />

      {/* Send */}
      <div className="flex justify-end mt-2">
        {mode === "popup" && (
          <button
            onClick={onClose}
            className="text-[11px] px-3 py-1.5 rounded-lg text-gray-400 hover:text-gray-200 transition-colors mr-2"
          >
            Cancel
          </button>
        )}
        <button
          onClick={submit}
          disabled={!text.trim() || sending}
          className="text-[11px] px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-30 transition-colors"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
