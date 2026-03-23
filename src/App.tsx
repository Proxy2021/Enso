import React, { useEffect, useState } from "react";
import { useChatStore } from "./store/chat";
import CardTimeline from "./components/CardTimeline";
import ChatInput from "./components/ChatInput";
import AppsMenu from "./components/AppsMenu";
import PinnedSidebar from "./components/PinnedSidebar";
import ConversationSidebar from "./components/ConversationSidebar";
import ConnectionPicker from "./components/ConnectionPicker";
import SetupWizard from "./components/SetupWizard";

import { parseDeepLink, setActiveBackend, getActiveBackend, loadBackends } from "./lib/connection";
import { isNative } from "./lib/platform";
import { initDeepLinkListener } from "./lib/deep-link-handler";
import UpdateBanner from "./components/UpdateBanner";
import DebugReporter from "./components/DebugReporter";
import SettingsPanel from "./components/SettingsPanel";
import ToastContainer from "./components/ToastContainer";
import BackgroundTaskBar from "./components/BackgroundTaskBar";
import ResultsInbox, { useUnseenCount } from "./components/ResultsInbox";
import { reportError } from "./lib/error-reporter";
import { useKeyboardShortcuts } from "./lib/keyboard-shortcuts";
// Initialize card registry (registers all built-in card types)
import "./cards";

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error.message, "react_boundary", {
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-dvh text-gray-100 bg-gray-950 p-8">
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-400 mb-4 text-center max-w-md">{this.state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors text-sm"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ConnectionBanner() {
  const state = useChatStore((s) => s.connectionState);
  const connect = useChatStore((s) => s.connect);

  if (state === "connected") return null;

  const isConnecting = state === "connecting";

  return (
    <div className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-amber-900/80 border-b border-amber-700/60 text-amber-200">
      {isConnecting ? (
        <>
          <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span>Reconnecting to server...</span>
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Connection lost</span>
          <button
            onClick={() => connect()}
            className="ml-2 px-2.5 py-0.5 rounded bg-amber-700/80 hover:bg-amber-600/80 text-amber-100 text-xs font-medium transition-colors"
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}

function ConnectionDot() {
  const state = useChatStore((s) => s.connectionState);
  const setShowPicker = useChatStore((s) => s.setShowConnectionPicker);
  const active = getActiveBackend();
  const color =
    state === "connected"
      ? "bg-emerald-400"
      : state === "connecting"
        ? "bg-amber-400 animate-pulse"
        : "bg-red-400";

  return (
    <button
      onClick={() => setShowPicker(true)}
      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors max-w-[4.5rem] truncate"
      title="Connection settings"
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
      <span className="hidden sm:inline">{active ? active.name : state}</span>
    </button>
  );
}

function SidebarToggle() {
  const pinnedCards = useChatStore((s) => s.pinnedCards);
  const toggleSidebar = useChatStore((s) => s.toggleSidebar);
  if (pinnedCards.length === 0) return null;
  return (
    <button
      onClick={toggleSidebar}
      className="relative flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors px-1.5 py-1 rounded-lg border border-gray-700/60 bg-gray-800/50"
      title="Pinned apps"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 17v5" />
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5H8a1 1 0 0 1 1 1z" />
      </svg>
      <span className="text-xs">{pinnedCards.length}</span>
    </button>
  );
}

function ResultsButton({ onClick }: { onClick: () => void }) {
  const unseen = useUnseenCount();
  return (
    <button
      onClick={onClick}
      className="relative flex items-center text-sm text-gray-400 hover:text-gray-200 transition-colors p-1.5 rounded-lg border border-gray-700/60 bg-gray-800/50"
      title="Completed tasks"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
      {unseen > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-indigo-500 text-[9px] text-white font-bold px-1">
          {unseen > 9 ? "9+" : unseen}
        </span>
      )}
    </button>
  );
}

/** Compact label showing active chat LLM in the header */
function ActiveModelLabel() {
  const chatModel = useChatStore((s) => s.chatModel);

  // Derive short display name from model ID
  const label = (() => {
    if (!chatModel) return "";
    // e.g. "gemini-2.5-flash" → "Gemini 2.5 Flash"
    if (chatModel.startsWith("gemini-")) {
      const rest = chatModel.slice(7); // "2.5-flash"
      return "Gemini " + rest.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
    }
    if (chatModel.startsWith("ollama:")) return chatModel.slice(7);
    // Fallback: capitalize segments
    return chatModel.split(/[-_]/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
  })();

  if (!label) return null;

  return (
    <span className="text-[11px] text-gray-500 font-medium truncate max-w-[10rem]" title={`Chat model: ${chatModel}`}>
      {label}
    </span>
  );
}

function SearchToggle() {
  const searchVisible = useChatStore((s) => s.cardSearchVisible);
  const setVisible = useChatStore((s) => s.setCardSearchVisible);
  const cardCount = useChatStore((s) => s.cardOrder.length);
  if (cardCount === 0) return null;
  return (
    <button
      onClick={() => setVisible(!searchVisible)}
      className={`flex items-center text-sm transition-colors p-1.5 rounded-lg border ${searchVisible ? "text-violet-400 border-violet-500/40 bg-violet-500/10" : "text-gray-400 hover:text-gray-200 border-gray-700/60 bg-gray-800/50"}`}
      title="Search cards (Ctrl+F)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </button>
  );
}

export default function App() {
  const connect = useChatStore((s) => s.connect);
  const disconnect = useChatStore((s) => s.disconnect);
  const connectToBackend = useChatStore((s) => s.connectToBackend);
  const loadSharedCard = useChatStore((s) => s.loadSharedCard);
  const [showResults, setShowResults] = useState(false);

  useKeyboardShortcuts();

  useEffect(() => {
    // Handle deep-link: ?backend=https://...&token=xxx&share=cardId
    const deepLink = parseDeepLink();
    if (deepLink) {
      setActiveBackend(deepLink.id);
      connectToBackend(deepLink);
      // If a shared card ID is present, load it once connected
      if (deepLink.shareCardId) {
        const shareId = deepLink.shareCardId;
        // Small delay to let WebSocket connect before fetching card state
        const timer = setTimeout(() => loadSharedCard(shareId), 1500);
        window.history.replaceState({}, "", window.location.pathname);
        return () => { clearTimeout(timer); disconnect(); };
      }
      // Clean URL params
      window.history.replaceState({}, "", window.location.pathname);
      return () => disconnect();
    }

    // Native: no backends saved at all → show setup wizard (first launch)
    if (isNative && !getActiveBackend()) {
      const savedBackends = loadBackends();
      if (savedBackends.length === 0) {
        useChatStore.getState().setShowSetupWizard(true);
      } else {
        useChatStore.getState().setShowConnectionPicker(true);
      }
      return () => disconnect();
    }

    // Normal startup: connect to last-used or same-origin
    connect();
    return () => disconnect();
  }, [connect, disconnect, connectToBackend, loadSharedCard]);

  // Initialize deep link listener for enso://connect QR codes
  useEffect(() => {
    initDeepLinkListener(
      (config) => connectToBackend(config),
      () => {
        useChatStore.getState().setShowSetupWizard(false);
        useChatStore.getState().setShowConnectionPicker(false);
      },
    );
  }, [connectToBackend]);

  return (
    <AppErrorBoundary>
      <div className="flex flex-col h-dvh text-gray-100">
        <header className="sticky top-0 z-20 flex items-center justify-between px-2.5 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] border-b border-gray-800/80 bg-gray-950/70 backdrop-blur supports-[backdrop-filter]:bg-gray-950/55">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight">Enso</h1>
            <span className="hidden sm:inline"><ActiveModelLabel /></span>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <SettingsPanel />
            <span className="hidden sm:flex"><DebugReporter /></span>
            <AppsMenu />
            <SearchToggle />
            <ResultsButton onClick={() => setShowResults(true)} />
            <SidebarToggle />
            <ConnectionDot />
          </div>
        </header>
        <UpdateBanner />
        <ConnectionBanner />
        <div className="flex flex-1 overflow-hidden min-h-0">
          <ConversationSidebar />
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <CardTimeline />
            <BackgroundTaskBar />
            <ChatInput />
          </div>
          <PinnedSidebar />
        </div>
        <ToastContainer />
        <ResultsInbox show={showResults} onClose={() => setShowResults(false)} />
        <ConnectionPicker />
        <SetupWizard />
      </div>
    </AppErrorBoundary>
  );
}
