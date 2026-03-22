/**
 * Tool Factory — validation, auto-heal, and refine utilities.
 *
 * The old Gemini-based build pipeline (handleBuildTool, generateAppProposal, etc.)
 * has been replaced by Claude Code sessions in build-via-claude.ts.
 * This module retains the functions still used by the refine flow and auto-heal.
 */

import type { ExecutorContext } from "./types.js";
import { callGeminiLLMWithRetry, GEMINI_MODEL_PRO, STRUCTURED_DATA_SYSTEM_PROMPT } from "./ui-generator.js";
import { buildExecutorContext } from "./app-persistence.js";
import { logError } from "./action-log.js";

// ── Types ──

export interface PluginToolDef {
  suffix: string;
  description: string;
  parameters: Record<string, unknown>;
  sampleParams: Record<string, unknown>;
  sampleData: Record<string, unknown>;
  requiredDataKeys: string[];
  isPrimary: boolean;
}

export interface PluginSpec {
  toolFamily: string;
  toolPrefix: string;
  description: string;
  signatureId: string;
  tools: PluginToolDef[];
}

// ── Helpers ──

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:javascript|js|jsx?|tsx?)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();
}

function ensureExportDefault(jsx: string): string {
  if (jsx.startsWith("export default function")) return jsx;
  const idx = jsx.indexOf("export default function");
  return idx > 0 ? jsx.slice(idx) : jsx;
}

// ── Validation ──

// AsyncFunction constructor: supports `await` in executor bodies
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as typeof Function;

