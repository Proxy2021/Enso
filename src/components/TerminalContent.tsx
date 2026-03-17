/**
 * TerminalContent — Embeddable Claude Code terminal renderer.
 *
 * Extracts the marker-parsing pipeline and all visual sub-components from
 * TerminalCard so they can be reused inside any Enso card (e.g. deep
 * research build view, orchestration cards, etc.).
 *
 * Usage:
 *   <TerminalContent text={rawText} status={status} />
 *
 * The component is purely presentational — it does NOT own scroll
 * containers, input fields, project pickers, or session management.
 * The parent controls those concerns.
 */

import { useState, useMemo } from "react";
import MarkdownText from "./MarkdownText";
import type { Card } from "../cards/types";

// ── Marker Regexes ──

const TOOL_MARKER_RE = /\u200B\[tool:(\w+)(?::([^\]]*))?\]\n?/g;
const COST_MARKER_RE = /\u200B\[cost:([^\]]+)\]\n?/g;
const BASH_MARKER_RE = /\u200B\[bash:([^\]]*)\]\n?/g;
const RATELIMIT_MARKER_RE = /\u200B\[ratelimit:([^\]]*)\]\n?/g;
const TASK_MARKER_RE = /\u200B\[task:(start|completed|failed|stopped):([^\]]*)\]\n?/g;
const SUGGEST_MARKER_RE = /\u200B\[suggest:([^\]]*)\]\n?/g;
const INIT_MARKER_RE = /\u200B\[init:([^\]]*)\]\n?/g;
const FILES_MARKER_RE = /\u200B\[files:([^\]]*)\]\n?/g;
const COMPACT_MARKER_RE = /\u200B\[compact:(start|done)(?::([^:]*):([^\]]*))?\]\n?/g;
const CTX_MARKER_RE = /\u200B\[ctx:(\d+)%?\]\n?/g;
const THINK_START_RE = /\u200B\[think:start\]\n?/g;
const THINK_END_RE = /\u200B\[think:end\]\n?/g;
const CONNECTION_MARKER_RE = /\u200B\[connection:lost\]\n?/g;
const CONNECTION_RESTORED_RE = /\u200B\[connection:restored\]\n?/g;

// ── Exported types ──

export interface SessionInit {
  model: string;
  version: string;
  toolCount: number;
  mcpCount: number;
  mode: string;
}

export interface FilesChanged {
  saved: string[];
  failed: string[];
}

export interface CompactEvent {
  phase: "start" | "done";
  trigger?: string;
  preTokens?: string;
}

export interface ToolActivity {
  toolName: string;
  detail?: string;
}

export interface BashCommand {
  command: string;
}

export interface RateLimitWarning {
  status: "rejected" | "warning";
  detail: string;
}

export interface TaskEvent {
  type: "start" | "completed" | "failed" | "stopped";
  description: string;
}

export interface ThinkingBlock {
  text: string;
}

export interface TerminalEntry {
  userPrompt?: string;
  text: string;
  toolActivities: ToolActivity[];
  bashCommands: BashCommand[];
  rateLimits: RateLimitWarning[];
  tasks: TaskEvent[];
  suggestions: string[];
  sessionInit: SessionInit | null;
  filesChanged: FilesChanged[];
  compactEvents: CompactEvent[];
  thinkingBlocks: ThinkingBlock[];
  isThinking: boolean;
  cost: string | null;
  connectionLost: boolean;
  connectionRestored: boolean;
  status: Card["status"];
}

// ── Exported constants ──

export const TOOL_ICONS: Record<string, string> = {
  Read: "\uD83D\uDCC4",
  Edit: "\u270F\uFE0F",
  Write: "\uD83D\uDCDD",
  Bash: "\uD83D\uDCBB",
  Grep: "\uD83D\uDD0D",
  Glob: "\uD83D\uDCC2",
  Agent: "\uD83E\uDD16",
  WebSearch: "\uD83C\uDF10",
  WebFetch: "\uD83C\uDF10",
  NotebookEdit: "\uD83D\uDCD3",
};

// ── Marker parsing ──

