/**
 * Project Manager — CRUD + caching for Enso projects.
 *
 * Each project is stored at ~/.enso/projects/<projectId>/project.json
 * with its own sprints/, deliverables/, and team configuration.
 *
 * The "enso" project is pre-configured as the default.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { logAction, logError } from "./action-log.js";
import { getEnsoPath } from "./utils/home.js";

const PROJECTS_DIR = getEnsoPath("projects");

/**
 * For the "enso" project, use the checked-in repo copy as source of truth
 * so it stays in sync across machines via git.
 */
const REPO_PROJECTS_DIR = join(
  import.meta.dirname, "..", "..", "projects"
);

// ── Types ──

export interface TeamAgent {
  id: string;
  name: string;
  role: string;
  responsibilities: string;
  goals: string[];
  perspective: string;
  agentRole: "researcher" | "architect" | "builder" | "coder" | "reviewer";
  painPoints?: string[];
}

export interface SprintFinding {
  sprintId: string;
  sprintDate: number;  // timestamp ms
  finding: string;
  resolved: boolean;
}

export interface Persona {
  id: string;
  name: string;
  role: string;
  background: string;
  goals: string[];
  frustrations: string[];
  testScenarios: string[];
  // Evolving fields — updated by PL meta-review after each sprint
  history?: SprintFinding[];
  unresolvedFrustrations?: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  vision: string;
  codebasePath: string;
  techStack?: string;
  testUrl?: string;
  testCommand?: string;
  branch?: string;  // Git branch for evolution work (default: "main")

  teamAgents: TeamAgent[];
  personas: Persona[];
  validationPersonaIds: string[];

  createdAt: number;
  updatedAt: number;
}

// ── Helpers ──

/**
 * Resolve the directory for a project.
 * "enso" project → repo's projects/enso/ (git-tracked, syncs across machines)
 * All others → ~/.enso/projects/<id>/ (user data, machine-local)
 */
function projectDir(projectId: string): string {
  if (projectId === "enso") {
    const repoDir = join(REPO_PROJECTS_DIR, "enso");
    if (existsSync(join(repoDir, "project.json"))) return repoDir;
  }
  return join(PROJECTS_DIR, projectId);
}

// ── CRUD ──

