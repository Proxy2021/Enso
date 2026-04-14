/**
 * JSON sanitization utilities for LLM output.
 *
 * LLMs (especially Gemini) frequently return malformed JSON even when
 * `responseMimeType: "application/json"` is set. Common issues include:
 *   - Markdown fences wrapping the JSON
 *   - Unescaped control characters (tabs, newlines) inside strings
 *   - Invalid escape sequences (\s, \p, \' etc.)
 *   - Unescaped embedded double quotes in string values
 *   - Truncated output (incomplete JSON structures)
 *   - Trailing commas
 *
 * These utilities are battle-tested across 10+ call sites.
 */

/**
 * Sanitize unescaped control characters AND invalid escape sequences inside
 * JSON string values. JSON only allows: \" \\ \/ \b \f \n \r \t \uXXXX.
 * LLMs often produce invalid escapes like \s, \d, \p, \' etc.
 */
export function sanitizeJsonStrings(json: string): string {
  const VALID_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    const code = json.charCodeAt(i);
    if (inString) {
      if (escaped) {
        escaped = false;
        if (VALID_ESCAPES.has(ch)) {
          result += ch;
        } else {
          result = result.slice(0, -1) + ch;
        }
        continue;
      }
      if (ch === "\\") { escaped = true; result += ch; continue; }
      if (ch === '"') { inString = false; result += ch; continue; }
      if (code < 0x20) {
        if (code === 0x0a) { result += "\\n"; continue; }
        if (code === 0x0d) { result += "\\r"; continue; }
        if (code === 0x09) { result += "\\t"; continue; }
        result += "\\u" + code.toString(16).padStart(4, "0");
        continue;
      }
      result += ch;
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }
  return result;
}

/**
 * Fix unescaped double quotes inside JSON string values.
 * Walks the JSON, tracking whether we're inside a string. When a " is
 * encountered inside a string, we check if closing here would produce valid
 * JSON structure (next meaningful char should be , : } ]). If not, it's an
 * embedded quote → escape it.
 */
export function fixUnescapedQuotes(json: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;
  let afterColon = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        result.push(ch);
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        result.push(ch);
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        while (j < json.length && (json[j] === " " || json[j] === "\t" || json[j] === "\n" || json[j] === "\r")) j++;
        const next = j < json.length ? json[j] : "";
        if (next === "" || next === "," || next === "}" || next === "]" || next === ":") {
          inString = false;
          afterColon = next === ":";
          result.push(ch);
        } else {
          result.push('\\"');
        }
        continue;
      }
      result.push(ch);
      continue;
    }

    // Not in string
    if (ch === '"') {
      inString = true;
      result.push(ch);
      continue;
    }
    if (ch === ":") afterColon = true;
    else if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") afterColon = false;
    result.push(ch);
  }

  return result.join("");
}

/**
 * Multi-stage JSON repair for LLM output. Attempts progressively more
 * aggressive repairs until the JSON parses successfully.
 *
 * Stages:
 *  1. Strip markdown fences, extract outermost JSON structure
 *  2. Try parsing as-is (fast path for valid JSON)
 *  3. Sanitize control characters and invalid escapes
 *  4. Fix unescaped embedded double quotes
 *  5. State-machine structural repair (truncation recovery)
 *  6. Aggressive repair: close unterminated strings + structures
 */
export function cleanJson(raw: string): string {
  // Strip markdown fences
  let s = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  // Extract the outermost JSON object/array if there's surrounding text
  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  const start = firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket) ? firstBrace : firstBracket;
  if (start > 0) s = s.slice(start);

  // Try parsing as-is first
  try { JSON.parse(s); return s; } catch { /* continue with repairs */ }

  // Sanitize unescaped control characters inside strings
  s = sanitizeJsonStrings(s);
  try { JSON.parse(s); return s; } catch { /* continue */ }

  // Fix unescaped double quotes inside string values
  s = fixUnescapedQuotes(s);
  try { JSON.parse(s); return s; } catch { /* continue with structural repairs */ }

  // State-machine repair: track string/structure context properly
  const stack: string[] = [];
  let inString = false;
  let lastValidEnd = -1;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = false; continue; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") { stack.push(ch); continue; }
    if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) {
        const candidate = s.slice(0, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { /* continue */ }
      }
      if (stack.length === 1) lastValidEnd = i;
      continue;
    }
  }

  // Truncated — try to repair by closing open structures
  if (lastValidEnd > 0) {
    let repaired = s.slice(0, lastValidEnd + 1);
    repaired = repaired.replace(/,\s*$/, "");
    const rStack: string[] = [];
    let rInStr = false, rEsc = false;
    for (let i = 0; i < repaired.length; i++) {
      const ch = repaired[i];
      if (rInStr) { if (rEsc) { rEsc = false; } else if (ch === "\\") { rEsc = true; } else if (ch === '"') { rInStr = false; } continue; }
      if (ch === '"') { rInStr = true; continue; }
      if (ch === "{" || ch === "[") rStack.push(ch);
      if (ch === "}" || ch === "]") rStack.pop();
    }
    while (rStack.length > 0) {
      const open = rStack.pop()!;
      repaired += open === "{" ? "}" : "]";
    }
    try { JSON.parse(repaired); return repaired; } catch { /* continue */ }
  }

  // Aggressive repair: close the unterminated string + all open structures
  let repaired = s;
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, "");
  const fStack: string[] = [];
  let fInStr = false, fEsc = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (fInStr) { if (fEsc) { fEsc = false; } else if (ch === "\\") { fEsc = true; } else if (ch === '"') { fInStr = false; } continue; }
    if (ch === '"') { fInStr = true; continue; }
    if (ch === "{" || ch === "[") fStack.push(ch);
    if (ch === "}" || ch === "]") fStack.pop();
  }
  while (fStack.length > 0) {
    const open = fStack.pop()!;
    repaired += open === "{" ? "}" : "]";
  }
  try { JSON.parse(repaired); return repaired; } catch { /* continue */ }

  // Last resort: return the stripped version and let caller handle the error
  return s;
}
