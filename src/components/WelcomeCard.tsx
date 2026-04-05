import { useState, useEffect } from "react";
import { useChatStore } from "../store/chat";
import { useT } from "../lib/i18n";
import { STORAGE_KEYS, TIMINGS } from "../lib/constants";
import type { ProactiveSuggestionAction } from "@shared/types";

interface Template {
  icon: string;
  titleKey: string;
  descKey: string;
  appId?: string;
  toolFamily?: string;
  prompt?: string;
}

const TEMPLATES: Template[] = [
  { icon: "\uD83D\uDCBB", titleKey: "welcome.tile.codeAssistant", descKey: "welcome.tile.codeAssistant.desc", prompt: "/code" },
  { icon: "\uD83D\uDD0D", titleKey: "welcome.tile.researcher", descKey: "welcome.tile.researcher.desc", toolFamily: "researcher" },
  { icon: "\uD83E\uDDE0", titleKey: "welcome.tile.wiki", descKey: "welcome.tile.wiki.desc", toolFamily: "cortex" },
  { icon: "\uD83E\uDDEC", titleKey: "welcome.tile.evolve", descKey: "welcome.tile.evolve.desc", prompt: "/evolve" },
  { icon: "\u26A1", titleKey: "welcome.tile.orchestrate", descKey: "welcome.tile.orchestrate.desc", prompt: "/orchestrate" },
  { icon: "\uD83D\uDCC1", titleKey: "welcome.tile.browseFiles", descKey: "welcome.tile.browseFiles.desc", toolFamily: "filesystem" },
  { icon: "\uD83D\uDDBC\uFE0F", titleKey: "welcome.tile.photoGallery", descKey: "welcome.tile.photoGallery.desc", toolFamily: "media_gallery" },
  { icon: "\uD83D\uDDA5\uFE0F", titleKey: "welcome.tile.remoteDesktop", descKey: "welcome.tile.remoteDesktop.desc", toolFamily: "remote_desktop" },
  { icon: "\uD83D\uDCC1", titleKey: "welcome.tile.projects", descKey: "welcome.tile.projects.desc", prompt: "/projects" },
  { icon: "\uD83D\uDDA5\uFE0F", titleKey: "welcome.tile.terminal", descKey: "welcome.tile.terminal.desc", prompt: "/shell" },
  { icon: "\uD83D\uDD2C", titleKey: "welcome.tile.discover", descKey: "welcome.tile.discover.desc", prompt: "/discover" },
  { icon: "\uD83D\uDCCA", titleKey: "welcome.tile.sessions", descKey: "welcome.tile.sessions.desc", prompt: "/sessions" },
];

interface SuggestedPrompt {
  categoryKey: string;
  textKey: string;
  icon: string;
}

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { categoryKey: "welcome.category.build", icon: "\uD83D\uDEE0\uFE0F", textKey: "welcome.prompt.build" },
  { categoryKey: "welcome.category.research", icon: "\uD83D\uDD0D", textKey: "welcome.prompt.research" },
  { categoryKey: "welcome.category.create", icon: "\u2728", textKey: "welcome.prompt.create" },
  { categoryKey: "welcome.category.compare", icon: "\uD83D\uDCCA", textKey: "welcome.prompt.compare" },
  { categoryKey: "welcome.category.diagram", icon: "\uD83D\uDD17", textKey: "welcome.prompt.diagram" },
  { categoryKey: "welcome.category.explain", icon: "\uD83C\uDF93", textKey: "welcome.prompt.explain" },
];

const PILLAR_ICONS: Record<string, string> = {
  project_health: "\uD83D\uDEE1\uFE0F",
  research: "\uD83D\uDD2C",
  communication: "\u2709\uFE0F",
  workflow: "\u26A1",
  learning: "\uD83C\uDF93",
  digest: "\uD83D\uDCCB",
  ambient: "\u2699\uFE0F",
};

const PILLAR_COLORS: Record<string, string> = {
  project_health: "border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20",
  research: "border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20",
  communication: "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20",
  workflow: "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20",
  learning: "border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20",
  digest: "border-zinc-500/40 bg-zinc-500/10 hover:bg-zinc-500/20",
  ambient: "border-zinc-500/40 bg-zinc-500/10 hover:bg-zinc-500/20",
};

