import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useChatStore } from "../store/chat";
import { useSpeechRecognition } from "../lib/use-speech-recognition";

interface SlashCommand {
  command: string;
  label: string;
  description: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { command: "/code", label: "/code", description: "Open Claude Code project picker" },
  { command: "/code ", label: "/code <prompt>", description: "Send a prompt to Claude Code" },
  { command: "/tool enso", label: "/tool enso", description: "Open the tool console" },
  { command: "/delete-apps", label: "/delete-apps", description: "Delete all dynamically created apps" },
];

const ATTACH_CATEGORIES = [
  {
    id: "photos_videos",
    label: "Photos & Videos",
    accept: "image/*,video/*",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  {
    id: "documents",
    label: "Documents",
    accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip,.json,.xml,.md",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
  },
  {
    id: "audio",
    label: "Audio",
    accept: "audio/*",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    id: "location",
    label: "Location",
    accept: null,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
] as const;

function getFileCategory(file: File): "image" | "video" | "audio" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

function getFileExt(file: File): string {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts.pop()!.toUpperCase() : "";
}

export default function ChatInput() {
  const [text, setText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendMessageWithMedia = useChatStore((s) => s.sendMessageWithMedia);
  const connectionState = useChatStore((s) => s.connectionState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  const disabled = connectionState !== "connected";

  // Speech-to-text
  const handleTranscript = useCallback((transcript: string) => {
    setText((prev) => {
      const separator = prev.length > 0 && !prev.endsWith(" ") ? " " : "";
      return prev + separator + transcript;
    });
  }, []);
  const { isSupported: speechSupported, isListening, interimTranscript, toggleListening } =
    useSpeechRecognition(handleTranscript);

  // Close attach menu on click outside
  useEffect(() => {
    if (!attachMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [attachMenuOpen]);

  // Filter slash commands based on current input
  const filteredCommands = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/")) return [];
    // Show all commands when just "/" is typed
    if (trimmed === "/") return SLASH_COMMANDS;
    // Filter by prefix match
    return SLASH_COMMANDS.filter(
      (cmd) => cmd.command.startsWith(trimmed) && cmd.command !== trimmed,
    );
  }, [text]);

  const showMenu = filteredCommands.length > 0;

  async function handleSend() {
    const trimmed = text.trim();
    if ((!trimmed && attachedFiles.length === 0) || disabled) return;

    if (isListening) toggleListening();

    if (attachedFiles.length > 0) {
      await sendMessageWithMedia(trimmed, attachedFiles);
    } else {
      sendMessage(trimmed);
    }

    setText("");
    setAttachedFiles([]);
    setSelectedIndex(0);
    textareaRef.current?.focus();
  }

  function selectCommand(cmd: SlashCommand) {
    // If the command ends with a space (like "/code "), just fill it in for the user to continue typing
    if (cmd.command.endsWith(" ")) {
      setText(cmd.command);
    } else {
      setText(cmd.command);
      // Auto-send commands that don't need arguments
      setTimeout(() => {
        sendMessage(cmd.command);
        setText("");
        setSelectedIndex(0);
      }, 0);
    }
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showMenu) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) selectCommand(cmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setText("");
        setSelectedIndex(0);
        return;
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    setSelectedIndex(0);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      setAttachedFiles((prev) => [...prev, ...files]);
    }
    e.target.value = "";
  }

  function removeFile(index: number) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleCategorySelect(cat: (typeof ATTACH_CATEGORIES)[number]) {
    setAttachMenuOpen(false);
    if (cat.id === "location") {
      handleLocationShare();
      return;
    }
    if (fileInputRef.current && cat.accept) {
      fileInputRef.current.accept = cat.accept;
      fileInputRef.current.click();
    }
  }

  async function handleLocationShare() {
    if (!navigator.geolocation) return;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      const { latitude, longitude } = position.coords;
      const locationText = `My Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nhttps://www.google.com/maps?q=${latitude},${longitude}`;
      sendMessage(locationText);
    } catch {
      // Permission denied or timeout — silently ignore
    }
  }

  return (
    <div className="border-t border-gray-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="max-w-3xl mx-auto relative">
        {/* Attached file previews */}
        {attachedFiles.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {attachedFiles.map((file, i) => {
              const cat = getFileCategory(file);
              return (
                <div
                  key={i}
                  className="relative group rounded-lg overflow-hidden border border-gray-700 bg-gray-800"
                >
                  {cat === "image" ? (
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="h-16 w-16 object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 flex flex-col items-center justify-center gap-1 px-1">
                      {cat === "video" && (
                        <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      )}
                      {cat === "audio" && (
                        <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      )}
                      {cat === "document" && (
                        <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      )}
                      <span className="text-[8px] text-gray-400 truncate w-full text-center">
                        {getFileExt(file) || file.name.slice(0, 8)}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-0 right-0 bg-gray-900/80 text-gray-300 hover:text-white rounded-bl-lg px-1.5 py-0.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Slash command autocomplete menu */}
        {showMenu && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-600/60 rounded-lg shadow-[0_-4px_20px_rgba(0,0,0,0.4)] overflow-hidden z-50">
            {filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.command}
                onClick={() => selectCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full text-left px-3 py-3 sm:py-2 flex items-center gap-3 transition-colors ${
                  idx === selectedIndex
                    ? "bg-indigo-600/30 text-gray-100"
                    : "text-gray-300 hover:bg-gray-700/50"
                }`}
              >
                <span className="text-xs font-mono text-indigo-400 min-w-[120px]">{cmd.label}</span>
                <span className="text-xs text-gray-400">{cmd.description}</span>
              </button>
            ))}
            <div className="px-3 py-1.5 border-t border-gray-700/50 text-[10px] text-gray-500">
              ↑↓ navigate · Enter or Tab to select · Esc to dismiss
            </div>
          </div>
        )}

        {isListening && interimTranscript && (
          <div className="mb-1.5 px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/40 text-sm text-gray-400 italic truncate">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse mr-2 align-middle" />
            {interimTranscript}
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Attachment menu */}
          <div ref={attachMenuRef} className="relative">
            <button
              onClick={() => setAttachMenuOpen(!attachMenuOpen)}
              disabled={disabled}
              className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-3 py-2.5 rounded-xl text-sm transition-colors"
              title="Attach file"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            {attachMenuOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-48 bg-gray-800 border border-gray-600/60 rounded-lg shadow-[0_-4px_20px_rgba(0,0,0,0.4)] overflow-hidden z-50">
                {ATTACH_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat)}
                    className="w-full text-left px-3 py-3 sm:py-2.5 flex items-center gap-3 text-gray-300 hover:bg-gray-700/50 transition-colors"
                  >
                    <span className="text-indigo-400 shrink-0">{cat.icon}</span>
                    <span className="text-xs">{cat.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Disconnected..." : isListening ? "Listening..." : "Type a message..."}
            disabled={disabled}
            rows={1}
            className="flex-1 bg-gray-800 text-gray-100 rounded-xl px-4 py-2.5 text-base sm:text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 disabled:opacity-50"
          />
          {speechSupported && (
            <button
              onClick={toggleListening}
              disabled={disabled}
              className={`relative px-3 py-2.5 rounded-xl text-sm transition-colors ${
                isListening
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  : "bg-gray-800 hover:bg-gray-700 text-gray-300"
              } disabled:opacity-50`}
              title={isListening ? "Stop recording" : "Voice input"}
              aria-label={isListening ? "Stop voice recording" : "Start voice recording"}
            >
              {isListening && (
                <span className="absolute inset-0 rounded-xl bg-red-500/20 animate-pulse" />
              )}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="relative z-10"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={disabled || (!text.trim() && attachedFiles.length === 0)}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
