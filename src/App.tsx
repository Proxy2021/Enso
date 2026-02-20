import { useEffect } from "react";
import { useChatStore } from "./store/chat";
import CardTimeline from "./components/CardTimeline";
import ChatInput from "./components/ChatInput";
import AppsMenu from "./components/AppsMenu";
// Initialize card registry (registers all built-in card types)
import "./cards";

function ConnectionDot() {
  const state = useChatStore((s) => s.connectionState);
  const color =
    state === "connected"
      ? "bg-emerald-400"
      : state === "connecting"
        ? "bg-amber-400 animate-pulse"
        : "bg-red-400";

  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      {state}
    </div>
  );
}

export default function App() {
  const connect = useChatStore((s) => s.connect);
  const disconnect = useChatStore((s) => s.disconnect);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <div className="flex flex-col h-screen text-gray-100">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b border-gray-800/80 bg-gray-950/70 backdrop-blur supports-[backdrop-filter]:bg-gray-950/55">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Enso</h1>
          <p className="text-[11px] text-gray-500 leading-none mt-0.5">OpenClaw, but every answer is an app.</p>
        </div>
        <div className="flex items-center gap-3">
          <AppsMenu />
          <ConnectionDot />
        </div>
      </header>
      <CardTimeline />
      <ChatInput />
    </div>
  );
}
