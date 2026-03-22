import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useChatStore } from "../store/chat";
import { useSpeechRecognition } from "../lib/use-speech-recognition";
import { useVoiceRecorder } from "../lib/use-voice-recorder";
import { isNative } from "../lib/platform";
import { isLikelyNaturalLanguage } from "../utils/nlDetection";
import { useT } from "../lib/i18n";

interface SlashCommand {
  command: string;
  label: string;
  descKey: string;
  icon?: string;
  category: "build" | "research" | "system" | "history";
}

const SLASH_COMMANDS: SlashCommand[] = [
  // Build
  { command: "/code", label: "/code", descKey: "slash.code", icon: "\uD83D\uDCBB", category: "build" },
  { command: "/code ", label: "/code <prompt>", descKey: "slash.codePrompt", icon: "\uD83D\uDCBB", category: "build" },
  { command: "/orchestrate", label: "/orchestrate", descKey: "slash.orchestrate", icon: "\u26A1", category: "build" },
  { command: "/evolve", label: "/evolve", descKey: "slash.evolve", icon: "\uD83E\uDDEC", category: "build" },
  // Research
  { command: "/research ", label: "/research <topic>", descKey: "slash.research", icon: "\uD83D\uDD0D", category: "research" },
  { command: "/discover", label: "/discover", descKey: "slash.discover", icon: "\uD83D\uDD2C", category: "research" },
  // System
  { command: "/projects", label: "/projects", descKey: "slash.projects", icon: "\uD83D\uDCC1", category: "system" },
  { command: "/shell", label: "/shell", descKey: "slash.shell", icon: "\uD83D\uDDA5\uFE0F", category: "system" },
  { command: "/tool enso", label: "/tool enso", descKey: "slash.toolEnso", icon: "\uD83D\uDD27", category: "system" },
  { command: "/delete-apps", label: "/delete-apps", descKey: "slash.deleteApps", icon: "\uD83D\uDDD1\uFE0F", category: "system" },
  { command: "/help", label: "/help", descKey: "slash.help", icon: "\u2753", category: "system" },
  // History
  { command: "/evolution-history", label: "/evolution-history", descKey: "slash.evolutionHistory", icon: "\uD83D\uDCCA", category: "history" },
  { command: "/discovery-history", label: "/discovery-history", descKey: "slash.discoveryHistory", icon: "\uD83D\uDD0D", category: "history" },
];

const CATEGORY_LABELS: Record<SlashCommand["category"], string> = {
  build: "Build",
  research: "Research",
  system: "System",
  history: "History",
};

