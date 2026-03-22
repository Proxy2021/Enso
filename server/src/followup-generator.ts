/**
 * Follow-up Generator — suggests contextual next actions after responses.
 *
 * Heuristic-first: pattern-matches the response to suggest relevant follow-ups.
 * No LLM call needed — returns synchronously in <1ms.
 * Supports English and Chinese labels based on user's language setting.
 */

export interface FollowUpSuggestion {
  label: string;
  prompt: string;
  icon?: string;
}

// ── Bilingual label tables ──

const LABELS = {
  en: {
    goDeeper: "Go deeper",
    compareAlternatives: "Compare alternatives",
    buildTracker: "Build a tracker",
    explainCode: "Explain this code",
    writeTests: "Write tests",
    improveIt: "Improve it",
    elaborateStep1: "Elaborate on step 1",
    anyAlternatives: "Any alternatives?",
    makeChecklist: "Make a checklist",
    whichRecommend: "Which do you recommend?",
    addMoreCriteria: "Add more criteria",
    buildComparisonApp: "Build comparison app",
    summarizeKeyPoints: "Summarize key points",
    practicalExample: "Practical example",
    howDoIStart: "How do I start?",
    tellMeMore: "Tell me more",
    alternatives: "Alternatives?",
    // Research-specific
    compareEntities: "Compare",
    trackTrends: "Track trends",
    buildDashboard: "Build dashboard",
    exploreDebate: "Explore the debate",
    buildFromResearch: "Build app from this",
    monitorTopic: "Monitor this topic",
  },
  zh: {
    goDeeper: "深入了解",
    compareAlternatives: "比较替代方案",
    buildTracker: "构建追踪应用",
    explainCode: "解释这段代码",
    writeTests: "编写测试",
    improveIt: "改进代码",
    elaborateStep1: "详细说明第一步",
    anyAlternatives: "有替代方案吗？",
    makeChecklist: "制作清单",
    whichRecommend: "你推荐哪个？",
    addMoreCriteria: "添加更多比较维度",
    buildComparisonApp: "构建对比应用",
    summarizeKeyPoints: "总结要点",
    practicalExample: "实际示例",
    howDoIStart: "如何开始？",
    tellMeMore: "告诉我更多",
    alternatives: "有替代方案吗？",
    // Research-specific
    compareEntities: "对比",
    trackTrends: "追踪趋势",
    buildDashboard: "构建仪表盘",
    exploreDebate: "探索争议",
    buildFromResearch: "基于此构建应用",
    monitorTopic: "监控此话题",
  },
} as const;

type LabelKey = keyof (typeof LABELS)["en"];

function l(lang: string | undefined, key: LabelKey): string {
  const locale = lang === "zh" ? "zh" : "en";
  return LABELS[locale][key];
}

/**
 * Generate 2-3 follow-up suggestions based on the response content.
 * Purely heuristic — no LLM call. Returns empty array if no good match.
 */
