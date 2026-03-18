import { useRef, useEffect, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useChatStore } from "../store/chat";
import type { CardRendererProps } from "./types";

/**
 * Registry of write functions for each shell card.
 * The store calls these to push PTY output into the xterm instance
 * without re-rendering via React state.
 */
export const shellWriters = new Map<string, (data: string) => void>();

export default function ShellCard({ card }: CardRendererProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsClient = useChatStore((s) => s._wsClient);
  const shellSessionId = card.toolMeta?.toolSessionId;
  const [isExited, setIsExited] = useState(card.status === "complete");

  // Buffer output received before xterm is mounted
  const pendingOutputRef = useRef<string>("");

  // Track session ID in a ref for stable callbacks
  const sessionIdRef = useRef<string | undefined>(shellSessionId);
  useEffect(() => {
    sessionIdRef.current = shellSessionId;
  }, [shellSessionId]);

  // Update exited state
  useEffect(() => {
    if (card.status === "complete" || card.status === "error") {
      setIsExited(true);
    }
  }, [card.status]);

  // Initialize xterm.js
  useEffect(() => {
    if (!termRef.current || xtermRef.current) return;

    // Dynamic font size: scale down on narrow screens to fit more columns.
    // Targets 80 cols, clamped between 9px (mobile) and 13px (desktop).
    const termPadding = 8; // 4px each side
    const targetCols = 80;
    const charWidthRatio = 0.6; // monospace char width ≈ fontSize × 0.6
    const availableWidth = termRef.current.clientWidth - termPadding;
    const idealFontSize = availableWidth / (targetCols * charWidthRatio);
    const fontSize = Math.max(9, Math.min(13, Math.round(idealFontSize)));

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, monospace",
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        selectionBackground: "#264f78",
        black: "#484f58",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39d353",
        white: "#b1bac4",
        brightBlack: "#6e7681",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d364",
        brightWhite: "#f0f6fc",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(termRef.current);

    // Fit terminal to container, then send shell.create with measured dimensions
    requestAnimationFrame(() => {
      fitAddon.fit();
      const cols = terminal.cols || 80;
      const rows = terminal.rows || 24;
      wsClient?.send({
        type: "shell.create",
        sourceCardId: card.id,
        shellCols: cols,
        shellRows: rows,
      });
    });

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Flush any buffered output
    if (pendingOutputRef.current) {
      terminal.write(pendingOutputRef.current);
      pendingOutputRef.current = "";
    }

    // Handle resize — recalculate font size for new container width
    const container = termRef.current;
    const resizeObserver = new ResizeObserver(() => {
      try {
        const width = container.clientWidth - termPadding;
        const newSize = Math.max(9, Math.min(13, Math.round(width / (targetCols * charWidthRatio))));
        if (terminal.options.fontSize !== newSize) {
          terminal.options.fontSize = newSize;
        }
        fitAddon.fit();
      } catch {
        // ignore fit errors during unmount
      }
    });
    resizeObserver.observe(container);

    // Send resize events to backend
    terminal.onResize(({ cols, rows }) => {
      const sid = sessionIdRef.current;
      if (sid) {
        wsClient?.send({
          type: "shell.resize",
          shellSessionId: sid,
          shellCols: cols,
          shellRows: rows,
        });
      }
    });

    // Forward keystrokes to backend PTY
    terminal.onData((data: string) => {
      const sid = sessionIdRef.current;
      if (sid) {
        wsClient?.send({
          type: "shell.input",
          shellSessionId: sid,
          shellInput: data,
        });
      }
    });

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register shell writer for the store to push output
  useEffect(() => {
    const cardId = card.id;
    shellWriters.set(cardId, (data: string) => {
      if (xtermRef.current) {
        xtermRef.current.write(data);
      } else {
        pendingOutputRef.current += data;
      }
    });
    return () => {
      shellWriters.delete(cardId);
    };
  }, [card.id]);

  // Re-fit when card display changes (collapse/expand)
  useEffect(() => {
    if (card.display === "expanded") {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
      });
    }
  }, [card.display]);

  // Kill shell session
  const handleKill = useCallback(() => {
    const sid = sessionIdRef.current;
    if (sid) {
      wsClient?.send({
        type: "shell.destroy",
        shellSessionId: sid,
      });
    }
  }, [wsClient]);

  return (
    <div className="mb-3">
      <div className="bg-[#0d1117] border border-gray-800 rounded-lg overflow-hidden">
        {/* macOS-style header */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-900/80 border-b border-gray-800 text-xs">
          <div className="flex gap-1">
            <button
              onClick={handleKill}
              className="w-2.5 h-2.5 rounded-full bg-red-500/70 hover:bg-red-500 active:bg-red-600 active:scale-[0.85] transition-all duration-150 cursor-pointer"
              title="Kill shell"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/30" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/30" />
          </div>
          <span className="text-gray-500 text-[11px] ml-1">
            {isExited ? "exited" : "shell"}
          </span>
          {shellSessionId && (
            <span className="text-gray-700 text-[10px] ml-auto font-mono">
              {shellSessionId.slice(0, 8)}
            </span>
          )}
        </div>

        {/* Terminal container — responsive height: up to 400px but capped at 50dvh for mobile */}
        <div
          ref={termRef}
          className="w-full"
          style={{ height: "min(400px, 50dvh)", padding: "4px" }}
        />
      </div>
    </div>
  );
}
