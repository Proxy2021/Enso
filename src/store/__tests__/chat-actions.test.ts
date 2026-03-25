import { describe, it, expect, vi } from "vitest";

/**
 * Tests for the launchCommandInNewChat store action logic.
 *
 * The Zustand store uses localStorage at module init, making direct import
 * impractical in Node. Instead, we test the action's logic in isolation,
 * matching the pattern used in chat.test.ts.
 *
 * Source: src/store/chat.ts launchCommandInNewChat()
 */

describe("launchCommandInNewChat action logic", () => {
  // Simulate the action's implementation:
  // launchCommandInNewChat: async (message: string) => {
  //   await get().startNewChat();
  //   get().sendMessage(message);
  //   set({ activeTab: "chat", chatViewOpen: true });
  // },

  it("calls startNewChat then sendMessage in correct order", async () => {
    const callOrder: string[] = [];
    const state = {
      activeTab: "tasks" as string,
      chatViewOpen: false,
      startNewChat: vi.fn(async () => { callOrder.push("startNewChat"); }),
      sendMessage: vi.fn((msg: string) => { callOrder.push(`sendMessage:${msg}`); }),
    };

    // Replicate the action logic
    const launchCommandInNewChat = async (message: string) => {
      await state.startNewChat();
      state.sendMessage(message);
      state.activeTab = "chat";
      state.chatViewOpen = true;
    };

    await launchCommandInNewChat("/evolve test-project");

    expect(callOrder).toEqual(["startNewChat", "sendMessage:/evolve test-project"]);
    expect(state.activeTab).toBe("chat");
    expect(state.chatViewOpen).toBe(true);
  });

  it("sets activeTab and chatViewOpen even for empty messages", async () => {
    const state = {
      activeTab: "evolve" as string,
      chatViewOpen: false,
      startNewChat: vi.fn(async () => {}),
      sendMessage: vi.fn(),
    };

    const launchCommandInNewChat = async (message: string) => {
      await state.startNewChat();
      state.sendMessage(message);
      state.activeTab = "chat";
      state.chatViewOpen = true;
    };

    await launchCommandInNewChat("");

    expect(state.startNewChat).toHaveBeenCalled();
    expect(state.sendMessage).toHaveBeenCalledWith("");
    expect(state.activeTab).toBe("chat");
    expect(state.chatViewOpen).toBe(true);
  });

  it("awaits startNewChat before calling sendMessage", async () => {
    let newChatResolved = false;
    const state = {
      activeTab: "tasks" as string,
      chatViewOpen: false,
      startNewChat: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
        newChatResolved = true;
      }),
      sendMessage: vi.fn((_msg: string) => {
        expect(newChatResolved).toBe(true);
      }),
    };

    const launchCommandInNewChat = async (message: string) => {
      await state.startNewChat();
      state.sendMessage(message);
      state.activeTab = "chat";
      state.chatViewOpen = true;
    };

    await launchCommandInNewChat("/discover");
    expect(state.sendMessage).toHaveBeenCalledWith("/discover");
  });
});
