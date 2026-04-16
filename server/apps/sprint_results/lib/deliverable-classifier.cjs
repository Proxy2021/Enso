/**
 * Smart Deliverable Classifier
 *
 * Analyzes sprint deliverable content from wiki markdown and generates
 * context-aware, content-specific activation steps — replacing generic templates.
 *
 * Works WITHOUT an LLM call by default (heuristic markdown parsing).
 * Falls back to ctx.ask() for complex content that can't be parsed heuristically.
 */

var path = require("path");
var os = require("os");

// ── Markdown Parsing Utilities ──

/**
 * Extract headings from markdown content.
 * @param {string} md - Raw markdown text
 * @returns {Array<{level: number, text: string}>}
 */
function extractHeadings(md) {
  var headings = [];
  var lines = md.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim() });
    }
  }
  return headings;
}

/**
 * Extract bullet-point items from markdown.
 * @param {string} md - Raw markdown text
 * @returns {string[]}
 */
function extractBulletPoints(md) {
  var bullets = [];
  var lines = md.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(/^\s*[-*+]\s+(.+)/);
    if (match) {
      bullets.push(match[1].trim());
    }
  }
  return bullets;
}

/**
 * Extract code blocks from markdown.
 * @param {string} md - Raw markdown text
 * @returns {Array<{language: string, code: string}>}
 */
function extractCodeBlocks(md) {
  var blocks = [];
  var regex = /```(\w*)\n([\s\S]*?)```/g;
  var m;
  while ((m = regex.exec(md)) !== null) {
    blocks.push({ language: m[1] || "text", code: m[2].trim() });
  }
  return blocks;
}

/**
 * Extract action items — lines with checkboxes, numbered steps, or imperative verbs.
 * @param {string} md - Raw markdown text
 * @returns {string[]}
 */
function extractActionItems(md) {
  var items = [];
  var lines = md.split("\n");
  var imperativeVerbs = /^\s*(?:[-*+]|\d+[.)]\s)\s*((?:Run|Open|Test|Try|Apply|Use|Create|Build|Check|Review|Analyze|Compare|Configure|Set up|Install|Import|Export|Download|Upload|Enable|Deploy|Start|Launch|Execute|Integrate|Validate)\b.+)/i;
  var checkboxPattern = /^\s*[-*+]\s+\[[ x]\]\s+(.+)/i;
  for (var i = 0; i < lines.length; i++) {
    var cbMatch = lines[i].match(checkboxPattern);
    if (cbMatch) {
      items.push(cbMatch[1].trim());
      continue;
    }
    var verbMatch = lines[i].match(imperativeVerbs);
    if (verbMatch) {
      items.push(verbMatch[1].trim());
    }
  }
  return items;
}

/**
 * Extract the best preview snippet — first substantive paragraph of content.
 * @param {string} md - Raw markdown text
 * @param {number} maxLen - Maximum characters
 * @returns {string}
 */
function extractPreviewSnippet(md, maxLen) {
  maxLen = maxLen || 300;
  var lines = md.split("\n");
  var paragraphs = [];
  var current = "";
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    // Skip headings, horizontal rules, code fence markers, metadata
    if (/^#{1,6}\s/.test(line) || /^---/.test(line) || /^```/.test(line)) {
      if (current.length > 30) paragraphs.push(current.trim());
      current = "";
      continue;
    }
    if (line === "") {
      if (current.length > 30) paragraphs.push(current.trim());
      current = "";
      continue;
    }
    current += (current ? " " : "") + line;
  }
  if (current.length > 30) paragraphs.push(current.trim());

  // Pick the first substantive paragraph (skip very short ones)
  for (var p = 0; p < paragraphs.length; p++) {
    if (paragraphs[p].length > 40) {
      var snippet = paragraphs[p];
      if (snippet.length > maxLen) {
        snippet = snippet.substring(0, maxLen - 3) + "...";
      }
      return snippet;
    }
  }
  return paragraphs.length > 0 ? paragraphs[0].substring(0, maxLen) : "";
}

