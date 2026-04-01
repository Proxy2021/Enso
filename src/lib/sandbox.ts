import React from "react";
import * as Recharts from "recharts";
import * as LucideReact from "lucide-react";
import { transform } from "sucrase";
import type { ToolRouting } from "@shared/types";
import { EnsoUI } from "./enso-ui";

interface CompileResult {
  Component: React.FC<{
    data: unknown;
    sendMessage: (text: string, routing?: ToolRouting) => void;
    onAction: (action: string, payload?: unknown) => void;
    theme: string;
  }>;
  error?: undefined;
}

interface CompileError {
  Component?: undefined;
  error: string;
}

/**
 * Scan transformed code for top-level `var`, `const`, `let`, `function`, `class` declarations
 * so we can skip them in the preamble and avoid "Identifier already declared" errors.
 */
function findDeclaredNames(code: string): Set<string> {
  const names = new Set<string>();
  // Match: var/const/let NAME, function NAME, class NAME (top-level-ish)
  const re = /\b(?:var|const|let)\s+(?:\{[^}]*\}|(\w+))|(?:function|class)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m[1]) names.add(m[1]);
    if (m[2]) names.add(m[2]);
  }
  // Also catch destructured names: var { Foo, Bar } = ...
  const destructRe = /\b(?:var|const|let)\s+\{([^}]+)\}/g;
  while ((m = destructRe.exec(code)) !== null) {
    for (const part of m[1].split(",")) {
      // Handle `Card: UICard` → UICard, or just `Badge` → Badge
      const alias = part.includes(":") ? part.split(":")[1] : part;
      const name = alias.trim();
      if (/^\w+$/.test(name)) names.add(name);
    }
  }
  return names;
}

/**
 * Wrap React so that createElement auto-stringifies plain objects
 * passed as children.  Prevents React error #31 ("Objects are not
 * valid as a React child") which is the most common template crash.
 */
function buildSafeReact(): typeof React {
  const orig = React.createElement;
  function safeChild(c: unknown): unknown {
    if (
      c !== null &&
      c !== undefined &&
      typeof c === "object" &&
      !React.isValidElement(c) &&
      !Array.isArray(c) &&
      typeof (c as Iterable<unknown>)[Symbol.iterator] !== "function"
    ) {
      try { return JSON.stringify(c); } catch { return String(c); }
    }
    return c;
  }
  const safe = Object.create(React);
  safe.createElement = function (
    type: unknown,
    props: unknown,
    ...children: unknown[]
  ) {
    return (orig as Function).call(
      React,
      type,
      props,
      ...children.map(safeChild),
    );
  };
  return safe;
}

const SafeReact = buildSafeReact();

