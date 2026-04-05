import React, { useEffect } from "react";
import { useChatStore } from "./store/chat";
import CardTimeline from "./components/CardTimeline";
import ChatInput from "./components/ChatInput";
import PinnedSidebar from "./components/PinnedSidebar";
import ConversationSidebar from "./components/ConversationSidebar";
import ConnectionPicker from "./components/ConnectionPicker";
import SetupWizard from "./components/SetupWizard";
import { DesktopTabRail, MobileTabBar, TabHeader } from "./components/TabNavigation";
import MobileConversationList from "./components/MobileConversationList";
import TasksView from "./components/TasksView";
import EvolveView from "./components/EvolveView";
import ProjectsView from "./components/ProjectsView";
import SettingsView from "./components/SettingsView";

import { parseDeepLink, setActiveBackend, getActiveBackend, loadBackends, addBackend } from "./lib/connection";
import { isNative } from "./lib/platform";
import { initDeepLinkListener } from "./lib/deep-link-handler";
import { useTheme } from "./lib/theme";

declare const __ENSO_DEFAULT_BACKEND__: string;
declare const __ENSO_DEFAULT_TOKEN__: string;
declare const __ENSO_DEFAULT_NAME__: string;
import UpdateBanner from "./components/UpdateBanner";
import SettingsPanel from "./components/SettingsPanel";
import ToastContainer from "./components/ToastContainer";
import BackgroundTaskBar from "./components/BackgroundTaskBar";
import ProactiveNudgeBanner from "./components/ProactiveNudgeBanner";
import { reportError } from "./lib/error-reporter";
import { useKeyboardShortcuts } from "./lib/keyboard-shortcuts";
import { t, useT } from "./lib/i18n";
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
          <h2 className="text-lg font-semibold mb-2">{t("error.somethingWrong")}</h2>
          <p className="text-sm text-gray-400 mb-4 text-center max-w-md">{this.state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors text-sm"
          >
            {t("error.reload")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ConnectionBanner() {
  const { t } = useT();
  const state = useChatStore((s) => s.connectionState);
  const connect = useChatStore((s) => s.connect);

  if (state === "connected") return null;

  const isConnecting = state === "connecting";

  return (
    <div className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-amber-900/80 border-b border-amber-700/60 text-amber-200">
      {isConnecting ? (
        <>
          <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span>{t("error.reconnecting")}</span>
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>{t("error.connectionLost")}</span>
          <button
            onClick={() => connect()}
            className="ml-2 px-2.5 py-0.5 rounded bg-amber-700/80 hover:bg-amber-600/80 text-amber-100 text-xs font-medium transition-colors"
          >
            {t("common.retry")}
          </button>
        </>
      )}
    </div>
  );
}

function SidebarToggle() {
  const { t } = useT();
  const pinnedCards = useChatStore((s) => s.pinnedCards);
  const toggleSidebar = useChatStore((s) => s.toggleSidebar);
  if (pinnedCards.length === 0) return null;
  return (
    <button
      onClick={toggleSidebar}
      className="relative flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 active:scale-[0.92] transition-all duration-150 p-1.5 rounded-lg border border-gray-700/60 bg-gray-800/50"
      title={t("pinnedApps")}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 17v5" />
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5H8a1 1 0 0 1 1 1z" />
      </svg>
      <span className="text-xs">{pinnedCards.length}</span>
    </button>
  );
}

/** Mobile chat header with back button and conversation title */
function MobileChatHeader() {
  const setChatViewOpen = useChatStore((s) => s.setChatViewOpen);
  const activeId = useChatStore((s) => s.activeConversationId);
  const conversations = useChatStore((s) => s.conversationsList);
  const activeTitle = conversations.find((c) => c.id === activeId)?.title ?? "Chat";

  return (
    <header className="sm:hidden flex items-center gap-2 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] border-b border-gray-800/80 bg-gray-950/90 backdrop-blur-lg">
      <button
        onClick={() => setChatViewOpen(false)}
        className="flex items-center justify-center w-9 h-9 rounded-xl text-gray-400 hover:text-gray-200 active:scale-[0.92] active:bg-gray-800 transition-all duration-150"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h1 className="flex-1 text-sm font-semibold text-gray-200 truncate">{activeTitle}</h1>
      <SettingsPanel />
    </header>
  );
}

function SearchToggle() {
  const { t } = useT();
  const searchVisible = useChatStore((s) => s.cardSearchVisible);
  const setVisible = useChatStore((s) => s.setCardSearchVisible);
  const cardCount = useChatStore((s) => s.cardOrder.length);
  if (cardCount === 0) return null;
  return (
    <button
      onClick={() => setVisible(!searchVisible)}
      className={`flex items-center text-sm transition-all duration-150 p-1.5 rounded-lg border active:scale-[0.92] ${searchVisible ? "text-violet-400 border-violet-500/40 bg-violet-500/10" : "text-gray-400 hover:text-gray-200 border-gray-700/60 bg-gray-800/50"}`}
      title={t("search.hint")}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    </button>
  );
}

/** Chat tab controls — search + pinned sidebar (settings moved to rail) */
function ChatTabHeader() {
  return (
    <TabHeader>
      <SearchToggle />
      <SidebarToggle />
    </TabHeader>
  );
}

/** Unified tab content — shared between desktop and mobile */
function TabContent() {
  const activeTab = useChatStore((s) => s.activeTab);
  const chatViewOpen = useChatStore((s) => s.chatViewOpen);

  if (activeTab === "chat") {
    // Mobile: conversation list or chat view (stack navigation)
    // Desktop: sidebar + timeline + pinned
    return (
      <>
        {/* Mobile chat */}
        <div className="sm:hidden flex-1 flex flex-col overflow-hidden min-h-0">
          {chatViewOpen ? (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 mobile-chat-enter">
              <MobileChatHeader />
              <CardTimeline />
              <BackgroundTaskBar />
              <ProactiveNudgeBanner />
              <ChatInput />
            </div>
          ) : (
            <MobileConversationList />
          )}
        </div>
        {/* Desktop chat */}
        <div className="hidden sm:flex flex-1 flex-col overflow-hidden min-h-0">
          <ChatTabHeader />
          <div className="flex flex-1 overflow-hidden min-h-0">
            <ConversationSidebar />
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <CardTimeline />
              <BackgroundTaskBar />
              <ProactiveNudgeBanner />
              <ChatInput />
            </div>
            <PinnedSidebar />
          </div>
        </div>
      </>
    );
  }

  if (activeTab === "tasks") {
    return <TasksView />;
  }

  if (activeTab === "evolve") {
    return <EvolveView />;
  }

  if (activeTab === "projects") {
    return <ProjectsView />;
  }

  if (activeTab === "me") {
    return <SettingsView />;
  }

  return null;
}

export default function App() {
  const connect = useChatStore((s) => s.connect);
  const disconnect = useChatStore((s) => s.disconnect);
  const connectToBackend = useChatStore((s) => s.connectToBackend);
  const loadSharedCard = useChatStore((s) => s.loadSharedCard);

  useKeyboardShortcuts();
  useTheme(); // ensure theme attribute is applied on mount

  useEffect(() => {
    const deepLink = parseDeepLink();
    if (deepLink) {
      setActiveBackend(deepLink.id);
      connectToBackend(deepLink);
      if (deepLink.shareCardId) {
        const shareId = deepLink.shareCardId;
        const timer = setTimeout(() => loadSharedCard(shareId), 1500);
        window.history.replaceState({}, "", window.location.pathname);
        return () => { clearTimeout(timer); disconnect(); };
      }
      window.history.replaceState({}, "", window.location.pathname);
      return () => disconnect();
    }

    if (isNative && !getActiveBackend()) {
      const savedBackends = loadBackends();
      if (savedBackends.length === 0) {
        const defaultUrl = typeof __ENSO_DEFAULT_BACKEND__ !== "undefined" ? __ENSO_DEFAULT_BACKEND__ : "";
        const defaultToken = typeof __ENSO_DEFAULT_TOKEN__ !== "undefined" ? __ENSO_DEFAULT_TOKEN__ : "";
        if (defaultUrl && defaultToken) {
          const defaultName = typeof __ENSO_DEFAULT_NAME__ !== "undefined" ? __ENSO_DEFAULT_NAME__ : "Enso Server";
          const config = addBackend({ name: defaultName, url: defaultUrl, token: defaultToken });
          setActiveBackend(config.id);
          connectToBackend(config);
          return () => disconnect();
        }
        useChatStore.getState().setShowSetupWizard(true);
      } else {
        useChatStore.getState().setShowConnectionPicker(true);
      }
      return () => disconnect();
    }

    connect();
    return () => disconnect();
  }, [connect, disconnect, connectToBackend, loadSharedCard]);

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
        <UpdateBanner />
        <ConnectionBanner />

        <div className="flex flex-1 overflow-hidden min-h-0">
          <DesktopTabRail />
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <TabContent />
          </div>
        </div>

        <MobileTabBar />

        <ToastContainer />
        <ConnectionPicker />
        <SetupWizard />
      </div>
    </AppErrorBoundary>
  );
}