const ATTACH_CATEGORIES = [
  {
    id: "photos_videos",
    labelKey: "attach.photosVideos",
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
    labelKey: "attach.documents",
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
    labelKey: "attach.audio",
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
    id: "camera",
    labelKey: "attach.camera",
    accept: "image/*",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  {
    id: "location",
    labelKey: "attach.location",
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
  const [locationError, setLocationError] = useState<string | null>(null);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendMessageWithMedia = useChatStore((s) => s.sendMessageWithMedia);
  const sendShellInput = useChatStore((s) => s.sendShellInput);
  const activeShellSessionId = useChatStore((s) => s.getActiveShellSessionId());
  const connectionState = useChatStore((s) => s.connectionState);
  const hasActiveBackgroundTask = useChatStore((s) => s.hasActiveBackgroundTask);
  const hasCards = useChatStore((s) => s.cardOrder.length > 0);
  const clearConversation = useChatStore((s) => s.clearConversation);
  const { t } = useT();
  const [queueToast, setQueueToast] = useState<string | null>(null);
  const nlInterceptionToast = useChatStore((s) => s._nlInterceptionToast);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageResearchRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  const disabled = connectionState !== "connected";

  // Auto-dismiss queue toast after 4 seconds
  useEffect(() => {
    if (!queueToast) return;
    const timer = setTimeout(() => setQueueToast(null), 4000);
    return () => clearTimeout(timer);
  }, [queueToast]);

  // Auto-dismiss NL interception toast after 3 seconds
  useEffect(() => {
    if (!nlInterceptionToast) return;
    const timer = setTimeout(() => useChatStore.setState({ _nlInterceptionToast: null }), 3000);
    return () => clearTimeout(timer);
  }, [nlInterceptionToast]);

  // Speech-to-text — native uses MediaRecorder + server transcription, web uses Web Speech API
  const handleTranscript = useCallback((transcript: string) => {
    setText((prev) => {
      const separator = prev.length > 0 && !prev.endsWith(" ") ? " " : "";
      return prev + separator + transcript;
    });
  }, []);
  const speech = useSpeechRecognition(handleTranscript);
  const recorder = useVoiceRecorder(handleTranscript);
  const voice = isNative ? recorder : speech;
  const speechSupported = voice.isSupported;
  const isListening = voice.isListening;
  const toggleListening = voice.toggleListening;
  const interimTranscript = isNative
    ? (recorder.isTranscribing ? t("chat.transcribing") : (recorder.isListening ? t("chat.recording") : ""))
    : speech.interimTranscript;

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

    // Route to active shell session when one exists (essential for mobile
    // where xterm.js virtual keyboard doesn't reliably appear in WebView).
    // Skip for slash commands so /shell, /code etc. still work.
    if (activeShellSessionId && attachedFiles.length === 0 && !trimmed.startsWith("/")) {
      if (!isLikelyNaturalLanguage(trimmed)) {
        sendShellInput(trimmed);
        setText("");
        textareaRef.current?.focus();
        return;
      }
      // NL detected in shell mode — route to AI instead of shell
    }

    if (attachedFiles.length > 0) {
      await sendMessageWithMedia(trimmed, attachedFiles);
    } else {
      sendMessage(trimmed);
    }

    // Show queue toast if a background task is active
    if (hasActiveBackgroundTask()) {
      setQueueToast(t("chat.queueToast"));
    }

    setText("");
    setAttachedFiles([]);
    setSelectedIndex(0);
    requestAnimationFrame(() => autoResize());
    textareaRef.current?.focus();
  }

  function selectCommand(cmd: SlashCommand) {
    // Capture trailing text the user typed after the command prefix
    const currentText = text.trim();
    const trailingText = currentText.startsWith(cmd.command.trimEnd())
      ? currentText.slice(cmd.command.trimEnd().length).trim()
      : "";

    if (cmd.command.endsWith(" ")) {
      // Commands that expect inline arguments (e.g. "/code ")
      // Pre-fill with command + any trailing text the user already typed
      setText(trailingText ? `${cmd.command}${trailingText}` : cmd.command);
    } else {
      // Auto-send commands (e.g. "/orchestrate", "/shell")
      // Send the FULL text including trailing arguments
      const fullText = trailingText ? `${cmd.command} ${trailingText}` : cmd.command;
      setText(fullText);
      setTimeout(() => {
        sendMessage(fullText);
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
        if (cmd) {
          // If the user has typed text BEYOND the command prefix,
          // send directly instead of selecting the autocomplete item
          const trimmed = text.trim();
          const hasTrailingText = cmd.command.endsWith(" ")
            ? trimmed.length > cmd.command.trimEnd().length + 1
            : trimmed.length > cmd.command.length;
          if (e.key === "Enter" && hasTrailingText) {
            handleSend();
          } else {
            selectCommand(cmd);
          }
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setText("");
        setSelectedIndex(0);
        return;
      }
    } else if (e.key === "Escape" && activeShellSessionId) {
      e.preventDefault();
      const wsClient = useChatStore.getState()._wsClient;
      if (wsClient) {
        wsClient.send({ type: "shell.destroy", shellSessionId: activeShellSessionId });
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    setSelectedIndex(0);
    requestAnimationFrame(() => autoResize());
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      // Image-research: auto-send immediately, no staging
      if (e.target === imageResearchRef.current) {
        e.target.value = "";
        sendMessageWithMedia("", files, "image_research");
        return;
      }
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
    if (cat.id === "camera") {
      cameraInputRef.current?.click();
      return;
    }
    if (fileInputRef.current && cat.accept) {
      fileInputRef.current.accept = cat.accept;
      fileInputRef.current.click();
    }
  }

  async function handleLocationShare() {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError(t("attach.locationUnavailable"));
      return;
    }
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
    } catch (err) {
      const code = (err as GeolocationPositionError)?.code;
      if (code === 1 /* PERMISSION_DENIED */) {
        setLocationError(t("attach.locationDenied"));
      } else if (code === 3 /* TIMEOUT */) {
        setLocationError(t("attach.locationTimeout"));
      } else {
        setLocationError(t("attach.locationError"));
      }
    }
  }

  return (
    <div className="border-t border-gray-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="max-w-3xl mx-auto relative">
        {/* Location error banner */}
        {locationError && (
          <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm">
            <span>{locationError}</span>
            <button onClick={() => setLocationError(null)} className="shrink-0 text-red-400 hover:text-red-200">✕</button>
          </div>
        )}
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
                    className="absolute top-0 right-0 bg-gray-900/80 text-gray-300 hover:text-white active:text-white rounded-bl-lg px-1.5 py-0.5 text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Queue visibility toast */}
        {queueToast && (
          <div className="absolute bottom-full left-0 right-0 mb-1 z-40 flex justify-center pointer-events-none">
            <div className="bg-gray-800/95 border border-gray-600/50 rounded-lg px-4 py-2 shadow-lg flex items-center gap-2 max-w-md pointer-events-auto">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
              </span>
              <span className="text-xs text-gray-300">{queueToast}</span>
              <button
                onClick={() => setQueueToast(null)}
                className="text-gray-500 hover:text-gray-300 text-xs ml-1 shrink-0"
              >
                &times;
              </button>
            </div>
          </div>
        )}

        {/* NL interception toast — shown when shell input was auto-routed to AI */}
        {nlInterceptionToast && (
          <div className="absolute bottom-full left-0 right-0 mb-1 z-40 flex justify-center pointer-events-none">
            <div className="bg-emerald-900/90 border border-emerald-500/50 rounded-lg px-4 py-2 shadow-lg flex items-center gap-2 max-w-md pointer-events-auto">
              <svg className="h-3.5 w-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-xs text-emerald-200">{nlInterceptionToast}</span>
            </div>
          </div>
        )}

        {/* Shell mode indicator banner — enhanced for visibility */}
        {activeShellSessionId && (
          <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2.5 rounded-lg bg-amber-900/50 border-2 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
              <span className="text-xs text-amber-200 font-semibold tracking-wide">SHELL MODE</span>
              <span className="text-[10px] text-amber-300/80">
                — type commands or press <kbd className="px-1 py-0.5 rounded bg-amber-800/50 border border-amber-600/50 text-amber-200 font-mono text-[9px]">Esc</kbd> to return to AI
              </span>
            </div>
            <button
              onClick={() => {
                const wsClient = useChatStore.getState()._wsClient;
                if (wsClient && activeShellSessionId) {
                  wsClient.send({ type: "shell.destroy", shellSessionId: activeShellSessionId });
                }
              }}
              className="text-[10px] px-2.5 py-1 rounded-md border border-amber-500/60 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 active:bg-amber-500/35 active:scale-[0.95] transition-all duration-150 font-medium"
            >
              Exit Shell
            </button>
          </div>
        )}

        {/* New Conversation button — only show when cards exist */}
        {hasCards && !activeShellSessionId && (
          <button
            onClick={clearConversation}
            className="text-[10px] px-2 py-1 rounded-md border border-gray-700/50 bg-gray-800/50 text-gray-400 hover:text-gray-200 hover:border-indigo-500/40 transition-colors mb-2"
          >
            New Conversation
          </button>
        )}

        {/* Slash command autocomplete menu */}
        {showMenu && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-600/60 rounded-lg shadow-[0_-4px_20px_rgba(0,0,0,0.4)] overflow-hidden z-50 max-h-[60vh] overflow-y-auto">
            {(() => {
              let globalIdx = 0;
              let lastCategory = "";
              return filteredCommands.map((cmd) => {
                const idx = globalIdx++;
                const showHeader = cmd.category !== lastCategory;
                lastCategory = cmd.category;
                return (
                  <div key={cmd.command}>
                    {showHeader && (
                      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-800/80 border-b border-gray-700/30">
                        {CATEGORY_LABELS[cmd.category]}
                      </div>
                    )}
                    <button
                      onClick={() => selectCommand(cmd)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full text-left px-3 py-3 sm:py-2.5 flex items-center gap-3 transition-all duration-150 ${
                        idx === selectedIndex
                          ? "bg-indigo-600/30 text-gray-100"
                          : "text-gray-300 hover:bg-gray-700/50 active:bg-gray-600/50"
                      }`}
                    >
                      {cmd.icon && <span className="text-base flex-shrink-0 w-6 text-center">{cmd.icon}</span>}
                      <span className="text-xs font-mono text-indigo-400 min-w-[100px] sm:min-w-[120px]">{cmd.label}</span>
                      <span className="text-xs text-gray-400 truncate">{t(cmd.descKey)}</span>
                    </button>
                  </div>
                );
              });
            })()}
            <div className="px-3 py-1.5 border-t border-gray-700/50 text-[10px] text-gray-500 flex justify-between">
              <span>{"\u2191\u2193"} navigate</span>
              <span>Enter or Tab to select</span>
              <span>Esc to dismiss</span>
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
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
          />
          {/* Image-research input: camera on mobile, image picker on web */}
          <input
            ref={imageResearchRef}
            type="file"
            accept="image/*"
            {...(isNative ? { capture: "environment" as const } : {})}
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Attachment menu */}
          <div ref={attachMenuRef} className="relative">
            <button
              onClick={() => setAttachMenuOpen(!attachMenuOpen)}
              disabled={disabled}
              className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 active:scale-[0.95] disabled:opacity-50 text-gray-300 px-3 py-2.5 rounded-xl text-sm transition-all duration-150"
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
                    className="w-full text-left px-3 py-3 sm:py-2.5 flex items-center gap-3 text-gray-300 hover:bg-gray-700/50 active:bg-gray-600/50 active:scale-[0.98] transition-all duration-150"
                  >
                    <span className="text-indigo-400 shrink-0">{cat.icon}</span>
                    <span className="text-xs">{t(cat.labelKey)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Image-to-Research button */}
          <button
            onClick={() => imageResearchRef.current?.click()}
            disabled={disabled}
            className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 active:scale-[0.95] disabled:opacity-50 text-indigo-400 hover:text-indigo-300 px-3 py-2.5 rounded-xl text-sm transition-all duration-150"
            title="Upload image to research"
          >
            {/* ScanSearch icon — magnifying glass with scan corners */}
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
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <circle cx="12" cy="12" r="3" />
              <path d="m16 16-1.9-1.9" />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Disconnected..." : isListening ? "Listening..." : activeShellSessionId ? "Shell command..." : "Message..."}
            disabled={disabled}
            rows={1}
            className={`flex-1 bg-gray-800 text-gray-100 rounded-xl px-4 py-2.5 text-base sm:text-sm resize-none outline-none placeholder-gray-500 disabled:opacity-50 overflow-y-auto ${
              activeShellSessionId
                ? "ring-2 ring-amber-500/60 focus:ring-amber-500"
                : "focus:ring-2 focus:ring-indigo-500"
            }`}
            style={{ maxHeight: "200px" }}
          />
          {speechSupported && (
            <button
              onClick={toggleListening}
              disabled={disabled}
              className={`relative px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                isListening
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 active:bg-red-500/40 active:scale-[0.95]"
                  : "bg-gray-800 hover:bg-gray-700 active:bg-gray-600 active:scale-[0.95] text-gray-300"
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
            className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-400 active:scale-[0.95] disabled:opacity-50 disabled:hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
