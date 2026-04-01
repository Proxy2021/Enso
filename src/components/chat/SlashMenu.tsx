import { useMemo } from "react";
import { SLASH_COMMANDS, CATEGORY_LABELS, type SlashCommand } from "./slash-commands";
import { useT } from "../../lib/i18n";

interface SlashMenuProps {
  text: string;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onSelectCommand: (cmd: SlashCommand) => void;
}

export function SlashMenu({ text, selectedIndex, onSelectIndex, onSelectCommand }: SlashMenuProps) {
  const { t } = useT();

  const filteredCommands = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/")) return [];
    if (trimmed === "/") return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (cmd) => cmd.command.startsWith(trimmed) && cmd.command !== trimmed,
    );
  }, [text]);

  if (filteredCommands.length === 0) return null;

  let globalIdx = 0;
  let lastCategory = "";

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-600/60 rounded-lg shadow-[0_-4px_20px_rgba(0,0,0,0.4)] overflow-hidden z-50 max-h-[60vh] overflow-y-auto">
      {filteredCommands.map((cmd) => {
        const idx = globalIdx++;
        const showHeader = cmd.category !== lastCategory;
        lastCategory = cmd.category;
        return (
          <div key={cmd.command}>
            {showHeader && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-800/80 border-b border-gray-700/30">
                {CATEGORY_LABELS[cmd.category]}
              </div>
            )}
            <button
              onClick={() => onSelectCommand(cmd)}
              onMouseEnter={() => onSelectIndex(idx)}
              className={`w-full text-left px-3 py-3 sm:py-2.5 flex items-center gap-3 transition-all duration-150 ${
                idx === selectedIndex
                  ? "bg-indigo-600/30 text-gray-100"
                  : "text-gray-300 hover:bg-gray-700/50 active:bg-gray-600/50"
              }`}
            >
              {cmd.icon && <span className="text-base flex-shrink-0 w-6 text-center">{cmd.icon}</span>}
              <span className="text-xs font-mono text-indigo-400 min-w-[100px] sm:min-w-[120px]">{cmd.label}</span>
              <span className="text-xs text-gray-400 truncate">{t(cmd.descKey)}</span>
            </button>
          </div>
        );
      })}
      <div className="px-3 py-1.5 border-t border-gray-700/50 text-[10px] text-gray-500 flex justify-between">
        <span>{"\u2191\u2193"} navigate</span>
        <span>Enter or Tab to select</span>
        <span>Esc to dismiss</span>
      </div>
    </div>
  );
}

/** Hook to compute filtered commands and showMenu from text input. */
export function useFilteredCommands(text: string) {
  const filteredCommands = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/")) return [];
    if (trimmed === "/") return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (cmd) => cmd.command.startsWith(trimmed) && cmd.command !== trimmed,
    );
  }, [text]);

  return { filteredCommands, showMenu: filteredCommands.length > 0 };
}
