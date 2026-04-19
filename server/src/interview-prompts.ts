/**
 * interview-prompts.ts — Author-interview variant of deep content.
 *
 * Generates an "imagined interview" podcast where the AI interviewer asks
 * the best questions to reach the core of the book, and the author (modeled
 * from their published work + interviews) answers.
 *
 * Three phases:
 *   1. researchAuthorVoice — fetch quotes/positions from the author's
 *      interviews, talks, and other writings so the author's voice is
 *      grounded rather than fabricated.
 *   2. designInterviewQuestions — rank 8-12 questions that target
 *      load-bearing claims, tensions inside the book, and the user's own
 *      Cortex context.
 *   3. writeInterviewDialogue — produce the full Joe (interviewer) /
 *      Jane (author) script in one pass.
 */
import { llm } from "./llm.js";
import { braveWebSearch, fetchPageContent } from "./researcher-tools.js";
import { logAction, logError } from "./action-log.js";
import type { EntityResearchResult } from "./deep-content.js";

export interface AuthorVoiceProfile {
  quotes: Array<{ text: string; source: string }>;
  toneNotes: string;
  /** Did we find substantial author-sourced material? Falls back to generic voice if not. */
  grounded: boolean;
}

export interface InterviewQuestion {
  question: string;
  probes: "core-claim" | "tension" | "assumption" | "application" | "wildcard";
  rationale: string;
}

// ─── Phase 1: Author Voice Research ──────────────────────────────────────────

export async function researchAuthorVoice(params: {
  author: string;
  title: string;
  onProgress?: (detail: string) => void;
}): Promise<AuthorVoiceProfile> {
  const { author, title, onProgress } = params;

  // Skip for unknown authors — interview will fall back to generic voice.
  if (!author || author === "Unknown") {
    return { quotes: [], toneNotes: "", grounded: false };
  }

  onProgress?.(`Researching ${author}'s voice...`);

  const queries = [
    `"${author}" interview "${title}"`,
    `"${author}" talk lecture keynote`,
    `"${author}" quotes on writing "${title}"`,
  ];

  const quotes: Array<{ text: string; source: string }> = [];
  try {
    const searchResults = await Promise.all(
      queries.map((q) => braveWebSearch(q, 3).catch(() => [] as Array<{ url: string; title: string }>)),
    );
    const urls: Array<{ url: string; title: string }> = [];
    const seen = new Set<string>();
    for (const batch of searchResults) {
      for (const hit of batch) {
        if (hit.url && !seen.has(hit.url)) {
          seen.add(hit.url);
          urls.push(hit);
        }
      }
    }

    // Fetch up to 4 pages in parallel to keep latency bounded.
    const pages = await Promise.all(
      urls.slice(0, 4).map((u) =>
        fetchPageContent(u.url)
          .then((text) => ({ url: u.url, title: u.title, text }))
          .catch(() => null),
      ),
    );
    for (const p of pages) {
      if (!p || !p.text) continue;
      // Excerpt ~1500 chars per page to keep LLM prompt manageable.
      quotes.push({ text: p.text.slice(0, 1500), source: p.title || p.url });
    }
  } catch (err) {
    logError("interview", `Author voice research failed for ${author}`, err);
  }

  if (quotes.length === 0) {
    return { quotes: [], toneNotes: "", grounded: false };
  }

  // Distill tone — single LLM pass produces a short style guide.
  const tonePrompt = `The following are excerpts from ${author}'s interviews, talks, and writings about "${title}":

${quotes.map((q, i) => `[${i + 1}] From ${q.source}:\n${q.text}`).join("\n\n")}

In 3-5 sentences, describe ${author}'s speaking/writing voice: cadence, vocabulary, recurring rhetorical moves, signature phrases, attitude toward opposing views. Be specific and concrete so someone could imitate it. Output only the description.`;

  const toneNotes = (await llm({ prompt: tonePrompt, tier: "utility", timeoutMs: 30_000 }))?.trim() ?? "";

  logAction({ ts: Date.now(), type: "action", category: "interview", message: `Author voice research: ${quotes.length} sources for ${author}` });

  return { quotes, toneNotes, grounded: quotes.length >= 2 };
}

// ─── Phase 2: Question Design ────────────────────────────────────────────────

