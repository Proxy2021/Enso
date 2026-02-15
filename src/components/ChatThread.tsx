import { useEffect, useRef } from "react";
import { useChatStore } from "../store/chat";
import MessageBubble from "./MessageBubble";

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4 max-w-3xl mx-auto">
      <div className="bg-gray-800 rounded-2xl px-4 py-3 flex items-center gap-1.5">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}

export default function ChatThread() {
  const messages = useChatStore((s) => s.messages);
  const isWaiting = useChatStore((s) => s.isWaiting);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isWaiting]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-lg font-medium">Enso</p>
          <p className="text-sm mt-1 text-gray-400">
            OpenClaw, but every answer is an app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isWaiting && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
