import { getDomainEvolutionJob, reportDomainGap } from "./domain-evolution.js";
import {
  detectToolTemplateForToolName,
  getAllToolTemplates,
  getRegisteredToolCatalog,
  type ToolTemplate,
} from "./native-tools/registry.js";

type ToolFamilyGroup = {
  toolFamily: string;
  toolCount: number;
  templateCount: number;
  tools: string[];
  templates: ToolTemplate[];
};

function buildFamilyGroups(): ToolFamilyGroup[] {
  const templates = getAllToolTemplates();
  const templateByFamily = new Map<string, ToolTemplate[]>();
  for (const t of templates) {
    const bucket = templateByFamily.get(t.toolFamily) ?? [];
    bucket.push(t);
    templateByFamily.set(t.toolFamily, bucket);
  }

  const tools = getRegisteredToolCatalog().flatMap((entry) => entry.tools);
  const toolByFamily = new Map<string, string[]>();
  for (const toolName of tools) {
    const signature = detectToolTemplateForToolName(toolName);
    if (!signature) continue;
    const bucket = toolByFamily.get(signature.toolFamily) ?? [];
    bucket.push(toolName);
    toolByFamily.set(signature.toolFamily, bucket);
  }

  const families = new Set<string>([
    ...Array.from(templateByFamily.keys()),
    ...Array.from(toolByFamily.keys()),
  ]);

  return Array.from(families)
    .map((toolFamily) => {
      const familyTemplates = templateByFamily.get(toolFamily) ?? [];
      const familyTools = toolByFamily.get(toolFamily) ?? [];
      return {
        toolFamily,
        toolCount: familyTools.length,
        templateCount: familyTemplates.length,
        tools: [...familyTools].sort(),
        templates: [...familyTemplates].sort((a, b) => a.signatureId.localeCompare(b.signatureId)),
      };
    })
    .sort((a, b) => a.toolFamily.localeCompare(b.toolFamily));
}

function normalizeDescription(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findExistingMatch(description: string): { toolFamily: string; reason: string } | null {
  const normalized = normalizeDescription(description);
  if (!normalized) return null;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const groups = buildFamilyGroups();
  let best: { toolFamily: string; score: number; reason: string } | null = null;
  for (const group of groups) {
    const haystack = normalizeDescription(
      [
        group.toolFamily,
        ...group.tools,
        ...group.templates.map((t) => `${t.signatureId} ${t.templateId}`),
      ].join(" "),
    );
    const score = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = {
        toolFamily: group.toolFamily,
        score,
        reason: `matched ${score}/${words.length} keywords`,
      };
    }
  }
  if (!best) return null;
  if (best.score < Math.max(2, Math.ceil(words.length / 3))) return null;
  return { toolFamily: best.toolFamily, reason: best.reason };
}

export function buildToolConsoleHomeData(): Record<string, unknown> {
  const groups = buildFamilyGroups();
  return {
    view: "home",
    title: "Enso Tool Console",
    families: groups.map((g) => ({
      toolFamily: g.toolFamily,
      toolCount: g.toolCount,
      templateCount: g.templateCount,
    })),
  };
}

export function buildToolConsoleFamilyData(toolFamily: string): Record<string, unknown> {
  const groups = buildFamilyGroups();
  const selected = groups.find((g) => g.toolFamily === toolFamily);
  return {
    view: "family",
    selected: selected
      ? {
          toolFamily: selected.toolFamily,
          tools: selected.tools,
          templates: selected.templates.map((t) => ({
            signatureId: t.signatureId,
            templateId: t.templateId,
            coverageStatus: t.coverageStatus,
            supportedActions: t.supportedActions,
          })),
        }
      : {
          toolFamily,
          tools: [],
          templates: [],
        },
  };
}

export async function handleToolConsoleAdd(description: string): Promise<Record<string, unknown>> {
  const trimmed = description.trim();
  if (!trimmed) {
    return {
      status: "invalid_input",
      message: "Please provide a tool description before submitting.",
    };
  }

  const existing = findExistingMatch(trimmed);
  if (existing) {
    return {
      status: "exists",
      message: `Tool support already exists in "${existing.toolFamily}" (${existing.reason}).`,
      matchedFamily: existing.toolFamily,
    };
  }

  const jobId = reportDomainGap({
    cardId: `tool_console_${Date.now()}`,
    userMessage: trimmed,
    assistantText: `Tool creation request from /tool enso: ${trimmed}`,
    data: {
      requestedDescription: trimmed,
      requestedBy: "tool_console",
    },
  });
  let job = getDomainEvolutionJob(jobId);
  const start = Date.now();
  while (
    job
    && (job.status === "queued" || job.status === "generating_blueprint")
    && Date.now() - start < 3000
  ) {
    await new Promise((resolve) => setTimeout(resolve, 75));
    job = getDomainEvolutionJob(jobId);
  }

  return {
    status: job?.status ?? "queued",
    message: job?.status === "registered"
      ? `New tool family "${job.blueprint?.toolFamily}" registered and ready.`
      : `Tool generation job queued: ${jobId} (${job?.status ?? "queued"}).`,
    jobId,
    jobStatus: job?.status ?? "queued",
    blueprint: job?.blueprint,
  };
}