export function generateFollowUps(params: {
  userMessage: string;
  assistantText: string;
  toolFamily?: string;
  language?: string;
}): FollowUpSuggestion[] {
  const { userMessage, assistantText: text, toolFamily, language } = params;
  const topic = extractTopic(userMessage);

  // ── Research responses ──
  if (
    toolFamily === "researcher" ||
    /\b(according to|source[s]?:|reference[s]?:|citation|findings|research shows)\b/i.test(text)
  ) {
    return [
      { label: l(language, "goDeeper"), prompt: `Do a deep dive on: ${topic}`, icon: "🔍" },
      { label: l(language, "compareAlternatives"), prompt: `Compare the top alternatives for: ${topic}`, icon: "⚖️" },
      { label: l(language, "buildTracker"), prompt: `Build an app to track and monitor: ${topic}`, icon: "📊" },
    ];
  }

  // ── Code responses ──
  if (/```[\s\S]{20,}```/.test(text)) {
    return [
      { label: l(language, "explainCode"), prompt: `Explain the code you just showed me in detail`, icon: "📖" },
      { label: l(language, "writeTests"), prompt: `Write tests for the code above`, icon: "🧪" },
      { label: l(language, "improveIt"), prompt: `Suggest improvements for the code you just showed`, icon: "✨" },
    ];
  }

  // ── Step-by-step / numbered lists ──
  if (/\n\s*[1-9]\.\s+\S/.test(text) && (text.match(/\n\s*\d+\.\s/g) || []).length >= 3) {
    return [
      { label: l(language, "elaborateStep1"), prompt: `Elaborate on the first step you described`, icon: "📝" },
      { label: l(language, "anyAlternatives"), prompt: `Are there alternative approaches to: ${topic}?`, icon: "🔄" },
      { label: l(language, "makeChecklist"), prompt: `Build a checklist app for the steps you described about: ${topic}`, icon: "✅" },
    ];
  }

  // ── Comparison / table responses ──
  if (/\|.*\|.*\|/.test(text) && (text.match(/\|/g) || []).length >= 8) {
    return [
      { label: l(language, "whichRecommend"), prompt: `Based on the comparison, which option do you recommend for: ${topic}?`, icon: "🏆" },
      { label: l(language, "addMoreCriteria"), prompt: `Add more comparison criteria to the analysis of: ${topic}`, icon: "➕" },
      { label: l(language, "buildComparisonApp"), prompt: `Build a comparison dashboard app for: ${topic}`, icon: "📊" },
    ];
  }

  // ── Long explanations ──
  if (text.length > 800) {
    return [
      { label: l(language, "summarizeKeyPoints"), prompt: `Summarize the key points from your explanation of: ${topic}`, icon: "📋" },
      { label: l(language, "practicalExample"), prompt: `Give me a practical, hands-on example of: ${topic}`, icon: "💡" },
      { label: l(language, "howDoIStart"), prompt: `What's the best way to get started with: ${topic}?`, icon: "🚀" },
    ];
  }

  // ── Default: topic-based follow-ups ──
  if (topic.length > 3) {
    return [
      { label: l(language, "tellMeMore"), prompt: `Tell me more about: ${topic}`, icon: "💬" },
      { label: l(language, "alternatives"), prompt: `What are the alternatives to: ${topic}?`, icon: "🔄" },
    ];
  }

  return [];
}

/**
 * Extract the main topic/subject from a user message.
 * Simple heuristic: take the substantive part, strip question words.
 */
function extractTopic(message: string): string {
  let topic = message
    // Remove common question prefixes
    .replace(/^(what|how|why|when|where|who|can you|could you|please|tell me|explain|describe|show me|help me)\s+(is|are|do|does|did|was|were|about|with|to|the|a|an)?\s*/i, "")
    // Remove trailing question marks and periods
    .replace(/[?!.]+$/, "")
    .trim();

  // If the original message was short enough, use it directly
  if (topic.length < 5 && message.length < 80) {
    topic = message.replace(/[?!.]+$/, "").trim();
  }

  // Truncate to reasonable length
  if (topic.length > 80) {
    topic = topic.slice(0, 77) + "...";
  }

  return topic;
}

// ── Research-Specific Follow-Ups ──

interface ResearchData {
  topic?: string;
  keyFindings?: Array<{ text: string; type?: string }>;
  sections?: Array<{ title: string; bullets?: string[] }>;
  contradictions?: Array<{ claim: string }>;
}

/**
 * Extract named entities (capitalized multi-word phrases, organizations, products)
 * from text for use in contextual follow-ups.
 */
