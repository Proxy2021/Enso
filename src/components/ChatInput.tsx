import React, { useState, useRef, useCallback, useEffect } from "react";
import { useChatStore } from "../store/chat";
import { VoiceOverlay } from "./VoiceOverlay";
import { isNative } from "../lib/platform";
import { isLikelyNaturalLanguage } from "../utils/nlDetection";
import { useT } from "../lib/i18n";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { useKeyboardOffset } from "./chat/useKeyboardOffset";
import { type SlashCommand } from "./chat/slash-commands";
import { SlashMenu, useFilteredCommands } from "./chat/SlashMenu";
import { ATTACH_CATEGORIES } from "./chat/attach-categories";
import { usePushToTalk } from "./chat/usePushToTalk";
import { AttachmentPreview } from "./chat/AttachmentPreview";
import { ImageResearchPreview, type IrPreviewState } from "./chat/ImageResearchPreview";
import { SendControls } from "./chat/SendControls";
import { QuickActionChips } from "./chat/QuickActionChips";
import { AttachMenu } from "./chat/AttachMenu";

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
  const keyboardOffset = useKeyboardOffset();

  // Image research preview state
  const [irPreview, setIrPreview] = useState<IrPreviewState | null>(null);

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
    desktopPttHandlers, cancelPtt,
    handleTextareaTouchStart, handleTextareaTouchMove, handleTextareaTouchEnd, handleTextareaTouchCancel,
  } = usePushToTalk({ disabled, sendMessage, textareaRef });

  // Filter slash commands based on current input
  const { filteredCommands, showMenu } = useFilteredCommands(text);

  async function handleSend() {
    const trimmed = text.trim();
    if ((!trimmed && attachedFiles.length === 0) || disabled) return;

    cancelPtt();

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
          <ImageResearchPreview
            preview={irPreview}
            onCancel={() => { URL.revokeObjectURL(irPreview.localUrl); setIrPreview(null); }}
            onAction={(topic, file, intent) => {
              URL.revokeObjectURL(irPreview.localUrl);
              setIrPreview(null);
              sendMessageWithMedia(topic, [file], intent);
            }}
            onTopicChange={(topic) => setIrPreview(prev => prev ? { ...prev, topic } : null)}
          />
        )}
        {/* Location error banner */}
        {locationError && (
          <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm">
            <span>{locationError}</span>
            <button onClick={() => setLocationError(null)} className="shrink-0 text-red-400 hover:text-red-200">✕</button>
          </div>
        )}
        {/* Attached file previews */}
        <AttachmentPreview files={attachedFiles} onRemove={removeFile} />

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

        {/* Mobile quick action chips */}
        {!activeShellSessionId && !showMenu && (
          <QuickActionChips
            disabled={disabled}
            onResearch={() => { setText("/research "); textareaRef.current?.focus(); }}
            onCode={() => { setText("/code "); textareaRef.current?.focus(); }}
            onCamera={() => imageResearchRef.current?.click()}
            onOrchestrate={() => sendMessage("/orchestrate")}
          />
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
          <SlashMenu
            text={text}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onSelectCommand={selectCommand}
          />
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

          <AttachMenu
            disabled={disabled}
            open={attachMenuOpen}
            onToggle={() => setAttachMenuOpen(!attachMenuOpen)}
            onClose={() => setAttachMenuOpen(false)}
            onCategorySelect={handleCategorySelect}
            onImageResearch={() => imageResearchRef.current?.click()}
          />

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
          <SendControls
            disabled={disabled}
            hasContent={!!text.trim() || attachedFiles.length > 0}
            hasShellSession={!!activeShellSessionId}
            speechSupported={speechSupported}
            onSend={handleSend}
            pttHandlers={desktopPttHandlers}
          />
        </div>
      </div>
    </div>
  );
}
