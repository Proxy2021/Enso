import { useEffect } from "react";
import { useChatStore } from "./store/chat";
import CardTimeline from "./components/CardTimeline";
import ChatInput from "./components/ChatInput";
import AppsMenu from "./components/AppsMenu";
import PinnedSidebar from "./components/PinnedSidebar";
import ConnectionPicker from "./components/ConnectionPicker";
import SetupWizard from "./components/SetupWizard";
import { parseDeepLink, setActiveBackend, getActiveBackend, loadBackends } from "./lib/connection";
import { isNative } from "./lib/platform";
import { initDeepLinkListener } from "./lib/deep-link-handler";
import UpdateBanner from "./components/UpdateBanner";
// Initialize card registry (registers all built-in card types)
import "./cards";

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
      className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
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
      className="relative flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded-lg border border-gray-700/60 bg-gray-800/50"
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

export default function App() {
  const connect = useChatStore((s) => s.connect);
  const disconnect = useChatStore((s) => s.disconnect);
  const connectToBackend = useChatStore((s) => s.connectToBackend);

  useEffect(() => {
    // Handle deep-link: ?backend=https://...&token=xxx
    const deepLink = parseDeepLink();
    if (deepLink) {
      setActiveBackend(deepLink.id);
      connectToBackend(deepLink);
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
  }, [connect, disconnect, connectToBackend]);

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
    <div className="flex flex-col h-dvh text-gray-100">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-gray-800/80 bg-gray-950/70 backdrop-blur supports-[backdrop-filter]:bg-gray-950/55">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Enso</h1>
          <p className="text-[11px] text-gray-500 leading-none mt-0.5">Every answer is an app.</p>
        </div>
        <div className="flex items-center gap-3">
          <AppsMenu />
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
    </div>
  );
}
