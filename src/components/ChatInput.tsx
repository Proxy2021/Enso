import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useChatStore } from "../store/chat";
import { VoiceOverlay } from "./VoiceOverlay";
import { isNative } from "../lib/platform";
import { isLikelyNaturalLanguage } from "../utils/nlDetection";
import { useT } from "../lib/i18n";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { useKeyboardOffset } from "./chat/useKeyboardOffset";
import { SLASH_COMMANDS, CATEGORY_LABELS, type SlashCommand } from "./chat/slash-commands";
import { ATTACH_CATEGORIES } from "./chat/attach-categories";
import { getFileCategory, getFileExt, haptic } from "./chat/chat-utils";
import { usePushToTalk } from "./chat/usePushToTalk";

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
  const { t } = useT();
  const [queueToast, setQueueToast] = useState<string | null>(null);
  const nlInterceptionToast = useChatStore((s) => s._nlInterceptionToast);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageResearchRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const keyboardOffset = useKeyboardOffset();

  // Stable blob URL map for attachment image previews — avoids creating new
  // blob URLs on every render and revokes stale ones to prevent memory leaks.
  const blobUrlMapRef = useRef<Map<File, string>>(new Map());
  const getFileBlobUrl = useCallback((file: File): string => {
    const map = blobUrlMapRef.current;
    let url = map.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      map.set(file, url);
    }
    return url;
  }, []);
  // Revoke blob URLs for files that have been removed
  useEffect(() => {
    const map = blobUrlMapRef.current;
    const currentFiles = new Set(attachedFiles);
    for (const [file, url] of map) {
      if (!currentFiles.has(file)) {
        URL.revokeObjectURL(url);
        map.delete(file);
      }
    }
  }, [attachedFiles]);
  // Cleanup all blob URLs on unmount
  useEffect(() => {
    const map = blobUrlMapRef.current;
    return () => {
      for (const url of map.values()) {
        URL.revokeObjectURL(url);
      }
      map.clear();
    };
  }, []);

  // Image research preview state
  const [irPreview, setIrPreview] = useState<{
    file: File; localUrl: string; topic: string; loading: boolean; serverPath: string;
  } | null>(null);

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

  // Push-to-talk + voice input (extracted to chat/usePushToTalk.ts)
  const {
    pttActive, pttCancelZone, pttStartTime, pttDisplayText, textareaPttFlash,
    inputMode, setInputMode,
    voice, speechSupported, isFallbackRecorder, recorder,
    pttAccumulatedRef, pttStartYRef, pttActiveRef, pttCancelRef,
    setPttActive, setPttCancelZone, setPttStartTime, setPttAccumulatedText,
    handleTextareaTouchStart, handleTextareaTouchMove, handleTextareaTouchEnd, handleTextareaTouchCancel,
  } = usePushToTalk({ disabled, sendMessage, textareaRef });

  // Close attach menu on click/touch outside
  useEffect(() => {
    if (!attachMenuOpen) return;
    const handler = (e: PointerEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
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

    if (pttActiveRef.current) {
      voice.cancelListening();
      pttActiveRef.current = false;
      setPttActive(false);
      setPttCancelZone(false);
      pttAccumulatedRef.current = "";
    }

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
      // Capture files before clearing state, then fire-and-forget.
      // sendMessageWithMedia shows the card optimistically before uploading.
      const filesToSend = [...attachedFiles];
      setAttachedFiles([]);
      setText("");
      setSelectedIndex(0);
      requestAnimationFrame(() => autoResize());
      textareaRef.current?.focus();
      sendMessageWithMedia(trimmed, filesToSend);
    } else {
      sendMessage(trimmed);
      setText("");
      setSelectedIndex(0);
      requestAnimationFrame(() => autoResize());
      textareaRef.current?.focus();
    }

    // Show queue toast if a background task is active
    if (hasActiveBackgroundTask()) {
      setQueueToast(t("chat.queueToast"));
    }
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
      // Image-research: show preview modal for user to review/edit the topic
      if (e.target === imageResearchRef.current) {
        e.target.value = "";
        const file = files[0];
        const localUrl = URL.createObjectURL(file);
        setIrPreview({ file, localUrl, topic: "", loading: true, serverPath: "" });

        // Upload image then analyze in background
        (async () => {
          try {
            const baseUrl = getBackendBaseUrl();
            const { compressImageFile } = await import("../lib/media-actions");
            const compressed = await compressImageFile(file);
            const uploadRes = await fetch(`${baseUrl}/upload`, {
              method: "POST",
              headers: authHeaders({ "Content-Type": compressed.type }),
              body: compressed,
            });
            if (!uploadRes.ok) throw new Error("Upload failed");
            const { filePath } = await uploadRes.json();

            // Analyze with vision
            const analyzeRes = await fetch(`${baseUrl}/api/image-analyze`, {
              method: "POST",
              headers: authHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ imagePath: filePath }),
            });
            const { topic } = analyzeRes.ok ? await analyzeRes.json() : { topic: "" };

            setIrPreview(prev => prev ? { ...prev, topic, loading: false, serverPath: filePath } : null);
          } catch {
            setIrPreview(prev => prev ? { ...prev, topic: "", loading: false } : null);
          }
        })();
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
    <div
      className="border-t border-gray-800 p-2 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      style={keyboardOffset > 0 ? { paddingBottom: `max(${keyboardOffset}px, env(safe-area-inset-bottom))` } : undefined}
    >
      <div className="max-w-3xl mx-auto relative">
        {/* Image research preview modal */}
        {irPreview && (
          <div className="mb-3 bg-gray-800/90 border border-gray-600/60 rounded-xl p-3 shadow-lg">
            <div className="flex gap-3">
              {/* Image thumbnail */}
              <div className="shrink-0">
                <img src={irPreview.localUrl} alt="Preview" className="w-20 h-20 object-cover rounded-lg border border-gray-600" />
              </div>
              {/* Topic area */}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/><path d="m16 16-1.9-1.9"/></svg>
                  {irPreview.loading ? "Analyzing image..." : "Research topic (edit if needed)"}
                </div>
                {irPreview.loading ? (
                  <div className="flex items-center gap-2 py-2">
                    <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-gray-400">Extracting topic from image...</span>
                  </div>
                ) : (
                  <textarea
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:border-indigo-500 outline-none resize-none"
                    rows={2}
                    value={irPreview.topic}
                    onChange={e => setIrPreview(prev => prev ? { ...prev, topic: e.target.value } : null)}
                    placeholder="Describe what to research..."
                    autoFocus
                  />
                )}
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => { URL.revokeObjectURL(irPreview.localUrl); setIrPreview(null); }}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <div className="flex gap-1.5 ml-auto">
                {([
                  { label: "Research", icon: "\uD83D\uDD0D", prefix: "", intent: "image_research" as const },
                  { label: "Similar", icon: "\uD83D\uDDBC\uFE0F", prefix: "", intent: "image_search" as const },
                  { label: "Shop", icon: "\uD83D\uDED2", prefix: "Find prices, reviews, and where to buy: ", intent: "image_research" as const },
                  { label: "Translate", icon: "\uD83C\uDF10", prefix: "Translate all text visible in this image. Detected content: ", intent: "image_research" as const },
                ]).map(action => (
                  <button
                    key={action.label}
                    onClick={() => {
                      const topic = action.prefix + irPreview.topic.trim();
                      const file = irPreview.file;
                      URL.revokeObjectURL(irPreview.localUrl);
                      setIrPreview(null);
                      sendMessageWithMedia(topic, [file], action.intent);
                    }}
                    disabled={irPreview.loading || !irPreview.topic.trim()}
                    className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 text-[11px] font-medium rounded-lg transition-colors flex items-center gap-1"
                  >
                    <span className="text-xs">{action.icon}</span> {action.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
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
                      src={getFileBlobUrl(file)}
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
                    className="absolute -top-2 -right-2 flex items-center justify-center w-11 h-11 text-gray-300 hover:text-white active:text-white text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-900/80 text-[10px]">&times;</span>
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

        {/* Mobile quick action chips — horizontal scrolling row like Doubao */}
        {!activeShellSessionId && !showMenu && (
          <div className="sm:hidden flex gap-1.5 mb-2 overflow-x-auto scrollbar-hide pb-0.5">
            <button
              onClick={() => { setText("/research "); textareaRef.current?.focus(); }}
              disabled={disabled}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-700/50 bg-gray-900/40 text-[11px] text-gray-300 active:bg-gray-800 active:scale-[0.96] transition-all disabled:opacity-40"
            >
              <span className="text-xs">&#x1f50d;</span> {t("mobile.quickAction.research")}
            </button>
            <button
              onClick={() => { setText("/code "); textareaRef.current?.focus(); }}
              disabled={disabled}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-700/50 bg-gray-900/40 text-[11px] text-gray-300 active:bg-gray-800 active:scale-[0.96] transition-all disabled:opacity-40"
            >
              <span className="text-xs">&#x1f4bb;</span> {t("mobile.quickAction.code")}
            </button>
            <button
              onClick={() => imageResearchRef.current?.click()}
              disabled={disabled}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-700/50 bg-gray-900/40 text-[11px] text-gray-300 active:bg-gray-800 active:scale-[0.96] transition-all disabled:opacity-40"
            >
              <span className="text-xs">&#x1f4f7;</span> {t("attach.camera")}
            </button>
            <button
              onClick={() => sendMessage("/orchestrate")}
              disabled={disabled}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full border border-gray-700/50 bg-gray-900/40 text-[11px] text-gray-300 active:bg-gray-800 active:scale-[0.96] transition-all disabled:opacity-40"
            >
              <span className="text-xs">&#x26a1;</span> {t("mobile.quickAction.orchestrate")}
            </button>
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

        {/* Push-to-talk overlay */}
        {pttActive && (
          <VoiceOverlay
            transcript={pttDisplayText}
            isInCancelZone={pttCancelZone}
            isFallbackRecorder={isFallbackRecorder}
            isTranscribing={"isTranscribing" in recorder && recorder.isTranscribing}
            startTime={pttStartTime}
          />
        )}

        <div className="flex items-end gap-1 sm:gap-2">
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
                {/* Image research — mobile only (desktop has dedicated button) */}
                <button
                  key="image-research"
                  onClick={() => { setAttachMenuOpen(false); imageResearchRef.current?.click(); }}
                  className="sm:hidden w-full text-left px-3 py-3 flex items-center gap-3 text-gray-300 hover:bg-gray-700/50 active:bg-gray-600/50 active:scale-[0.98] transition-all duration-150"
                >
                  <span className="text-indigo-400 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" /><path d="m16 16-1.9-1.9" />
                    </svg>
                  </span>
                  <span className="text-xs">Research image</span>
                </button>
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

          {/* Image-to-Research button — hidden on mobile, moved to attach menu */}
          <button
            onClick={() => imageResearchRef.current?.click()}
            disabled={disabled}
            className="hidden sm:flex bg-gray-800 hover:bg-gray-700 active:bg-gray-600 active:scale-[0.95] disabled:opacity-50 text-indigo-400 hover:text-indigo-300 px-3 py-2.5 rounded-xl text-sm transition-all duration-150"
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

          {/* Voice/Text mode toggle — mobile only */}
          {speechSupported && (
            <button
              onClick={() => setInputMode(prev => prev === "text" ? "voice" : "text")}
              className="sm:hidden shrink-0 px-2 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-300 transition-all duration-150"
              aria-label={inputMode === "text" ? "Switch to voice mode" : "Switch to text mode"}
            >
              {inputMode === "text" ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12" />
                </svg>
              )}
            </button>
          )}

          {inputMode === "text" || typeof window !== "undefined" && window.innerWidth >= 640 ? (
          <textarea
            ref={textareaRef}
            data-chat-input
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onTouchStart={handleTextareaTouchStart}
            onTouchMove={handleTextareaTouchMove}
            onTouchEnd={handleTextareaTouchEnd}
            onTouchCancel={handleTextareaTouchCancel}
            placeholder={disabled ? "Disconnected..." : activeShellSessionId ? "Shell command..." : (speechSupported ? "Message or hold to talk..." : "Message...")}
            disabled={disabled}
            rows={1}
            className={`flex-1 bg-gray-800 text-gray-100 rounded-xl px-4 py-2.5 text-base sm:text-sm resize-none outline-none placeholder-gray-500 disabled:opacity-50 overflow-y-auto transition-all duration-200 ${
              textareaPttFlash
                ? "scale-[0.98] ring-2 ring-violet-500/80"
                : activeShellSessionId
                  ? "ring-2 ring-amber-500/60 focus:ring-amber-500"
                  : "focus:ring-2 focus:ring-indigo-500"
            }`}
            style={{
              maxHeight: "200px",
              ...(pttActive ? { WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties : {}),
            }}
          />
          ) : (
          <button
            className="sm:hidden flex-1 bg-gray-800 text-gray-300 rounded-xl px-4 py-2.5 text-base flex items-center justify-center gap-2 select-none touch-none active:bg-violet-900/50 transition-all duration-150"
            onTouchStart={handleTextareaTouchStart}
            onTouchMove={handleTextareaTouchMove}
            onTouchEnd={handleTextareaTouchEnd}
            onTouchCancel={handleTextareaTouchCancel}
            disabled={disabled}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={pttActive ? "text-red-400 animate-pulse" : "text-violet-400"}>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
            <span className={pttActive ? "text-red-400" : "text-gray-400"}>
              {pttActive ? (pttCancelZone ? "Release to cancel" : "Listening...") : "Hold to talk"}
            </span>
          </button>
          )}
          {(() => {
            const sendIcon = (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
              </svg>
            );
            const micIcon = (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            );
            const pttHandlers = {
              onPointerDown: (e: React.PointerEvent) => {
                if (disabled) return;
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                pttAccumulatedRef.current = "";
                setPttAccumulatedText("");
                pttStartYRef.current = e.clientY;
                pttActiveRef.current = true;
                pttCancelRef.current = false;
                setPttActive(true);
                setPttCancelZone(false);
                setPttStartTime(Date.now());
                haptic(30);
                voice.startListening();
              },
              onPointerMove: (e: React.PointerEvent) => {
                if (!pttActiveRef.current) return;
                const dy = pttStartYRef.current - e.clientY;
                const inCancel = dy > 100;
                if (inCancel !== pttCancelRef.current) {
                  pttCancelRef.current = inCancel;
                  setPttCancelZone(inCancel);
                }
              },
              onPointerUp: () => {
                if (!pttActiveRef.current) return;
                pttActiveRef.current = false;
                const wasCancelled = pttCancelRef.current;
                setPttActive(false);
                setPttCancelZone(false);
                if (wasCancelled) {
                  voice.cancelListening();
                  haptic([30, 50, 30]);
                } else {
                  voice.cancelListening();
                  haptic(15);
                  const finalText = (pttAccumulatedRef.current + (voice.interimTranscript ? (pttAccumulatedRef.current ? " " : "") + voice.interimTranscript : "")).trim();
                  if (finalText) {
                    sendMessage(finalText);
                  }
                }
                pttAccumulatedRef.current = "";
                setPttAccumulatedText("");
              },
              onPointerCancel: () => {
                if (!pttActiveRef.current) return;
                pttActiveRef.current = false;
                setPttActive(false);
                setPttCancelZone(false);
                voice.cancelListening();
                pttAccumulatedRef.current = "";
                setPttAccumulatedText("");
              },
            };

            return (
              <>
                {/* Mobile: send-only button (PTT is via textarea long-press) */}
                <div className="sm:hidden">
                  <button
                    onClick={handleSend}
                    disabled={disabled || (!text.trim() && attachedFiles.length === 0 && !activeShellSessionId)}
                    className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-400 active:scale-[0.95] disabled:opacity-50 text-white px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                  >
                    {sendIcon}
                  </button>
                </div>

                {/* Desktop: mic + send side by side */}
                <div className="hidden sm:flex items-center gap-2">
                  {speechSupported && (
                    <button
                      disabled={disabled}
                      className="relative px-3 py-2.5 rounded-xl text-sm transition-all duration-150 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-300 disabled:opacity-50 select-none touch-none"
                      title="Hold to talk"
                      aria-label="Hold to talk"
                      {...pttHandlers}
                    >
                      {micIcon}
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
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
