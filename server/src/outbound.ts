// ── Outbound barrel ──
// Re-exports from sub-modules for backward-compatible imports.

export { registerCardContext, getCardState, createScopedShareContext } from "./outbound/card-context.js";
export { deliverEnsoReply, handleCardEnhance, deliverToEnso } from "./outbound/delivery.js";
export { handlePluginCardAction } from "./outbound/card-actions.js";
