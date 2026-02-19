import {
  detectToolTemplateForToolName,
  executeToolDirect,
  getRegisteredToolsDetailed,
} from "./native-tools/registry.js";
import { serverSuggestToolInvocation } from "./ui-generator.js";

export interface ToolRouteResult {
  matched: boolean;
  toolName?: string;
  params?: Record<string, unknown>;
  data?: unknown;
  confidence?: number;
}

type RouteCacheEntry = {
  toolName: string;
  params: Record<string, unknown>;
  confidence: number;
  expiresAt: number;
};

type ToolDetail = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  pluginId: string;
};

const ROUTE_CACHE_TTL_MS = 90_000;
const routeCache = new Map<string, RouteCacheEntry>();

function normalizeMessage(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, " ");
}

function tokenSet(input: string): Set<string> {
  return new Set(
    normalizeMessage(input)
      .split(/[^a-z0-9_]+/g)
      .filter((x) => x.length >= 3),
  );
}

function toolSchemaKeywords(parameters: Record<string, unknown>): string[] {
  const keywords = new Set<string>();
  const properties = parameters?.properties;
  if (properties && typeof properties === "object") {
    for (const [name, schema] of Object.entries(properties as Record<string, unknown>)) {
      keywords.add(name.toLowerCase());
      if (schema && typeof schema === "object") {
        const description = (schema as Record<string, unknown>).description;
        if (typeof description === "string") {
          for (const token of tokenSet(description)) keywords.add(token);
        }
      }
    }
  }
  return Array.from(keywords);
}