export function compileComponent(jsxCode: string): CompileResult | CompileError {
  try {
    // Transform JSX to JS using Sucrase
    const transformed = transform(jsxCode, {
      transforms: ["jsx", "typescript"],
      jsxRuntime: "classic",
      jsxPragma: "React.createElement",
      jsxFragmentPragma: "React.Fragment",
    }).code;

    // Replace export default with assignment
    const code = transformed
      .replace(/export\s+default\s+function\s+(\w+)/g, "function $1")
      .replace(/export\s+default\s+/, "");

    // Find the component function name.
    // Prefer well-known main component names (App, Template, Dashboard, etc.),
    // then fall back to the LAST function declaration (most likely the root component),
    // then the first function as a last resort.
    const MAIN_NAMES = /function\s+(App|Template|Dashboard|Component|Main|GeneratedUI)\s*\(/;
    const mainMatch = jsxCode.match(MAIN_NAMES);
    let fnName: string;
    if (mainMatch) {
      fnName = mainMatch[1];
    } else {
      // Use the last top-level function declaration (root component is usually defined last)
      const allFns = [...jsxCode.matchAll(/function\s+(\w+)\s*\(/g)];
      fnName = allFns.length > 0 ? allFns[allFns.length - 1][1] : "GeneratedUI";
    }

    // Scan the template code for names it already declares, so we skip them in preamble
    const templateNames = findDeclaredNames(code);

    // Destructure Recharts, React hooks, and EnsoUI so generated code can use names directly
    // Dynamically destructure all Lucide icon components so templates can use <Atom />, <Monitor />, etc.
    // Lucide icons are forwardRef objects (not functions), exclude *Icon duplicates to keep it manageable
    // Exclude names already declared by Recharts/React/EnsoUI destructures to avoid "already declared" errors
    const reservedNames = new Set([
      "useState", "useEffect", "useMemo", "useCallback", "useRef", "Fragment",
      "BarChart", "LineChart", "PieChart", "AreaChart", "RadarChart", "Bar", "Line", "Pie", "Area", "Radar",
      "XAxis", "YAxis", "CartesianGrid", "Tooltip", "Legend", "ResponsiveContainer", "Cell",
      "PolarGrid", "PolarAngleAxis", "PolarRadiusAxis", "ComposedChart", "Scatter",
      "RadialBarChart", "RadialBar", "Treemap", "Funnel", "FunnelChart",
      "Tabs", "Button", "Badge", "UICard", "Select", "Input", "Switch", "Slider",
      "Progress", "Accordion", "Dialog", "DataTable", "Stat", "Separator", "EmptyState",
      "Textarea", "Alert", "Avatar", "Timeline", "Skeleton", "DropdownMenu", "CheckboxGroup", "CodeBlock",
      "Icons",
    ]);
    const lucideDestructure = Object.keys(LucideReact)
      .filter(k => /^[A-Z]/.test(k) && k !== "Icon"
        && !reservedNames.has(k)
        && !templateNames.has(k)
        && typeof (LucideReact as Record<string, { render?: unknown }>)[k]?.render === "function")
      .join(", ");

    // Build EnsoUI destructure, skipping any names the template already declares
    const ensoUINames: Array<{ source: string; local: string }> = [
      { source: "Tabs", local: "Tabs" },
      { source: "Button", local: "Button" },
      { source: "Badge", local: "Badge" },
      { source: "Card", local: "UICard" },
      { source: "Select", local: "Select" },
      { source: "Input", local: "Input" },
      { source: "Switch", local: "Switch" },
      { source: "Slider", local: "Slider" },
      { source: "Progress", local: "Progress" },
      { source: "Accordion", local: "Accordion" },
      { source: "Dialog", local: "Dialog" },
      { source: "DataTable", local: "DataTable" },
      { source: "Stat", local: "Stat" },
      { source: "Separator", local: "Separator" },
      { source: "EmptyState", local: "EmptyState" },
      { source: "Textarea", local: "Textarea" },
      { source: "Alert", local: "Alert" },
      { source: "Avatar", local: "Avatar" },
      { source: "Timeline", local: "Timeline" },
      { source: "Skeleton", local: "Skeleton" },
      { source: "DropdownMenu", local: "DropdownMenu" },
      { source: "CheckboxGroup", local: "CheckboxGroup" },
      { source: "CodeBlock", local: "CodeBlock" },
    ];
    const filteredEnsoUI = ensoUINames
      .filter(({ local }) => !templateNames.has(local))
      .map(({ source, local }) => source === local ? source : `${source}: ${local}`)
      .join(", ");

    // Similarly filter React hooks and Recharts
    const reactNames = ["useState", "useEffect", "useMemo", "useCallback", "useRef", "Fragment"];
    const filteredReact = reactNames.filter(n => !templateNames.has(n)).join(", ");

    const rechartsNames = ["BarChart", "LineChart", "PieChart", "AreaChart", "RadarChart", "Bar", "Line", "Pie", "Area", "Radar", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "Legend", "ResponsiveContainer", "Cell", "PolarGrid", "PolarAngleAxis", "PolarRadiusAxis", "ComposedChart", "Scatter", "RadialBarChart", "RadialBar", "Treemap", "Funnel", "FunnelChart", "ReferenceLine", "ReferenceArea", "ReferenceDot"];
    const filteredRecharts = rechartsNames.filter(n => !templateNames.has(n)).join(", ");

    const preamble = [
      filteredReact ? `const { ${filteredReact} } = React;` : "",
      filteredRecharts ? `const { ${filteredRecharts} } = Recharts;` : "",
      filteredEnsoUI ? `const { ${filteredEnsoUI} } = EnsoUI;` : "",
      !templateNames.has("Icons") ? "const Icons = LucideReact;" : "",
      lucideDestructure ? `const { ${lucideDestructure} } = LucideReact;` : "",
    ].filter(Boolean).join("\n");

    const wrappedCode = `${preamble}\n${code}\nreturn ${fnName};`;

    // Execute in controlled scope — no DOM, no network, no globals
    const factory = new Function("React", "Recharts", "LucideReact", "EnsoUI", wrappedCode);
    const Component = factory(SafeReact, Recharts, LucideReact, EnsoUI);

    if (typeof Component !== "function") {
      return { error: "Generated code did not produce a valid component function" };
    }

    return { Component };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
