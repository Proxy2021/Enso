import { useState, useRef, useMemo } from "react";
import { useChatStore } from "../store/chat";

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

export default function ChatInput() {
  const [text, setText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendMessageWithMedia = useChatStore((s) => s.sendMessageWithMedia);
  const connectionState = useChatStore((s) => s.connectionState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const disabled = connectionState !== "connected";

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

  return (
    <div className="border-t border-gray-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="max-w-3xl mx-auto relative">
        {attachedFiles.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {attachedFiles.map((file, i) => (
              <div
                key={i}
                className="relative group rounded-lg overflow-hidden border border-gray-700 bg-gray-800"
              >
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="h-16 w-16 object-cover"
                />
                <button
                  onClick={() => removeFile(i)}
                  className="absolute top-0 right-0 bg-gray-900/80 text-gray-300 hover:text-white rounded-bl-lg px-1.5 py-0.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &times;
                </button>
              </div>
            ))}
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

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-3 py-2.5 rounded-xl text-sm transition-colors"
            title="Attach image"
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
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Disconnected..." : "Type a message..."}
            disabled={disabled}
            rows={1}
            className="flex-1 bg-gray-800 text-gray-100 rounded-xl px-4 py-2.5 text-base sm:text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 disabled:opacity-50"
          />
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
