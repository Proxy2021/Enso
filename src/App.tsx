import { useEffect } from "react";
import { useChatStore } from "./store/chat";
import ChatThread from "./components/ChatThread";
import ChatInput from "./components/ChatInput";

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
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h1 className="text-lg font-semibold">Enso</h1>
        <ConnectionDot />
      </header>
      <ChatThread />
      <ChatInput />
    </div>
  );
}
