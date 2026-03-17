import React, { useEffect, useState } from "react";
import { useChatStore } from "./store/chat";
import CardTimeline from "./components/CardTimeline";
import ChatInput from "./components/ChatInput";
import AppsMenu from "./components/AppsMenu";
import PinnedSidebar from "./components/PinnedSidebar";
import ConnectionPicker from "./components/ConnectionPicker";
import SetupWizard from "./components/SetupWizard";
import MemoryPanel from "./components/MemoryPanel";
import { parseDeepLink, setActiveBackend, getActiveBackend, loadBackends } from "./lib/connection";
import { isNative } from "./lib/platform";
import { initDeepLinkListener } from "./lib/deep-link-handler";
import UpdateBanner from "./components/UpdateBanner";
import DebugReporter from "./components/DebugReporter";
import ModelPicker from "./components/ModelPicker";
import { reportError } from "./lib/error-reporter";
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
      <div className={`w-2 h-2 rounded-full ${color}`} />
      {active ? active.name : state}
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

function MemoryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center text-sm text-gray-400 hover:text-gray-200 transition-colors p-1.5 rounded-lg border border-gray-700/60 bg-gray-800/50"
      title="Memory"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5Z" />
        <path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12" />
      </svg>
    </button>
  );
}

export default function App() {
  const connect = useChatStore((s) => s.connect);
  const disconnect = useChatStore((s) => s.disconnect);
  const connectToBackend = useChatStore((s) => s.connectToBackend);
  const loadSharedCard = useChatStore((s) => s.loadSharedCard);
  const [showMemory, setShowMemory] = useState(false);

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
          <h1 className="text-base font-semibold tracking-tight">Enso</h1>
          <div className="flex items-center gap-1.5">
            <ModelPicker />
            <DebugReporter />
            <AppsMenu />
            <MemoryButton onClick={() => setShowMemory(true)} />
            <SidebarToggle />
            <ConnectionDot />
          </div>
        </header>
        <UpdateBanner />
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <CardTimeline />
            <ChatInput />
          </div>
          <PinnedSidebar />
        </div>
        <ConnectionPicker />
        <SetupWizard />
        <MemoryPanel show={showMemory} onClose={() => setShowMemory(false)} />
      </div>
    </AppErrorBoundary>
  );
}