function shortlistTools(input: {
  userMessage: string;
  tools: ToolDetail[];
  limit?: number;
}): ToolDetail[] {
  const queryTokens = tokenSet(input.userMessage);
  if (queryTokens.size === 0) {
    return input.tools.slice(0, input.limit ?? 30);
  }
  const normalizedMessage = normalizeMessage(input.userMessage);
  const ranked = input.tools.map((tool) => {
    const schemaTokens = toolSchemaKeywords(tool.parameters).join(" ");
    const haystack = `${tool.pluginId} ${tool.name} ${tool.description} ${schemaTokens}`.toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
      if (haystack.includes(token)) score += 1;
    }
    const toolNameLower = tool.name.toLowerCase();
    if (normalizedMessage.includes(toolNameLower)) score += 4;
    const actionSuffix = toolNameLower.includes("_")
      ? toolNameLower.slice(toolNameLower.lastIndexOf("_") + 1)
      : toolNameLower;
    if (actionSuffix.length >= 4 && normalizedMessage.includes(actionSuffix)) score += 2;
    if (tool.description.toLowerCase().includes("list") && /\b(list|show|display|browse)\b/.test(normalizedMessage)) {
      score += 1;
    }
    return { tool, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  const top = ranked.filter((x) => x.score > 0).slice(0, input.limit ?? 30).map((x) => x.tool);
  if (top.length > 0) return top;
  return input.tools.slice(0, input.limit ?? 30);
}

function buildToolCatalogContext(input: {
  allTools: ToolDetail[];
  shortlistedTools: ToolDetail[];
}): string {
  const byPlugin = new Map<string, string[]>();
  for (const tool of input.allTools) {
    const bucket = byPlugin.get(tool.pluginId) ?? [];
    bucket.push(tool.name);
    byPlugin.set(tool.pluginId, bucket);
  }
  const pluginSummary = Array.from(byPlugin.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .map(([pluginId, names]) => `${pluginId} (${names.length} tools): ${names.slice(0, 8).join(", ")}`)
    .join("\n");

  const shortlistSummary = input.shortlistedTools
    .slice(0, 20)
    .map((tool) => {
      const required = Array.isArray(tool.parameters?.required)
        ? (tool.parameters.required as unknown[]).filter((x): x is string => typeof x === "string").join(", ")
        : "";
      return `${tool.name} — ${tool.description}${required ? ` [required: ${required}]` : ""}`;
    })
    .join("\n");

  return [
    `Registered plugins and tools:`,
    pluginSummary || "(none)",
    "",
    `Top candidate tools for this message:`,
    shortlistSummary || "(none)",
  ].join("\n");
}

function isLikelyGeneratedTool(tool: ToolDetail): boolean {
  const plugin = tool.pluginId.toLowerCase();
  const name = tool.name.toLowerCase();
  return plugin.startsWith("autogen_") || name.startsWith("autogen_");
}

function isSupportedRoutableTool(tool: ToolDetail): boolean {
  const signature = detectToolTemplateForToolName(tool.name);
  if (!signature) return false;
  if (signature.toolFamily.startsWith("system_")) return false;
  return true;
}

function parseToolNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function toolPrefix(name: string): string {
  const idx = name.lastIndexOf("_");
  if (idx <= 0) return name.toLowerCase();
  return name.slice(0, idx + 1).toLowerCase();
}

function scoreToolRelevance(userMessage: string, tool: ToolDetail): number {
  const queryTokens = tokenSet(userMessage);
  if (queryTokens.size === 0) return 0;
  const haystack = `${tool.pluginId} ${tool.name} ${tool.description} ${toolSchemaKeywords(tool.parameters).join(" ")}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 1;
  }
  const toolTokens = parseToolNameTokens(tool.name);
  for (const token of toolTokens) {
    if (token.length >= 4 && normalizeMessage(userMessage).includes(token)) score += 1;
  }
  return score;
}

function shouldAcceptSuggestion(input: {
  userMessage: string;
  tool: ToolDetail;
  confidence: number;
}): boolean {
  const relevance = scoreToolRelevance(input.userMessage, input.tool);
  if (input.confidence >= 0.8) return relevance >= 1;
  if (input.confidence >= 0.5) return relevance >= 1;
  return relevance >= 2;
}

function toolProperties(tool: ToolDetail): Record<string, Record<string, unknown>> {
  const properties = tool.parameters?.properties;
  if (!properties || typeof properties !== "object") return {};
  return properties as Record<string, Record<string, unknown>>;
}

function requiredFields(tool: ToolDetail): string[] {
  if (!Array.isArray(tool.parameters?.required)) return [];
  return (tool.parameters.required as unknown[])
    .filter((x): x is string => typeof x === "string");
}

function extractFirstNumber(message: string): number | undefined {
  const match = message.match(/\b(\d+)\b/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function inferPathLikeValue(message: string): string {
  const explicitPath = message.match(/(^|\s)(~\/[^\s,;]+|\/[^\s,;]+)/);
  if (explicitPath?.[2]) return explicitPath[2];
  const normalized = normalizeMessage(message);
  if (/\bdesktop\b/.test(normalized)) return "~/Desktop";
  if (/\bdownloads\b/.test(normalized)) return "~/Downloads";
  if (/\bdocuments\b/.test(normalized)) return "~/Documents";
  if (/\b(pictures|photos)\b/.test(normalized)) return "~/Pictures";
  if (/\bmovies\b/.test(normalized)) return "~/Movies";
  if (/\bmusic\b/.test(normalized)) return "~/Music";
  if (/\bgithub\b/.test(normalized)) return "~/Desktop/Github";
  if (/\bhome\b/.test(normalized)) return "~";
  return ".";
}

function inferLocationLikeValue(message: string): string | undefined {
  const toMatch = message.match(/\bto\s+([A-Za-z][A-Za-z\s-]{1,40})/i);
  if (toMatch?.[1]) return toMatch[1].trim();
  const inMatch = message.match(/\bin\s+([A-Za-z][A-Za-z\s-]{1,40})/i);
  if (inMatch?.[1]) return inMatch[1].trim();
  return undefined;
}

function inferTickerValue(message: string): string | undefined {
  const ticker = message.match(/\b([A-Z]{2,6})\b/);
  if (ticker?.[1]) return ticker[1];
  return undefined;
}

function coerceFromEnumOrDefault(input: {
  schema: Record<string, unknown> | undefined;
  message: string;
  fallbackString?: string;
}): unknown {
  const enumValues = Array.isArray(input.schema?.enum)
    ? (input.schema?.enum as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  if (enumValues.length > 0) {
    const normalized = normalizeMessage(input.message);
    const found = enumValues.find((item) => normalized.includes(item.toLowerCase().replace(/_/g, " ")));
    return found ?? enumValues[0];
  }
  return input.fallbackString ?? "default";
}

function inferMissingRequiredParams(input: {
  userMessage: string;
  tool: ToolDetail;
  baseParams: Record<string, unknown>;
}): Record<string, unknown> {
  const params: Record<string, unknown> = { ...input.baseParams };
  const properties = toolProperties(input.tool);
  const required = requiredFields(input.tool);
  const normalized = normalizeMessage(input.userMessage);

  for (const key of required) {
    if (params[key] != null) continue;
    const schema = properties[key];
    const lowerKey = key.toLowerCase();
    const schemaType = typeof schema?.type === "string" ? String(schema.type) : undefined;

    if (/(path|dir|directory|root|repo|file)/.test(lowerKey)) {
      params[key] = inferPathLikeValue(input.userMessage);
      continue;
    }
    if (/(destination|city|location|place|region)/.test(lowerKey)) {
      params[key] = inferLocationLikeValue(input.userMessage) ?? "Tokyo";
      continue;
    }
    if (/(ticker|symbol)/.test(lowerKey)) {
      params[key] = inferTickerValue(input.userMessage) ?? "AAPL";
      continue;
    }
    if (/(dayindex|day)/.test(lowerKey)) {
      params[key] = extractFirstNumber(input.userMessage) ?? 1;
      continue;
    }
    if (/(mealtype|meal_type)/.test(lowerKey)) {
      if (/\bbreakfast\b/.test(normalized)) params[key] = "breakfast";
      else if (/\blunch\b/.test(normalized)) params[key] = "lunch";
      else params[key] = "dinner";
      continue;
    }
    if (/(diet|style|pace)/.test(lowerKey)) {
      params[key] = coerceFromEnumOrDefault({
        schema,
        message: input.userMessage,
        fallbackString: "balanced",
      });
      continue;
    }
    if (schemaType === "number" || /(days|limit|max|count|servings|budget)/.test(lowerKey)) {
      params[key] = extractFirstNumber(input.userMessage) ?? 1;
      continue;
    }
    if (schemaType === "boolean") {
      params[key] = /\b(true|yes|include|with)\b/.test(normalized);
      continue;
    }
    if (schemaType === "array") {
      params[key] = [];
      continue;
    }
    params[key] = coerceFromEnumOrDefault({
      schema,
      message: input.userMessage,
      fallbackString: "default",
    });
  }
  return params;
}

function isOperationalPrompt(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) return false;
  return /\b(list|show|scan|search|read|inspect|group|plan|optimize|budget|overview|detect|run|check|predict|market|portfolio|ticker|repo|trip|itinerary|meal|grocery|directory|files|media|workspace|snapshot)\b/.test(
    normalized,
  );
}

function scorePrefixRelevance(userMessage: string, tools: ToolDetail[]): number {
  if (tools.length === 0) return 0;
  const queryTokens = tokenSet(userMessage);
  if (queryTokens.size === 0) return 0;
  const haystack = tools
    .map((tool) => `${tool.pluginId} ${tool.name} ${tool.description} ${toolSchemaKeywords(tool.parameters).join(" ")}`)
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 1;
  }
  return score;
}

function topPrefixCandidates(userMessage: string, tools: ToolDetail[]): Array<{ prefix: string; tools: ToolDetail[]; score: number }> {
  const byPrefix = new Map<string, ToolDetail[]>();
  for (const tool of tools) {
    const prefix = toolPrefix(tool.name);
    const bucket = byPrefix.get(prefix) ?? [];
    bucket.push(tool);
    byPrefix.set(prefix, bucket);
  }
  return Array.from(byPrefix.entries())
    .map(([prefix, groupTools]) => ({
      prefix,
      tools: groupTools,
      score: scorePrefixRelevance(userMessage, groupTools),
    }))
    .sort((a, b) => b.score - a.score);
}

function topLexicalTools(userMessage: string, tools: ToolDetail[]): Array<{ tool: ToolDetail; relevance: number }> {
  return tools
    .map((tool) => ({ tool, relevance: scoreToolRelevance(userMessage, tool) }))
    .sort((a, b) => b.relevance - a.relevance);
}

async function executeToolWithInferredParams(input: {
  tool: ToolDetail;
  userMessage: string;
  params: Record<string, unknown>;
  confidence: number;
}): Promise<ToolRouteResult> {
  const finalParams = inferMissingRequiredParams({
    userMessage: input.userMessage,
    tool: input.tool,
    baseParams: input.params,
  });
  const result = await executeToolDirect(input.tool.name, finalParams);
  if (!result.success || result.data == null) return { matched: false };
  return {
    matched: true,
    toolName: input.tool.name,
    params: finalParams,
    data: result.data,
    confidence: input.confidence,
  };
}

async function tryRouteWithStrategy(input: {
  userMessage: string;
  geminiApiKey: string;
  candidateTools: ToolDetail[];
  allTools: ToolDetail[];
  minConfidence: number;
  timeoutMs: number;
  maxOutputTokens: number;
  strategyLabel: "primary" | "fallback";
}): Promise<ToolRouteResult> {
  const shortlistedTools = shortlistTools({
    userMessage: input.userMessage,
    tools: input.candidateTools,
    limit: input.strategyLabel === "primary" ? 20 : 32,
  });
  const catalogContext = buildToolCatalogContext({
    allTools: input.allTools,
    shortlistedTools,
  });

  const suggestion = await serverSuggestToolInvocation({
    userMessage: input.userMessage,
    geminiApiKey: input.geminiApiKey,
    tools: shortlistedTools,
    catalogContext,
    timeoutMs: input.timeoutMs,
    maxOutputTokens: input.maxOutputTokens,
    maxAttempts: 1,
    strategy: input.strategyLabel,
  });
  if (!suggestion || !suggestion.toolName || suggestion.confidence < input.minConfidence) {
    return { matched: false };
  }

  const selectedTool = input.allTools.find((tool) => tool.name === suggestion.toolName);
  if (!selectedTool) return { matched: false };
  if (!shouldAcceptSuggestion({
    userMessage: input.userMessage,
    tool: selectedTool,
    confidence: suggestion.confidence,
  })) {
    return { matched: false };
  }

  return executeToolWithInferredParams({
    tool: selectedTool,
    userMessage: input.userMessage,
    params: (suggestion.params ?? {}) as Record<string, unknown>,
    confidence: suggestion.confidence,
  });
}

function shouldAttemptRouting(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized || normalized.length < 6) return false;
  // Avoid wasting tool-router calls on obvious social chitchat.
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|cool|nice)$/i.test(normalized)) return false;
  return true;
}

export async function tryRouteWithLLM(params: {
  userMessage: string;
  geminiApiKey?: string;
}): Promise<ToolRouteResult> {
  if (!shouldAttemptRouting(params.userMessage)) return { matched: false };
  const apiKey = params.geminiApiKey;

  const cacheKey = normalizeMessage(params.userMessage);
  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const cachedResult = await executeToolDirect(cached.toolName, cached.params);
    if (cachedResult.success && cachedResult.data != null) {
      return {
        matched: true,
        toolName: cached.toolName,
        params: cached.params,
        data: cachedResult.data,
        confidence: cached.confidence,
      };
    }
  }

  const tools = getRegisteredToolsDetailed();
  if (tools.length === 0) return { matched: false };
  const primaryTools = tools.filter((tool) => !isLikelyGeneratedTool(tool));
  const firstPassCandidates = primaryTools.length > 0 ? primaryTools : tools;

  if (!isOperationalPrompt(params.userMessage)) return { matched: false };

  const supportedTools = firstPassCandidates.filter(isSupportedRoutableTool);
  const routingPool = supportedTools.length > 0 ? supportedTools : firstPassCandidates;

  const lexicalRank = topLexicalTools(params.userMessage, routingPool);
  // Try multiple strong lexical candidates before LLM to improve robustness.
  const lexicalCandidates = lexicalRank
    .filter((item) => item.relevance >= 1)
    .slice(0, 6);
  for (const candidate of lexicalCandidates) {
    const lexicalResult = await executeToolWithInferredParams({
      tool: candidate.tool,
      userMessage: params.userMessage,
      params: {},
      confidence: Math.min(0.7, 0.4 + (candidate.relevance * 0.05)),
    });
    if (lexicalResult.matched) {
      routeCache.set(cacheKey, {
        toolName: lexicalResult.toolName ?? "",
        params: (lexicalResult.params ?? {}) as Record<string, unknown>,
        confidence: lexicalResult.confidence ?? 0.55,
        expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
      });
      return lexicalResult;
    }
  }

  // If no API key, keep routing via lexical/schema strategies only.
  if (!apiKey) return { matched: false };

  const primary = await tryRouteWithStrategy({
    userMessage: params.userMessage,
    geminiApiKey: apiKey,
    candidateTools: routingPool,
    allTools: routingPool,
    minConfidence: 0.3,
    timeoutMs: 1900,
    maxOutputTokens: 700,
    strategyLabel: "primary",
  });
  if (primary.matched) {
    routeCache.set(cacheKey, {
      toolName: primary.toolName ?? "",
      params: (primary.params ?? {}) as Record<string, unknown>,
      confidence: primary.confidence ?? 0.45,
      expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
    });
    return primary;
  }

  const fallback = await tryRouteWithStrategy({
    userMessage: params.userMessage,
    geminiApiKey: apiKey,
    candidateTools: routingPool,
    allTools: routingPool,
    minConfidence: 0.2,
    timeoutMs: 2600,
    maxOutputTokens: 900,
    strategyLabel: "fallback",
  });
  if (!fallback.matched) {
    const prefixes = topPrefixCandidates(params.userMessage, routingPool)
      .filter((item) => item.score > 0)
      .slice(0, 2);
    for (const candidate of prefixes) {
      const ranked = topLexicalTools(params.userMessage, candidate.tools);
      const top = ranked[0];
      if (!top || top.relevance < 1) continue;
      const direct = await executeToolWithInferredParams({
        tool: top.tool,
        userMessage: params.userMessage,
        params: {},
        confidence: 0.3,
      });
      if (!direct.matched) continue;
      routeCache.set(cacheKey, {
        toolName: direct.toolName ?? "",
        params: (direct.params ?? {}) as Record<string, unknown>,
        confidence: direct.confidence ?? 0.3,
        expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
      });
      return direct;
    }
    return { matched: false };
  }
  routeCache.set(cacheKey, {
    toolName: fallback.toolName ?? "",
    params: (fallback.params ?? {}) as Record<string, unknown>,
    confidence: fallback.confidence ?? 0.35,
    expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
  });
  return fallback;
}

