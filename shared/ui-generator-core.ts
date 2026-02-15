import type { UIGeneratorContext, UIGeneratorResult, UIGeneratorDeps } from "./types.js";

/**
 * Recursively builds a deterministic shape string from data structure.
 * Captures field names + types but not values.
 */
export function computeDataShape(data: unknown): string {
  if (data === null || data === undefined) return "null";
  if (Array.isArray(data)) {
    if (data.length === 0) return "[]";
    return `[${computeDataShape(data[0])}]`;
  }
  if (typeof data === "object") {
    const keys = Object.keys(data as Record<string, unknown>).sort();
    const fields = keys.map(
      (k) => `${k}:${computeDataShape((data as Record<string, unknown>)[k])}`
    );
    return `{${fields.join(",")}}`;
  }
  return typeof data;
}

/**
 * djb2 hash → compact cache key like `shape_2f8a1b`
 */
export function hashShape(shape: string): string {
  let hash = 5381;
  for (let i = 0; i < shape.length; i++) {
    hash = ((hash << 5) + hash + shape.charCodeAt(i)) >>> 0;
  }
  return `shape_${hash.toString(16)}`;
}

const SYSTEM_PROMPT = `You are a React component generator. Output ONLY valid JSX code for a single React component.

Rules:
- Export a single default function component: export default function GeneratedUI({ data, sendMessage, theme })
- Use Tailwind CSS classes for styling (dark theme: bg-gray-800, text-gray-100, etc.)
- You may use Recharts components: BarChart, LineChart, PieChart, Bar, Line, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, Area, AreaChart
- You may use Lucide React icons: import them from the provided LucideReact scope (e.g., LucideReact.Sun, LucideReact.Cloud, etc.)
- sendMessage(text) sends a chat message — use it for interactive buttons
- Make the component visually appealing with proper spacing, borders, and rounded corners
- Handle missing/null data gracefully
- Output ONLY the component code, no markdown fences, no explanation
- Do NOT import React or other modules — they are provided in scope`;

/**
 * Portable UIGenerator: checks cache by shape key, on miss calls LLM, caches result.
 */
export async function generateUI(
  context: UIGeneratorContext,
  deps: UIGeneratorDeps
): Promise<UIGeneratorResult> {
  const shape = computeDataShape(context.data);
  const shapeKey = hashShape(shape);

  // Check cache
  const cached = deps.cacheGet(shapeKey);
  if (cached) {
    return { code: cached, shapeKey, cached: true };
  }

  const userPrompt = `Generate a React component to display this data:

Data shape: ${shape}
Sample data: ${JSON.stringify(context.data, null, 2)}
User's request: ${context.userMessage}
Assistant context: ${context.assistantText}

Remember: output ONLY the component code, starting with "export default function GeneratedUI"`;

  const code = await deps.callLLM(`${SYSTEM_PROMPT}\n\n${userPrompt}`);

  deps.cacheSet(shapeKey, code);
  return { code, shapeKey, cached: false };
}