export async function validateToolExecutor(params: {
  executeBody: string;
  sampleParams: Record<string, unknown>;
  expectedKeys: string[];
}): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const executeFn = new AsyncFunction("callId", "params", "ctx", params.executeBody) as (
      callId: string,
      params: Record<string, unknown>,
      ctx: ExecutorContext,
    ) => Promise<{ content: Array<{ type: string; text?: string }> }>;

    const ctx = buildExecutorContext("validation", "test"); // no apiKey during validation
    const result = await executeFn("test-call", params.sampleParams, ctx);
    if (!result?.content?.[0]?.text) {
      errors.push("Execute function did not return expected { content: [{ type, text }] } structure");
    } else {
      const parsed = JSON.parse(result.content[0].text);
      for (const key of params.expectedKeys) {
        if (!(key in parsed)) {
          errors.push(`Missing expected key "${key}" in tool output`);
        }
      }
    }
  } catch (err) {
    logError("tool-factory", `Executor validation failed: ${err instanceof Error ? err.message : String(err)}`, err);
    errors.push(`Execute function error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { valid: errors.length === 0, errors };
}

export async function validateTemplateJSX(templateJSX: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const { transform } = await import("sucrase");
    transform(templateJSX, {
      transforms: ["jsx", "typescript"],
      jsxRuntime: "classic",
      jsxPragma: "React.createElement",
      jsxFragmentPragma: "React.Fragment",
    });
  } catch (err) {
    errors.push(`Template JSX compilation error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { valid: errors.length === 0, errors };
}

// ── Auto-Heal ──

/**
 * Attempt to auto-fix a failing dynamic app executor using Gemini.
 * Returns the fixed function body on success, or an error message on failure.
 */
export async function autoHealExecutor(params: {
  toolName: string;
  toolFamily: string;
  executorBody: string;
  errorMessage: string;
  failedParams: Record<string, unknown>;
  sampleData: Record<string, unknown>;
  expectedKeys: string[];
  apiKey: string;
  /** Interaction trail context for contextual debugging (Living Apps Phase 1B). */
  failureContext?: { formatted: string };
  model?: string;
  providerKeys?: Record<string, string>;
}): Promise<{ success: boolean; fixedBody?: string; error?: string }> {
  try {
    const prompt = buildExecutorFixPrompt(params);
    let raw: string;
    if (params.model && params.providerKeys) {
      const { callChatLLM } = await import("./llm-provider.js");
      raw = await callChatLLM({ prompt, model: params.model, providerKeys: params.providerKeys });
    } else {
      raw = await callGeminiLLMWithRetry(prompt, params.apiKey);
    }
    const fixedBody = stripMarkdownFences(raw);

    // Validate the fixed executor
    const validation = await validateToolExecutor({
      executeBody: fixedBody,
      sampleParams: params.failedParams,
      expectedKeys: params.expectedKeys,
    });

    if (!validation.valid) {
      return { success: false, error: `Fix validation failed: ${validation.errors.join("; ")}` };
    }

    return { success: true, fixedBody };
  } catch (err) {
    logError("tool-factory", "Auto-heal failed", err);
    return { success: false, error: `Auto-heal error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function buildExecutorFixPrompt(params: {
  toolName: string;
  executorBody: string;
  errorMessage: string;
  failedParams: Record<string, unknown>;
  sampleData: Record<string, unknown>;
  failureContext?: { formatted: string };
}): string {
  const failureContextSection = params.failureContext
    ? `\n\n${params.failureContext.formatted}\n`
    : "";

  return `You are a JavaScript code fixer. A tool executor function body is failing at runtime.

TOOL: ${params.toolName}
PARAMS THAT CAUSED THE ERROR: ${JSON.stringify(params.failedParams)}
EXPECTED OUTPUT SHAPE (example): ${JSON.stringify(params.sampleData)}

CURRENT EXECUTOR BODY (this runs as: new AsyncFunction("callId", "params", "ctx", BODY)):
\`\`\`javascript
${params.executorBody}
\`\`\`

RUNTIME ERROR:
${params.errorMessage}
${failureContextSection}
EXECUTOR CONTEXT — ctx has these methods:
- await ctx.callTool(name, params) → { success, data, error }
- await ctx.listDir(path) → { success, data, error }
- await ctx.readFile(path) → { success, data, error }
- await ctx.searchFiles(root, name) → { success, data, error }
- await ctx.fetch(url, opts?) → { ok, status, data }
- await ctx.search(query, opts?) → { ok, results }
- await ctx.ask(prompt, opts?) → { ok, text }
- ctx.store.get/set/delete(key) → KV persistence

Fix the executor body. The output must:
1. Return { content: [{ type: "text", text: JSON.stringify(data) }] }
2. Include "tool": "${params.toolName}" in the output JSON
3. Handle the error case gracefully (try/catch with fallback data)
4. Use var instead of const/let for compatibility

Respond with ONLY the fixed function body. No function keyword, no wrapper, no markdown fences.`;
}

// ── Refine Template ──

export async function refineTemplate(params: {
  toolFamily: string;
  signatureId: string;
  currentData: unknown;
  instruction: string;
  existingTemplate?: string;
  apiKey: string;
  model?: string;
  providerKeys?: Record<string, string>;
}): Promise<{ templateJSX: string; valid: boolean; errors: string[] }> {
  const { toolFamily, signatureId, currentData, instruction, existingTemplate, apiKey, model, providerKeys } = params;

  const dataShape = (() => {
    try {
      const json = JSON.stringify(currentData, null, 2);
      return json.length > 3000 ? json.slice(0, 3000) + "\n..." : json;
    } catch {
      return "{}";
    }
  })();

  const prompt = `${STRUCTURED_DATA_SYSTEM_PROMPT}

DATA SHAPE (current data rendered by this component):
${dataShape}

PLUGIN CONTEXT:
- Plugin family: ${toolFamily}
- Signature: ${signatureId}

${existingTemplate ? `EXISTING TEMPLATE (modify this — keep the same overall structure but apply the user's instruction):
\`\`\`jsx
${existingTemplate}
\`\`\`

` : ""}USER'S REFINEMENT INSTRUCTION:
${instruction}

${existingTemplate
    ? "Modify the existing template according to the user's instruction. Keep all existing functionality (onAction calls, data rendering, action buttons) intact unless the user specifically asks to change them. Focus on the UI/styling/layout changes requested."
    : "Build a rich, interactive app component for this data. Include refresh and action buttons using onAction()."}

Respond with ONLY the JSX component code. Must start with: export default function GeneratedUI({ data, onAction })`;

  const callLLM = async (p: string) => {
    if (model && providerKeys) {
      const { callChatLLM } = await import("./llm-provider.js");
      return callChatLLM({ prompt: p, model, providerKeys });
    }
    return callGeminiLLMWithRetry(p, apiKey, GEMINI_MODEL_PRO);
  };

  let rawJSX = await callLLM(prompt);
  let templateJSX = ensureExportDefault(stripMarkdownFences(rawJSX));

  const validation = await validateTemplateJSX(templateJSX);
  if (!validation.valid) {
    const retryPrompt = prompt
      + `\n\nPREVIOUS ATTEMPT FAILED WITH ERRORS:\n${validation.errors.join("\n")}\n\nFix the JSX syntax errors.`;
    rawJSX = await callLLM(retryPrompt);
    templateJSX = ensureExportDefault(stripMarkdownFences(rawJSX));

    const retry = await validateTemplateJSX(templateJSX);
    return { templateJSX, valid: retry.valid, errors: retry.errors };
  }

  return { templateJSX, valid: true, errors: [] };
}
