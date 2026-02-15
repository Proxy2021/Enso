import { generateUI } from "../shared/ui-generator-core.js";
import type { UIGeneratorContext, UIGeneratorResult, UIGeneratorDeps } from "../shared/types.js";

const cache = new Map<string, string>();

const FALLBACK_COMPONENT = `export default function GeneratedUI({ data }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 overflow-auto max-h-96">
      <pre className="text-sm text-gray-300 whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}`;

async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[UIGenerator] No GEMINI_API_KEY — using fallback component");
    return FALLBACK_COMPONENT;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("[UIGenerator] Gemini API error:", err);
    return FALLBACK_COMPONENT;
  }

  const result = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? FALLBACK_COMPONENT;

  // Strip markdown fences if present
  return text.replace(/^```(?:jsx?|tsx?)?\n?/m, "").replace(/\n?```$/m, "").trim();
}

const deps: UIGeneratorDeps = {
  callLLM,
  cacheGet: (key) => cache.get(key),
  cacheSet: (key, value) => { cache.set(key, value); },
};

export async function serverGenerateUI(
  context: UIGeneratorContext
): Promise<UIGeneratorResult> {
  try {
    return await generateUI(context, deps);
  } catch (err) {
    console.error("[UIGenerator] Generation failed:", err);
    return { code: FALLBACK_COMPONENT, shapeKey: "fallback", cached: false };
  }
}