export async function designInterviewQuestions(params: {
  title: string;
  author: string;
  research: EntityResearchResult;
  userProfile?: string;
  userFocuses?: string[];
  language?: string;
}): Promise<InterviewQuestion[]> {
  const { title, author, research, userProfile, userFocuses, language } = params;

  const prompt = `You are designing the question list for an in-depth interview with ${author}, author of "${title}". The goal is to cut to the core of the book — not puff-piece questions, not generic "tell us about your book" openers.

BOOK CONTEXT
Core thesis: ${research.coreThesis}
Key themes: ${research.keyThemes.join("; ")}
Key insights: ${research.keyInsights.slice(0, 8).map((i) => i.insight).join(" | ")}
Critical perspectives that exist: ${research.criticalPerspectives.slice(0, 5).join(" | ")}
${research.chapterSummaries.length > 0 ? `Chapters: ${research.chapterSummaries.map((c) => c.chapter).join(", ")}` : ""}

${userProfile ? `USER CONTEXT (for personalization of 1-2 questions):\n${userProfile.slice(0, 1500)}\n` : ""}
${userFocuses && userFocuses.length > 0 ? `USER'S ACTIVE FOCUS AREAS: ${userFocuses.join("; ")}` : ""}

Design 8-12 questions that together reach the core of the book. Mix these categories:
- core-claim: directly probes a load-bearing argument ("Walk me through why X implies Y")
- tension: surfaces an apparent contradiction or edge case inside the book
- assumption: pushes on a hidden premise ("You assume Z — what if Z is wrong?")
- application: asks how the framework applies to a concrete scenario (use user's focus area when relevant)
- wildcard: one unexpected question that reveals the author's meta-perspective

Order: opener (accessible) → core claims (hardest probes) → tensions → application → wildcard → reflective close.

Output ONLY valid JSON:
{
  "questions": [
    {
      "question": "The actual question as the interviewer would ask it",
      "probes": "core-claim" | "tension" | "assumption" | "application" | "wildcard",
      "rationale": "one sentence explaining why this question belongs"
    }
  ]
}${language && language !== "English" ? `\n\nCRITICAL: Write every question in ${language}. Do NOT use English.` : ""}`;

  const result = await llm({ prompt, tier: "pro", timeoutMs: 45_000 });
  try {
    let jsonStr = result?.replace(/```(?:json|JSON)?\n?|\n?```/g, "").trim() ?? "{}";
    const fb = jsonStr.indexOf("{");
    const lb = jsonStr.lastIndexOf("}");
    if (fb >= 0 && lb > fb) jsonStr = jsonStr.slice(fb, lb + 1);
    const parsed = JSON.parse(jsonStr) as { questions: InterviewQuestion[] };
    return parsed.questions ?? [];
  } catch (err) {
    logError("interview", "Failed to parse interview question JSON", err);
    // Fallback: a minimal question list
    return [
      { question: `What is the single most important idea in "${title}"?`, probes: "core-claim", rationale: "Fallback opener" },
      { question: `Your argument rests on ${research.keyThemes[0] || "certain assumptions"} — what if those don't hold?`, probes: "assumption", rationale: "Fallback assumption probe" },
      { question: `What would you tell a reader who wants to apply this immediately?`, probes: "application", rationale: "Fallback application" },
    ];
  }
}

// ─── Phase 3: Dialogue Script ────────────────────────────────────────────────

export async function writeInterviewDialogue(params: {
  title: string;
  author: string;
  research: EntityResearchResult;
  questions: InterviewQuestion[];
  authorVoice: AuthorVoiceProfile;
  language?: string;
  targetMinutes?: number;
}): Promise<string> {
  const { title, author, research, questions, authorVoice, language, targetMinutes = 20 } = params;

  const charsPerMinute = 900;
  const targetChars = targetMinutes * charsPerMinute;

  const voiceSection = authorVoice.grounded
    ? `AUTHOR VOICE (imitate this when the author speaks):
${authorVoice.toneNotes}

GROUNDED SOURCE MATERIAL (use when you can; paraphrase — don't invent quotes):
${authorVoice.quotes.map((q, i) => `[${i + 1}] ${q.source}: ${q.text.slice(0, 600)}`).join("\n\n")}`
    : `AUTHOR VOICE: We don't have strong sourced material on ${author}'s speaking style. Have them speak as a thoughtful, articulate domain expert defending the positions in "${title}". If a specific question requires extrapolation beyond the book, the author should signal it: "If I had to speculate..." or "This goes beyond what I wrote, but..."`;

  const prompt = `You are writing an imagined interview podcast with ${author}, author of "${title}". Joe is the male interviewer. Jane is the female guest (${author}).

QUESTION LIST (the interviewer asks these in order, but may follow up conversationally):
${questions.map((q, i) => `${i + 1}. [${q.probes}] ${q.question}`).join("\n")}

BOOK CONTEXT (ground the author's answers in this):
Core thesis: ${research.coreThesis}
Key insights: ${research.keyInsights.slice(0, 10).map((i) => `${i.insight}${i.example ? ` (e.g. ${i.example})` : ""}`).join(" | ")}
Critical perspectives: ${research.criticalPerspectives.slice(0, 5).join(" | ")}

${voiceSection}

WRITING RULES
- Format: "Joe:" and "Jane:" speaker tags, one speaker per line. Always keep these exact English names even when the dialogue is in another language — they are speaker IDs, not translated names.
- Open with Joe introducing ${author} and "${title}" in 1-2 sentences — ground the listener and note this is an imagined interview based on ${author}'s published work
- Follow the question list order, but allow 1-2 follow-ups per answer when natural ("Wait, you said X earlier — doesn't that contradict...")
- Jane's answers should be 3-6 sentences, substantive, specific — use concrete examples from the book
- Joe's questions should be crisp and probing, not preamble
- When the author makes a strong claim, Joe should occasionally push back rather than just moving on
- If the question requires extrapolation beyond the book, Jane explicitly signals it ("If I had to speculate...")
- End with Joe asking a reflective closing question, Jane's brief answer, Joe thanking the author
- Target length: ~${targetChars} characters of dialogue
- Output ONLY the dialogue script — no narrator, no stage directions, no markdown headers${language && language !== "English" ? `\n- CRITICAL: Write the ENTIRE dialogue in ${language}. Both hosts speak fluent ${language}. Do NOT use English.` : ""}`;

  const script = await llm({ prompt, tier: "pro", timeoutMs: 120_000, maxOutputTokens: 16384 });
  return script?.trim() ?? "";
}
