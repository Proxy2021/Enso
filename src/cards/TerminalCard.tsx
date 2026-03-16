import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useChatStore, type ProjectInfo } from "../store/chat";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { useVoiceInput } from "../components/VoiceMicButton";
import MarkdownText from "../components/MarkdownText";
import type { Card, CardRendererProps } from "./types";

// ── Marker Parsing ──

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

interface SessionInit {
  model: string;
  version: string;
  toolCount: number;
  mcpCount: number;
  mode: string;
}

interface FilesChanged {
  saved: string[];
  failed: string[];
}

interface CompactEvent {
  phase: "start" | "done";
  trigger?: string;
  preTokens?: string;
}

interface ToolActivity {
  toolName: string;
  detail?: string;
}

interface BashCommand {
  command: string;
}

interface RateLimitWarning {
  status: "rejected" | "warning";
  detail: string;
}

interface TaskEvent {
  type: "start" | "completed" | "failed" | "stopped";
  description: string;
}

interface ThinkingBlock {
  text: string;
}

const TOOL_ICONS: Record<string, string> = {
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

function stripMarkers(text: string) {
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

  // Extract thinking blocks (text between [think:start] and [think:end])
  // Must be done before other marker stripping to avoid corrupting thinking text
  {
    const parts = text.split(THINK_START_RE);
    const rebuilt: string[] = [parts[0]];
    for (let i = 1; i < parts.length; i++) {
      const endParts = parts[i].split(THINK_END_RE);
      if (endParts.length >= 2) {
        // Found matching end — extract thinking text
        const thinkText = endParts[0].trim();
        if (thinkText) thinkingBlocks.push({ text: thinkText });
        // Rest after [think:end] is normal text
        rebuilt.push(endParts.slice(1).join(""));
      } else {
        // No matching end yet — still thinking (streaming)
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

// ── Project Picker ──

function ProjectPicker({ projects, cardId }: { projects: ProjectInfo[]; cardId?: string }) {
  const setCodeSessionCwd = useChatStore((s) => s.setCodeSessionCwd);
  const switchTerminalProject = useChatStore((s) => s.switchTerminalProject);
  const fetchProjects = useChatStore((s) => s.fetchProjects);

  useEffect(() => {
    if (projects.length === 0) fetchProjects();
  }, [projects.length, fetchProjects]);

  if (projects.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-4 text-center">
        Scanning for projects...
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="text-gray-400 text-xs mb-3 px-1">Select a project to work in:</div>
      <div className="space-y-1">
        {projects.map((p) => (
          <button
            key={p.path}
            onClick={() => {
              if (cardId) switchTerminalProject(cardId, p.path);
              else setCodeSessionCwd(p.path);
            }}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-800 transition-colors group"
          >
            <span className="text-green-400 font-medium text-sm">{p.name}</span>
            <span className="text-gray-600 text-xs ml-2 group-hover:text-gray-500">{p.path}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Slash Command Types ──

type SlashCommand = { name: string; description: string };

// Module-level cache to avoid re-fetching on every TerminalInput mount
const slashCommandCache = new Map<string, SlashCommand[]>();

// ── Terminal Input ──

function TerminalInput({ onSubmit, cwd }: { onSubmit: (text: string) => void; cwd?: string }) {
  const [text, setText] = useState("");
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { VoiceMic } = useVoiceInput(setText);

  // Fetch available slash commands when cwd is set (cached per cwd)
  useEffect(() => {
    if (!cwd) return;
    const cached = slashCommandCache.get(cwd);
    if (cached) { setCommands(cached); return; }
    const url = `${getBackendBaseUrl()}/api/claude-commands?cwd=${encodeURIComponent(cwd)}`;
    fetch(url, { headers: authHeaders() })
      .then(r => r.json())
      .then((cmds: SlashCommand[]) => { slashCommandCache.set(cwd, cmds); setCommands(cmds); })
      .catch(() => {});
  }, [cwd]);

  // Compute filtered matches
  const slashPrefix = text.startsWith("/") ? text.slice(1).toLowerCase() : null;
  const matches = slashPrefix != null
    ? commands.filter(c => c.name.toLowerCase().startsWith(slashPrefix))
    : [];
  const showMenu = matches.length > 0 && text.startsWith("/") && !text.includes(" ");

  // Reset selection when matches change
  useEffect(() => { setSelectedIdx(0); }, [matches.length]);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  }

  const selectCommand = useCallback((cmd: SlashCommand) => {
    setText(`/${cmd.name} `);
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, matches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && matches.length > 0)) {
        e.preventDefault();
        selectCommand(matches[selectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setText("");
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div>
      {showMenu && (
        <div className="mb-1 ml-5 border border-gray-700 rounded-md overflow-hidden">
          {matches.map((cmd, i) => (
            <button
              key={cmd.name}
              onMouseDown={(e) => { e.preventDefault(); selectCommand(cmd); }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-baseline gap-2 ${i === selectedIdx ? "bg-gray-800 text-green-400" : "text-gray-300 hover:bg-gray-800/60"}`}
            >
              <span className="font-mono font-semibold shrink-0">/{cmd.name}</span>
              <span className="text-gray-500 truncate text-[11px]">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 pt-1.5 border-t border-gray-800/50 mt-1">
        <span className="text-green-400 font-bold shrink-0">{"\u276F"}</span>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Claude Code..."
          className="flex-1 bg-transparent text-gray-100 text-sm outline-none placeholder-gray-600 font-mono"
        />
        <VoiceMic />
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="shrink-0 p-1 rounded text-gray-500 hover:text-green-400 disabled:text-gray-700 disabled:cursor-default transition-colors"
          title="Send (Enter)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Question Options ──

function QuestionOptions({
  questions,
  onSelect,
}: {
  questions: NonNullable<Card["pendingQuestions"]>;
  onSelect: (text: string) => void;
}) {
  return (
    <div className="mt-3 mb-1 space-y-4">
      {questions.map((q, qi) => (
        <div key={qi}>
          <div className="text-gray-300 text-sm mb-2 pl-3">{q.question}</div>
          <div className="flex flex-wrap gap-2 pl-3">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                onClick={() => onSelect(opt.label)}
                className="px-3 py-1.5 text-xs rounded-md border border-gray-700 bg-gray-800/60 text-gray-200 hover:bg-gray-700 hover:border-gray-600 hover:text-white transition-colors cursor-pointer"
                title={opt.description}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tool Activity Chips ──

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

// ── Cost Footer ──

function formatTokens(raw: string): string {
  const num = parseInt(raw, 10);
  if (isNaN(num)) return raw;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return String(num);
}

function CostFooter({ cost }: { cost: string }) {
  const parts = cost.split("|").map((s) => s.trim());
  // parts[0] = $cost, [1] = turns, [2] = duration, [3+] = token stats
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

// ── Bash Command Block ──

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

// ── Rate Limit Banner ──

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

// ── Task Chips ──

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

// ── Session Init Bar ──

function SessionInitBar({ init }: { init: SessionInit }) {
  const parts: string[] = [];
  if (init.version) parts.push(`v${init.version}`);
  // Shorten model name: "claude-opus-4-6" → "opus-4-6"
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

// ── Files Changed Chips ──

function FilesChangedChips({ files }: { files: FilesChanged[] }) {
  const allSaved = files.flatMap(f => f.saved);
  const allFailed = files.flatMap(f => f.failed);
  if (allSaved.length === 0 && allFailed.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-1 pl-3">
      {allSaved.map((name, i) => (
        <span
          key={`s-${i}`}
          className="inline-flex items-center gap-0.5 px-1 py-px text-[9px] bg-green-900/30 border border-green-700/40 text-green-400 rounded"
        >
          <span>{"\uD83D\uDCC4"}</span>
          <span className="truncate max-w-[120px]">{name}</span>
        </span>
      ))}
      {allFailed.map((name, i) => (
        <span
          key={`f-${i}`}
          className="inline-flex items-center gap-0.5 px-1 py-px text-[9px] bg-red-900/30 border border-red-700/40 text-red-400 rounded"
        >
          <span>{"\u26A0\uFE0F"}</span>
          <span className="truncate max-w-[120px]">{name}</span>
        </span>
      ))}
    </div>
  );
}

// ── Compact Banner ──

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

// ── Thinking Block ──

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

// ── Context Warning ──

function ContextWarningBanner({ percent }: { percent: number }) {
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

// ── Activity Indicator ──

function ActivityIndicator({ label }: { label?: string }) {
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

// ── Prompt Suggestion ──

function PromptSuggestion({ suggestion, onSelect }: { suggestion: string; onSelect: (text: string) => void }) {
  return (
    <button
      onClick={() => onSelect(suggestion)}
      className="text-left px-2 py-1 mt-0.5 rounded border border-gray-700/50 bg-gray-900/40 hover:bg-gray-800/60 hover:border-gray-600 transition-colors cursor-pointer group"
    >
      <span className="text-gray-500 text-[11px] italic group-hover:text-gray-300 transition-colors">{suggestion}</span>
    </button>
  );
}

// ── Terminal Block ──

interface TerminalEntry {
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

function TerminalBlock({ entry, isFirst, onInput }: { entry: TerminalEntry; isFirst?: boolean; onInput?: (text: string) => void }) {
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

// ── Main Terminal Card ──

/**
 * Parses card text into terminal entries.
 * The card accumulates all terminal interaction as text.
 * User prompts are prefixed with ">>> " markers injected by the store.
 * Tool activity markers (\u200B[tool:...]) and cost markers (\u200B[cost:...]) are stripped and collected.
 */
function parseEntries(card: Card): { entries: TerminalEntry[]; ctxPercent: number | null } {
  const text = card.text ?? "";
  if (!text) return { entries: [], ctxPercent: null };

  // Split on user prompt markers
  const segments = text.split(/^>>> (.+)$/m);

  const entries: TerminalEntry[] = [];
  let latestCtxPercent: number | null = null;

  // First segment: response text without a preceding prompt
  if (segments[0].trim()) {
    const { clean, tools, bashCommands, rateLimits, tasks, suggestions, sessionInit, filesChanged, compactEvents, cost, connectionLost, connectionRestored, ctxPercent, thinkingBlocks, isThinking } = stripMarkers(segments[0].trim());
    if (ctxPercent != null) latestCtxPercent = ctxPercent;
    entries.push({
      text: clean,
      toolActivities: tools,
      bashCommands,
      rateLimits,
      tasks,
      suggestions,
      sessionInit,
      filesChanged,
      compactEvents,
      thinkingBlocks,
      isThinking,
      cost,
      connectionLost,
      connectionRestored,
      status: segments.length <= 1 ? card.status : "complete",
    });
  }

  // Remaining segments alternate: prompt, response
  for (let i = 1; i < segments.length; i += 2) {
    const userPrompt = segments[i];
    const responseText = (segments[i + 1] ?? "").trim();
    const isLast = i + 2 >= segments.length;
    const { clean, tools, bashCommands, rateLimits, tasks, suggestions, sessionInit, filesChanged, compactEvents, cost, connectionLost, connectionRestored, ctxPercent, thinkingBlocks, isThinking } = stripMarkers(responseText);
    if (ctxPercent != null) latestCtxPercent = ctxPercent;

    entries.push({
      userPrompt,
      text: clean,
      toolActivities: tools,
      bashCommands,
      rateLimits,
      tasks,
      suggestions,
      sessionInit,
      filesChanged,
      compactEvents,
      thinkingBlocks,
      isThinking,
      cost,
      connectionLost,
      connectionRestored,
      status: isLast ? card.status : "complete",
    });
  }

  return { entries, ctxPercent: latestCtxPercent };
}

// ── Project Switch Button ──

function ProjectSwitchButton({ cardId, currentCwd }: { cardId: string; currentCwd: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const projects = useChatStore((s) => s.projects);
  const fetchProjects = useChatStore((s) => s.fetchProjects);
  const switchTerminalProject = useChatStore((s) => s.switchTerminalProject);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (isOpen && projects.length === 0) fetchProjects();
  }, [isOpen, projects.length, fetchProjects]);

  useEffect(() => {
    if (isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const projectName = currentCwd.replace(/\\/g, "/").split("/").pop() ?? currentCwd;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors truncate max-w-[180px]"
        title={`Project: ${currentCwd}\nClick to switch`}
      >
        <span className="text-[10px]">📁</span>
        <span className="truncate">{projectName}</span>
        <span className="text-[8px] opacity-60">▼</span>
      </button>
      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-72 max-h-48 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1"
          style={{ top: pos.top, right: pos.right }}
        >
          {projects.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 text-xs">Scanning...</div>
          ) : (
            projects.map((p) => (
              <button
                key={p.path}
                onClick={() => {
                  if (p.path !== currentCwd) switchTerminalProject(cardId, p.path);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700/60 transition-colors ${
                  p.path === currentCwd ? "text-green-400" : "text-gray-300"
                }`}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-gray-600 ml-1.5 text-[10px]">{p.path}</span>
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Session Picker (for /resume) ──

function SessionPicker({ cardId, onDismiss }: { cardId: string; onDismiss: () => void }) {
  const cards = useChatStore((s) => s.cards);
  const resumeSessionOnCard = useChatStore((s) => s.resumeSessionOnCard);
  const sendMessage = useChatStore((s) => s.sendMessage);

  // Collect all terminal cards with active sessions (excluding this card)
  const sessions = Object.values(cards).filter(
    (c): c is Card & { toolMeta: { toolSessionId: string; cwd: string } } =>
      c.type === "terminal" &&
      c.id !== cardId &&
      !!c.toolMeta?.toolSessionId &&
      !!c.toolMeta?.cwd,
  );

  if (sessions.length === 0) {
    return (
      <div className="py-3 text-center">
        <div className="text-gray-500 text-sm mb-2">No active sessions to resume.</div>
        <div className="text-gray-600 text-xs">Type a prompt to start a new session.</div>
        <button onClick={onDismiss} className="mt-2 text-xs text-gray-400 hover:text-gray-300">Dismiss</button>
      </div>
    );
  }

  return (
    <div className="py-2">
      <div className="text-gray-400 text-xs mb-2 px-1">Resume an existing session:</div>
      <div className="space-y-1">
        {sessions.map((c) => {
          const projectName = c.toolMeta.cwd.replace(/\\/g, "/").split("/").pop() ?? c.toolMeta.cwd;
          return (
            <button
              key={c.id}
              onClick={() => {
                resumeSessionOnCard(cardId, c.toolMeta.toolSessionId, c.toolMeta.cwd);
                onDismiss();
                // Send /resume to actually resume the CLI session
                const routing = {
                  mode: "direct_tool" as const,
                  toolId: "claude-code",
                  toolSessionId: c.toolMeta.toolSessionId,
                  cwd: c.toolMeta.cwd,
                };
                sendMessage("/resume", routing, cardId);
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-800/80 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <span className="text-green-400 font-medium text-sm">{projectName}</span>
                <span className="text-gray-600 text-[10px]">{c.toolMeta.toolSessionId.slice(0, 8)}...</span>
              </div>
              <div className="text-gray-600 text-[10px] mt-0.5">{c.toolMeta.cwd}</div>
            </button>
          );
        })}
      </div>
      <button onClick={onDismiss} className="mt-2 text-xs text-gray-400 hover:text-gray-300 px-1">Cancel</button>
    </div>
  );
}

// ── Main Terminal Card ──

export default function TerminalCard({ card }: CardRendererProps) {
  const projects = useChatStore((s) => s.projects);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelOperation = useChatStore((s) => s.cancelOperation);
  const fetchProjects = useChatStore((s) => s.fetchProjects);
  const setCodeSessionCwd = useChatStore((s) => s.setCodeSessionCwd);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showSessionPicker, setShowSessionPicker] = useState(false);

  // Per-card session state — derived from the card's own toolMeta
  const cardCwd = card.toolMeta?.cwd ?? null;
  const cardSessionId = card.toolMeta?.toolSessionId ?? null;
  const needsProject = !cardCwd;
  const { entries, ctxPercent } = useMemo(() => parseEntries(card), [card.text, card.status]);
  const isStreaming = card.status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [card.text, isStreaming]);

  // Fetch projects when this card needs one
  useEffect(() => {
    if (needsProject && projects.length === 0) fetchProjects();
  }, [needsProject, projects.length, fetchProjects]);

  function handleInput(text: string) {
    // /resume with no session → show session picker
    if (text.trim().toLowerCase() === "/resume" && !cardSessionId) {
      setShowSessionPicker(true);
      return;
    }
    const routing = {
      mode: "direct_tool" as const,
      toolId: "claude-code",
      ...(cardSessionId ? { toolSessionId: cardSessionId } : {}),
      ...(cardCwd ? { cwd: cardCwd } : {}),
    };
    sendMessage(text, routing, card.id);
  }

  return (
    <div className="mb-3">
      <div className="bg-[#0d1117] border border-gray-800 rounded-lg overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-900/80 border-b border-gray-800 text-xs">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500/70" />
            <span className="w-2 h-2 rounded-full bg-yellow-500/70" />
            <span className="w-2 h-2 rounded-full bg-green-500/70" />
          </div>
          <span className="text-gray-400 text-[11px]">Claude Code</span>
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
          {card.operation?.cancellable && card.operation.operationId && (
            <button
              onClick={() => cancelOperation(card.operation!.operationId)}
              className="ml-auto px-2 py-0.5 rounded border border-red-700/60 text-red-300 hover:bg-red-900/40 transition-colors"
              title="Cancel current operation"
            >
              Cancel
            </button>
          )}
          {cardCwd && (
            <span className={card.operation?.cancellable ? "" : "ml-auto"}>
              <ProjectSwitchButton cardId={card.id} currentCwd={cardCwd} />
            </span>
          )}
        </div>

        {/* Content */}
        <div className="px-3 py-2 max-h-[70vh] overflow-y-auto">
          {needsProject ? (
            showSessionPicker ? (
              <SessionPicker cardId={card.id} onDismiss={() => setShowSessionPicker(false)} />
            ) : (
              <ProjectPicker projects={projects} cardId={card.id} />
            )
          ) : showSessionPicker ? (
            <SessionPicker cardId={card.id} onDismiss={() => setShowSessionPicker(false)} />
          ) : (
            <>
              {ctxPercent != null && ctxPercent >= 85 && (
                <ContextWarningBanner percent={ctxPercent} />
              )}
              {entries.map((entry, i) => (
                <TerminalBlock key={i} entry={entry} isFirst={i === 0} onInput={handleInput} />
              ))}

              {isStreaming && card.operation && card.operation.stage !== "streaming" && card.operation.stage !== "complete" && (
                <ActivityIndicator label={card.operation.label} />
              )}

              {card.pendingQuestions && card.pendingQuestions.length > 0 && !isStreaming && (
                <QuestionOptions questions={card.pendingQuestions} onSelect={handleInput} />
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input — outside scroll container so autocomplete menu isn't clipped */}
        {!needsProject && !isStreaming && (
          <div className="px-3 pb-2">
            <TerminalInput onSubmit={handleInput} cwd={cardCwd} />
          </div>
        )}
      </div>
    </div>
  );
}
