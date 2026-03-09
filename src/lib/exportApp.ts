/**
 * Export an Enso app card as a standalone HTML file.
 *
 * Strategy:
 * - Uses ES module imports from esm.sh CDN (React 19, ReactDOM, Recharts, Lucide)
 * - Tailwind Play CDN for styling
 * - Inlines a minimal subset of EnsoUI components as plain JS
 * - Embeds card data as a JSON literal
 * - Compiles JSX via Sucrase (CDN) at load time in the exported page
 */

import type { Card } from "../cards/types";

// ── Minimal EnsoUI source (self-contained, no imports) ──
// These are the most commonly used components, written as plain functions
// that will be available in the exported page's scope.

const ENSO_UI_SOURCE = `
const accentStyles = {
  blue:    { border: "border-blue-400",    bg: "bg-blue-400/10",    text: "text-blue-400"    },
  emerald: { border: "border-emerald-400", bg: "bg-emerald-400/10", text: "text-emerald-400" },
  amber:   { border: "border-amber-400",   bg: "bg-amber-400/10",  text: "text-amber-400"   },
  purple:  { border: "border-purple-400",  bg: "bg-purple-400/10", text: "text-purple-400"  },
  rose:    { border: "border-rose-400",    bg: "bg-rose-400/10",   text: "text-rose-400"    },
  cyan:    { border: "border-cyan-400",    bg: "bg-cyan-400/10",   text: "text-cyan-400"    },
  orange:  { border: "border-orange-400",  bg: "bg-orange-400/10", text: "text-orange-400"  },
  red:     { border: "border-red-400",     bg: "bg-red-400/10",    text: "text-red-400"     },
  gray:    { border: "border-gray-400",    bg: "bg-gray-400/10",   text: "text-gray-400"    },
  violet:  { border: "border-violet-400",  bg: "bg-violet-400/10", text: "text-violet-400"  },
  indigo:  { border: "border-indigo-400",  bg: "bg-indigo-400/10", text: "text-indigo-400"  },
  teal:    { border: "border-teal-400",    bg: "bg-teal-400/10",   text: "text-teal-400"    },
  pink:    { border: "border-pink-400",    bg: "bg-pink-400/10",   text: "text-pink-400"    },
};
function getAccent(accent) {
  if (!accent) return accentStyles.blue;
  return accentStyles[accent] || accentStyles.blue;
}

function UICard({ children, className = "", accent, header, footer }) {
  const a = accent ? getAccent(accent) : null;
  const base = "rounded-lg border overflow-hidden";
  const colors = a ? a.bg + " " + a.border + " border-l-2" : "bg-gray-800 border-gray-600/50";
  return React.createElement("div", { className: base + " " + colors + " " + className },
    header && React.createElement("div", { className: "px-2.5 py-2 border-b border-gray-700/50 flex items-center justify-between" },
      typeof header === "string" ? React.createElement("span", { className: "text-sm font-semibold text-gray-100" }, header) : header),
    React.createElement("div", { className: "p-2.5" }, children),
    footer && React.createElement("div", { className: "px-2.5 py-2 border-t border-gray-700/50" }, footer)
  );
}

function Separator({ orientation = "horizontal", className = "" }) {
  return orientation === "horizontal"
    ? React.createElement("div", { className: "border-t border-gray-700/50 my-2 " + className })
    : React.createElement("div", { className: "border-l border-gray-700/50 mx-2 self-stretch " + className });
}

function Tabs({ tabs, value: controlledValue, defaultValue, onChange, children, variant = "pills", className = "" }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || (tabs[0] && tabs[0].value) || "");
  const activeTab = controlledValue !== undefined ? controlledValue : internalValue;
  const handleTabClick = (v) => { if (controlledValue === undefined) setInternalValue(v); onChange && onChange(v); };
  const tabBarStyles = {
    pills: "flex gap-1 p-0.5 bg-gray-800/60 rounded-lg border border-gray-700/50",
    underline: "flex gap-0 border-b border-gray-700/50",
    boxed: "flex gap-0 bg-gray-800 rounded-t-lg border border-b-0 border-gray-700/50 overflow-hidden",
  };
  const getTabStyle = (isActive) => {
    if (variant === "pills") return isActive ? "bg-gray-700 text-gray-100 shadow-sm" : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/40";
    if (variant === "underline") return isActive ? "text-violet-400 border-b-2 border-violet-400 -mb-px" : "text-gray-400 hover:text-gray-200 border-b-2 border-transparent -mb-px";
    return isActive ? "bg-gray-700 text-gray-100 border-b-2 border-violet-400" : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 border-b-2 border-transparent";
  };
  return React.createElement("div", { className },
    React.createElement("div", { className: tabBarStyles[variant] || tabBarStyles.pills },
      tabs.map((tab) => React.createElement("button", {
        key: tab.value,
        onClick: () => handleTabClick(tab.value),
        className: "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer " + getTabStyle(activeTab === tab.value)
      }, tab.icon, tab.label))
    ),
    React.createElement("div", { className: "mt-2.5" }, typeof children === "function" ? children(activeTab) : children)
  );
}

function Button({ children, onClick, variant = "default", size = "sm", icon, disabled = false, loading = false, className = "" }) {
  const variants = {
    default: "bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600",
    primary: "bg-violet-600 border-violet-500 text-white hover:bg-violet-500",
    ghost: "bg-transparent border-transparent text-gray-300 hover:bg-gray-700/50 hover:text-gray-100",
    danger: "bg-rose-600/15 border-rose-500/40 text-rose-400 hover:bg-rose-600/25",
    outline: "bg-transparent border-gray-600 text-gray-300 hover:bg-gray-700/50",
  };
  const sizes = { sm: "px-2.5 py-1 text-xs gap-1.5", md: "px-3 py-1.5 text-xs gap-2", lg: "px-4 py-2 text-sm gap-2" };
  return React.createElement("button", {
    onClick, disabled: disabled || loading,
    className: "inline-flex items-center justify-center font-medium rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed " + (variants[variant] || variants.default) + " " + (sizes[size] || sizes.sm) + " " + className,
  }, loading ? React.createElement("svg", { className: "animate-spin h-3 w-3", viewBox: "0 0 24 24", fill: "none" },
    React.createElement("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
    React.createElement("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })
  ) : icon ? React.createElement("span", { className: "shrink-0" }, icon) : null, children);
}

function Badge({ children, variant = "default", size = "sm", dot = false, className = "" }) {
  const variants = {
    default: "bg-gray-700 text-gray-300 border-gray-600",
    success: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30",
    warning: "bg-amber-400/15 text-amber-400 border-amber-400/30",
    danger: "bg-rose-400/15 text-rose-400 border-rose-400/30",
    info: "bg-blue-400/15 text-blue-400 border-blue-400/30",
    outline: "bg-transparent text-gray-300 border-gray-500",
  };
  const dotColors = { default: "bg-gray-400", success: "bg-emerald-400", warning: "bg-amber-400", danger: "bg-rose-400", info: "bg-blue-400", outline: "bg-gray-400" };
  const sizeStyles = size === "md" ? "px-2 py-0.5 text-xs" : "px-1.5 py-0.5 text-[10px]";
  return React.createElement("span", {
    className: "inline-flex items-center gap-1 rounded-full border font-medium " + (variants[variant] || variants.default) + " " + sizeStyles + " " + className,
  }, dot && React.createElement("span", { className: "w-1.5 h-1.5 rounded-full " + (dotColors[variant] || dotColors.default) }), children);
}

function Stat({ label, value, change, icon, trend, accent = "blue" }) {
  const a = getAccent(accent);
  const effectiveTrend = trend || (change != null ? (change >= 0 ? "up" : "down") : undefined);
  return React.createElement("div", { className: a.bg + " border " + a.border + " rounded-lg p-2.5" },
    React.createElement("div", { className: "flex items-start justify-between" },
      React.createElement("div", { className: "space-y-1" },
        React.createElement("p", { className: "text-[10px] text-gray-400 uppercase tracking-wider font-medium" }, label),
        React.createElement("p", { className: "text-sm font-bold " + a.text + " tabular-nums" }, value)
      ),
      icon && React.createElement("span", { className: a.text + " opacity-60" }, icon)
    ),
    change != null && React.createElement("div", { className: "mt-1.5 flex items-center gap-1" },
      React.createElement("span", { className: "text-[10px] font-medium tabular-nums " + (effectiveTrend === "up" ? "text-emerald-400" : effectiveTrend === "down" ? "text-rose-400" : "text-gray-400") },
        (change >= 0 ? "+" : "") + change + "%"
      )
    )
  );
}

function DataTable({ columns, data, pageSize = 0, striped = false, compact = false, onRowClick, className = "" }) {
  const [sortKey, setSortKey] = React.useState(null);
  const [sortDir, setSortDir] = React.useState("asc");
  const [page, setPage] = React.useState(0);
  const handleSort = (key) => { setSortKey((prev) => { if (prev === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return key; } setSortDir("asc"); return key; }); };
  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey], bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);
  const totalPages = pageSize > 0 ? Math.ceil(sortedData.length / pageSize) : 1;
  const pagedData = pageSize > 0 ? sortedData.slice(page * pageSize, (page + 1) * pageSize) : sortedData;
  const cellPad = compact ? "px-2 py-1" : "px-2.5 py-1.5";
  return React.createElement("div", { className: "w-full overflow-x-auto " + className },
    React.createElement("table", { className: "w-full text-xs text-left" },
      React.createElement("thead", null,
        React.createElement("tr", { className: "border-b border-gray-700" },
          columns.map((col) => React.createElement("th", {
            key: col.key,
            onClick: col.sortable ? () => handleSort(col.key) : undefined,
            className: cellPad + " text-gray-400 font-medium whitespace-nowrap " + (col.sortable ? "cursor-pointer hover:text-gray-200 select-none" : ""),
          }, col.label))
        )
      ),
      React.createElement("tbody", { className: striped ? "divide-y divide-gray-700/30" : "divide-y divide-gray-700/50" },
        pagedData.map((row, i) => React.createElement("tr", {
          key: i,
          onClick: onRowClick ? () => onRowClick(row) : undefined,
          className: (onRowClick ? "cursor-pointer hover:bg-gray-700/40 " : "") + (striped && i % 2 === 1 ? "bg-gray-800/40 " : "") + "transition-colors",
        }, columns.map((col) => React.createElement("td", { key: col.key, className: cellPad + " text-gray-200 whitespace-nowrap" },
          col.render ? col.render(row[col.key], row) : String(row[col.key] != null ? row[col.key] : "")
        )))),
        pagedData.length === 0 && React.createElement("tr", null,
          React.createElement("td", { colSpan: columns.length, className: cellPad + " text-gray-500 text-center" }, "No data"))
      )
    ),
    pageSize > 0 && totalPages > 1 && React.createElement("div", { className: "flex items-center justify-between mt-2 px-1" },
      React.createElement("span", { className: "text-[10px] text-gray-500" }, (page * pageSize + 1) + "–" + Math.min((page + 1) * pageSize, sortedData.length) + " of " + sortedData.length),
      React.createElement("div", { className: "flex gap-1" },
        React.createElement("button", { onClick: () => setPage((p) => Math.max(0, p - 1)), disabled: page === 0, className: "px-2 py-0.5 text-[10px] rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer" }, "Prev"),
        React.createElement("button", { onClick: () => setPage((p) => Math.min(totalPages - 1, p + 1)), disabled: page >= totalPages - 1, className: "px-2 py-0.5 text-[10px] rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer" }, "Next")
      )
    )
  );
}

function Progress({ value, max = 100, variant = "default", size = "md", showLabel = false, label, className = "" }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const barColors = { default: "bg-violet-500", success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-rose-500" };
  const heights = { sm: "h-1", md: "h-1.5", lg: "h-2.5" };
  return React.createElement("div", { className: "w-full " + className },
    (label || showLabel) && React.createElement("div", { className: "flex items-center justify-between mb-1" },
      label && React.createElement("span", { className: "text-xs text-gray-400" }, label),
      showLabel && React.createElement("span", { className: "text-xs text-gray-300 tabular-nums" }, Math.round(pct) + "%")),
    React.createElement("div", { className: "w-full bg-gray-700 rounded-full overflow-hidden " + (heights[size] || heights.md) },
      React.createElement("div", { className: "h-full rounded-full transition-all duration-500 ease-out " + (barColors[variant] || barColors.default), style: { width: pct + "%" } })
    )
  );
}

function Accordion({ items, type = "single", defaultOpen, className = "" }) {
  const [openItems, setOpenItems] = React.useState(() => {
    if (!defaultOpen) return new Set();
    return new Set(Array.isArray(defaultOpen) ? defaultOpen : [defaultOpen]);
  });
  const toggleItem = (value) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(value)) { next.delete(value); } else { if (type === "single") next.clear(); next.add(value); }
      return next;
    });
  };
  return React.createElement("div", { className: "space-y-1 " + className },
    items.map((item) => {
      const isOpen = openItems.has(item.value);
      return React.createElement("div", { key: item.value, className: "border border-gray-700/50 rounded-lg overflow-hidden" },
        React.createElement("button", {
          onClick: () => toggleItem(item.value),
          className: "w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium text-gray-200 bg-gray-800/60 hover:bg-gray-800 transition-colors cursor-pointer"
        }, React.createElement("span", null, typeof item.title === "string" ? item.title : item.title),
          React.createElement("span", { className: "text-gray-400 text-xs" }, isOpen ? "▲" : "▼")),
        React.createElement("div", { className: "overflow-hidden transition-all duration-200 " + (isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0") },
          React.createElement("div", { className: "px-2.5 py-2 text-xs text-gray-300" }, item.content))
      );
    })
  );
}

function Select({ options, value: controlledValue, defaultValue, onChange, placeholder = "Select...", size = "sm", className = "" }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  const currentValue = controlledValue !== undefined ? controlledValue : internalValue;
  const handleChange = (e) => { const v = e.target.value; if (controlledValue === undefined) setInternalValue(v); onChange && onChange(v); };
  const sizeStyles = size === "md" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-xs";
  return React.createElement("div", { className: "relative inline-flex " + className },
    React.createElement("select", { value: currentValue, onChange: handleChange, className: "appearance-none bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 pr-7 cursor-pointer focus:outline-none focus:border-violet-500/50 transition-colors " + sizeStyles },
      placeholder && React.createElement("option", { value: "", disabled: true }, placeholder),
      options.map((opt) => React.createElement("option", { key: opt.value, value: opt.value }, opt.label))
    )
  );
}

function Input({ value: controlledValue, defaultValue, onChange, onKeyDown, placeholder = "", type = "text", icon, size = "sm", disabled = false, className = "" }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  const currentValue = controlledValue !== undefined ? controlledValue : internalValue;
  const handleChange = (e) => { const v = e.target.value; if (controlledValue === undefined) setInternalValue(v); onChange && onChange(v); };
  const sizeStyles = size === "md" ? "py-1.5 text-xs" : "py-1 text-xs";
  return React.createElement("div", { className: "relative inline-flex items-center " + className },
    React.createElement("input", {
      type, value: currentValue, onChange: handleChange, onKeyDown, placeholder, disabled,
      className: "bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 w-full focus:outline-none focus:border-violet-500/50 transition-colors disabled:opacity-50 " + sizeStyles + " px-2.5"
    })
  );
}

function Switch({ checked: controlledChecked, defaultChecked = false, onChange, label, size = "md", disabled = false }) {
  const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
  const isChecked = controlledChecked !== undefined ? controlledChecked : internalChecked;
  const toggle = () => { if (disabled) return; const next = !isChecked; if (controlledChecked === undefined) setInternalChecked(next); onChange && onChange(next); };
  const trackSize = size === "sm" ? "w-7 h-4" : "w-9 h-5";
  const thumbSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  const thumbTranslate = isChecked ? (size === "sm" ? "translate-x-3" : "translate-x-4") : "translate-x-0.5";
  return React.createElement("button", { role: "switch", "aria-checked": isChecked, onClick: toggle, disabled, className: "inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" },
    React.createElement("span", { className: "relative inline-flex shrink-0 rounded-full transition-colors duration-200 " + trackSize + " " + (isChecked ? "bg-violet-600" : "bg-gray-600") },
      React.createElement("span", { className: "inline-block rounded-full bg-white shadow-sm transition-transform duration-200 mt-[3px] " + thumbSize + " " + thumbTranslate })),
    label && React.createElement("span", { className: "text-xs text-gray-300" }, label)
  );
}

function Slider({ value: controlledValue, defaultValue = 50, onChange, min = 0, max = 100, step = 1, label, showValue = false }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = controlledValue !== undefined ? controlledValue : internalValue;
  const handleChange = (e) => { const v = Number(e.target.value); if (controlledValue === undefined) setInternalValue(v); onChange && onChange(v); };
  return React.createElement("div", { className: "flex items-center gap-2.5" },
    label && React.createElement("span", { className: "text-xs text-gray-400 shrink-0" }, label),
    React.createElement("input", { type: "range", min, max, step, value: currentValue, onChange: handleChange, className: "flex-1 h-1.5 rounded-full appearance-none bg-gray-700 cursor-pointer accent-violet-500" }),
    showValue && React.createElement("span", { className: "text-xs text-gray-300 font-medium tabular-nums min-w-[2.5rem] text-right" }, currentValue)
  );
}

function Dialog({ open, onClose, title, description, children, footer }) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return React.createElement("div", { className: "fixed inset-0 z-[100] flex items-center justify-center" },
    React.createElement("div", { className: "absolute inset-0 bg-black/60 backdrop-blur-sm", onClick: onClose }),
    React.createElement("div", { className: "relative z-10 w-full max-w-md mx-4 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl" },
      (title || description) && React.createElement("div", { className: "px-4 pt-4 pb-2" },
        title && React.createElement("h3", { className: "text-sm font-semibold text-gray-100" }, title),
        description && React.createElement("p", { className: "text-xs text-gray-400 mt-0.5" }, description)),
      React.createElement("div", { className: "px-4 py-2 text-xs text-gray-300" }, children),
      footer && React.createElement("div", { className: "px-4 py-3 border-t border-gray-700/50 flex items-center justify-end gap-2" }, footer)
    )
  );
}

function EmptyState({ icon, title, description, action }) {
  return React.createElement("div", { className: "flex flex-col items-center justify-center py-8 text-center" },
    icon && React.createElement("span", { className: "text-gray-500 mb-2" }, icon),
    React.createElement("p", { className: "text-sm font-medium text-gray-300" }, title),
    description && React.createElement("p", { className: "text-xs text-gray-500 mt-1 max-w-xs" }, description),
    action && React.createElement("button", { onClick: action.onClick, className: "mt-3 px-3 py-1.5 text-xs font-medium rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors cursor-pointer" }, action.label)
  );
}

const EnsoUI = { Card: UICard, Separator, Tabs, Button, Badge, Switch, Select, Input, Slider, Progress, Accordion, Tooltip: function(p) { return React.createElement("span", { title: p.content }, p.children); }, Dialog, DataTable, Stat, EmptyState };
`;