/**
 * Build a content summary from headings and first paragraph.
 * @param {string} md - Raw markdown text
 * @param {string} taskTitle - Deliverable title
 * @returns {string}
 */
function buildContentSummary(md, taskTitle) {
  var headings = extractHeadings(md);
  var sectionNames = [];
  for (var i = 0; i < Math.min(headings.length, 6); i++) {
    if (headings[i].level <= 3) sectionNames.push(headings[i].text);
  }

  var preview = extractPreviewSnippet(md, 200);
  var parts = [];
  if (preview) parts.push(preview);
  if (sectionNames.length > 1) {
    parts.push("Covers: " + sectionNames.slice(0, 4).join(", ") +
      (sectionNames.length > 4 ? " and " + (sectionNames.length - 4) + " more sections" : ""));
  }
  return parts.join(" ") || "Content for: " + taskTitle;
}

/**
 * Extract key topics from headings and bold text.
 * @param {string} md - Raw markdown text
 * @returns {string[]}
 */
function extractKeyTopics(md) {
  var topics = [];
  var seen = {};

  // From headings
  var headings = extractHeadings(md);
  for (var i = 0; i < headings.length; i++) {
    var h = headings[i].text.replace(/[*_`#]/g, "").trim();
    if (h.length > 2 && h.length < 60 && !seen[h.toLowerCase()]) {
      seen[h.toLowerCase()] = true;
      topics.push(h);
    }
  }

  // From bold text
  var boldRegex = /\*\*([^*]+)\*\*/g;
  var m;
  while ((m = boldRegex.exec(md)) !== null) {
    var t = m[1].trim();
    if (t.length > 2 && t.length < 60 && !seen[t.toLowerCase()]) {
      seen[t.toLowerCase()] = true;
      topics.push(t);
    }
  }

  return topics.slice(0, 10);
}

// ── Activation Type Classification ──

/**
 * Determine activation type from entity type and content analysis.
 * @param {string} entityType
 * @param {string} md
 * @returns {'run'|'read-and-apply'|'explore'|'build-on'|'review-and-decide'}
 */
function determineActivationType(entityType, md) {
  if (entityType === "app") return "run";

  var lower = md.toLowerCase();
  var hasCode = /```/.test(md);
  var hasActionItems = extractActionItems(md).length > 3;
  var hasDecisionFramework = /decision|choose|option|trade-?off|vs\b|versus|compare/i.test(md);
  var hasResearchContent = /research|findings|analysis|study|data|results/i.test(md);

  if (entityType === "article") {
    if (hasActionItems) return "read-and-apply";
    if (hasDecisionFramework) return "review-and-decide";
    return "read-and-apply";
  }
  if (entityType === "idea") {
    if (hasCode) return "build-on";
    return "explore";
  }
  // synthesis or other
  if (hasDecisionFramework) return "review-and-decide";
  if (hasResearchContent) return "explore";
  return "review-and-decide";
}

// ── Content-Specific Step Generation ──

/**
 * Generate activation steps specific to the actual content.
 * @param {object} opts
 * @param {string} opts.entityType
 * @param {string} opts.activationType
 * @param {string} opts.taskTitle
 * @param {string} opts.md - Full markdown content
 * @param {string} opts.painPoint
 * @param {string} opts.quickStart
 * @returns {Array<{instruction: string, context: string, estimatedMinutes: number}>}
 */
function generateContentAwareSteps(opts) {
  var headings = extractHeadings(opts.md);
  var bullets = extractBulletPoints(opts.md);
  var actionItems = extractActionItems(opts.md);
  var codeBlocks = extractCodeBlocks(opts.md);
  var topics = extractKeyTopics(opts.md);

  // Pick the most meaningful heading sections (level 2-3)
  var keySections = [];
  for (var h = 0; h < headings.length; h++) {
    if (headings[h].level >= 2 && headings[h].level <= 3) {
      keySections.push(headings[h].text);
    }
  }

  var steps = [];

  if (opts.entityType === "app") {
    steps = generateAppSteps(opts, codeBlocks, keySections, actionItems);
  } else if (opts.entityType === "article") {
    steps = generateArticleSteps(opts, keySections, bullets, actionItems, topics);
  } else if (opts.entityType === "idea") {
    steps = generateIdeaSteps(opts, keySections, bullets, topics);
  } else {
    steps = generateSynthesisSteps(opts, keySections, bullets, topics);
  }

  // Ensure we have at least 3 steps, at most 5
  if (steps.length < 3) {
    steps.push({
      instruction: "Note your key takeaways and how they connect to: " + (opts.painPoint || opts.taskTitle),
      context: "Capturing personal insights while the content is fresh ensures you act on them",
      estimatedMinutes: 5
    });
  }
  if (steps.length < 3) {
    steps.push({
      instruction: "Identify one concrete action to take this week based on " + opts.taskTitle,
      context: "A single focused action beats a long to-do list",
      estimatedMinutes: 3
    });
  }

  return steps.slice(0, 5);
}

function generateAppSteps(opts, codeBlocks, keySections, actionItems) {
  var steps = [];
  var qs = opts.quickStart || "Open " + opts.taskTitle;

  // Step 1: Launch with specific context
  steps.push({
    instruction: qs,
    context: opts.painPoint ? "This directly addresses: " + opts.painPoint : "Get the app running to see what it does",
    estimatedMinutes: 3
  });

  // Step 2: Test with real data — reference specific features from sections
  var testContext = "Use your actual data";
  if (keySections.length > 0) {
    testContext = "Focus on testing: " + keySections.slice(0, 2).join(" and ");
  }
  steps.push({
    instruction: "Test with your real data — try the core workflow end-to-end",
    context: testContext,
    estimatedMinutes: 10
  });

  // Step 3: Reference specific action items if found
  if (actionItems.length > 0) {
    steps.push({
      instruction: actionItems[0],
      context: "This action was identified as a key step in the app's workflow",
      estimatedMinutes: 5
    });
  }

  // Step 4: Evaluate and note gaps
  steps.push({
    instruction: "Note what works and what's missing for your specific use case" + (opts.painPoint ? " (" + opts.painPoint + ")" : ""),
    context: "Your feedback drives the next sprint's improvements",
    estimatedMinutes: 5
  });

  // Step 5: Integrate
  steps.push({
    instruction: "Add " + opts.taskTitle + " to your regular workflow or request specific improvements",
    context: "An app only delivers value when it becomes part of your routine",
    estimatedMinutes: 5
  });

  return steps;
}

function generateArticleSteps(opts, keySections, bullets, actionItems, topics) {
  var steps = [];

  // Step 1: Read with focus
  var readTarget = keySections.length > 0 ?
    "Read " + opts.taskTitle + " — start with the \"" + keySections[0] + "\" section" :
    "Read " + opts.taskTitle + " from start to finish";
  steps.push({
    instruction: readTarget,
    context: opts.quickStart || "This article was created to address: " + (opts.painPoint || "your current needs"),
    estimatedMinutes: keySections.length > 5 ? 15 : 10
  });

  // Step 2: Highlight specific insights — reference actual bullets
  var insightBullets = bullets.slice(0, 3);
  if (insightBullets.length > 0) {
    var insightText = insightBullets[0];
    if (insightText.length > 80) insightText = insightText.substring(0, 77) + "...";
    steps.push({
      instruction: "Identify which insights apply to you — for example: \"" + insightText + "\"",
      context: "The article contains " + bullets.length + " specific points — pick the 2-3 most relevant to your situation",
      estimatedMinutes: 5
    });
  }

  // Step 3: Apply specific topic
  if (topics.length > 1) {
    steps.push({
      instruction: "Apply the \"" + topics[1] + "\" approach to a current project or task",
      context: "Applying one technique immediately creates muscle memory and validates the idea",
      estimatedMinutes: 15
    });
  } else if (actionItems.length > 0) {
    steps.push({
      instruction: actionItems[0],
      context: "This is a concrete action identified in the article",
      estimatedMinutes: 10
    });
  }

  // Step 4: Cross-reference
  if (keySections.length > 2) {
    steps.push({
      instruction: "Cross-reference the \"" + keySections[Math.min(2, keySections.length - 1)] + "\" section with your existing knowledge in Cortex",
      context: "Linking new insights to what you already know strengthens retention and reveals gaps",
      estimatedMinutes: 5
    });
  }

  return steps;
}

function generateIdeaSteps(opts, keySections, bullets, topics) {
  var steps = [];

  // Step 1: Explore the core concept
  steps.push({
    instruction: "Explore " + opts.taskTitle + (keySections.length > 0 ? " — start with \"" + keySections[0] + "\"" : ""),
    context: opts.quickStart || "Understand the core proposition before diving into details",
    estimatedMinutes: 10
  });

  // Step 2: Research the most exciting aspect
  if (topics.length > 1) {
    steps.push({
      instruction: "Deep-dive into \"" + topics[Math.min(1, topics.length - 1)] + "\" — the most actionable aspect of this idea",
      context: "Focus your research energy on the part with the highest potential impact",
      estimatedMinutes: 15
    });
  }

  // Step 3: Feasibility check using specific content
  if (bullets.length > 0) {
    var feasibilityPoint = bullets[0];
    if (feasibilityPoint.length > 80) feasibilityPoint = feasibilityPoint.substring(0, 77) + "...";
    steps.push({
      instruction: "Assess feasibility: can you act on \"" + feasibilityPoint + "\" with your current setup?",
      context: "Ground the idea in reality — what resources and skills do you already have?",
      estimatedMinutes: 10
    });
  }

  // Step 4: Sketch prototype
  steps.push({
    instruction: "Sketch a quick prototype or outline for how you'd use " + opts.taskTitle + " in practice",
    context: opts.painPoint ? "Keep your pain point in focus: " + opts.painPoint : "Turn the abstract idea into something concrete",
    estimatedMinutes: 15
  });

  return steps;
}

function generateSynthesisSteps(opts, keySections, bullets, topics) {
  var steps = [];

  // Step 1: Review with section-specific guidance
  steps.push({
    instruction: "Review " + opts.taskTitle + (keySections.length > 0 ? " — pay special attention to \"" + keySections[0] + "\"" : ""),
    context: opts.quickStart || "This synthesis was generated to address: " + (opts.painPoint || "cross-cutting patterns in your work"),
    estimatedMinutes: 10
  });

  // Step 2: Extract patterns — reference actual topics found
  if (topics.length > 2) {
    steps.push({
      instruction: "Extract the key patterns connecting: " + topics.slice(0, 3).join(", "),
      context: "These " + topics.length + " topics were identified as the main themes — look for what unifies them",
      estimatedMinutes: 10
    });
  }

  // Step 3: Cross-reference with Cortex
  steps.push({
    instruction: "Cross-reference findings with your existing Cortex knowledge — look for confirmations or contradictions",
    context: "Synthesis gains power when connected to your broader knowledge graph",
    estimatedMinutes: 10
  });

  // Step 4: Decide next action
  if (keySections.length > 1) {
    steps.push({
      instruction: "Based on the \"" + keySections[keySections.length > 2 ? 2 : 1] + "\" section, decide one concrete next step",
      context: "A synthesis should lead to action — pick the highest-impact move",
      estimatedMinutes: 5
    });
  }

  return steps;
}

// ── Related Actions Generator ──

function generateRelatedActions(entityType, taskTitle, topics, keySections) {
  var actions = [];
  if (entityType === "app") {
    actions.push("Request improvements to " + taskTitle);
    if (topics.length > 0) actions.push("Research more about " + topics[0]);
  } else if (entityType === "article") {
    actions.push("Save key insights to Cortex");
    if (topics.length > 0) actions.push("Find related articles about " + topics[0]);
    actions.push("Generate a podcast from this article");
  } else if (entityType === "idea") {
    actions.push("Start a research sprint on " + taskTitle);
    actions.push("Convert to a project in Cortex");
    if (topics.length > 0) actions.push("Explore related ideas about " + topics[0]);
  } else {
    actions.push("Share this synthesis via email");
    actions.push("Create a follow-up research question");
    if (keySections.length > 0) actions.push("Deep-dive into " + keySections[0]);
  }
  return actions.slice(0, 3);
}

// ── Wiki Content Loader ──

/**
 * Load wiki content for a given entity ID.
 * Entity ID format: cortex:<type>:<slug>
 * @param {object} ctx - Executor context with readFile
 * @param {string} entityId
 * @returns {Promise<string>} Markdown content or empty string
 */
async function loadWikiContent(ctx, entityId) {
  var slug = "";
  var parts = entityId.split(":");
  if (parts.length >= 3) {
    slug = parts.slice(2).join(":");
  } else {
    slug = entityId;
  }

  var homeDir = process.env.HOME || process.env.USERPROFILE || "~";
  var searchPaths = [
    homeDir + "/.enso/wiki/synthesis/" + slug + ".md",
    homeDir + "/.enso/wiki/entities/" + slug + ".md"
  ];

  for (var i = 0; i < searchPaths.length; i++) {
    try {
      var result = await ctx.readFile(searchPaths[i]);
      if (result) {
        var content = typeof result === "string" ? result :
                      (result.data || result.content || "");
        if (content && content.length > 10) return content;
      }
    } catch (e) {
      // Try next path
    }
  }
  return "";
}

// ── Main Classifier ──

/**
 * Classify a sprint deliverable and generate context-aware activation steps.
 *
 * @param {object} ctx - Executor context (provides readFile, optionally ask)
 * @param {object} deliverable - Deliverable metadata from focus area
 * @param {string} deliverable.entityId - Cortex entity ID
 * @param {string} deliverable.entityType - app, article, idea, synthesis
 * @param {string} deliverable.taskTitle - Deliverable title
 * @param {string} [deliverable.painPoint] - Pain point this addresses
 * @param {string} [deliverable.howItHelps] - How it helps
 * @param {string} [deliverable.quickStart] - Quick start instruction
 * @param {string} [wikiContent] - Pre-loaded wiki content (if available)
 * @returns {Promise<{
 *   activationType: string,
 *   contentSummary: string,
 *   keyTopics: string[],
 *   activationSteps: Array<{instruction: string, context: string, estimatedMinutes: number}>,
 *   previewSnippet: string,
 *   relatedActions: string[],
 *   classified: boolean
 * }>}
 */
async function classifyDeliverable(ctx, deliverable, wikiContent) {
  var entityType = deliverable.entityType || "synthesis";
  var taskTitle = deliverable.taskTitle || "Untitled";
  var painPoint = deliverable.painPoint || "";
  var quickStart = deliverable.quickStart || "";

  // Load wiki content if not provided
  var md = wikiContent || "";
  if (!md && deliverable.entityId) {
    md = await loadWikiContent(ctx, deliverable.entityId);
  }

  // If no wiki content found, build minimal content from deliverable metadata
  if (!md || md.length < 50) {
    md = "# " + taskTitle + "\n\n";
    if (painPoint) md += "**Pain Point:** " + painPoint + "\n\n";
    if (deliverable.howItHelps) md += "**How It Helps:** " + deliverable.howItHelps + "\n\n";
    if (quickStart) md += "**Quick Start:** " + quickStart + "\n\n";
  }

  var activationType = determineActivationType(entityType, md);
  var contentSummary = buildContentSummary(md, taskTitle);
  var keyTopics = extractKeyTopics(md);
  var previewSnippet = extractPreviewSnippet(md, 300);
  var headings = extractHeadings(md);
  var keySections = [];
  for (var i = 0; i < headings.length; i++) {
    if (headings[i].level >= 2 && headings[i].level <= 3) keySections.push(headings[i].text);
  }

  var activationSteps = generateContentAwareSteps({
    entityType: entityType,
    activationType: activationType,
    taskTitle: taskTitle,
    md: md,
    painPoint: painPoint,
    quickStart: quickStart
  });

  var relatedActions = generateRelatedActions(entityType, taskTitle, keyTopics, keySections);

  return {
    activationType: activationType,
    contentSummary: contentSummary,
    keyTopics: keyTopics,
    activationSteps: activationSteps,
    previewSnippet: previewSnippet,
    relatedActions: relatedActions,
    classified: true
  };
}

/**
 * Classify with LLM fallback — uses ctx.ask() for complex content.
 * Only called when heuristic classification produces weak results.
 *
 * @param {object} ctx - Executor context with ask()
 * @param {object} deliverable - Deliverable metadata
 * @param {string} wikiContent - Wiki markdown content
 * @returns {Promise<object>} Same shape as classifyDeliverable result
 */
async function classifyWithLLM(ctx, deliverable, wikiContent) {
  if (!ctx.ask) {
    // No LLM available, fall back to heuristic
    return classifyDeliverable(ctx, deliverable, wikiContent);
  }

  var taskTitle = deliverable.taskTitle || "Untitled";
  var entityType = deliverable.entityType || "synthesis";
  var painPoint = deliverable.painPoint || "";
  var contentPreview = (wikiContent || "").substring(0, 2000);

  var prompt = "Analyze this sprint deliverable and generate 3-5 specific activation steps.\n\n" +
    "Title: " + taskTitle + "\n" +
    "Type: " + entityType + "\n" +
    "Pain Point: " + painPoint + "\n\n" +
    "Content (first 2000 chars):\n" + contentPreview + "\n\n" +
    "Return JSON with this exact shape:\n" +
    '{"activationType":"run|read-and-apply|explore|build-on|review-and-decide",' +
    '"contentSummary":"2-3 sentence summary",' +
    '"keyTopics":["topic1","topic2"],' +
    '"activationSteps":[{"instruction":"specific step","context":"why it matters","estimatedMinutes":5}],' +
    '"relatedActions":["action1","action2"]}\n' +
    "Make instructions reference SPECIFIC content from the deliverable. No generic advice.";

  try {
    var response = await ctx.ask(prompt);
    var text = typeof response === "string" ? response :
               (response.text || response.content || "");

    // Extract JSON from response
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      var parsed = JSON.parse(jsonMatch[0]);
      return {
        activationType: parsed.activationType || "review-and-decide",
        contentSummary: parsed.contentSummary || "",
        keyTopics: parsed.keyTopics || [],
        activationSteps: parsed.activationSteps || [],
        previewSnippet: extractPreviewSnippet(wikiContent || "", 300),
        relatedActions: parsed.relatedActions || [],
        classified: true
      };
    }
  } catch (e) {
    // LLM failed, fall through to heuristic
  }

  return classifyDeliverable(ctx, deliverable, wikiContent);
}

module.exports = {
  classifyDeliverable: classifyDeliverable,
  classifyWithLLM: classifyWithLLM,
  loadWikiContent: loadWikiContent,
  // Exported for testing
  extractHeadings: extractHeadings,
  extractBulletPoints: extractBulletPoints,
  extractCodeBlocks: extractCodeBlocks,
  extractActionItems: extractActionItems,
  extractPreviewSnippet: extractPreviewSnippet,
  extractKeyTopics: extractKeyTopics,
  determineActivationType: determineActivationType
};
