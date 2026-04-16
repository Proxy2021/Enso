// Sprint Results: Launch Executor — True Activator
// Type-specific activation: app (run/register), article (content+insights),
// idea (exploration paths), synthesis (interactive checklist).

var entityId = (params.entityId || "").trim();
var entityType = (params.entityType || "").trim();
var focusIdParam = (params.focusId || "").trim();

if (!entityId || !entityType) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_sprint_results_launch",
    success: false,
    error: "Missing entityId or entityType parameter"
  }) }] };
}

var homeDir = process.env.HOME || process.env.USERPROFILE || "~";

// ── Helpers ──

async function readContent(path) {
  try {
    var r = await ctx.readFile(path);
    if (typeof r === "string") return r.length > 0 ? r : null;
    if (r && r.success !== false && r.data) {
      var d = typeof r.data === "string" ? r.data : String(r.data);
      return d.length > 0 ? d : null;
    }
    if (r && r.content) return String(r.content);
  } catch (e) {}
  return null;
}

async function listEntries(dir) {
  try {
    var r = await ctx.listDir(dir);
    if (Array.isArray(r)) return r;
    if (r && Array.isArray(r.data)) return r.data;
  } catch (e) {}
  return [];
}

function parseSlug(eid) {
  var parts = eid.split(":");
  return parts.length >= 3 ? parts.slice(2).join(":") : eid;
}

function toAppFamily(s) {
  return s.replace(/-/g, "_").toLowerCase();
}

function getPreview(text, maxLen) {
  if (!text) return "";
  var c = text.replace(/^---[\s\S]*?---\n?/, "").trim();
  c = c.replace(/^#[^\n]*\n/, "").trim();
  return c.length > (maxLen || 300) ? c.substring(0, maxLen || 300) + "..." : c;
}

function extractHeadings(text) {
  if (!text) return [];
  var out = [];
  var lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^#{1,3}\s+(.+)/);
    if (m && m[1]) out.push(m[1].trim());
  }
  return out;
}

function extractActionItems(text) {
  if (!text) return [];
  var items = [];
  var lines = text.split("\n");
  var prefixes = ["action:", "\u2192", "next step:", "- [ ]", "todo:", "try this:", "step "];
  for (var i = 0; i < lines.length && items.length < 8; i++) {
    var line = lines[i].trim();
    var lower = line.toLowerCase();
    for (var p = 0; p < prefixes.length; p++) {
      var idx = lower.indexOf(prefixes[p]);
      if (idx >= 0 && idx < 5) {
        items.push(line.replace(/^[-*]\s*/, "").replace(/^\[[ x]\]\s*/, ""));
        break;
      }
    }
  }
  return items;
}

function extractKeyPoints(text, max) {
  if (!text) return [];
  var items = [];
  var lines = text.split("\n");
  for (var i = 0; i < lines.length && items.length < (max || 5); i++) {
    var line = lines[i].trim();
    if (/^[-*]\s+\*\*/.test(line) || /^\d+\.\s+\*\*/.test(line)) {
      items.push(line.replace(/^[-*\d.]+\s*/, ""));
    }
  }
  if (items.length === 0) {
    var bolds = text.match(/\*\*([^*]+)\*\*/g);
    if (bolds) {
      for (var b = 0; b < Math.min(bolds.length, max || 5); b++) {
        items.push(bolds[b].replace(/\*\*/g, ""));
      }
    }
  }
  return items;
}

