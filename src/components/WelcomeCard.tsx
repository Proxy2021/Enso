import { useChatStore } from "../store/chat";

interface Template {
  icon: string;
  title: string;
  description: string;
  toolFamily?: string; // Direct app invocation
  prompt?: string;     // Fallback: send as chat message
}

const TEMPLATES: Template[] = [
  {
    icon: "\uD83D\uDCC1",
    title: "Browse Files",
    description: "Explore your filesystem",
    toolFamily: "filesystem",
  },
  {
    icon: "\uD83D\uDDBC\uFE0F",
    title: "Photo Gallery",
    description: "Browse your media files",
    toolFamily: "media_gallery",
  },
  {
    icon: "\uD83C\uDFD9\uFE0F",
    title: "City Planning",
    description: "Research a city",
    toolFamily: "city_planner",
  },
  {
    icon: "\uD83D\uDD0D",
    title: "Researcher",
    description: "Deep dive into any topic",
    toolFamily: "researcher",
  },
  {
    icon: "\uD83D\uDDA5\uFE0F",
    title: "Remote Desktop",
    description: "Control this machine's screen",
    toolFamily: "remote_desktop",
  },
  {
    icon: "\uD83D\uDCBB",
    title: "Code Assistant",
    description: "Open Claude Code",
    prompt: "/code",
  },
  {
    icon: "\uD83D\uDDA5\uFE0F",
    title: "Terminal",
    description: "Open a remote shell",
    prompt: "/shell",
  },
];

export default function WelcomeCard() {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const runApp = useChatStore((s) => s.runApp);
  const connectionState = useChatStore((s) => s.connectionState);
  const disabled = connectionState !== "connected";

  function handleClick(template: Template) {
    if (disabled) return;
    if (template.toolFamily) {
      runApp(template.toolFamily);
    } else if (template.prompt) {
      sendMessage(template.prompt);
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="text-center mb-6">
        <p className="text-sm text-gray-400">
          Every answer is an app. Try one of these:
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg w-full">
        {TEMPLATES.map((t) => (
          <button
            key={t.title}
            onClick={() => handleClick(t)}
            disabled={disabled}
            className="text-left p-3 rounded-xl border border-gray-700/70 bg-gray-900/50 hover:bg-gray-800/70 hover:border-gray-600 transition-colors disabled:opacity-50"
          >
            <span className="text-xl">{t.icon}</span>
            <div className="text-xs font-medium text-gray-200 mt-1.5">
              {t.title}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {t.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