export function stripMarkers(text: string) {
  const tools: ToolActivity[] = [];
  const bashCommands: BashCommand[] = [];
  const rateLimits: RateLimitWarning[] = [];
  const tasks: TaskEvent[] = [];
  const suggestions: string[] = [];
  const filesChanged: FilesChanged[] = [];
  const compactEvents: CompactEvent[] = [];
  const thinkingBlocks: ThinkingBlock[] = [];
  let sessionInit: SessionInit | null = null;
  let cost: string | null = null;
  let isThinking = false;

  // Extract thinking blocks BEFORE other markers to preserve content
  {
    const parts = text.split(THINK_START_RE);
    const rebuilt: string[] = [parts[0]];
    for (let i = 1; i < parts.length; i++) {
      const endParts = parts[i].split(THINK_END_RE);
      if (endParts.length >= 2) {
        const thinkText = endParts[0].trim();
        if (thinkText) thinkingBlocks.push({ text: thinkText });
        rebuilt.push(endParts.slice(1).join(""));
      } else {
        const thinkText = endParts[0].trim();
        if (thinkText) thinkingBlocks.push({ text: thinkText });
        isThinking = true;
      }
    }
    text = rebuilt.join("");
  }

  let clean = text.replace(TOOL_MARKER_RE, (_match, toolName, detail) => {
    tools.push({ toolName, detail: detail || undefined });
    return "";
  });

  clean = clean.replace(COST_MARKER_RE, (_match, costStr) => {
    cost = costStr;
    return "";
  });

  clean = clean.replace(BASH_MARKER_RE, (_match, command) => {
    bashCommands.push({ command });
    return "";
  });

  clean = clean.replace(RATELIMIT_MARKER_RE, (_match, info) => {
    const isRejected = info.startsWith("rejected");
    rateLimits.push({
      status: isRejected ? "rejected" : "warning",
      detail: info.replace(/^(rejected|warning)/, "").trim(),
    });
    return "";
  });

  clean = clean.replace(TASK_MARKER_RE, (_match, type, description) => {
    tasks.push({ type, description });
    return "";
  });

  clean = clean.replace(SUGGEST_MARKER_RE, (_match, suggestion) => {
    suggestions.push(suggestion);
    return "";
  });

  clean = clean.replace(INIT_MARKER_RE, (_match, payload) => {
    const [model, version, toolCountStr, mcpCountStr, mode] = payload.split("|");
    sessionInit = {
      model: model ?? "",
      version: version ?? "",
      toolCount: parseInt(toolCountStr ?? "0", 10) || 0,
      mcpCount: parseInt(mcpCountStr ?? "0", 10) || 0,
      mode: mode ?? "",
    };
    return "";
  });

  clean = clean.replace(FILES_MARKER_RE, (_match, payload) => {
    const [okPart, failPart] = payload.split("|");
    const saved = (okPart ?? "").split(",").filter(Boolean);
    const failed = (failPart ?? "").split(",").filter(Boolean);
    if (saved.length > 0 || failed.length > 0) {
      filesChanged.push({ saved, failed });
    }
    return "";
  });

  clean = clean.replace(COMPACT_MARKER_RE, (_match, phase, trigger, preTokens) => {
    compactEvents.push({
      phase: phase as "start" | "done",
      trigger: trigger || undefined,
      preTokens: preTokens || undefined,
    });
    return "";
  });

  let ctxPercent: number | null = null;
  clean = clean.replace(CTX_MARKER_RE, (_match, pct) => {
    ctxPercent = parseInt(pct, 10);
    return "";
  });

  let connectionLost = false;
  clean = clean.replace(CONNECTION_MARKER_RE, () => {
    connectionLost = true;
    return "";
  });

  let connectionRestored = false;
  clean = clean.replace(CONNECTION_RESTORED_RE, () => {
    connectionRestored = true;
    return "";
  });

  return { clean, tools, bashCommands, rateLimits, tasks, suggestions, sessionInit, filesChanged, compactEvents, cost, connectionLost, connectionRestored, ctxPercent, thinkingBlocks, isThinking };
}

// ── Entry parsing ──

