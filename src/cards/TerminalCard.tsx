import { useState, useRef, useEffect } from "react";
import { useChatStore, type ProjectInfo } from "../store/chat";
import MarkdownText from "../components/MarkdownText";
import type { Card, CardRendererProps } from "./types";

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

// ── Terminal Block ──

interface TerminalEntry {
  userPrompt?: string;
  text: string;
  status: Card["status"];
}

function TerminalBlock({ entry }: { entry: TerminalEntry }) {
  return (
    <div className="mb-1">
      {entry.userPrompt && (
        <div className="flex items-start gap-2 mb-1">
          <span className="text-green-400 font-bold shrink-0">{"\u276F"}</span>
          <span className="text-gray-100 text-sm">{entry.userPrompt}</span>
        </div>
      )}
      <div className="text-sm text-gray-300 leading-relaxed pl-5">
        <MarkdownText text={entry.text} />
        {entry.status === "streaming" && (
          <span className="inline-block w-1.5 h-4 bg-green-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
        )}
      </div>
      {entry.status === "error" && (
        <div className="text-red-400 text-xs mt-1 pl-5">
          Command failed
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
 */
function parseEntries(card: Card): TerminalEntry[] {
  const text = card.text ?? "";
  if (!text) return [];

  // Split on user prompt markers
  const segments = text.split(/^>>> (.+)$/m);

  const entries: TerminalEntry[] = [];

  // First segment: response text without a preceding prompt
  if (segments[0].trim()) {
    entries.push({
      text: segments[0].trim(),
      status: segments.length <= 1 ? card.status : "complete",
    });
  }

  // Remaining segments alternate: prompt, response
  for (let i = 1; i < segments.length; i += 2) {
    const userPrompt = segments[i];
    const responseText = (segments[i + 1] ?? "").trim();
    const isLast = i + 2 >= segments.length;

    entries.push({
      userPrompt,
      text: responseText,
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
                <TerminalBlock key={i} entry={entry} />
              ))}

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
