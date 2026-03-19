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

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const PROJECTS_DIR = join(HOME, ".enso", "projects");

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

export interface Persona {
  id: string;
  name: string;
  role: string;
  background: string;
  goals: string[];
  frustrations: string[];
  testScenarios: string[];
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

  teamAgents: TeamAgent[];
  personas: Persona[];
  validationPersonaIds: string[];

  createdAt: number;
  updatedAt: number;
}

// ── CRUD ──

export function loadProject(projectId: string): Project | null {
  try {
    const filePath = join(PROJECTS_DIR, projectId, "project.json");
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (err) {
    logError("project-manager", `Failed to load project ${projectId}`, err);
    return null;
  }
}

export function saveProject(project: Project): void {
  try {
    const dir = join(PROJECTS_DIR, project.id);
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "sprints"), { recursive: true });
    mkdirSync(join(dir, "deliverables"), { recursive: true });
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
    description: "Claude Code-powered AI agent that answers any question with the best interactive experience and tackles any task with full engineering team capability.",
    vision: "Every answer is an app. Full engineering team for any task. Self-evolving platform that compounds with use.",
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
    ],

    validationPersonaIds: ["startup-founder", "student-researcher"],

    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Ensure the default Enso project exists. Called on server startup.
 */
export function ensureDefaultProject(): Project {
  mkdirSync(PROJECTS_DIR, { recursive: true });
  let project = loadProject("enso");
  if (!project) {
    project = getDefaultEnsoProject();
    saveProject(project);
    logAction({ ts: Date.now(), type: "action", category: "project-manager", message: "Created default Enso project" });
  }
  return project;
}
