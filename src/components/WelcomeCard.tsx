import { useChatStore } from "../store/chat";

interface Template {
  icon: string;
  title: string;
  description: string;
  prompt: string;
}

const TEMPLATES: Template[] = [
  {
    icon: "\uD83D\uDCC1",
    title: "Browse Files",
    description: "Explore your filesystem",
    prompt: "Show me what's in my home directory",
  },
  {
    icon: "\u2708\uFE0F",
    title: "Plan a Trip",
    description: "Get a travel itinerary",
    prompt: "Help me plan a weekend trip to a nearby city",
  },
  {
    icon: "\uD83C\uDF7D\uFE0F",
    title: "Meal Planning",
    description: "Plan meals for the week",
    prompt: "Create a healthy meal plan for this week",
  },
  {
    icon: "\uD83D\uDCBB",
    title: "Code Assistant",
    description: "Open Claude Code",
    prompt: "/code",
  },
  {
    icon: "\uD83C\uDFB5",
    title: "Media Library",
    description: "Browse your media files",
    prompt: "Show me my recent photos and videos",
  },
  {
    icon: "\uD83D\uDCAC",
    title: "Just Chat",
    description: "Ask me anything",
    prompt: "",
  },
];

export default function WelcomeCard() {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const connectionState = useChatStore((s) => s.connectionState);
  const disabled = connectionState !== "connected";

  function handleClick(template: Template) {
    if (disabled) return;
    if (!template.prompt) return; // "Just Chat" — user types their own
    sendMessage(template.prompt);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="text-center mb-6">
        <p className="text-lg font-semibold text-gray-200">Enso</p>
        <p className="text-sm text-gray-400 mt-1">
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
