import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../store/chat";
import type { ChannelMode } from "@shared/types";

const modes: Array<{ value: ChannelMode; label: string; description: string }> = [
  { value: "full", label: "Full", description: "Interactive UI with in-place updates" },
  { value: "ui", label: "UI", description: "Generated UI, new card per response" },
  { value: "im", label: "IM", description: "Plain text only, no generated UI" },
];

export default function ModePicker() {
  const channelMode = useChatStore((s) => s.channelMode);
  const setChannelMode = useChatStore((s) => s.setChannelMode);
  const connectionState = useChatStore((s) => s.connectionState);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const disabled = connectionState !== "connected";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = modes.find((m) => m.value === channelMode) ?? modes[0]!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md border transition-colors ${
          disabled
            ? "border-gray-700 text-gray-600 cursor-not-allowed"
            : "border-gray-700 text-gray-300 hover:border-gray-600 hover:text-gray-200"
        }`}
      >
        {current.label}
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-md border border-gray-700 bg-gray-800 shadow-lg z-50">
          {modes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => {
                setChannelMode(mode.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors first:rounded-t-md last:rounded-b-md ${
                mode.value === channelMode
                  ? "bg-indigo-500/20 text-indigo-300"
                  : "text-gray-300 hover:bg-gray-700"
              }`}
            >
              <div className="font-medium">{mode.label}</div>
              <div className="text-xs text-gray-500">{mode.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