export function parseEntries(text: string, cardStatus: Card["status"]): { entries: TerminalEntry[]; ctxPercent: number | null } {
  if (!text) return { entries: [], ctxPercent: null };

  const segments = text.split(/^>>> (.+)$/m);
  const entries: TerminalEntry[] = [];
  let latestCtxPercent: number | null = null;

  if (segments[0].trim()) {
    const parsed = stripMarkers(segments[0].trim());
    if (parsed.ctxPercent != null) latestCtxPercent = parsed.ctxPercent;
    entries.push({
      text: parsed.clean,
      toolActivities: parsed.tools,
      bashCommands: parsed.bashCommands,
      rateLimits: parsed.rateLimits,
      tasks: parsed.tasks,
      suggestions: parsed.suggestions,
      sessionInit: parsed.sessionInit,
      filesChanged: parsed.filesChanged,
      compactEvents: parsed.compactEvents,
      thinkingBlocks: parsed.thinkingBlocks,
      isThinking: parsed.isThinking,
      cost: parsed.cost,
      connectionLost: parsed.connectionLost,
      connectionRestored: parsed.connectionRestored,
      status: segments.length <= 1 ? cardStatus : "complete",
    });
  }

  for (let i = 1; i < segments.length; i += 2) {
    const userPrompt = segments[i];
    const responseText = (segments[i + 1] ?? "").trim();
    const isLast = i + 2 >= segments.length;
    const parsed = stripMarkers(responseText);
    if (parsed.ctxPercent != null) latestCtxPercent = parsed.ctxPercent;

    entries.push({
      userPrompt,
      text: parsed.clean,
      toolActivities: parsed.tools,
      bashCommands: parsed.bashCommands,
      rateLimits: parsed.rateLimits,
      tasks: parsed.tasks,
      suggestions: parsed.suggestions,
      sessionInit: parsed.sessionInit,
      filesChanged: parsed.filesChanged,
      compactEvents: parsed.compactEvents,
      thinkingBlocks: parsed.thinkingBlocks,
      isThinking: parsed.isThinking,
      cost: parsed.cost,
      connectionLost: parsed.connectionLost,
      connectionRestored: parsed.connectionRestored,
      status: isLast ? cardStatus : "complete",
    });
  }

  return { entries, ctxPercent: latestCtxPercent };
}

// ── Visual Sub-Components ──

function ThinkingBlockView({ block, isActive }: { block: ThinkingBlock; isActive?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const lines = block.text.split("\n");
  const preview = lines.slice(0, 3).join("\n");
  const hasMore = lines.length > 3;

  return (
    <div className="mb-1.5 pl-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-purple-400/80 hover:text-purple-300 transition-colors"
      >
        {isActive ? (
          <span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="text-[9px]">{expanded ? "\u25BC" : "\u25B6"}</span>
        )}
        <span className="font-medium">{isActive ? "Thinking..." : "Thought process"}</span>
        {!expanded && !isActive && (
          <span className="text-gray-600 text-[10px]">({lines.length} line{lines.length !== 1 ? "s" : ""})</span>
        )}
      </button>
      {(expanded || isActive) && (
        <div className="mt-1 ml-1 pl-2 border-l-2 border-purple-800/40 text-[11px] text-gray-500 leading-relaxed font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
          {expanded ? block.text : (hasMore ? preview + "\n..." : preview)}
        </div>
      )}
    </div>
  );
}

function ToolActivityChips({ tools }: { tools: ToolActivity[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-1 pl-3">
      {tools.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-[10px] text-gray-500">
          <span className="shrink-0 text-[9px]">{TOOL_ICONS[t.toolName] ?? "\u2699\uFE0F"}</span>
          {t.detail && <span className="text-gray-600 truncate max-w-[100px] font-mono">{t.detail}</span>}
        </span>
      ))}
    </div>
  );
}

function formatTokens(raw: string): string {
  const num = parseInt(raw, 10);
  if (isNaN(num)) return raw;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return String(num);
}

function CostFooter({ cost }: { cost: string }) {
  const parts = cost.split("|").map((s) => s.trim());
  const primary = parts.slice(0, 3).filter(Boolean).join(" \u00B7 ");
  const tokenParts: string[] = [];
  for (const p of parts.slice(3)) {
    if (p.endsWith("in")) tokenParts.push(formatTokens(p.slice(0, -2)) + " in");
    else if (p.endsWith("out")) tokenParts.push(formatTokens(p.slice(0, -3)) + " out");
    else if (p.endsWith("cache")) tokenParts.push(formatTokens(p.slice(0, -5)) + " cached");
    else if (p.startsWith("ctx:")) tokenParts.push(p.slice(4) + " context");
  }
  const allParts = tokenParts.length > 0 ? `${primary} \u00B7 ${tokenParts.join(" \u00B7 ")}` : primary;
  return (
    <div className="font-mono mt-0.5 pl-3">
      <div className="text-[9px] text-gray-600">{allParts}</div>
    </div>
  );
}

