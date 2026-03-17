import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useChatStore, type ProjectInfo } from "../store/chat";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { useVoiceInput } from "../components/VoiceMicButton";
import type { Card, CardRendererProps } from "./types";

// Import shared terminal rendering from TerminalContent
import {
  parseEntries,
  TerminalBlock,
  ContextWarningBanner,
  ActivityIndicator,
} from "../components/TerminalContent";

// Re-export TOOL_ICONS for any external consumers
export { TOOL_ICONS } from "../components/TerminalContent";

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
  const { entries, ctxPercent } = useMemo(() => parseEntries(card.text ?? "", card.status), [card.text, card.status]);
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
