/**
 * Shared Tailwind CSS class constants.
 * Eliminates repeated class strings across dialog/modal components.
 */

export const MODAL_BACKDROP =
  "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4";

export const MODAL_PANEL =
  "w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.55)]";

export const BTN_SECONDARY =
  "px-3 py-1.5 text-xs rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 transition-all duration-150";

export const BTN_PRIMARY_INDIGO =
  "px-3 py-1.5 text-xs rounded-md border border-indigo-500/60 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 transition-all duration-150";

export const BTN_PRIMARY_AMBER =
  "px-3 py-1.5 text-xs rounded-md border border-amber-500/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-all duration-150";

export const INPUT_BASE =
  "flex-1 bg-gray-800 border border-gray-600/60 rounded-lg px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500/50";

export const TEXTAREA_BASE =
  "w-full bg-gray-800 border border-gray-600/60 rounded-lg px-3 py-2 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 resize-none";
