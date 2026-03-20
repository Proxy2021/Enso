/**
 * Heuristic to detect natural language vs shell commands.
 * Used by ChatInput (Path A) and ShellCard xterm interception (Path B).
 */
export function isLikelyNaturalLanguage(input: string): boolean {
  const trimmed = input.trim();
  // Escape hatch: ! prefix forces shell execution
  if (trimmed.startsWith("!")) return false;
  const words = trimmed.split(/\s+/);
  if (words.length <= 2) return false;
  if (trimmed.includes("?")) return true;
  const nlStarters = /^(what|how|why|when|where|who|which|can|could|would|should|is|are|was|were|do|does|did|explain|describe|compare|tell|help|write|create|build|design|show|give|list|summarize|analyze|suggest|recommend)\b/i;
  if (nlStarters.test(trimmed)) return true;
  if (words.length >= 6) {
    const hasShellIndicators = /[|><&;`$\\]|--\w|\/\w+\//.test(trimmed);
    if (!hasShellIndicators) return true;
  }
  return false;
}