function classifyContent(content, type) {
  if (!content) return { summary: "", complexity: "simple", estimatedTime: "1 min", wordCount: 0, sections: 0 };
  var wordCount = content.split(/\s+/).length;
  var headingCount = (content.match(/^#{1,3}\s/gm) || []).length;
  var complexity = wordCount > 2000 ? "detailed" : wordCount > 500 ? "moderate" : "simple";
  var timeMap = {
    app: complexity === "detailed" ? "5\u201310 min" : "2\u20135 min",
    article: complexity === "detailed" ? "10\u201315 min read" : "3\u20135 min read",
    idea: complexity === "detailed" ? "15\u201320 min exploration" : "5\u201310 min exploration",
    synthesis: complexity === "detailed" ? "10\u201315 min review" : "3\u20135 min review"
  };
  var cleaned = content.replace(/^---[\s\S]*?---\n?/, "").replace(/^#[^\n]*\n/, "").trim();
  var firstSentence = cleaned.split(/[.!?\n]/)[0].trim();
  if (firstSentence.length > 200) firstSentence = firstSentence.substring(0, 200) + "...";
  return {
    summary: firstSentence,
    complexity: complexity,
    estimatedTime: timeMap[type] || "2\u20135 min",
    wordCount: wordCount,
    sections: headingCount
  };
}

// ── Load Entity Content from Wiki ──

var slug = parseSlug(entityId);
var entityContent = null;
var entityTitle = "";
var entityFound = false;

var wikiPaths = [
  homeDir + "/.enso/wiki/synthesis/" + slug + ".md",
  homeDir + "/.enso/wiki/entities/" + slug + ".md"
];
for (var wp = 0; wp < wikiPaths.length; wp++) {
  var wc = await readContent(wikiPaths[wp]);
  if (wc && wc.length > 10) {
    entityContent = wc;
    entityTitle = slug.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    entityFound = true;
    break;
  }
}

if (!entityFound) {
  var searchDirs = [homeDir + "/.enso/wiki/synthesis/", homeDir + "/.enso/wiki/entities/"];
  for (var si = 0; si < searchDirs.length && !entityFound; si++) {
    var entries = await listEntries(searchDirs[si]);
    for (var ei = 0; ei < entries.length; ei++) {
      var fname = entries[ei].name || entries[ei];
      if (typeof fname === "string" && (fname.indexOf(entityId) >= 0 || fname.indexOf(slug) >= 0)) {
        var fc = await readContent(searchDirs[si] + fname);
        if (fc) {
          entityContent = fc;
          entityTitle = String(fname).replace(/\.md$/, "").replace(/\.json$/, "");
          entityFound = true;
          break;
        }
      }
    }
  }
}

// ── Load Deliverable Context from Focus Areas ──

var deliverable = null;
var focusTitle = "";
try {
  var focusRaw = await readContent(homeDir + "/.enso/data/focus-areas.json");
  if (focusRaw) {
    var focusData = JSON.parse(focusRaw);
    if (focusData && focusData.areas) {
      for (var ai = 0; ai < focusData.areas.length; ai++) {
        var area = focusData.areas[ai];
        if (area.lastSprintSummary && area.lastSprintSummary.deliverables) {
          for (var di = 0; di < area.lastSprintSummary.deliverables.length; di++) {
            var del = area.lastSprintSummary.deliverables[di];
            if (del.entityId === entityId) {
              deliverable = del;
              focusTitle = area.title || "";
              break;
            }
          }
        }
        if (deliverable) break;
      }
    }
  }
} catch (e) {}

if (deliverable) {
  if (!entityTitle) entityTitle = deliverable.taskTitle || slug;
  if (!entityContent) {
    entityContent = "**" + (deliverable.taskTitle || "") + "**\n\n" +
      "Pain Point: " + (deliverable.painPoint || "") + "\n\n" +
      "How It Helps: " + (deliverable.howItHelps || "") + "\n\n" +
      "Quick Start: " + (deliverable.quickStart || "");
    entityFound = true;
  }
}

// ── Mark as Acted On ──

if (focusIdParam) {
  var statusMap = await ctx.store.get("status_" + focusIdParam) || {};
  statusMap[entityId] = "acted_on";
  await ctx.store.set("status_" + focusIdParam, statusMap);
}

// ── Content Classification (inline, with external classifier fallback) ──

var classification = classifyContent(entityContent, entityType);
try {
  var classifier = require("../apps/sprint_results/lib/deliverable-classifier.cjs");
  if (classifier && classifier.classifyDeliverable && entityFound) {
    var extClass = await classifier.classifyDeliverable(ctx, {
      entityId: entityId, entityType: entityType,
      taskTitle: entityTitle || entityId,
      painPoint: deliverable ? (deliverable.painPoint || "") : "",
      howItHelps: deliverable ? (deliverable.howItHelps || "") : "",
      quickStart: deliverable ? (deliverable.quickStart || "") : ""
    }, entityContent || "");
    if (extClass) {
      classification.summary = extClass.contentSummary || classification.summary;
      classification.keyTopics = extClass.keyTopics || [];
      classification.activationType = extClass.activationType || null;
    }
  }
} catch (e) {}

// ── Type-Specific Activation ──

var activation = {};

if (entityType === "app") {
  var appFamily = toAppFamily(slug);
  var appJsonPath = homeDir + "/.enso/apps/" + appFamily + "/app.json";
  var appSpec = null;

  var appContent = await readContent(appJsonPath);
  if (appContent) {
    try { appSpec = JSON.parse(appContent); } catch (e) {}
  }

  if (appSpec && appSpec.spec && appSpec.spec.tools && appSpec.spec.tools.length > 0) {
    var primarySuffix = null;
    for (var ti = 0; ti < appSpec.spec.tools.length; ti++) {
      if (appSpec.spec.tools[ti].isPrimary) { primarySuffix = appSpec.spec.tools[ti].suffix; break; }
    }
    if (!primarySuffix) primarySuffix = appSpec.spec.tools[0].suffix;

    var toolName = (appSpec.spec.toolPrefix || ("enso_" + appFamily + "_")) + primarySuffix;
    var liveResult = null;
    try { liveResult = await ctx.callTool(toolName, {}); } catch (e) {}

    if (liveResult && liveResult.success) {
      activation = {
        activationType: "app_live",
        appFamily: appFamily,
        primaryTool: toolName,
        toolCount: appSpec.spec.tools.length,
        appDescription: appSpec.spec.description || "",
        liveData: liveResult.data,
        actions: [
          { label: "Open Full App", tool: toolName, params: {} },
          { label: "Start Activation Guide", tool: "enso_sprint_results_activate", params: { focusId: focusIdParam, entityId: entityId } }
        ]
      };
    } else {
      activation = {
        activationType: "app_needs_registration",
        appFamily: appFamily,
        toolCount: appSpec.spec.tools.length,
        appDescription: appSpec.spec.description || "",
        message: "App found on disk with " + appSpec.spec.tools.length + " tools but is not currently registered.",
        actions: [
          { label: "Deploy with Claude Code", tool: "enso_claude_code_run", params: { prompt: "Load and register the " + appFamily + " app, then test it" } },
          { label: "Start Activation Guide", tool: "enso_sprint_results_activate", params: { focusId: focusIdParam, entityId: entityId } }
        ]
      };
    }
  } else {
    activation = {
      activationType: "app_not_deployed",
      appFamily: appFamily,
      message: "App has not been built yet. Use Claude Code to build it from the sprint specification.",
      actions: [
        { label: "Build with Claude Code", tool: "enso_claude_code_run", params: { prompt: "Build and deploy the " + (entityTitle || slug) + " app from its sprint deliverable specification" } },
        { label: "View Specification", tool: "enso_cortex_entity", params: { entityId: entityId } },
        { label: "Start Activation Guide", tool: "enso_sprint_results_activate", params: { focusId: focusIdParam, entityId: entityId } }
      ]
    };
  }

} else if (entityType === "article") {
  var headings = extractHeadings(entityContent);
  var takeaways = extractKeyPoints(entityContent, 3);
  var actionItems = extractActionItems(entityContent);

  if (actionItems.length === 0) {
    for (var hi = 0; hi < headings.length && actionItems.length < 3; hi++) {
      var hl = headings[hi].toLowerCase();
      if (hl.indexOf("next") >= 0 || hl.indexOf("action") >= 0 || hl.indexOf("apply") >= 0 ||
          hl.indexOf("step") >= 0 || hl.indexOf("implement") >= 0 || hl.indexOf("recommend") >= 0) {
        actionItems.push(headings[hi]);
      }
    }
  }

  activation = {
    activationType: "article_content",
    keyTakeaways: takeaways.length > 0 ? takeaways : headings.slice(0, 3),
    fullContent: entityContent || "",
    sections: headings,
    actionItems: actionItems,
    actions: [
      { label: "Save to Notes", tool: "enso_note_keeper_add", params: { title: entityTitle, content: (entityContent || "").substring(0, 5000) } },
      { label: "Start Activation Guide", tool: "enso_sprint_results_activate", params: { focusId: focusIdParam, entityId: entityId } },
      { label: "Find Related", tool: "enso_cortex_search", params: { query: entityTitle } }
    ]
  };

} else if (entityType === "idea") {
  var ideaHeadings = extractHeadings(entityContent);
  var researchPaths = [];

  for (var ri = 0; ri < Math.min(ideaHeadings.length, 3); ri++) {
    researchPaths.push(ideaHeadings[ri]);
  }
  if (researchPaths.length < 3 && deliverable) {
    if (researchPaths.length < 1) researchPaths.push("Deep dive: " + (deliverable.painPoint || entityTitle));
    if (researchPaths.length < 2) researchPaths.push("Find implementations of " + entityTitle + " in practice");
    if (researchPaths.length < 3) researchPaths.push("Evaluate feasibility and integration paths");
  }
  if (researchPaths.length === 0) {
    researchPaths.push("Explore core concepts of " + entityTitle);
    researchPaths.push("Research practical applications");
    researchPaths.push("Identify next steps for development");
  }

  activation = {
    activationType: "idea_exploration",
    summary: getPreview(entityContent, 300),
    fullContent: entityContent || "",
    researchPaths: researchPaths,
    relatedNote: "Use 'Find Related' to discover connections in your Cortex knowledge base.",
    actions: [
      { label: "Deep Dive Research", tool: "enso_researcher_research", params: { query: entityTitle } },
      { label: "Start Activation Guide", tool: "enso_sprint_results_activate", params: { focusId: focusIdParam, entityId: entityId } },
      { label: "Find Related", tool: "enso_cortex_search", params: { query: entityTitle } }
    ]
  };

} else {
  // synthesis or unknown type
  var synthHeadings = extractHeadings(entityContent);
  var keyPoints = extractKeyPoints(entityContent, 10);

  var checklist = [];
  for (var ci = 0; ci < keyPoints.length; ci++) {
    checklist.push({ item: keyPoints[ci], checked: false, index: ci });
  }

  activation = {
    activationType: "synthesis_interactive",
    keyPatterns: synthHeadings.slice(0, 5),
    checklist: checklist,
    fullContent: entityContent || "",
    actions: [
      { label: "Apply Framework", tool: "enso_sprint_results_activate", params: { focusId: focusIdParam, entityId: entityId } },
      { label: "Find Connections", tool: "enso_cortex_search", params: { query: entityTitle } },
      { label: "Export Summary", tool: "enso_sprint_results_share", params: { focusId: focusIdParam } }
    ]
  };
}

// ── Build Result ──

var actionLabel = entityType === "app" ? "Launched" :
                  entityType === "article" ? "Opened" :
                  entityType === "idea" ? "Exploring" : "Reviewing";

var result = {
  tool: "enso_sprint_results_launch",
  success: true,
  entityId: entityId,
  entityType: entityType,
  title: entityTitle || entityId,
  found: entityFound,
  message: actionLabel + ": " + (entityTitle || entityId),
  painPoint: deliverable ? (deliverable.painPoint || "") : "",
  howItHelps: deliverable ? (deliverable.howItHelps || "") : "",
  quickStart: deliverable ? (deliverable.quickStart || "") : "",
  focusTitle: focusTitle,
  preview: {
    summary: classification.summary,
    snippet: getPreview(entityContent, 300),
    estimatedTime: classification.estimatedTime,
    complexity: classification.complexity,
    wordCount: classification.wordCount,
    sections: classification.sections
  },
  activation: activation,
  content: entityContent || "Entity content will be loaded when available."
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
