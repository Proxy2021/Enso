import { useState, useEffect, useCallback } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import type { CardRendererProps } from "./types";

// ── Types ──

interface TeamLeaderAction {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  type: "user-task" | "platform-fix" | "platform-feature" | "maintenance";
  title: string;
  reasoning: string;
  delegation: "focus" | "knowledge" | "research" | "builder" | "outreach" | "self";
  estimatedEffort: string;
  autoExecute: boolean;
  status: "proposed" | "approved" | "executing" | "completed" | "skipped";
}

interface BriefingSection {
  emoji: string;
  title: string;
  items: string[];
}

interface Briefing {
  timestamp: string;
  headline: string;
  sections: BriefingSection[];
  proposedActions: TeamLeaderAction[];
  textSummary: string;
}

interface TLConfig {
  schedule: { morningRoutine: string; checkIn: string };
  channels: { email: boolean; wechat: boolean; inApp: boolean };
  autoEvolve: boolean;
}

interface TLState {
  lastMorningRoutineAt: string | null;
  lastCheckInAt: string | null;
  lastBriefing: Briefing | null;
  recentActions: TeamLeaderAction[];
}

interface React {
  id: string;
  channel: string;
  text: string;
  action?: string;
  context: { type: string; summary: string };
  timestamp: string;
  processed: boolean;
  resolution?: string;
}

// ── Helpers ──

function priorityColor(p: string): string {
  switch (p) {
    case "critical": return "bg-red-500/20 text-red-300 border-red-500/30";
    case "high": return "bg-orange-500/20 text-orange-300 border-orange-500/30";
    case "medium": return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "low": return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    default: return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }
}

function statusIcon(s: string): string {
  switch (s) {
    case "completed": return "✓";
    case "executing": return "◉";
    case "proposed": return "○";
    case "skipped": return "—";
    default: return "○";
  }
}

function statusColor(s: string): string {
  switch (s) {
    case "completed": return "text-emerald-400";
    case "executing": return "text-blue-400";
    case "proposed": return "text-violet-400";
    case "skipped": return "text-zinc-500";
    default: return "text-zinc-400";
  }
}

function delegationLabel(d: string): string {
  switch (d) {
    case "focus": return "Focus";
    case "knowledge": return "Cortex";
    case "research": return "Research";
    case "builder": return "Builder";
    case "outreach": return "Outreach";
    case "self": return "TL";
    default: return d;
  }
}