// ── Shared helpers embedded in both modes ──

const COMPILE_HELPER = `
    const PREAMBLE = [
      "const { useState, useEffect, useMemo, useCallback, useRef, Fragment } = React;",
      "const { BarChart, LineChart, PieChart, AreaChart, RadarChart, Bar, Line, Pie, Area, Radar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ComposedChart, Scatter, RadialBarChart, RadialBar, Treemap, Funnel, FunnelChart } = Recharts;",
      "const { Tabs, Button, Badge, Card: UICard, Select, Input, Switch, Slider, Progress, Accordion, Dialog, DataTable, Stat, Separator, EmptyState } = EnsoUI;",
    ].join("\\n");

    function compileJsx(src) {
      const transformed = transform(src, {
        transforms: ["jsx", "typescript"],
        jsxRuntime: "classic",
        jsxPragma: "React.createElement",
        jsxFragmentPragma: "React.Fragment",
      }).code;
      const code = transformed
        .replace(/export\\s+default\\s+function\\s+(\\w+)/g, "function $1")
        .replace(/export\\s+default\\s+/, "");
      const fnMatch = src.match(/function\\s+(\\w+)\\s*\\(/);
      const fnName = fnMatch ? fnMatch[1] : "GeneratedUI";
      const wrappedCode = PREAMBLE + "\\n" + code + "\\nreturn " + fnName + ";";
      const factory = new Function("React", "Recharts", "LucideReact", "EnsoUI", wrappedCode);
      return factory(React, Recharts, LucideReact, EnsoUI);
    }
`;

