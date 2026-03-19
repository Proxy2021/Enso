import { useChatStore } from "../store/chat";

interface Template {
  icon: string;
  title: string;
  description: string;
  appId?: string;      // Direct app invocation (preferred)
  toolFamily?: string; // Legacy alias for appId
  prompt?: string;     // Fallback: send as chat message
}

const TEMPLATES: Template[] = [
  {
    icon: "\uD83D\uDD0D",
    title: "Researcher",
    description: "25+ source deep research with citations",
    toolFamily: "researcher",
  },
  {
    icon: "\uD83D\uDCBB",
    title: "Code Assistant",
    description: "Write, run & debug code live",
    prompt: "/code",
  },
  {
    icon: "\u26A1",
    title: "Orchestrate",
    description: "Multi-agent projects with DAG execution",
    prompt: "/orchestrate",
  },
  {
    icon: "\uD83D\uDCC1",
    title: "Browse Files",
    description: "Explore & manage your filesystem",
    toolFamily: "filesystem",
  },
  {
    icon: "\uD83D\uDDBC\uFE0F",
    title: "Photo Gallery",
    description: "Browse, search & organize media",
    toolFamily: "media_gallery",
  },
  {
    icon: "\uD83D\uDDA5\uFE0F",
    title: "Remote Desktop",
    description: "Control this machine's screen",
    toolFamily: "remote_desktop",
  },
  {
    icon: "\uD83D\uDCC1",
    title: "Projects",
    description: "Manage AI teams & evolution",
    prompt: "/projects",
  },
  {
    icon: "\uD83D\uDDA5\uFE0F",
    title: "Terminal",
    description: "Remote shell access",
    prompt: "/shell",
  },
];

interface SuggestedPrompt {
  category: string;
  text: string;
  icon: string;
}

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { category: "Research", icon: "\uD83D\uDD0D", text: "Research CRISPR gene editing breakthroughs in 2026" },
  { category: "Compare", icon: "\uD83D\uDCCA", text: "Compare Salesforce vs HubSpot vs Pipedrive for startups" },
  { category: "Build", icon: "\uD83D\uDEE0\uFE0F", text: "Build a project tracker app with drag-and-drop" },
  { category: "Diagram", icon: "\uD83D\uDD17", text: "Design a microservices architecture diagram for e-commerce" },
  { category: "Create", icon: "\u2728", text: "Create a 30-day social media content calendar" },
  { category: "Explain", icon: "\uD83C\uDF93", text: "Explain how React Server Components work vs SSR" },
];

export default function WelcomeCard() {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const runApp = useChatStore((s) => s.runApp);
  const connectionState = useChatStore((s) => s.connectionState);
  const disabled = connectionState !== "connected";

  function handleClick(template: Template) {
    if (disabled) return;
    const appId = template.appId ?? template.toolFamily;
    if (appId) {
      runApp(appId);
    } else if (template.prompt) {
      sendMessage(template.prompt);
    }
  }

  function handlePromptClick(prompt: SuggestedPrompt) {
    if (disabled) return;
    sendMessage(prompt.text);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-gray-200 mb-1">Welcome to Enso</h2>
        <p className="text-sm text-gray-400 max-w-md">
          Your AI workspace — research with live sources, build interactive apps, write &amp; debug code, and orchestrate multi-agent tasks.
        </p>
      </div>

      {/* Suggested prompts */}
      <div className="w-full max-w-lg mb-6">
        <p className="text-xs text-gray-500 mb-2 px-1">Try asking:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p.text}
              onClick={() => handlePromptClick(p)}
              disabled={disabled}
              className="text-left px-3 py-2.5 rounded-lg border border-gray-700/50 bg-gray-900/30 hover:bg-gray-800/60 hover:border-indigo-500/40 active:bg-gray-800 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 group"
            >
              <span className="text-xs text-gray-300 group-hover:text-gray-100 line-clamp-1">
                <span className="mr-1.5">{p.icon}</span>{p.text}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Feature tiles */}
      <div className="w-full max-w-lg">
        <p className="text-xs text-gray-500 mb-2 px-1">Or launch a tool:</p>
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.title}
              onClick={() => handleClick(t)}
              disabled={disabled}
              className="text-left p-2.5 rounded-xl border border-gray-700/70 bg-gray-900/50 hover:bg-gray-800/70 hover:border-gray-600 active:bg-gray-800 active:scale-[0.96] active:border-gray-500 transition-all duration-150 disabled:opacity-50"
            >
              <span className="text-lg">{t.icon}</span>
              <div className="text-[11px] font-medium text-gray-200 mt-1">
                {t.title}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">
                {t.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-gray-600 mt-4">
        Type / for commands &middot; Attach files with + &middot; Build apps from any response
      </p>
    </div>
  );
}
