import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { ServerMessage } from "@shared/types";
import type { ChatMessage } from "../types";
import { createWSClient, type ConnectionState } from "../lib/ws-client";

interface ChatStore {
  messages: ChatMessage[];
  connectionState: ConnectionState;
  isWaiting: boolean;
  _wsClient: ReturnType<typeof createWSClient> | null;

  connect: () => void;
  disconnect: () => void;
  sendMessage: (text: string) => void;
  sendMessageWithMedia: (text: string, mediaFiles: File[]) => Promise<void>;
  _handleServerMessage: (msg: ServerMessage) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  connectionState: "disconnected",
  isWaiting: false,
  _wsClient: null,

  connect: () => {
    const existing = get()._wsClient;
    if (existing) return;

    const wsUrl =
      location.protocol === "https:"
        ? `wss://${location.host}/ws`
        : `ws://${location.host}/ws`;

    const client = createWSClient({
      url: wsUrl,
      onMessage: (msg) => get()._handleServerMessage(msg),
      onStateChange: (state) => set({ connectionState: state }),
    });

    set({ _wsClient: client });
    client.connect();
  },

  disconnect: () => {
    get()._wsClient?.disconnect();
    set({ _wsClient: null, connectionState: "disconnected" });
  },

  sendMessage: (text: string) => {
    const id = uuidv4();
    const userMsg: ChatMessage = {
      id,
      runId: id,
      role: "user",
      text,
      state: "complete",
    };

    set((s) => ({ messages: [...s.messages, userMsg], isWaiting: true }));
    get()._wsClient?.send({ type: "chat.send", text });
  },

  sendMessageWithMedia: async (text: string, mediaFiles: File[]) => {
    const mediaUrls: string[] = [];

    for (const file of mediaFiles) {
      const res = await fetch("/upload", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (res.ok) {
        const { filePath } = await res.json();
        mediaUrls.push(filePath);
      }
    }

    const id = uuidv4();
    const userMsg: ChatMessage = {
      id,
      runId: id,
      role: "user",
      text,
      mediaUrls: mediaFiles.map((f) => URL.createObjectURL(f)),
      state: "complete",
    };

    set((s) => ({ messages: [...s.messages, userMsg], isWaiting: true }));
    get()._wsClient?.send({
      type: "chat.send",
      text,
      mediaUrls,
    });
  },

  _handleServerMessage: (msg: ServerMessage) => {
    set((state) => {
      const existing = state.messages.find(
        (m) => m.runId === msg.runId && m.role === "assistant"
      );
      const isWaiting = false;

      if (msg.state === "delta") {
        if (existing) {
          return {
            isWaiting,
            messages: state.messages.map((m) =>
              m.runId === msg.runId && m.role === "assistant"
                ? { ...m, text: m.text + (msg.text ?? ""), state: "streaming" as const }
                : m
            ),
          };
        }
        return {
          isWaiting,
          messages: [
            ...state.messages,
            {
              id: msg.id,
              runId: msg.runId,
              role: "assistant" as const,
              text: msg.text ?? "",
              state: "streaming" as const,
            },
          ],
        };
      }

      if (msg.state === "final") {
        // Merge mediaUrls from this message with any previously accumulated
        const mergedMediaUrls = [
          ...(existing?.mediaUrls ?? []),
          ...(msg.mediaUrls ?? []),
        ];
        const mediaUrls = mergedMediaUrls.length > 0 ? mergedMediaUrls : undefined;

        if (existing) {
          return {
            isWaiting,
            messages: state.messages.map((m) =>
              m.runId === msg.runId && m.role === "assistant"
                ? {
                    ...m,
                    text: msg.text ?? m.text,
                    data: msg.data,
                    generatedUI: msg.generatedUI,
                    mediaUrls,
                    state: "complete" as const,
                  }
                : m
            ),
          };
        }
        return {
          isWaiting,
          messages: [
            ...state.messages,
            {
              id: msg.id,
              runId: msg.runId,
              role: "assistant" as const,
              text: msg.text ?? "",
              data: msg.data,
              generatedUI: msg.generatedUI,
              mediaUrls,
              state: "complete" as const,
            },
          ],
        };
      }

      if (msg.state === "error") {
        if (existing) {
          return {
            isWaiting,
            messages: state.messages.map((m) =>
              m.runId === msg.runId && m.role === "assistant"
                ? { ...m, text: msg.text ?? "An error occurred.", state: "error" as const }
                : m
            ),
          };
        }
        return {
          isWaiting,
          messages: [
            ...state.messages,
            {
              id: msg.id,
              runId: msg.runId,
              role: "assistant" as const,
              text: msg.text ?? "An error occurred.",
              state: "error" as const,
            },
          ],
        };
      }

      return state;
    });
  },
}));