// ── Live mode: reactive App with embedded WS client ──

function buildLiveScript(params: {
  escapedData: string;
  escapedJsx: string;
  wsUrl: string;
  cardId: string;
  serverUrl: string;
  serverToken: string;
  toolMeta: string;
}): string {
  const { escapedData, escapedJsx, wsUrl, cardId, serverUrl, serverToken, toolMeta } = params;
  return `
    // ── Config ──
    const WS_URL = ${JSON.stringify(wsUrl)};
    const CARD_ID = ${JSON.stringify(cardId)};
    const SERVER_URL = ${JSON.stringify(serverUrl)};
    const SERVER_TOKEN = ${JSON.stringify(serverToken)};
    const TOOL_META = ${toolMeta};
    const INITIAL_DATA = ${escapedData};
    const INITIAL_JSX = ${escapedJsx};

    // ── Media URL resolver ──
    var SERVER_PATH_PREFIXES = ["/media/", "/demo/"];
    function resolveMedia(obj) {
      if (typeof obj === "string") {
        if (SERVER_PATH_PREFIXES.some(function(p) { return obj.startsWith(p); })) {
          const sep = obj.includes("?") ? "&" : "?";
          return SERVER_URL + obj + (SERVER_TOKEN ? sep + "token=" + encodeURIComponent(SERVER_TOKEN) : "");
        }
        return obj;
      }
      if (Array.isArray(obj)) return obj.map(resolveMedia);
      if (obj && typeof obj === "object") {
        const result = {};
        for (const [k, v] of Object.entries(obj)) result[k] = resolveMedia(v);
        return result;
      }
      return obj;
    }

    ${COMPILE_HELPER}

    const { useState, useEffect, useRef } = React;
    const noop = function() {};

    function EnsoApp() {
      const [data, setData] = useState(resolveMedia(INITIAL_DATA));
      const [Component, setComponent] = useState(() => compileJsx(INITIAL_JSX));
      const [connected, setConnected] = useState(false);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      const wsRef = useRef(null);

      useEffect(() => {
        let reconnectDelay = 1000;
        let dead = false;
        function connect() {
          if (dead) return;
          const ws = new WebSocket(WS_URL);
          ws.onopen = () => { setConnected(true); reconnectDelay = 1000; };
          ws.onclose = () => {
            setConnected(false);
            if (!dead) setTimeout(connect, reconnectDelay);
            reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          };
          ws.onerror = () => {};
          ws.onmessage = (e) => {
            try {
              const msg = JSON.parse(e.data);
              if (msg.targetCardId !== CARD_ID && msg.cardId !== CARD_ID) return;
              if (msg.state === "error") { setError(msg.text || "Action failed"); setLoading(false); return; }
              if (msg.data != null) setData(resolveMedia(msg.data));
              if (msg.generatedUI != null) {
                try { setComponent(() => compileJsx(msg.generatedUI)); } catch (ce) { console.error("Recompile failed:", ce); }
              }
              if (msg.state === "final") { setLoading(false); setError(null); }
            } catch {}
          };
          wsRef.current = ws;
        }
        connect();
        return () => { dead = true; wsRef.current?.close(); };
      }, []);

      const onAction = (action, payload) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          setError("Not connected to server"); return;
        }
        setLoading(true); setError(null);
        wsRef.current.send(JSON.stringify({
          type: "card.action", cardId: CARD_ID, cardAction: action,
          cardPayload: payload, mode: "full",
          ...(TOOL_META ? { routing: { mode: "direct_tool", toolId: TOOL_META.toolId } } : {})
        }));
      };

      return React.createElement("div", { className: "max-w-5xl mx-auto p-4 relative" },
        // Connection indicator
        React.createElement("div", {
          className: "fixed top-3 right-3 z-50 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border " +
            (connected
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-rose-500/30 bg-rose-500/10 text-rose-400")
        },
          React.createElement("span", { className: "w-1.5 h-1.5 rounded-full " + (connected ? "bg-emerald-400" : "bg-rose-400") }),
          connected ? "Live" : "Disconnected"
        ),
        // Loading overlay
        loading && React.createElement("div", {
          className: "fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
        },
          React.createElement("div", { className: "px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-xs text-gray-300 flex items-center gap-2" },
            React.createElement("svg", { className: "animate-spin h-3 w-3", viewBox: "0 0 24 24", fill: "none" },
              React.createElement("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
              React.createElement("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })
            ),
            "Processing…"
          )
        ),
        // Error banner
        error && React.createElement("div", {
          className: "mb-3 px-3 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs text-rose-400 flex items-center justify-between"
        },
          React.createElement("span", null, error),
          React.createElement("button", {
            onClick: () => setError(null),
            className: "ml-2 text-rose-300 hover:text-rose-100 cursor-pointer"
          }, "\\u2715")
        ),
        // The actual app
        React.createElement(Component, { data: data, sendMessage: noop, onAction: onAction, theme: "dark" })
      );
    }

    try {
      const root = createRoot(document.getElementById("root"));
      root.render(React.createElement(EnsoApp));
    } catch (err) {
      document.getElementById("root").innerHTML =
        '<div style="padding:2rem;color:#fca5a5;font-family:monospace">' +
        '<h2>Failed to render exported app</h2>' +
        '<pre>' + (err.message || err) + '<\\/pre></div>';
    }
`;
}

