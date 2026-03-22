/**
 * EnsoUI — Pre-styled component library for Enso's sandbox.
 *
 * All components are pure React + Tailwind CSS (no external dependencies).
 * Injected into the sandbox scope as `EnsoUI`, destructured in the preamble
 * so generated templates can use them directly: <Tabs>, <DataTable>, <Badge>, etc.
 *
 * Design tokens match Enso's dark theme:
 *   bg-gray-900 (outer), bg-gray-800 (cards), border-gray-600/50, text-gray-100
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import mpegts from "mpegts.js";

/* ═══════════════════════════════════════════════════════════════════════════
   ACCENT COLORS — shared palette used across components
   ═══════════════════════════════════════════════════════════════════════════ */

type Accent = "blue" | "emerald" | "amber" | "purple" | "rose" | "cyan" | "orange" | "red" | "gray" | "violet" | "indigo" | "teal" | "pink";

const accentStyles: Record<Accent, { border: string; bg: string; text: string }> = {
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

/** Safe accent lookup — returns a valid style even for unknown accent values */
function getAccent(accent?: string): { border: string; bg: string; text: string } {
  if (!accent) return accentStyles.blue;
  return accentStyles[accent as Accent] ?? accentStyles.blue;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. CARD — Styled container with optional header, footer, accent
   ═══════════════════════════════════════════════════════════════════════════ */

function Card({
  children,
  className = "",
  accent,
  header,
  footer,
}: {
  children: React.ReactNode;
  className?: string;
  accent?: Accent;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const a = accent ? getAccent(accent) : null;
  const base = "rounded-lg border overflow-hidden";
  const colors = a
    ? `${a.bg} ${a.border} border-l-2`
    : "bg-gray-800 border-gray-600/50";

  return (
    <div className={`${base} ${colors} ${className}`}>
      {header && (
        <div className="px-2.5 py-2 border-b border-gray-700/50 flex items-center justify-between">
          {typeof header === "string" ? (
            <span className="text-sm font-semibold text-gray-100">{header}</span>
          ) : header}
        </div>
      )}
      <div className="p-2.5">{children}</div>
      {footer && (
        <div className="px-2.5 py-2 border-t border-gray-700/50">{footer}</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. SEPARATOR — Horizontal / vertical divider
   ═══════════════════════════════════════════════════════════════════════════ */

function Separator({
  orientation = "horizontal",
  className = "",
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  return orientation === "horizontal" ? (
    <div className={`border-t border-gray-700/50 my-2 ${className}`} />
  ) : (
    <div className={`border-l border-gray-700/50 mx-2 self-stretch ${className}`} />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. TABS — Multi-view navigation with render-function children
   ═══════════════════════════════════════════════════════════════════════════ */

function Tabs({
  tabs,
  value: controlledValue,
  defaultValue,
  onChange,
  onValueChange,
  children,
  variant = "pills",
  className = "",
}: {
  tabs: Array<{ value: string; label: string; icon?: React.ReactNode }>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onValueChange?: (value: string) => void;
  children: React.ReactNode | ((activeTab: string) => React.ReactNode);
  variant?: "pills" | "underline" | "boxed";
  className?: string;
}) {
  const safeTabs = Array.isArray(tabs) ? tabs : [];
  const [internalValue, setInternalValue] = useState(defaultValue ?? safeTabs[0]?.value ?? "");
  const activeTab = controlledValue ?? internalValue;
  const changeHandler = onChange ?? onValueChange;

  const handleTabClick = useCallback(
    (v: string) => {
      if (controlledValue === undefined) setInternalValue(v);
      changeHandler?.(v);
    },
    [controlledValue, changeHandler],
  );

  const tabBarStyles: Record<string, string> = {
    pills: "flex gap-1 p-0.5 bg-gray-800/60 rounded-lg border border-gray-700/50",
    underline: "flex gap-0 border-b border-gray-700/50",
    boxed: "flex gap-0 bg-gray-800 rounded-t-lg border border-b-0 border-gray-700/50 overflow-hidden",
  };

  const getTabStyle = (isActive: boolean) => {
    if (variant === "pills") {
      return isActive
        ? "bg-gray-700 text-gray-100 shadow-sm"
        : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 active:bg-gray-700/60 active:scale-[0.97]";
    }
    if (variant === "underline") {
      return isActive
        ? "text-violet-400 border-b-2 border-violet-400 -mb-px"
        : "text-gray-400 hover:text-gray-200 border-b-2 border-transparent -mb-px active:text-gray-100 active:scale-[0.97]";
    }
    // boxed
    return isActive
      ? "bg-gray-700 text-gray-100 border-b-2 border-violet-400"
      : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/40 border-b-2 border-transparent active:bg-gray-700/60 active:scale-[0.97]";
  };

  return (
    <div className={className}>
      <div className={tabBarStyles[variant] ?? tabBarStyles.pills}>
        {safeTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabClick(tab.value)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 cursor-pointer ${getTabStyle(activeTab === tab.value)}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-2.5">
        {typeof children === "function" ? children(activeTab) : children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. BUTTON — Consistent button with variants
   ═══════════════════════════════════════════════════════════════════════════ */

function Button({
  children,
  onClick,
  variant = "default",
  size = "sm",
  icon,
  disabled = false,
  loading = false,
  className = "",
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    default: "bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600 active:bg-gray-500",
    primary: "bg-violet-600 border-violet-500 text-white hover:bg-violet-500 active:bg-violet-400",
    ghost: "bg-transparent border-transparent text-gray-300 hover:bg-gray-700/50 hover:text-gray-100 active:bg-gray-700/70",
    danger: "bg-rose-600/15 border-rose-500/40 text-rose-400 hover:bg-rose-600/25 active:bg-rose-600/35",
    outline: "bg-transparent border-gray-600 text-gray-300 hover:bg-gray-700/50 active:bg-gray-700/70",
  };

  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1 text-xs gap-1.5",
    md: "px-3 py-1.5 text-xs gap-2",
    lg: "px-4 py-2 text-sm gap-2",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium rounded-lg border transition-all duration-150 active:scale-[0.96] active:brightness-110 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant] ?? variants.default} ${sizes[size] ?? sizes.sm} ${className}`}
    >
      {loading ? (
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. BADGE — Status indicator / tag
   ═══════════════════════════════════════════════════════════════════════════ */

function Badge({
  children,
  variant = "default",
  size = "sm",
  dot = false,
  className = "",
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "outline";
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    default: "bg-gray-700 text-gray-300 border-gray-600",
    success: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30",
    warning: "bg-amber-400/15 text-amber-400 border-amber-400/30",
    danger: "bg-rose-400/15 text-rose-400 border-rose-400/30",
    info: "bg-blue-400/15 text-blue-400 border-blue-400/30",
    outline: "bg-transparent text-gray-300 border-gray-500",
  };

  const dotColors: Record<string, string> = {
    default: "bg-gray-400",
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-rose-400",
    info: "bg-blue-400",
    outline: "bg-gray-400",
  };

  const sizeStyles = size === "md"
    ? "px-2 py-0.5 text-xs"
    : "px-1.5 py-0.5 text-[10px]";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${variants[variant] ?? variants.default} ${sizeStyles} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant] ?? dotColors.default}`} />}
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. SWITCH — Boolean on/off toggle
   ═══════════════════════════════════════════════════════════════════════════ */

function Switch({
  checked: controlledChecked,
  defaultChecked = false,
  onChange,
  label,
  size = "md",
  disabled = false,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isChecked = controlledChecked ?? internalChecked;

  const toggle = useCallback(() => {
    if (disabled) return;
    const next = !isChecked;
    if (controlledChecked === undefined) setInternalChecked(next);
    onChange?.(next);
  }, [isChecked, controlledChecked, onChange, disabled]);

  const trackSize = size === "sm" ? "w-7 h-4" : "w-9 h-5";
  const thumbSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  const thumbTranslate = isChecked
    ? (size === "sm" ? "translate-x-3" : "translate-x-4")
    : "translate-x-0.5";

  return (
    <button
      role="switch"
      aria-checked={isChecked}
      onClick={toggle}
      disabled={disabled}
      className={`inline-flex items-center gap-2 cursor-pointer active:scale-[0.97] transition-transform duration-150 disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span
        className={`relative inline-flex shrink-0 rounded-full transition-colors duration-200 ${trackSize} ${isChecked ? "bg-violet-600" : "bg-gray-600"}`}
      >
        <span
          className={`inline-block rounded-full bg-white shadow-sm transition-transform duration-200 mt-[3px] ${thumbSize} ${thumbTranslate}`}
        />
      </span>
      {label && <span className="text-xs text-gray-300">{label}</span>}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. SELECT — Styled native <select>
   ═══════════════════════════════════════════════════════════════════════════ */

function Select({
  options,
  value: controlledValue,
  defaultValue,
  onChange,
  placeholder = "Select...",
  size = "sm",
  className = "",
}: {
  options: Array<{ value: string; label: string }>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = controlledValue ?? internalValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      if (controlledValue === undefined) setInternalValue(v);
      onChange?.(v);
    },
    [controlledValue, onChange],
  );

  const sizeStyles = size === "md" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-xs";

  return (
    <div className={`relative inline-flex ${className}`}>
      <select
        value={currentValue}
        onChange={handleChange}
        className={`appearance-none bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 pr-7 cursor-pointer focus:outline-none focus:border-violet-500/50 transition-colors ${sizeStyles}`}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <svg
        className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. INPUT — Styled text input
   ═══════════════════════════════════════════════════════════════════════════ */

function Input({
  value: controlledValue,
  defaultValue,
  onChange,
  onKeyDown,
  placeholder = "",
  type = "text",
  icon,
  size = "sm",
  disabled = false,
  className = "",
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: "text" | "number" | "search" | "email" | "url";
  icon?: React.ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = controlledValue ?? internalValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (controlledValue === undefined) setInternalValue(v);
      onChange?.(v);
    },
    [controlledValue, onChange],
  );

  const sizeStyles = size === "md" ? "py-1.5 text-xs" : "py-1 text-xs";

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      {icon && (
        <span className="absolute left-2 text-gray-400 pointer-events-none">{icon}</span>
      )}
      <input
        type={type}
        value={currentValue}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={`bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 placeholder-gray-500 w-full focus:outline-none focus:border-violet-500/50 transition-colors disabled:opacity-50 ${sizeStyles} ${icon ? "pl-7 pr-2.5" : "px-2.5"}`}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. SLIDER — Range input
   ═══════════════════════════════════════════════════════════════════════════ */

function Slider({
  value: controlledValue,
  defaultValue = 50,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  showValue = false,
}: {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  showValue?: boolean;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = controlledValue ?? internalValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (controlledValue === undefined) setInternalValue(v);
      onChange?.(v);
    },
    [controlledValue, onChange],
  );

  return (
    <div className="flex items-center gap-2.5">
      {label && <span className="text-xs text-gray-400 shrink-0">{label}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        onChange={handleChange}
        className="flex-1 h-1.5 rounded-full appearance-none bg-gray-700 cursor-pointer accent-violet-500 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md"
      />
      {showValue && (
        <span className="text-xs text-gray-300 font-medium tabular-nums min-w-[2.5rem] text-right">
          {currentValue}
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   10. PROGRESS — Completion / loading bar
   ═══════════════════════════════════════════════════════════════════════════ */

function Progress({
  value,
  max = 100,
  variant = "default",
  size = "md",
  showLabel = false,
  label,
  className = "",
}: {
  value: number;
  max?: number;
  variant?: "default" | "success" | "warning" | "danger";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  const barColors: Record<string, string> = {
    default: "bg-violet-500",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
  };

  const heights: Record<string, string> = {
    sm: "h-1",
    md: "h-1.5",
    lg: "h-2.5",
  };

  return (
    <div className={`w-full ${className}`}>
      {(label || showLabel) && (
        <div className="flex items-center justify-between mb-1">
          {label && <span className="text-xs text-gray-400">{label}</span>}
          {showLabel && <span className="text-xs text-gray-300 tabular-nums">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className={`w-full bg-gray-700 rounded-full overflow-hidden ${heights[size] ?? heights.md}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${barColors[variant] ?? barColors.default}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   11. ACCORDION — Collapsible sections
   ═══════════════════════════════════════════════════════════════════════════ */

function Accordion({
  items,
  type = "single",
  defaultOpen,
  className = "",
}: {
  items: Array<{ value: string; title: string | React.ReactNode; content: React.ReactNode }>;
  type?: "single" | "multiple";
  defaultOpen?: string | string[];
  className?: string;
}) {
  const [openItems, setOpenItems] = useState<Set<string>>(() => {
    if (!defaultOpen) return new Set<string>();
    return new Set(Array.isArray(defaultOpen) ? defaultOpen : [defaultOpen]);
  });

  const toggleItem = useCallback(
    (value: string) => {
      setOpenItems((prev) => {
        const next = new Set(prev);
        if (next.has(value)) {
          next.delete(value);
        } else {
          if (type === "single") next.clear();
          next.add(value);
        }
        return next;
      });
    },
    [type],
  );

  return (
    <div className={`space-y-1 ${className}`}>
      {items.map((item) => {
        const isOpen = openItems.has(item.value);
        return (
          <div key={item.value} className="border border-gray-700/50 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleItem(item.value)}
              className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium text-gray-200 bg-gray-800/60 hover:bg-gray-800 active:bg-gray-700 active:scale-[0.99] transition-all duration-150 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                {typeof item.title === "string" ? item.title : item.title}
              </span>
              <svg
                className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}
            >
              <div className="px-2.5 py-2 text-xs text-gray-300">{item.content}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   12. TOOLTIP — CSS-only hover tooltip
   ═══════════════════════════════════════════════════════════════════════════ */

function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const positionStyles: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  };

  return (
    <span className="relative inline-flex group" tabIndex={0}>
      {children}
      <span
        className={`absolute z-50 px-2 py-1 text-[10px] text-gray-100 bg-gray-900 border border-gray-600 rounded-md shadow-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-active:opacity-100 transition-opacity duration-150 ${positionStyles[side] ?? positionStyles.top}`}
      >
        {content}
      </span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   13. DIALOG — In-card modal overlay (no portals)
   ═══════════════════════════════════════════════════════════════════════════ */

function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {/* Dialog box */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl">
        {/* Header */}
        {(title || description) && (
          <div className="px-4 pt-4 pb-2">
            {title && <h3 className="text-sm font-semibold text-gray-100">{title}</h3>}
            {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
          </div>
        )}
        {/* Body */}
        <div className="px-4 py-2 text-xs text-gray-300">{children}</div>
        {/* Footer */}
        {footer && (
          <div className="px-4 py-3 border-t border-gray-700/50 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   14. DATA TABLE — Sortable, paginated data table
   ═══════════════════════════════════════════════════════════════════════════ */

function DataTable({
  columns,
  data,
  pageSize = 0,
  striped = false,
  compact = false,
  onRowClick,
  className = "",
}: {
  columns: Array<{
    key: string;
    label: string;
    sortable?: boolean;
    render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  }>;
  data: Array<Record<string, unknown>>;
  pageSize?: number;
  striped?: boolean;
  compact?: boolean;
  onRowClick?: (row: Record<string, unknown>) => void;
  className?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const totalPages = pageSize > 0 ? Math.ceil(sortedData.length / pageSize) : 1;
  const pagedData = pageSize > 0
    ? sortedData.slice(page * pageSize, (page + 1) * pageSize)
    : sortedData;

  const cellPad = compact ? "px-2 py-1" : "px-2.5 py-1.5";

  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="min-w-full text-xs text-left">
        <thead>
          <tr className="border-b border-gray-700">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                className={`${cellPad} text-gray-400 font-medium whitespace-nowrap ${col.sortable ? "cursor-pointer hover:text-gray-200 active:text-gray-100 active:bg-gray-700/30 select-none transition-colors" : ""}`}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    <svg
                      className={`w-3 h-3 transition-transform ${sortDir === "desc" ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={striped ? "divide-y divide-gray-700/30" : "divide-y divide-gray-700/50"}>
          {pagedData.map((row, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`
                ${onRowClick ? "cursor-pointer hover:bg-gray-700/40 active:bg-gray-700/60 active:scale-[0.995]" : ""}
                ${striped && i % 2 === 1 ? "bg-gray-800/40" : ""}
                transition-all duration-150
              `}
            >
              {columns.map((col) => (
                <td key={col.key} className={`${cellPad} text-gray-200 whitespace-nowrap`}>
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
          {pagedData.length === 0 && (
            <tr>
              <td colSpan={columns.length} className={`${cellPad} text-gray-500 text-center`}>
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {pageSize > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-[10px] text-gray-500">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sortedData.length)} of {sortedData.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-0.5 text-[10px] rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 active:bg-gray-600/60 active:scale-[0.96] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-0.5 text-[10px] rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 active:bg-gray-600/60 active:scale-[0.96] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   15. STAT — KPI metric tile
   ═══════════════════════════════════════════════════════════════════════════ */

function Stat({
  label,
  value,
  change,
  icon,
  trend,
  accent = "blue",
}: {
  label: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  trend?: "up" | "down" | "flat";
  accent?: Accent;
}) {
  const a = getAccent(accent);
  const effectiveTrend = trend ?? (change != null ? (change >= 0 ? "up" : "down") : undefined);

  return (
    <div className={`${a.bg} border ${a.border} rounded-lg p-2.5`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
          <p className={`text-sm font-bold ${a.text} tabular-nums`}>{value}</p>
        </div>
        {icon && <span className={`${a.text} opacity-60`}>{icon}</span>}
      </div>
      {change != null && (
        <div className="mt-1.5 flex items-center gap-1">
          {effectiveTrend === "up" && (
            <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          )}
          {effectiveTrend === "down" && (
            <svg className="w-3 h-3 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
          <span className={`text-[10px] font-medium tabular-nums ${effectiveTrend === "up" ? "text-emerald-400" : effectiveTrend === "down" ? "text-rose-400" : "text-gray-400"}`}>
            {change >= 0 ? "+" : ""}{change}%
          </span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   16. EMPTY STATE — Zero-state placeholder
   ═══════════════════════════════════════════════════════════════════════════ */

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      {icon && <span className="text-gray-500 mb-2">{icon}</span>}
      <p className="text-sm font-medium text-gray-300">{title}</p>
      {description && <p className="text-xs text-gray-500 mt-1 max-w-xs">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 px-3 py-1.5 text-xs font-medium rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 active:bg-violet-500/30 active:scale-[0.96] transition-all duration-150 cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   17. VIDEO PLAYER — Smart video player with MPEG-TS transmuxing support
   ═══════════════════════════════════════════════════════════════════════════ */

function VideoPlayer({
  src,
  container,
  onError,
  className = "",
  style,
}: {
  src: string;
  container?: "mpegts" | "mp4" | "unknown";
  onError?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<mpegts.Player | null>(null);
  const [error, setError] = useState(false);
  const [useMpegts, setUseMpegts] = useState(container === "mpegts");

  // Tear down any active mpegts.js player instance
  const destroyPlayer = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.unload();
        playerRef.current.detachMediaElement();
        playerRef.current.destroy();
      } catch { /* ignore cleanup errors */ }
      playerRef.current = null;
    }
  }, []);

  // Initialize mpegts.js when useMpegts flips to true
  useEffect(() => {
    if (!useMpegts || !videoRef.current) return;
    if (!mpegts.isSupported()) {
      // MSE unavailable — nothing we can do
      setError(true);
      onError?.();
      return;
    }

    const player = mpegts.createPlayer(
      { type: "mpegts", url: src, isLive: false },
      { enableWorker: false, enableStashBuffer: true },
    );

    player.attachMediaElement(videoRef.current);
    player.load();
    playerRef.current = player;

    player.on(mpegts.Events.ERROR, () => {
      destroyPlayer();
      setError(true);
      onError?.();
    });

    return () => { destroyPlayer(); };
  }, [src, useMpegts, destroyPlayer, onError]);

  // Native <video> error → try mpegts.js as fallback
  const handleNativeError = useCallback(() => {
    if (!useMpegts && !error && mpegts.isSupported()) {
      setUseMpegts(true);
    } else {
      setError(true);
      onError?.();
    }
  }, [useMpegts, error, onError]);

  if (error) return null; // parent shows the error/System Player UI

  const defaultStyle: React.CSSProperties = {
    width: "100%",
    maxHeight: "480px",
    borderRadius: "6px",
    background: "#000",
    ...style,
  };

  return (
    <video
      ref={videoRef}
      src={useMpegts ? undefined : src}
      controls
      preload="metadata"
      onError={useMpegts ? undefined : handleNativeError}
      className={className}
      style={defaultStyle}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   18. TEXTAREA — Multi-line text input
   ═══════════════════════════════════════════════════════════════════════════ */

function Textarea({
  value: controlledValue,
  defaultValue,
  onChange,
  placeholder = "",
  rows = 4,
  maxLength,
  disabled = false,
  className = "",
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = controlledValue ?? internalValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      if (controlledValue === undefined) setInternalValue(v);
      onChange?.(v);
    },
    [controlledValue, onChange],
  );

  return (
    <div className={`relative ${className}`}>
      <textarea
        value={currentValue}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        className="w-full bg-gray-800 border border-gray-600/60 rounded-lg text-gray-200 text-xs placeholder-gray-500 px-2.5 py-2 focus:outline-none focus:border-violet-500/50 transition-colors disabled:opacity-50 resize-y min-h-[60px]"
      />
      {maxLength && (
        <span className="absolute bottom-2 right-2.5 text-[10px] text-gray-500 tabular-nums pointer-events-none">
          {currentValue.length}/{maxLength}
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   19. ALERT — Info / warning / error / success callout box
   ═══════════════════════════════════════════════════════════════════════════ */

function Alert({
  variant = "info",
  title,
  children,
  icon,
  dismissible = false,
  onDismiss,
  className = "",
}: {
  variant?: "info" | "success" | "warning" | "danger";
  title?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  const styles: Record<string, { bg: string; border: string; icon: string; text: string }> = {
    info:    { bg: "bg-blue-400/10",    border: "border-blue-400/30",    icon: "text-blue-400",    text: "text-blue-300" },
    success: { bg: "bg-emerald-400/10", border: "border-emerald-400/30", icon: "text-emerald-400", text: "text-emerald-300" },
    warning: { bg: "bg-amber-400/10",   border: "border-amber-400/30",   icon: "text-amber-400",   text: "text-amber-300" },
    danger:  { bg: "bg-rose-400/10",    border: "border-rose-400/30",    icon: "text-rose-400",    text: "text-rose-300" },
  };

  if (dismissed) return null;

  const s = styles[variant] ?? styles.info;
  const defaultIcons: Record<string, React.ReactNode> = {
    info: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
    success: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
    warning: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    danger: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  };

  return (
    <div className={`flex gap-2.5 px-3 py-2.5 rounded-lg border ${s.bg} ${s.border} ${className}`}>
      <span className={`shrink-0 mt-0.5 ${s.icon}`}>{icon ?? defaultIcons[variant]}</span>
      <div className="flex-1 min-w-0">
        {title && <p className={`text-xs font-semibold ${s.text} mb-0.5`}>{title}</p>}
        <div className="text-xs text-gray-300">{children}</div>
      </div>
      {dismissible && (
        <button
          onClick={() => { setDismissed(true); onDismiss?.(); }}
          className="shrink-0 text-gray-500 hover:text-gray-300 active:text-gray-100 active:scale-[0.9] transition-all duration-150 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   20. AVATAR — User / entity avatar with fallback initials
   ═══════════════════════════════════════════════════════════════════════════ */

function Avatar({
  src,
  name,
  size = "md",
  accent = "violet",
  className = "",
}: {
  src?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  accent?: Accent;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const a = getAccent(accent);

  const sizes: Record<string, { container: string; text: string }> = {
    sm: { container: "w-6 h-6", text: "text-[10px]" },
    md: { container: "w-8 h-8", text: "text-xs" },
    lg: { container: "w-12 h-12", text: "text-sm" },
  };

  const s = sizes[size] ?? sizes.md;

  const initials = useMemo(() => {
    if (!name) return "?";
    return name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  }, [name]);

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name ?? "avatar"}
        onError={() => setImgError(true)}
        className={`${s.container} rounded-full object-cover border border-gray-600/50 ${className}`}
      />
    );
  }

  return (
    <div className={`${s.container} rounded-full ${a.bg} border ${a.border} flex items-center justify-center ${className}`}>
      <span className={`${s.text} font-semibold ${a.text}`}>{initials}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   21. TIMELINE — Vertical event timeline
   ═══════════════════════════════════════════════════════════════════════════ */

function Timeline({
  items,
  className = "",
}: {
  items: Array<{
    title: string;
    description?: string;
    time?: string;
    icon?: React.ReactNode;
    accent?: Accent;
  }>;
  className?: string;
}) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div className={`relative ${className}`}>
      {safeItems.map((item, i) => {
        const a = getAccent(item.accent);
        const isLast = i === safeItems.length - 1;
        return (
          <div key={i} className="flex gap-3 pb-4 last:pb-0">
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full ${a.bg} border ${a.border} flex items-center justify-center shrink-0`}>
                {item.icon ?? <div className={`w-2 h-2 rounded-full ${a.text.replace("text-", "bg-")}`} />}
              </div>
              {!isLast && <div className="w-px flex-1 bg-gray-700/50 mt-1" />}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-gray-200 truncate">{item.title}</p>
                {item.time && <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">{item.time}</span>}
              </div>
              {item.description && <p className="text-[11px] text-gray-400 mt-0.5">{item.description}</p>}
            </div>
          </div>
        );
      })}
      {safeItems.length === 0 && (
        <p className="text-xs text-gray-500 text-center py-4">No events</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   22. SKELETON — Loading placeholder animations
   ═══════════════════════════════════════════════════════════════════════════ */

function Skeleton({
  variant = "text",
  width,
  height,
  count = 1,
  className = "",
}: {
  variant?: "text" | "circle" | "rect";
  width?: string;
  height?: string;
  count?: number;
  className?: string;
}) {
  const baseClass = "bg-gray-700 animate-pulse";

  const getShape = () => {
    switch (variant) {
      case "circle":
        return `${baseClass} rounded-full ${className}`;
      case "rect":
        return `${baseClass} rounded-lg ${className}`;
      default:
        return `${baseClass} rounded h-3 ${className}`;
    }
  };

  const shapeClass = getShape();

  const items = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={shapeClass}
      style={{
        width: width ?? (variant === "circle" ? "2rem" : "100%"),
        height: height ?? (variant === "circle" ? "2rem" : variant === "rect" ? "4rem" : undefined),
      }}
    />
  ));

  return count === 1 ? items[0] : <div className="space-y-2">{items}</div>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   23. DROPDOWN MENU — Action menus triggered by a button
   ═══════════════════════════════════════════════════════════════════════════ */

function DropdownMenu({
  trigger,
  items,
  align = "left",
  className = "",
}: {
  trigger: React.ReactNode;
  items: Array<{
    label: string;
    icon?: React.ReactNode;
    onClick?: () => void;
    variant?: "default" | "danger";
    disabled?: boolean;
  }>;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-flex ${className}`}>
      <span onClick={() => setOpen((v) => !v)} className="cursor-pointer">
        {trigger}
      </span>
      {open && (
        <div
          className={`absolute z-50 top-full mt-1 min-w-[160px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => { item.onClick?.(); setOpen(false); }}
              disabled={item.disabled}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                item.variant === "danger"
                  ? "text-rose-400 hover:bg-rose-400/10 active:bg-rose-400/20"
                  : "text-gray-300 hover:bg-gray-700/60 active:bg-gray-700"
              }`}
            >
              {item.icon && <span className="shrink-0 w-4 h-4 flex items-center justify-center">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   24. CHECKBOX GROUP — Multiple selection from a list
   ═══════════════════════════════════════════════════════════════════════════ */

function CheckboxGroup({
  options,
  value: controlledValue,
  defaultValue = [],
  onChange,
  label,
  orientation = "vertical",
  className = "",
}: {
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  label?: string;
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState<string[]>(defaultValue);
  const currentValue = controlledValue ?? internalValue;

  const toggle = useCallback(
    (optionValue: string) => {
      const next = currentValue.includes(optionValue)
        ? currentValue.filter((v) => v !== optionValue)
        : [...currentValue, optionValue];
      if (controlledValue === undefined) setInternalValue(next);
      onChange?.(next);
    },
    [currentValue, controlledValue, onChange],
  );

  return (
    <div className={className}>
      {label && <p className="text-xs text-gray-400 mb-1.5">{label}</p>}
      <div className={`flex gap-2 ${orientation === "vertical" ? "flex-col" : "flex-row flex-wrap"}`}>
        {options.map((opt) => {
          const checked = currentValue.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => !opt.disabled && toggle(opt.value)}
              disabled={opt.disabled}
              className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97] transition-transform duration-150"
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors duration-150 ${
                  checked
                    ? "bg-violet-600 border-violet-500"
                    : "bg-gray-800 border-gray-600 hover:border-gray-500"
                }`}
              >
                {checked && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   25. CODE BLOCK — Formatted code display with copy button
   ═══════════════════════════════════════════════════════════════════════════ */

function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  className = "",
}: {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    try {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may be unavailable in sandbox */ }
  }, [code]);

  const lines = code.split("\n");

  return (
    <div className={`relative rounded-lg border border-gray-700/50 bg-gray-900 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/50 bg-gray-800/40">
        <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{language ?? "code"}</span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-gray-400 hover:text-gray-200 active:text-gray-100 active:scale-[0.95] transition-all duration-150 cursor-pointer flex items-center gap-1"
        >
          {copied ? (
            <><svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied</>
          ) : (
            <><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</>
          )}
        </button>
      </div>
      <div className="overflow-x-auto p-3">
        <pre className="text-xs text-gray-300 font-mono leading-relaxed">
          {lines.map((line, i) => (
            <div key={i} className="flex">
              {showLineNumbers && (
                <span className="inline-block w-8 shrink-0 text-right pr-3 text-gray-600 select-none tabular-nums">
                  {i + 1}
                </span>
              )}
              <code>{line}</code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT — Single namespace object injected into sandbox
   ═══════════════════════════════════════════════════════════════════════════ */

export const EnsoUI = {
  Card,
  Separator,
  Tabs,
  Button,
  Badge,
  Switch,
  Select,
  Input,
  Slider,
  Progress,
  Accordion,
  Tooltip,
  Dialog,
  DataTable,
  Stat,
  EmptyState,
  VideoPlayer,
  Textarea,
  Alert,
  Avatar,
  Timeline,
  Skeleton,
  DropdownMenu,
  CheckboxGroup,
  CodeBlock,
};