function extractEntities(texts: string[]): string[] {
  const entities = new Set<string>();
  for (const text of texts) {
    // Match capitalized multi-word names (2-4 words): "NVIDIA", "Apple Inc", "React Server Components"
    const matches = text.match(/\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,3}\b/g);
    if (matches) {
      for (const m of matches) {
        // Filter out common sentence starters and generic words
        const lower = m.toLowerCase();
        if (lower.length > 2 && !["the", "this", "that", "these", "those", "with", "from", "into", "also", "however", "while", "since", "each", "both", "many", "some", "most", "such", "like"].includes(lower)) {
          entities.add(m);
        }
      }
    }
  }
  return Array.from(entities).slice(0, 10);
}

/**
 * Extract comparison pairs from text (X vs Y, X versus Y, X compared to Y).
 */
function extractComparisonPairs(texts: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const text of texts) {
    const vsMatch = text.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z]?[a-zA-Z]*)*)\s+(?:vs\.?|versus|compared to|or)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z]?[a-zA-Z]*)*)\b/i);
    if (vsMatch && vsMatch[1] && vsMatch[2]) {
      pairs.push([vsMatch[1].trim(), vsMatch[2].trim()]);
    }
  }
  return pairs;
}

/**
 * Generate context-aware follow-up suggestions from structured research data.
 * Extracts entities, comparisons, and contradictions from actual findings
 * rather than using generic labels.
 */
export function generateResearchFollowUps(params: {
  data: ResearchData;
  language?: string;
}): FollowUpSuggestion[] {
  const { data, language } = params;
  const topic = data.topic ?? "";
  const chips: FollowUpSuggestion[] = [];

  // Collect all text from findings and sections for entity extraction
  const allTexts = [
    ...(data.keyFindings?.map((f) => f.text) ?? []),
    ...(data.sections?.flatMap((s) => [s.title, ...(s.bullets ?? [])]) ?? []),
  ];

  // 1. Comparison pairs from findings
  const pairs = extractComparisonPairs(allTexts);
  if (pairs.length > 0) {
    const [a, b] = pairs[0];
    chips.push({
      label: `${l(language, "compareEntities")} ${a} vs ${b}`,
      prompt: `Compare ${a} vs ${b} in the context of ${topic}`,
      icon: "⚖️",
    });
  }

  // 2. Entity-based tracking (from trend/fact findings)
  const trendFindings = data.keyFindings?.filter((f) => f.type === "trend" || f.type === "fact") ?? [];
  if (trendFindings.length > 0) {
    const entities = extractEntities(trendFindings.map((f) => f.text));
    if (entities.length > 0) {
      chips.push({
        label: `${l(language, "trackTrends")}: ${entities[0]}`,
        prompt: `Research the latest trends and data for ${entities[0]} related to ${topic}`,
        icon: "📈",
      });
    }
  }

  // 3. Contradiction exploration
  if (data.contradictions && data.contradictions.length > 0) {
    const claim = data.contradictions[0].claim.slice(0, 50);
    chips.push({
      label: l(language, "exploreDebate"),
      prompt: `Explore different perspectives on: ${claim} in the context of ${topic}`,
      icon: "🔀",
    });
  }

  // 4. Build dashboard from research (always include)
  const topFindings = (data.keyFindings ?? []).slice(0, 3).map((f) => f.text).join("; ");
  chips.push({
    label: l(language, "buildFromResearch"),
    prompt: `Build an interactive dashboard app about "${topic}". Key findings: ${topFindings}. Include data visualization, filtering, and exploration features.`,
    icon: "🛠️",
  });

  // 5. Monitor this topic
  chips.push({
    label: l(language, "monitorTopic"),
    prompt: `Monitor the topic "${topic}" for changes and new developments`,
    icon: "👁️",
  });

  // If no entity-specific chips were generated (only build + monitor), add a generic dashboard chip
  if (chips.length <= 2) {
    chips.unshift({
      label: `${l(language, "buildDashboard")}: ${topic.slice(0, 30)}`,
      prompt: `Build a research dashboard app for ${topic} with charts and data exploration`,
      icon: "📊",
    });
  }

  return chips.slice(0, 4); // Max 4 chips
}
