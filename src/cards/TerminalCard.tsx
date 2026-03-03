import { useState, useRef, useEffect } from "react";
import { useChatStore, type ProjectInfo } from "../store/chat";
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
  let sessionInit: SessionInit | null = null;
  let cost: string | null = null;

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

  return { clean, tools, bashCommands, rateLimits, tasks, suggestions, sessionInit, filesChanged, compactEvents, cost };
}

// ── Project Picker ──

function ProjectPicker({ projects }: { projects: ProjectInfo[] }) {
  const setCodeSessionCwd = useChatStore((s) => s.setCodeSessionCwd);
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
            onClick={() => setCodeSessionCwd(p.path)}
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

// ── Terminal Input ──

function TerminalInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex items-center gap-2 pt-2 border-t border-gray-800/50 mt-2">
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
          <div className="text-gray-300 text-sm mb-2 pl-5">{q.question}</div>
          <div className="flex flex-wrap gap-2 pl-5">
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
    <div className="flex flex-wrap gap-1 mb-1.5 pl-5">
      {tools.map((t, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-gray-800/80 border border-gray-700/50 text-gray-500 rounded"
        >
          <span>{TOOL_ICONS[t.toolName] ?? "\u2699\uFE0F"}</span>
          <span>{t.toolName}</span>
          {t.detail && <span className="text-gray-600 truncate max-w-[120px]">{t.detail}</span>}
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
  return (
    <div className="font-mono mt-1 pl-5">
      <div className="text-[10px] text-gray-600">{primary}</div>
      {tokenParts.length > 0 && (
        <div className="text-[10px] text-gray-700">{tokenParts.join(" \u00B7 ")}</div>
      )}
    </div>
  );
}

// ── Bash Command Block ──

function BashCommandBlock({ commands }: { commands: BashCommand[] }) {
  if (commands.length === 0) return null;
  return (
    <div className="space-y-0.5 mb-1.5 pl-5">
      {commands.map((c, i) => (
        <div key={i} className="bg-gray-900/80 border border-gray-800/60 rounded px-2 py-1 font-mono text-[11px]">
          <span className="text-green-500">$</span>{" "}
          <span className="text-gray-300">{c.command}</span>
        </div>
      ))}
    </div>
  );
}

// ── Rate Limit Banner ──

function RateLimitBanner({ limits }: { limits: RateLimitWarning[] }) {
  if (limits.length === 0) return null;
  return (
    <div className="space-y-1 mb-1.5 pl-5">
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
    <div className="flex flex-wrap gap-1 mb-1.5 pl-5">
      {tasks.map((t, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] border rounded ${colors[t.type] ?? "bg-gray-800 border-gray-700 text-gray-400"}`}
        >
          <span>{icons[t.type] ?? "\u2699\uFE0F"}</span>
          <span className="truncate max-w-[200px]">{t.description}</span>
        </span>
      ))}
    </div>
  );
}

// ── Session Init Bar ──

function SessionInitBar({ init }: { init: SessionInit }) {
  const parts: string[] = [];
  if (init.version) parts.push(`Claude Code v${init.version}`);
  if (init.model) parts.push(init.model);
  if (init.toolCount) parts.push(`${init.toolCount} tools`);
  if (init.mcpCount) parts.push(`${init.mcpCount} MCP servers`);
  if (init.mode) parts.push(init.mode);
  if (parts.length === 0) return null;
  return (
    <div className="text-[10px] text-gray-500 font-mono bg-gray-900/60 rounded px-2 py-0.5 mb-1.5 ml-5 w-fit">
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
    <div className="flex flex-wrap gap-1 mb-1.5 pl-5">
      {allSaved.map((name, i) => (
        <span
          key={`s-${i}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-green-900/30 border border-green-700/40 text-green-400 rounded"
        >
          <span>{"\uD83D\uDCC4"}</span>
          <span className="truncate max-w-[140px]">{name}</span>
        </span>
      ))}
      {allFailed.map((name, i) => (
        <span
          key={`f-${i}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-red-900/30 border border-red-700/40 text-red-400 rounded"
        >
          <span>{"\u26A0\uFE0F"}</span>
          <span className="truncate max-w-[140px]">{name}</span>
        </span>
      ))}
    </div>
  );
}

// ── Compact Banner ──

function CompactBanner({ events }: { events: CompactEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="space-y-1 mb-1.5 pl-5">
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

// ── Activity Indicator ──

function ActivityIndicator({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-2 pl-5 text-gray-400 text-xs">
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-green-400 animate-[pulse_1.4s_ease-in-out_infinite]" />
        <span className="w-1 h-1 rounded-full bg-green-400 animate-[pulse_1.4s_ease-in-out_0.2s_infinite]" />
        <span className="w-1 h-1 rounded-full bg-green-400 animate-[pulse_1.4s_ease-in-out_0.4s_infinite]" />
      </span>
      <span className="text-gray-500">{label || "Working..."}</span>
    </div>
  );
}

// ── Prompt Suggestion ──

function PromptSuggestion({ suggestion, onSelect }: { suggestion: string; onSelect: (text: string) => void }) {
  return (
    <button
      onClick={() => onSelect(suggestion)}
      className="w-full text-left px-3 py-1.5 mt-1 rounded border border-gray-700/50 bg-gray-900/40 hover:bg-gray-800/60 hover:border-gray-600 transition-colors cursor-pointer group"
    >
      <span className="text-gray-600 text-xs mr-1.5">{">"}</span>
      <span className="text-gray-500 text-xs italic group-hover:text-gray-300 transition-colors">{suggestion}</span>
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
  cost: string | null;
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
      <div className="text-sm text-gray-300 leading-relaxed pl-5">
        <MarkdownText text={entry.text} />
        {entry.status === "streaming" && (
          <span className="inline-block w-1.5 h-4 bg-green-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
        )}
      </div>
      {entry.cost && <CostFooter cost={entry.cost} />}
      {entry.status === "error" && (
        <div className="text-red-400 text-xs mt-1 pl-5">
          Command failed
        </div>
      )}
      {entry.status === "complete" && entry.suggestions.length > 0 && onInput && (
        <div className="pl-5 mt-1">
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
function parseEntries(card: Card): TerminalEntry[] {
  const text = card.text ?? "";
  if (!text) return [];

  // Split on user prompt markers
  const segments = text.split(/^>>> (.+)$/m);

  const entries: TerminalEntry[] = [];

  // First segment: response text without a preceding prompt
  if (segments[0].trim()) {
    const { clean, tools, bashCommands, rateLimits, tasks, suggestions, sessionInit, filesChanged, compactEvents, cost } = stripMarkers(segments[0].trim());
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
      cost,
      status: segments.length <= 1 ? card.status : "complete",
    });
  }

  // Remaining segments alternate: prompt, response
  for (let i = 1; i < segments.length; i += 2) {
    const userPrompt = segments[i];
    const responseText = (segments[i + 1] ?? "").trim();
    const isLast = i + 2 >= segments.length;
    const { clean, tools, bashCommands, rateLimits, tasks, suggestions, sessionInit, filesChanged, compactEvents, cost } = stripMarkers(responseText);

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
      cost,
      status: isLast ? card.status : "complete",
    });
  }

  return entries;
}

export default function TerminalCard({ card }: CardRendererProps) {
  const projects = useChatStore((s) => s.projects);
  const codeSessionCwd = useChatStore((s) => s.codeSessionCwd);
  const codeSessionId = useChatStore((s) => s.codeSessionId);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelOperation = useChatStore((s) => s.cancelOperation);
  const activeTerminalCardId = useChatStore((s) => s._activeTerminalCardId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const needsProject = !codeSessionCwd;
  const entries = parseEntries(card);
  const isStreaming = card.status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [card.text, isStreaming]);

  function handleInput(text: string) {
    const routing = {
      mode: "direct_tool" as const,
      toolId: "claude-code",
      ...(codeSessionId ? { toolSessionId: codeSessionId } : {}),
      ...(codeSessionCwd ? { cwd: codeSessionCwd } : {}),
    };
    sendMessage(text, routing);
  }

  return (
    <div className="mb-3">
      <div className="bg-[#0d1117] border border-gray-800 rounded-lg overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-900/80 border-b border-gray-800 text-xs">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          <span className="text-gray-400 ml-1">Claude Code</span>
          {card.operation?.label && (
            <span className="text-gray-500 ml-2 truncate max-w-[30%]">{card.operation.label}</span>
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
          {codeSessionCwd && (
            <span className={`text-gray-600 truncate ${card.operation?.cancellable ? "max-w-[30%]" : "ml-auto max-w-[60%]"}`}>
              {codeSessionCwd}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="px-4 py-3 max-h-[600px] overflow-y-auto">
          {needsProject ? (
            <ProjectPicker projects={projects} />
          ) : (
            <>
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

          {activeTerminalCardId === card.id && !needsProject && !isStreaming && (
            <TerminalInput onSubmit={handleInput} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