export function loadProject(projectId: string): Project | null {
  try {
    const filePath = join(projectDir(projectId), "project.json");
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (err) {
    logError("project-manager", `Failed to load project ${projectId}`, err);
    return null;
  }
}

export function saveProject(project: Project): void {
  try {
    const dir = projectDir(project.id);
    mkdirSync(dir, { recursive: true });
    // Sprints & deliverables always in ~/.enso (not git-tracked)
    const dataDir = join(PROJECTS_DIR, project.id);
    mkdirSync(join(dataDir, "sprints"), { recursive: true });
    mkdirSync(join(dataDir, "deliverables"), { recursive: true });
    project.updatedAt = Date.now();
    writeFileSync(join(dir, "project.json"), JSON.stringify(project, null, 2));
    logAction({ ts: Date.now(), type: "action", category: "project-manager", message: `Saved project: ${project.name} (${project.id})` });
  } catch (err) {
    logError("project-manager", `Failed to save project ${project.id}`, err);
  }
}

export function listProjects(): Project[] {
  try {
    mkdirSync(PROJECTS_DIR, { recursive: true });
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const projects: Project[] = [];
    for (const dir of dirs) {
      const p = loadProject(dir);
      if (p) projects.push(p);
    }
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function deleteProject(projectId: string): boolean {
  if (projectId === "enso") return false; // Guard default
  try {
    const dir = join(PROJECTS_DIR, projectId);
    if (!existsSync(dir)) return false;
    rmSync(dir, { recursive: true, force: true });
    logAction({ ts: Date.now(), type: "action", category: "project-manager", message: `Deleted project: ${projectId}` });
    return true;
  } catch (err) {
    logError("project-manager", `Failed to delete project ${projectId}`, err);
    return false;
  }
}

export function getProjectSprintsDir(projectId: string): string {
  return join(PROJECTS_DIR, projectId, "sprints");
}

export function getProjectDeliverablesDir(projectId: string): string {
  return join(PROJECTS_DIR, projectId, "deliverables");
}

// ── Default Enso Project ──

function getDefaultEnsoProject(): Project {
  return {
    id: "enso",
    name: "Enso",
    description: "An AI sandbox that generates complete solutions. It discovers project opportunities, assembles AI teams to build, self-evolves, and ships products.",
    vision: "Enso — an AI sandbox that generates complete solutions. It discovers project opportunities, assembles AI teams to build, self-evolves, and ships products.",
    codebasePath: "D:/Github/Enso",
    techStack: "TypeScript/React 19/Node.js/Vite/Tailwind CSS 4",
    testUrl: "http://localhost:5173",

    teamAgents: [
      {
        id: "project-leader",
        name: "James Rodriguez",
        role: "Project Leader",
        responsibilities: "Meta-controller of Enso's evolution. Defines vision, sets goals for all agents, monitors evolution effectiveness, adjusts team composition and sprint structure. Reviews ALL outputs and writes meta-evaluation. Can modify team agents, personas, goals, and the evolution mechanism itself.",
        goals: [
          "Ensure Enso's vision stays coherent as features are added",
          "Maximize the impact of each evolution sprint",
          "Balance user delight, technical quality, and business viability",
          "Identify when the evolution mechanism itself needs improvement",
        ],
        perspective: "Am I building the right things? Is the team effective? Is the product coherent?",
        agentRole: "architect",
      },
      {
        id: "marketing-director",
        name: "Victoria Park",
        role: "Marketing Director",
        responsibilities: "Evaluates how Enso is positioned and presented to the world. Assesses first impressions, messaging clarity, competitive differentiation. Produces marketing deliverables: landing page copy, feature announcements, social media content, brand guidelines.",
        goals: [
          "Make Enso's value proposition crystal clear in 10 seconds",
          "Differentiate Enso from ChatGPT, Gemini, Manus AI, Devin",
          "Create compelling narratives around Enso's unique capabilities",
          "Build a content strategy that attracts the right users",
        ],
        perspective: "Would someone understand what Enso does immediately? What's the story that sells?",
        agentRole: "researcher",
        painPoints: [],
      },
      {
        id: "sales-director",
        name: "Marcus Thompson",
        role: "Sales Director",
        responsibilities: "Evaluates commercialization and growth potential. Assesses pricing models, customer acquisition channels, enterprise readiness. Produces sales deliverables: pricing strategies, pitch outlines, ROI calculators, partnership proposals.",
        goals: [
          "Define a sustainable monetization strategy for Enso",
          "Identify the highest-value customer segments",
          "Build the ROI narrative for enterprise buyers",
          "Design a pricing model that scales with value delivered",
        ],
        perspective: "How do we make money? Who pays and why? What's the competitive moat?",
        agentRole: "researcher",
        painPoints: [],
      },
      {
        id: "architect",
        name: "Elena Vasquez",
        role: "Software Architect",
        responsibilities: "Owns Enso's technical architecture. Reviews system design, identifies technical debt, ensures scalability and maintainability. Evaluates new feature proposals for architectural fit. Designs solutions for complex cross-cutting concerns (performance, security, data flow). Produces architecture decision records and system design docs.",
        goals: [
          "Keep Enso's architecture clean, modular, and extensible",
          "Prevent technical debt from accumulating across evolution sprints",
          "Ensure new features integrate cleanly with existing systems",
          "Design for scale — what works at 10 users must work at 10,000",
        ],
        perspective: "Is this architecturally sound? Will it scale? Are we creating tech debt?",
        agentRole: "architect",
      },
      {
        id: "engineering-manager",
        name: "David Park",
        role: "Engineering Manager",
        responsibilities: "Manages engineering execution quality. Reviews code changes from evolution sprints for correctness, completeness, and adherence to conventions. Ensures build passes, no regressions introduced, error handling is robust. Coordinates between architect's designs and coder's implementations. Produces engineering quality reports.",
        goals: [
          "Ensure every evolution sprint produces production-quality code",
          "Maintain code consistency and convention adherence across the codebase",
          "Catch bugs and regressions before they reach users",
          "Improve developer experience for both human and AI contributors",
        ],
        perspective: "Is this code production-ready? Are conventions followed? Will it break anything?",
        agentRole: "reviewer",
      },
      {
        id: "test-manager",
        name: "Aisha Rahman",
        role: "QA & Test Manager",
        responsibilities: "Owns testing strategy and quality assurance. Designs test scenarios that cover edge cases and real user workflows. Validates that implemented features actually work end-to-end, not just compile. Identifies gaps in test coverage. Produces test plans, bug reports, and quality metrics.",
        goals: [
          "Ensure every feature works end-to-end in real user scenarios",
          "Design test scenarios that catch the bugs evolution sprints miss",
          "Build a regression testing framework that prevents recurring issues",
          "Track quality metrics across evolution sprints to measure improvement",
        ],
        perspective: "Does this actually work? What edge cases are we missing? Is quality improving?",
        agentRole: "reviewer",
      },
      {
        id: "ai-technology-strategist",
        name: "Dr. Riya Nakamura",
        role: "AI Technology Strategist",
        responsibilities: "Internal AI technology expert. Constantly evaluates the latest AI technology available in the industry. Works with the team to determine if there are latest tech/ideas that can be leveraged to enhance Enso. Researches frontier AI capabilities (new model features, agent architectures, multimodal advances, tool use patterns) and proposes concrete adoption plans.",
        goals: [
          "Identify the most impactful emerging AI capabilities Enso should adopt",
          "Propose architectural improvements based on latest agent research",
          "Evaluate Enso against state-of-the-art AI agent platforms",
          "Recommend technology integrations that would leapfrog competitors",
        ],
        perspective: "What new AI tech exists that we are not leveraging? How do we stay ahead of the curve?",
        agentRole: "researcher",
      },
    ],

    personas: [
      {
        id: "startup-founder",
        name: "Alex Chen",
        role: "Startup Founder & CEO",
        background: "Serial entrepreneur running a 15-person B2B SaaS startup. Time-starved, needs to make fast decisions with incomplete information. Uses AI daily for competitive analysis, market research, investor prep, and strategic planning.",
        goals: [
          "Get comprehensive competitive analysis in minutes, not hours",
          "Make data-driven decisions with interactive dashboards",
          "Prepare investor-ready materials quickly",
          "Compare tools/vendors/strategies with clear recommendations",
        ],
        frustrations: [
          "Generic advice without actionable specifics",
          "Having to re-explain context every session",
          "Slow responses when urgency matters",
          "Results that look nice but lack depth",
        ],
        testScenarios: [
          "Ask Enso to compare 3 CRM platforms for a B2B SaaS startup",
          "Request a competitive landscape analysis of the AI agent market",
          "Ask for a go-to-market strategy for launching in Europe",
          "Try the research feature for 'latest Series A funding trends 2026'",
          "Ask Enso to plan a product launch timeline with milestones",
        ],
      },
      {
        id: "student-researcher",
        name: "Maya Patel",
        role: "Graduate Student & Researcher",
        background: "PhD student in computational biology. Uses AI for literature reviews, data analysis, understanding complex papers, and organizing research notes. Values depth and accuracy over speed.",
        goals: [
          "Deep dive into scientific topics with comprehensive sourcing",
          "Understand complex concepts with clear explanations",
          "Organize and synthesize information from multiple sources",
          "Generate visualizations of data and relationships",
        ],
        frustrations: [
          "Shallow summaries that miss nuances",
          "Lack of proper citations and source verification",
          "Cannot handle technical/domain-specific queries well",
          "No way to build on previous research sessions",
        ],
        testScenarios: [
          "Research 'CRISPR gene editing applications in agriculture 2026'",
          "Ask Enso to explain transformer attention mechanisms with diagrams",
          "Request a comparison of statistical methods for genomic analysis",
          "Try deep research on 'quantum computing impact on drug discovery'",
          "Ask for a literature review structure on machine learning in biology",
        ],
      },
      {
        id: "developer",
        name: "Jordan Kim",
        role: "Senior Full-Stack Developer",
        background: "10 years experience, primarily TypeScript/React/Node.js. Uses AI for code review, debugging, architecture decisions, and learning new technologies. Values precision and working code over explanations.",
        goals: [
          "Get working code solutions, not just concepts",
          "Debug complex issues with full context awareness",
          "Explore new frameworks and libraries efficiently",
          "Automate repetitive development tasks",
        ],
        frustrations: [
          "AI-generated code that doesn't compile or has subtle bugs",
          "Outdated library recommendations",
          "Lack of integration with actual development workflow",
          "Having to copy-paste between AI and IDE constantly",
        ],
        testScenarios: [
          "Open Claude Code via /code and ask to analyze a TypeScript error",
          "Try the terminal via /shell and run some system commands",
          "Ask Enso to compare React Server Components vs traditional SSR",
          "Request an architecture diagram for a microservices migration",
          "Try orchestrating: 'Build a REST API boilerplate with tests'",
        ],
      },
      {
        id: "business-analyst",
        name: "Sarah Thompson",
        role: "Business Intelligence Analyst",
        background: "Works at a mid-size e-commerce company. Spends most of her day analyzing sales data, creating reports, and building dashboards. Needs to present findings to non-technical stakeholders.",
        goals: [
          "Analyze data and generate insights without writing SQL",
          "Create polished visualizations and dashboards",
          "Automate recurring report generation",
          "Translate technical findings into business language",
        ],
        frustrations: [
          "AI tools that can't handle real spreadsheet data",
          "Pretty charts without actionable insights",
          "No memory of company-specific metrics and KPIs",
          "Results that need heavy reformatting for presentations",
        ],
        testScenarios: [
          "Ask Enso for a market size analysis of the e-commerce industry",
          "Request a dashboard comparing quarterly performance metrics",
          "Try: 'Analyze the pros and cons of subscription vs one-time pricing'",
          "Ask for a customer segmentation framework with visualizations",
          "Request an executive summary template for board presentation",
        ],
      },
      {
        id: "creative-professional",
        name: "Leo Morales",
        role: "Content Creator & Brand Strategist",
        background: "Freelance content strategist working with tech startups. Creates brand identities, marketing campaigns, social media content, and copywriting. Values creative inspiration alongside practical execution.",
        goals: [
          "Generate creative concepts and campaign ideas quickly",
          "Research trends and audience preferences",
          "Create content calendars and campaign plans",
          "Get inspiration while maintaining brand voice consistency",
        ],
        frustrations: [
          "Generic, cliche creative suggestions",
          "AI that doesn't understand brand tone and personality",
          "Cannot work with visual assets or design references",
          "Content that sounds robotic and needs heavy editing",
        ],
        testScenarios: [
          "Ask Enso for a social media campaign strategy for a fintech app",
          "Request creative tagline options for a sustainability brand",
          "Try: 'Research the latest content marketing trends for B2B SaaS'",
          "Ask for a 30-day content calendar with post ideas and hashtags",
          "Try the photo gallery or media features if available",
        ],
      },
      {
        id: "photographer-blogger",
        name: "Wei Liang (魏亮)",
        role: "Professional Photographer & Visual Storyteller",
        background:
          "Beijing-based travel and lifestyle photographer with 50TB photo archive spanning 8 years. Publishes weekly visual essays on Xiaohongshu (小红书), Bilibili, and WeChat. Shoots 2,000+ photos per trip. Deeply technical about color science, lens optics, and post-processing. Early adopter of AI tools for culling, retouching, and upscaling. Revenue from print sales, brand partnerships, and online photography courses. Prefers working in Chinese and expects tools to support his native language natively — not as an afterthought.",
        goals: [
          "Use Enso entirely in Chinese — UI, research results, and generated content all in native language",
          "Manage and organize massive photo libraries with smart tagging and duplicate detection",
          "Batch-process RAW files with consistent color grading and AI-assisted retouching",
          "Research and compare camera gear, lenses, and editing software with real-world data",
          "Use AI for intelligent photo culling, subject recognition, and metadata enrichment",
          "Create polished visual content — blog layouts, comparison galleries, before/after showcases",
          "Stay current on AI photography tools — generative fill, upscaling, noise reduction, sky replacement",
        ],
        frustrations: [
          "AI tools that only work well in English — poor Chinese support or mixed-language UI",
          "UI that mixes Chinese and English inconsistently, breaking the immersive experience",
          "File management tools that can't handle large volumes or understand EXIF/RAW metadata",
          "AI tools that over-process images and destroy natural skin tones or fine detail",
          "No good way to visually compare gear specs alongside real sample images",
          "Platforms that treat photos as flat images instead of rich assets with metadata, GPS, and edit history",
        ],
        testScenarios: [
          "Switch Enso to Chinese (中文) — verify all UI labels, buttons, and prompts display in Chinese",
          "Search in Chinese: '对比索尼A7RV和佳能R5 II的风光摄影表现' — expect Chinese research results",
          "Browse and manage a folder of photos — check if EXIF data, thumbnails, and sorting work well",
          "Ask Enso to research 'best AI photo editing tools 2026' in Chinese and compare features",
          "Upload photos and test any available processing, gallery, or media features",
          "Try: '研究AI图像放大工具 — Real-ESRGAN vs Topaz vs Magnific 对比' with interactive comparison",
        ],
      },
    ],

    validationPersonaIds: ["startup-founder", "student-researcher", "photographer-blogger"],

    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Ensure the default Enso project exists. Called on server startup.
 *
 * Priority: repo's projects/enso/project.json (git-tracked) → ~/.enso fallback → hardcoded default.
 * Sprints/deliverables dirs are always created under ~/.enso/ (machine-local data).
 */
export function ensureDefaultProject(): Project {
  mkdirSync(PROJECTS_DIR, { recursive: true });
  let project = loadProject("enso");
  if (!project) {
    project = getDefaultEnsoProject();
    saveProject(project);
    logAction({ ts: Date.now(), type: "action", category: "project-manager", message: "Created default Enso project" });
  }
  // Ensure sprints/deliverables dirs exist in ~/.enso even if project.json lives in repo
  const dataDir = join(PROJECTS_DIR, "enso");
  mkdirSync(join(dataDir, "sprints"), { recursive: true });
  mkdirSync(join(dataDir, "deliverables"), { recursive: true });
  return project;
}

// ── Branch Helpers ──

/** Get the project's configured branch (defaults to "main"). */
export function getProjectBranch(project: Project): string {
  return project.branch || "main";
}

/** Update a project's branch and persist. */
export function setProjectBranch(projectId: string, branch: string): void {
  const project = loadProject(projectId);
  if (!project) return;
  project.branch = branch;
  saveProject(project);
}

// ── Project Brain ──

/**
 * Absolute path to the project's brain.md.
 * Enso project → repo's projects/enso/brain.md (git-tracked).
 * All others → ~/.enso/projects/<id>/brain.md
 */
export function getProjectBrainPath(projectId: string): string {
  return join(projectDir(projectId), "brain.md");
}

/** Load the project brain. Returns null if it doesn't exist yet. */
export function loadProjectBrain(projectId: string): string | null {
  try {
    const brainPath = getProjectBrainPath(projectId);
    if (!existsSync(brainPath)) return null;
    return readFileSync(brainPath, "utf-8");
  } catch (err) {
    logError("project-manager", `Failed to load brain for project ${projectId}`, err);
    return null;
  }
}