function BashCommandBlock({ commands }: { commands: BashCommand[] }) {
  if (commands.length === 0) return null;
  return (
    <div className="space-y-px mb-1 pl-3">
      {commands.map((c, i) => (
        <div key={i} className="bg-gray-900/80 rounded px-1.5 py-0.5 font-mono text-[10px] break-all">
          <span className="text-green-500">$</span>{" "}
          <span className="text-gray-400">{c.command}</span>
        </div>
      ))}
    </div>
  );
}

function RateLimitBanner({ limits }: { limits: RateLimitWarning[] }) {
  if (limits.length === 0) return null;
  return (
    <div className="space-y-1 mb-1.5 pl-3">
      {limits.map((rl, i) => (
        <div
          key={i}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] ${
            rl.status === "rejected"
              ? "bg-red-900/30 border border-red-800/50 text-red-300"
              : "bg-yellow-900/30 border border-yellow-800/50 text-yellow-300"
          }`}
        >
          <span>{rl.status === "rejected" ? "\u26A0\uFE0F" : "\u23F3"}</span>
          <span>
            {rl.status === "rejected" ? "Rate limited" : "Approaching rate limit"}
            {rl.detail && ` ${rl.detail}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function TaskChips({ tasks }: { tasks: TaskEvent[] }) {
  if (tasks.length === 0) return null;
  const colors: Record<string, string> = {
    start: "bg-blue-900/40 border-blue-700/50 text-blue-300",
    completed: "bg-green-900/40 border-green-700/50 text-green-300",
    failed: "bg-red-900/40 border-red-700/50 text-red-300",
    stopped: "bg-red-900/40 border-red-700/50 text-red-300",
  };
  const icons: Record<string, string> = {
    start: "\u2699\uFE0F",
    completed: "\u2705",
    failed: "\u274C",
    stopped: "\u274C",
  };
  return (
    <div className="flex flex-wrap gap-1 mb-1 pl-3">
      {tasks.map((t, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-0.5 px-1 py-px text-[9px] border rounded ${colors[t.type] ?? "bg-gray-800 border-gray-700 text-gray-400"}`}
        >
          <span>{icons[t.type] ?? "\u2699\uFE0F"}</span>
          <span className="truncate max-w-[160px]">{t.description}</span>
        </span>
      ))}
    </div>
  );
}

function SessionInitBar({ init }: { init: SessionInit }) {
  const parts: string[] = [];
  if (init.version) parts.push(`v${init.version}`);
  if (init.model) parts.push(init.model.replace(/^claude-/, ""));
  if (init.toolCount) parts.push(`${init.toolCount} tools`);
  if (init.mcpCount) parts.push(`${init.mcpCount} MCP`);
  if (parts.length === 0) return null;
  return (
    <div className="text-[9px] text-gray-600 font-mono bg-gray-900/60 rounded px-1.5 py-px mb-1 ml-3 w-fit">
      {parts.join(" \u00B7 ")}
    </div>
  );
}

function FilesChangedChips({ files }: { files: FilesChanged[] }) {
  const allSaved = files.flatMap(f => f.saved);
  const allFailed = files.flatMap(f => f.failed);
  if (allSaved.length === 0 && allFailed.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-1 pl-3">
      {allSaved.map((name, i) => (
        <span key={`s-${i}`} className="inline-flex items-center gap-0.5 px-1 py-px text-[9px] bg-green-900/30 border border-green-700/40 text-green-400 rounded">
          <span>{"\uD83D\uDCC4"}</span>
          <span className="truncate max-w-[120px]">{name}</span>
        </span>
      ))}
      {allFailed.map((name, i) => (
        <span key={`f-${i}`} className="inline-flex items-center gap-0.5 px-1 py-px text-[9px] bg-red-900/30 border border-red-700/40 text-red-400 rounded">
          <span>{"\u26A0\uFE0F"}</span>
          <span className="truncate max-w-[120px]">{name}</span>
        </span>
      ))}
    </div>
  );
}

function CompactBanner({ events }: { events: CompactEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="space-y-1 mb-1.5 pl-3">
      {events.map((ev, i) => (
        <div
          key={i}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] ${
            ev.phase === "start"
              ? "bg-blue-900/30 border border-blue-800/50 text-blue-300"
              : "bg-green-900/30 border border-green-800/50 text-green-300"
          }`}
        >
          {ev.phase === "start" ? (
            <>
              <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span>Compacting context...</span>
            </>
          ) : (
            <>
              <span>{"\u2705"}</span>
              <span>
                Context compacted
                {(ev.trigger || ev.preTokens) && (
                  <span className="text-green-400/70">
                    {" ("}
                    {ev.trigger ?? "auto"}
                    {ev.preTokens ? `, ${ev.preTokens} tokens freed` : ""}
                    {")"}
                  </span>
                )}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function ContextWarningBanner({ percent }: { percent: number }) {
  if (percent < 85) return null;
  const isCritical = percent >= 95;
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] mb-1.5 ml-5 ${
        isCritical
          ? "bg-red-900/30 border border-red-800/50 text-red-300"
          : "bg-yellow-900/30 border border-yellow-800/50 text-yellow-300"
      }`}
    >
      <span>{isCritical ? "\u26A0\uFE0F" : "\u23F3"}</span>
      <span>
        {isCritical
          ? `Context critically full (${percent}%) \u2014 responses may be cut short`
          : `Context ${percent}% full \u2014 compaction will trigger soon`}
      </span>
    </div>
  );
}

export function ActivityIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-2 pl-3 text-xs">
      <span className="flex gap-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
      </span>
      <span className="text-gray-400 font-mono truncate">{label || "Working..."}</span>
    </div>
  );
}

export function PromptSuggestion({ suggestion, onSelect }: { suggestion: string; onSelect: (text: string) => void }) {
  return (
    <button
      onClick={() => onSelect(suggestion)}
      className="text-left px-2 py-1 mt-0.5 rounded border border-gray-700/50 bg-gray-900/40 hover:bg-gray-800/60 hover:border-gray-600 transition-colors cursor-pointer group"
    >
      <span className="text-gray-500 text-[11px] italic group-hover:text-gray-300 transition-colors">{suggestion}</span>
    </button>
  );
}

// ── Terminal Block (single entry) ──

export function TerminalBlock({ entry, isFirst, onInput }: { entry: TerminalEntry; isFirst?: boolean; onInput?: (text: string) => void }) {
  return (
    <div className="mb-1">
      {entry.userPrompt && (
        <div className="flex items-start gap-2 mb-1">
          <span className="text-green-400 font-bold shrink-0">{"\u276F"}</span>
          <span className="text-gray-100 text-sm">{entry.userPrompt}</span>
        </div>
      )}
      {isFirst && entry.sessionInit && (
        <SessionInitBar init={entry.sessionInit} />
      )}
      {entry.thinkingBlocks.length > 0 && (
        entry.thinkingBlocks.map((tb, i) => (
          <ThinkingBlockView
            key={i}
            block={tb}
            isActive={entry.isThinking && i === entry.thinkingBlocks.length - 1}
          />
        ))
      )}
      {entry.toolActivities.length > 0 && (
        <ToolActivityChips tools={entry.toolActivities} />
      )}
      {entry.bashCommands.length > 0 && (
        <BashCommandBlock commands={entry.bashCommands} />
      )}
      {entry.tasks.length > 0 && (
        <TaskChips tasks={entry.tasks} />
      )}
      {entry.filesChanged.length > 0 && (
        <FilesChangedChips files={entry.filesChanged} />
      )}
      {entry.compactEvents.length > 0 && (
        <CompactBanner events={entry.compactEvents} />
      )}
      {entry.rateLimits.length > 0 && (
        <RateLimitBanner limits={entry.rateLimits} />
      )}
      <div className="text-sm text-gray-300 leading-snug pl-3">
        <MarkdownText text={entry.text} />
        {entry.status === "streaming" && (
          <span className="inline-block w-1.5 h-4 bg-green-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
        )}
      </div>
      {entry.cost && <CostFooter cost={entry.cost} />}
      {entry.connectionLost && (
        <div className="flex items-center gap-1.5 text-amber-400 text-xs mt-2 pl-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Connection lost — reconnecting...
        </div>
      )}
      {entry.connectionRestored && (
        <div className="flex items-center gap-1.5 text-green-400 text-xs mt-2 pl-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
          Reconnected — session resumed
        </div>
      )}
      {entry.status === "error" && (
        <div className="text-red-400 text-xs mt-1 pl-3">
          Command failed
        </div>
      )}
      {entry.status === "complete" && entry.suggestions.length > 0 && onInput && (
        <div className="pl-3 mt-1">
          {entry.suggestions.map((s, i) => (
            <PromptSuggestion key={i} suggestion={s} onSelect={onInput} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Embeddable Component ──

export interface TerminalContentProps {
  /** Raw terminal text (with markers). */
  text: string;
  /** Card status — drives streaming cursor, suggestion display, etc. */
  status: Card["status"];
  /** Optional callback when user clicks a suggestion. */
  onInput?: (text: string) => void;
  /** Optional status label shown in the header bar. */
  statusLabel?: string;
  /** Accent color for the pulsing cursor (default: green). */
  accentColor?: "green" | "violet";
  /** Maximum height CSS class (default: "max-h-[400px]"). */
  maxHeightClass?: string;
  /** Whether to show the terminal chrome header (traffic lights + label). Default false. */
  showHeader?: boolean;
  /** Custom header label (default: "Claude Code"). */
  headerLabel?: string;
}

/**
 * Embeddable Claude Code terminal content renderer.
 *
 * Renders the full rich terminal experience (thinking blocks, tool chips,
 * bash commands, rate limits, file changes, markdown output) without
 * owning scroll containers or input fields.
 *
 * Parents should wrap this in their own scrollable container.
 */
export default function TerminalContent({
  text,
  status,
  onInput,
  statusLabel,
  accentColor = "green",
  maxHeightClass = "max-h-[400px]",
  showHeader = false,
  headerLabel = "Claude Code",
}: TerminalContentProps) {
  const { entries, ctxPercent } = useMemo(
    () => parseEntries(text, status),
    [text, status],
  );

  const cursorColor = accentColor === "violet" ? "bg-violet-400" : "bg-green-400";

  return (
    <div className="font-mono">
      {showHeader && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-900/80 border-b border-gray-800 text-xs rounded-t-lg">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500/70" />
            <span className="w-2 h-2 rounded-full bg-yellow-500/70" />
            <span className="w-2 h-2 rounded-full bg-green-500/70" />
          </div>
          <span className="text-gray-400 text-[11px]">{headerLabel}</span>
          {ctxPercent != null && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                ctxPercent > 80
                  ? "bg-red-900/50 text-red-300"
                  : ctxPercent > 60
                    ? "bg-yellow-900/50 text-yellow-300"
                    : "bg-green-900/50 text-green-300"
              }`}
            >
              ctx {ctxPercent}%
            </span>
          )}
          {statusLabel && (
            <span className="ml-auto text-[10px] text-gray-500">{statusLabel}</span>
          )}
        </div>
      )}
      <div className={`${maxHeightClass} overflow-y-auto px-3 py-2`}>
        {ctxPercent != null && ctxPercent >= 85 && (
          <ContextWarningBanner percent={ctxPercent} />
        )}
        {entries.length > 0 ? (
          entries.map((entry, i) => (
            <TerminalBlock key={i} entry={entry} isFirst={i === 0} onInput={onInput} />
          ))
        ) : (
          <div className="text-gray-600 italic text-xs">Starting Claude Code session...</div>
        )}
        {status === "streaming" && entries.length > 0 && entries[entries.length - 1].text === "" && (
          <ActivityIndicator label={statusLabel} />
        )}
        {/* Streaming cursor at bottom */}
        {status === "streaming" && entries.length === 0 && (
          <span className={`inline-block w-1.5 h-3.5 ${cursorColor} animate-pulse ml-0.5 align-text-bottom rounded-sm`} />
        )}
      </div>
    </div>
  );
}