export default function WelcomeCard() {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const runApp = useChatStore((s) => s.runApp);
  const connectionState = useChatStore((s) => s.connectionState);
  const proactiveSuggestions = useChatStore((s) => s.proactiveSuggestions);
  const disabled = connectionState !== "connected";
  const { t } = useT();

  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (localStorage.getItem(STORAGE_KEYS.ONBOARDING_DISMISSED)) return false;
    if (localStorage.getItem("enso_onboarded")) return false;
    return true;
  });

  // Request proactive suggestions on mount when connected
  useEffect(() => {
    if (connectionState !== "connected") return;
    const ws = useChatStore.getState()._wsClient;
    ws?.send({ type: "proactive.get_suggestions", suggestionCount: 3 } as never);
  }, [connectionState]);

  useEffect(() => {
    if (showOnboarding) {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_DISMISSED, "1");
      const timer = setTimeout(() => setShowOnboarding(false), TIMINGS.ONBOARDING_HIDE);
      return () => clearTimeout(timer);
    }
  }, [showOnboarding]);

  function handleClick(template: Template) {
    if (disabled) return;
    const appId = template.appId ?? template.toolFamily;
    if (appId) {
      runApp(appId);
    } else if (template.prompt) {
      sendMessage(template.prompt);
    }
  }

  function handlePromptClick(textKey: string) {
    if (disabled) return;
    sendMessage(t(textKey));
  }

  function handleSuggestionAction(action: ProactiveSuggestionAction, pillar: string) {
    if (disabled) return;
    // Record acceptance
    const ws = useChatStore.getState()._wsClient;
    ws?.send({ type: "proactive.accept", suggestionPillar: pillar } as never);

    switch (action.type) {
      case "send_message":
        sendMessage(action.message);
        break;
      case "run_app":
        runApp(action.appId);
        break;
      case "deep_research":
        sendMessage(`/research ${action.topic}`);
        break;
      case "open_project":
        sendMessage(`Open project at ${action.path}`);
        break;
    }
  }

  function handleDismissSuggestion(id: string, pillar: string) {
    const ws = useChatStore.getState()._wsClient;
    ws?.send({ type: "proactive.dismiss", suggestionId: id, suggestionPillar: pillar } as never);
    // Optimistic removal from local state
    useChatStore.setState((s) => ({
      proactiveSuggestions: s.proactiveSuggestions.filter(sg => sg.id !== id),
    }));
  }

  const topSuggestions = proactiveSuggestions.slice(0, 3);

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-4 py-4">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-gray-200 mb-1">{t("welcome.tagline")}</h2>
        <p className="text-sm text-gray-400 max-w-lg">
          {t("welcome.subtitle")}
        </p>
      </div>

      {showOnboarding && (
        <div className="w-full max-w-lg mb-4 px-3 py-2.5 rounded-lg bg-indigo-900/40 border border-indigo-700/40 text-sm text-indigo-200 animate-in fade-in">
          <div className="flex items-start justify-between gap-2">
            <p>{t("welcome.onboarding")}</p>
            <button onClick={() => setShowOnboarding(false)} className="text-indigo-400 hover:text-indigo-200 text-xs shrink-0 mt-0.5">&#x2715;</button>
          </div>
        </div>
      )}

      {/* Proactive suggestions from profile */}
      {topSuggestions.length > 0 && (
        <div className="w-full max-w-lg mb-5">
          <p className="text-xs text-gray-500 mb-2 px-1">{t("welcome.suggestedForYou")}</p>
          <div className="space-y-1.5">
            {topSuggestions.map((s) => (
              <div
                key={s.id}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all duration-150 group ${PILLAR_COLORS[s.pillar] || PILLAR_COLORS.ambient}`}
              >
                <span className="text-sm shrink-0 mt-0.5">{PILLAR_ICONS[s.pillar] || "\u2022"}</span>
                <button
                  onClick={() => handleSuggestionAction(s.action as ProactiveSuggestionAction, s.pillar)}
                  disabled={disabled}
                  className="flex-1 text-left min-w-0 disabled:opacity-50"
                >
                  <div className="text-xs font-medium text-gray-200">{s.title}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{s.description}</div>
                </button>
                <button
                  onClick={() => handleDismissSuggestion(s.id, s.pillar)}
                  className="shrink-0 text-gray-600 hover:text-gray-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                  title="Dismiss"
                >
                  &#x2715;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent conversations */}
      <RecentTopics disabled={disabled} />

      {/* Suggested prompts */}
      <div className="w-full max-w-lg mb-6">
        <p className="text-xs text-gray-500 mb-2 px-1">{t("welcome.tryAsking")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p.textKey}
              onClick={() => handlePromptClick(p.textKey)}
              disabled={disabled}
              className="text-left px-3 py-2.5 rounded-lg border border-gray-700/50 bg-gray-900/30 hover:bg-gray-800/60 hover:border-indigo-500/40 active:bg-gray-800 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 group"
            >
              <span className="text-xs text-gray-300 group-hover:text-gray-100 line-clamp-2">
                <span className="mr-1.5">{p.icon}</span>{t(p.textKey)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Feature tiles */}
      <div className="w-full max-w-lg">
        <p className="text-xs text-gray-500 mb-2 px-1">{t("welcome.launchTool")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.titleKey}
              onClick={() => handleClick(tmpl)}
              disabled={disabled}
              className="text-left p-3 sm:p-2.5 rounded-xl border border-gray-700/70 bg-gray-900/50 hover:bg-gray-800/70 hover:border-gray-600 active:bg-gray-800 active:scale-[0.96] active:border-gray-500 transition-all duration-150 disabled:opacity-50 flex sm:block items-center gap-3 sm:gap-0"
            >
              <span className="text-xl sm:text-lg">{tmpl.icon}</span>
              <div className="sm:mt-1">
                <div className="text-xs sm:text-[11px] font-medium text-gray-200">
                  {t(tmpl.titleKey)}
                </div>
                <div className="text-[11px] sm:text-[10px] text-gray-500 mt-0.5 line-clamp-2">
                  {t(tmpl.descKey)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/30 max-w-lg w-full">
        <p className="text-xs text-gray-400 text-center hidden sm:block">
          <span className="text-gray-300 font-medium">/research</span> {t("welcome.hint.research")}
          <span className="mx-1.5 text-gray-600">&middot;</span>
          <span className="text-gray-300 font-medium">/code</span> {t("welcome.hint.code")}
          <span className="mx-1.5 text-gray-600">&middot;</span>
          <span className="text-gray-300 font-medium">/shell</span> {t("welcome.hint.shell")}
          <span className="mx-1.5 text-gray-600">&middot;</span>
          <span className="text-gray-300 font-medium">/orchestrate</span> {t("welcome.hint.orchestrate")}
          <span className="mx-1.5 text-gray-600">&middot;</span>
          <span className="text-gray-300 font-medium">/discover</span> {t("welcome.hint.discover")}
          <span className="mx-1.5 text-gray-600">&middot;</span>
          <span className="text-gray-300 font-medium">/evolve</span> {t("welcome.hint.evolve")}
        </p>
        <p className="text-xs text-gray-400 text-center sm:hidden flex flex-wrap justify-center gap-x-3 gap-y-1">
          <span className="text-gray-300 font-medium">/research</span>
          <span className="text-gray-300 font-medium">/code</span>
          <span className="text-gray-300 font-medium">/shell</span>
          <span className="text-gray-300 font-medium">/orchestrate</span>
          <span className="text-gray-300 font-medium">/discover</span>
          <span className="text-gray-300 font-medium">/evolve</span>
        </p>
        <p className="text-[10px] text-gray-500 text-center mt-1">
          {t("welcome.hint.slashCommands")} &middot; {t("welcome.hint.attachFiles")}
        </p>
      </div>
    </div>
  );
}

function RecentTopics({ disabled }: { disabled: boolean }) {
  const recentTopics = useChatStore((s) => s.recentTopics);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const { t } = useT();

  if (!recentTopics || recentTopics.length === 0) return null;

  function formatTimeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t("recent.justNow");
    if (mins < 60) return t("recent.minsAgo").replace("{n}", String(mins));
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t("recent.hoursAgo").replace("{n}", String(hours));
    const days = Math.floor(hours / 24);
    if (days === 1) return t("recent.yesterday");
    return t("recent.daysAgo").replace("{n}", String(days));
  }

  return (
    <div className="w-full max-w-lg mb-5">
      <p className="text-xs text-gray-500 mb-2 px-1">{t("recent.title")}</p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {recentTopics.map((topic, i) => (
          <button
            key={i}
            onClick={() => sendMessage(topic.lastMessage)}
            disabled={disabled}
            className="shrink-0 text-left px-3 py-2 rounded-lg border border-gray-700/50 bg-gray-800/40 hover:bg-gray-800/70 hover:border-indigo-500/40 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 max-w-[200px]"
          >
            <div className="text-xs text-gray-300 truncate">{topic.topic}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">{formatTimeAgo(topic.timestamp)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
