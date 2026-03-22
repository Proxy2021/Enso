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
