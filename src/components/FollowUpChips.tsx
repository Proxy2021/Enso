import { useState } from "react";
import { useChatStore } from "../store/chat";

interface FollowUpChipsProps {
  cardId: string;
  followUps: Array<{ label: string; prompt: string; icon?: string }>;
}

export default function FollowUpChips({ followUps }: FollowUpChipsProps) {
  const [dismissed, setDismissed] = useState(false);
  const sendMessage = useChatStore((s) => s.sendMessage);

  if (dismissed || followUps.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
      {followUps.map((fu, i) => (
        <button
          key={i}
          onClick={() => {
            sendMessage(fu.prompt);
            setDismissed(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all duration-150 border border-indigo-500/20"
        >
          {fu.icon && <span>{fu.icon}</span>}
          {fu.label}
        </button>
      ))}
    </div>
  );
}