function typeIcon(t: string): string {
  switch (t) {
    case "user-task": return "🎯";
    case "platform-fix": return "🔧";
    case "platform-feature": return "🚀";
    case "maintenance": return "🧹";
    default: return "📋";
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Component ──

export default function TeamLeaderCard({ card }: CardRendererProps) {
  const [state, setState] = useState<TLState | null>(null);
  const [config, setConfig] = useState<TLConfig | null>(null);
  const [reacts, setReacts] = useState<React[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [reactInput, setReactInput] = useState<{ actionId: string; text: string } | null>(null);
  const [tab, setTab] = useState<"briefing" | "actions" | "reacts">("briefing");

  const baseUrl = getBackendBaseUrl();

  const fetchAll = useCallback(async () => {
    try {
      const [stateRes, configRes, reactsRes] = await Promise.all([
        fetch(`${baseUrl}/api/team-leader/state`, { headers: authHeaders() }),
        fetch(`${baseUrl}/api/team-leader/config`, { headers: authHeaders() }),
        fetch(`${baseUrl}/api/reacts?pending=false`, { headers: authHeaders() }),
      ]);
      if (stateRes.ok) setState(await stateRes.json());
      if (configRes.ok) setConfig(await configRes.json());
      if (reactsRes.ok) {
        const data = await reactsRes.json();
        setReacts(data.reacts || []);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 15000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const runMorning = async () => {
    setRunning(true);
    try {
      const res = await fetch(`${baseUrl}/api/team-leader/morning`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setRunning(false);
    }
  };

  const submitReact = async (actionTitle: string, text: string) => {
    try {
      await fetch(`${baseUrl}/api/reacts`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Re: "${actionTitle}" — ${text}`,
          action: "custom",
        }),
      });
      setReactInput(null);
      await fetchAll();
    } catch { /* best effort */ }
  };

  const briefing = state?.lastBriefing;
  const allActions = [
    ...(briefing?.proposedActions || []),
    ...(state?.recentActions?.filter(a =>
      !briefing?.proposedActions?.some(b => b.id === a.id)
    ) || []),
  ];

  return (
    <div className="rounded-xl border border-violet-500/20 bg-gray-950/60 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-violet-950/40 to-indigo-950/40 border-b border-violet-500/10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-violet-200 flex items-center gap-2">
              <span>👔</span> Team Leader Dashboard
            </h2>
            {state?.lastMorningRoutineAt && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                Last routine: {timeAgo(state.lastMorningRoutineAt)}
                {state.lastCheckInAt && ` · Last check-in: ${timeAgo(state.lastCheckInAt)}`}
              </p>
            )}
          </div>
          <button
            onClick={runMorning}
            disabled={running}
            className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
          >
            {running ? "Running..." : "Run Morning Routine"}
          </button>
        </div>

        {/* Schedule info */}
        {config && (
          <div className="flex gap-3 mt-2 text-[10px] text-gray-500">
            <span>Morning: {config.schedule.morningRoutine}</span>
            <span>Check-in: {config.schedule.checkIn}</span>
            <span>Auto-evolve: {config.autoEvolve ? "on" : "off"}</span>
            <span>Channels: {[config.channels.email && "email", config.channels.wechat && "wechat", config.channels.inApp && "in-app"].filter(Boolean).join(", ")}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800/40">
        {(["briefing", "actions", "reacts"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === t ? "text-violet-300 border-b-2 border-violet-500" : "text-gray-500 hover:text-gray-300"}`}
          >
            {t === "briefing" ? `Briefing${briefing ? "" : " (none)"}` : t === "actions" ? `Actions (${allActions.length})` : `Reacts (${reacts.length})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-500/10 text-red-300 text-xs">{error}</div>
      )}

      {/* Briefing Tab */}
      {tab === "briefing" && (
        <div className="p-5">
          {!briefing ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm mb-3">No briefing yet</p>
              <button onClick={runMorning} disabled={running} className="text-xs px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50">
                {running ? "Generating..." : "Generate First Briefing"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-violet-300">{briefing.headline}</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">{new Date(briefing.timestamp).toLocaleString()}</p>
              </div>
              {briefing.sections.map((s, i) => (
                <div key={i} className="rounded-lg border border-gray-800/30 bg-gray-900/30 p-3">
                  <h4 className="text-xs font-medium text-gray-300 mb-2">{s.emoji} {s.title}</h4>
                  <div className="space-y-1.5">
                    {s.items.map((item, j) => (
                      <p key={j} className="text-xs text-gray-400 leading-relaxed">{item}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions Tab */}
      {tab === "actions" && (
        <div className="p-4 space-y-2">
          {allActions.length === 0 ? (
            <p className="text-gray-500 text-xs text-center py-6">No actions yet. Run the morning routine to generate.</p>
          ) : (
            allActions.map(action => (
              <div key={action.id} className="rounded-lg border border-gray-800/30 bg-gray-900/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`${statusColor(action.status)} text-sm`}>{statusIcon(action.status)}</span>
                      <span className="text-xs">{typeIcon(action.type)}</span>
                      <span className="text-sm font-medium text-gray-200 truncate">{action.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityColor(action.priority)}`}>{action.priority}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-400 border border-gray-700/40">{delegationLabel(action.delegation)}</span>
                      <span className="text-[10px] text-gray-600">{action.estimatedEffort}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">{action.reasoning}</p>
                  </div>
                  {/* React button */}
                  <button
                    onClick={() => setReactInput(reactInput?.actionId === action.id ? null : { actionId: action.id, text: "" })}
                    className="text-[10px] px-2 py-1 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 hover:bg-violet-500/20 shrink-0"
                    title="Add a react about this action"
                  >
                    💬
                  </button>
                </div>
                {/* Inline react input */}
                {reactInput?.actionId === action.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={reactInput.text}
                      onChange={e => setReactInput({ ...reactInput, text: e.target.value })}
                      placeholder="Your react or instruction..."
                      className="flex-1 text-xs bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500"
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter" && reactInput.text.trim()) submitReact(action.title, reactInput.text); }}
                    />
                    <button
                      onClick={() => reactInput.text.trim() && submitReact(action.title, reactInput.text)}
                      disabled={!reactInput.text.trim()}
                      className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-30"
                    >
                      Send
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Reacts Tab */}
      {tab === "reacts" && (
        <div className="p-4 space-y-2">
          {reacts.length === 0 ? (
            <p className="text-gray-500 text-xs text-center py-6">No reacts yet. Use the react button on any action to send feedback.</p>
          ) : (
            reacts.map(r => (
              <div key={r.id} className="rounded-lg border border-gray-800/30 bg-gray-900/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-400 border border-gray-700/40">{r.channel}</span>
                  <span className="text-[10px] text-gray-500">{timeAgo(r.timestamp)}</span>
                  {r.processed ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Processed</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">Pending</span>
                  )}
                </div>
                <p className="text-xs text-gray-300">{r.text}</p>
                <p className="text-[10px] text-gray-600 mt-1">Re: {r.context.summary}</p>
                {r.resolution && (
                  <p className="text-[10px] text-violet-400 mt-1">→ {r.resolution}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
