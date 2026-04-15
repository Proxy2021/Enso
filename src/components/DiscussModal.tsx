/**
 * DiscussModal — Modal chat overlay for discussing a task with an agent before executing.
 *
 * Self-contained dialogue: sends messages to POST /api/chat/discuss,
 * accumulates conversation history, then "Execute" packages everything
 * as a react with the full discussion context.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { pushToast } from "../lib/notifications";
import type { ReactContext, AgentOption, DiscussRequest } from "./ReactToTL";

interface Message {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface Props {
  request: DiscussRequest;
  onClose: () => void;
  onExecute: (enrichedText: string, detail: string, imageUrls: string[]) => void;
}

export default function DiscussModal({ request, onClose, onExecute }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send the initial message on mount
  useEffect(() => {
    if (request.text) {
      sendMessage(request.text);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", text: text.trim(), timestamp: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${getBackendBaseUrl()}/api/chat/discuss`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, text: m.text })),
          context: request.context,
          agentName: request.agent.name,
          agentRole: request.agent.role,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMsg: Message = { role: "assistant", text: data.reply, timestamp: Date.now() };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", text: "Sorry, I couldn't process that. Please try again.", timestamp: Date.now() }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Connection error. Please try again.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [messages, loading, request]);

  const handleExecute = useCallback(async () => {
    setExecuting(true);

    // Build enriched context from the full discussion
    const discussionText = messages.map(m =>
      `${m.role === "user" ? "User" : request.agent.name}: ${m.text}`
    ).join("\n\n");

    const enrichedText = request.text;
    const detail = `Discussion with ${request.agent.name} (${messages.length} messages):\n\n${discussionText}`;

    onExecute(enrichedText, detail, request.imageUrls);
    pushToast("Executing", `Task sent to ${request.agent.name} with discussion context`, true, 3000);
  }, [messages, request, onExecute]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const agentEmoji = request.agent.type === "tl" ? "\uD83D\uDC54" : "\u2726";

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-2xl mx-4 bg-gray-900 border border-violet-500/30 rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "80vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-gray-800/60 flex items-center gap-3">
          <span className="text-lg">{agentEmoji}</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-violet-200">Discuss with {request.agent.name}</h3>
            <p className="text-[10px] text-gray-500 truncate">{request.context.summary}</p>
          </div>
          <button
            onClick={handleExecute}
            disabled={messages.length < 2 || loading || executing}
            className="text-[11px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-30 transition-colors flex items-center gap-1.5"
          >
            {executing ? "Sending..." : "\u26A1 Execute"}
          </button>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
          >
            {"\u00D7"}
          </button>
        </div>

        {/* Chat area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[200px]">
          {messages.length === 0 && !loading && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">Start discussing your task with {request.agent.name}.</p>
              <p className="text-[10px] text-gray-600 mt-1">When you're ready, click Execute to launch the task with full context.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                msg.role === "user"
                  ? "bg-violet-600/30 border border-violet-500/20 text-gray-200"
                  : "bg-gray-800/60 border border-gray-700/30 text-gray-300"
              }`}>
                {msg.role === "assistant" && (
                  <p className="text-[9px] text-violet-400 font-medium mb-1">{request.agent.name}</p>
                )}
                <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-800/60 border border-gray-700/30 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-5 py-3 border-t border-gray-800/60">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && input.trim() && !loading) {
                  sendMessage(input);
                }
              }}
              placeholder="Type your message..."
              className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500"
              autoFocus
              disabled={loading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="text-[11px] px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-30 transition-colors"
            >
              Send
            </button>
          </div>
          <p className="text-[9px] text-gray-600 mt-1.5 text-center">
            Discuss to refine the task, then click <strong className="text-emerald-400">Execute</strong> to launch
          </p>
        </div>
      </div>
    </div>
  );
}