// ── Offline mode: static snapshot (original behavior) ──

function buildOfflineScript(escapedData: string, escapedJsx: string): string {
  return `
    const DATA = ${escapedData};
    const jsxSource = ${escapedJsx};

    ${COMPILE_HELPER}

    try {
      const Component = compileJsx(jsxSource);
      const noop = function() {};
      const root = createRoot(document.getElementById("root"));
      root.render(
        React.createElement("div", { className: "max-w-5xl mx-auto p-4" },
          React.createElement(Component, { data: DATA, sendMessage: noop, onAction: noop, theme: "dark" })
        )
      );
    } catch (err) {
      document.getElementById("root").innerHTML =
        '<div style="padding:2rem;color:#fca5a5;font-family:monospace">' +
        '<h2>Failed to render exported app</h2>' +
        '<pre>' + (err.message || err) + '<\\/pre></div>';
    }
`;
}

// ── HTML shell ──

interface ServerConfig {
  serverUrl: string;
  token: string;
}

function generateHtml(card: Card, mode: "live" | "offline", serverConfig?: ServerConfig): string {
  const jsxSource = card.appGeneratedUI ?? card.generatedUI ?? "";
  const cardData = card.appData ?? card.data ?? {};
  const family = card.appCardMode?.toolFamily ?? card.cardMode?.toolFamily ?? "app";
  const title = `Enso — ${family.replace(/_/g, " ")}`;

  const escapedJsx = JSON.stringify(jsxSource);
  const escapedData = JSON.stringify(cardData);

  let scriptBody: string;
  if (mode === "live" && serverConfig) {
    const wsProto = serverConfig.serverUrl.startsWith("https") ? "wss:" : "ws:";
    const urlObj = new URL(serverConfig.serverUrl);
    const wsUrl = `${wsProto}//${urlObj.host}/ws${serverConfig.token ? `?token=${encodeURIComponent(serverConfig.token)}` : ""}`;

    const toolMeta = card.toolMeta ? JSON.stringify(card.toolMeta) : "null";

    scriptBody = buildLiveScript({
      escapedData,
      escapedJsx,
      wsUrl,
      cardId: card.id,
      serverUrl: serverConfig.serverUrl,
      serverToken: serverConfig.token,
      toolMeta,
    });
  } else {
    scriptBody = buildOfflineScript(escapedData, escapedJsx);
  }

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: { extend: {} },
    };
  <\/script>
  <style>
    body { background: #030712; color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    @keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
    .animate-shimmer { animation: shimmer 2s infinite; }
  </style>
</head>
<body class="bg-gray-950 min-h-screen">
  <div id="root"></div>

  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@19",
      "react-dom/client": "https://esm.sh/react-dom@19/client",
      "recharts": "https://esm.sh/recharts@2",
      "lucide-react": "https://esm.sh/lucide-react@0.400",
      "sucrase": "https://esm.sh/sucrase@3"
    }
  }
  <\/script>

  <script type="module">
    import React from "react";
    import { createRoot } from "react-dom/client";
    import * as Recharts from "recharts";
    import * as LucideReact from "lucide-react";
    import { transform } from "sucrase";

    // EnsoUI components
    ${ENSO_UI_SOURCE}

    ${scriptBody}
  <\/script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Export a card as a standalone HTML file and trigger download. */
export async function exportCardAsHtml(
  card: Card,
  mode: "live" | "offline" = "offline",
  serverConfig?: ServerConfig,
): Promise<void> {
  const html = generateHtml(card, mode, serverConfig);
  const family = card.appCardMode?.toolFamily ?? card.cardMode?.toolFamily ?? "app";
  const prefix = mode === "live" ? "enso-live" : "enso";
  const filename = `${prefix}-${family.replace(/_/g, "-")}-${Date.now()}.html`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
