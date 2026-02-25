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

    // Find the component function name
    const fnMatch = jsxCode.match(/function\s+(\w+)\s*\(/);
    const fnName = fnMatch?.[1] ?? "GeneratedUI";

    // Destructure Recharts, React hooks, and EnsoUI so generated code can use names directly
    const preamble = [
      "const { useState, useEffect, useMemo, useCallback, useRef, Fragment } = React;",
      "const { BarChart, LineChart, PieChart, AreaChart, RadarChart, Bar, Line, Pie, Area, Radar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ComposedChart, Scatter, RadialBarChart, RadialBar, Treemap, Funnel, FunnelChart } = Recharts;",
      "const { Tabs, Button, Badge, Card: UICard, Select, Input, Switch, Slider, Progress, Accordion, Dialog, DataTable, Stat, Separator, EmptyState } = EnsoUI;",
    ].join("\n");

    const wrappedCode = `${preamble}\n${code}\nreturn ${fnName};`;

    // Execute in controlled scope — no DOM, no network, no globals
    const factory = new Function("React", "Recharts", "LucideReact", "EnsoUI", wrappedCode);
    const Component = factory(React, Recharts, LucideReact, EnsoUI);

    if (typeof Component !== "function") {
      return { error: "Generated code did not produce a valid component function" };
    }

    return { Component };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
