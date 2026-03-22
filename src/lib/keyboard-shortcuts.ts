import { useEffect } from "react";
import { useChatStore } from "../store/chat";

interface ShortcutDef {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  description: string;
  action: () => void;
}

function matchesShortcut(e: KeyboardEvent, def: ShortcutDef): boolean {
  const ctrl = def.ctrl ?? false;
  const shift = def.shift ?? false;
  const hasCtrl = e.ctrlKey || e.metaKey;
  return (
    e.key.toLowerCase() === def.key.toLowerCase() &&
    hasCtrl === ctrl &&
    e.shiftKey === shift
  );
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      const shortcuts: ShortcutDef[] = [
        {
          key: "/",
          ctrl: true,
          description: "Focus chat input",
          action: () => {
            const input = document.querySelector<HTMLTextAreaElement>('[data-chat-input]');
            input?.focus();
          },
        },
        {
          key: "f",
          ctrl: true,
          description: "Toggle card search",
          action: () => {
            const state = useChatStore.getState();
            state.setCardSearchVisible(!state.cardSearchVisible);
          },
        },
        {
          key: "Escape",
          description: "Close panels",
          action: () => {
            const state = useChatStore.getState();
            if (state.cardSearchVisible) {
              state.setCardSearchVisible(false);
              return;
            }
          },
        },
      ];

      for (const shortcut of shortcuts) {
        if (matchesShortcut(e, shortcut)) {
          if (shortcut.key === "Escape" && isInput && !useChatStore.getState().cardSearchVisible) {
            continue;
          }
          if (shortcut.ctrl) {
            e.preventDefault();
          }
          shortcut.action();
          return;
        }
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
