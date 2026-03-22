import type { ServerMessage } from "@shared/types";
import { TOOL_ID_CLAUDE_CODE } from "../lib/constants";
import type { CardTypeRegistration } from "./types";

class CardRegistry {
  private types = new Map<string, CardTypeRegistration>();

  register(reg: CardTypeRegistration): void {
    this.types.set(reg.type, reg);
  }

  get(type: string): CardTypeRegistration | undefined {
    return this.types.get(type);
  }

  /** Resolve the card type for a given server message and role. */
  resolve(msg: ServerMessage, role: string): string {
    if (role === "user") {
      if (msg.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE) return "terminal";
      return "user-bubble";
    }

    // Check registered types in priority order
    for (const reg of this.types.values()) {
      if (reg.match(msg)) return reg.type;
    }

    return "chat";
  }
}

export const cardRegistry = new CardRegistry();
