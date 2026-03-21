/**
 * Discovery PPTX Generator — converts investment memo markdown into a
 * premium PowerPoint presentation using PptxGenJS.
 *
 * Color palette: Midnight Executive (navy/ice-blue/white)
 * Font pairing: Georgia (headers) + Calibri (body)
 */

import pptxgen from "pptxgenjs";
import { getDiscoveryFile, loadDiscoveryResult } from "./discovery-archive.js";
import { logError } from "./action-log.js";

// ── Color Palette (Midnight Executive) ──
const C = {
  navy: "1E2761",
  deepNavy: "141B3D",
  ice: "CADCFC",
  white: "FFFFFF",
  offWhite: "F0F2F8",
  muted: "8892B0",
  accent: "4FC3F7",   // light blue accent
  green: "00C853",
  amber: "FFB300",
  red: "FF5252",
  darkText: "1A1A2E",
  lightText: "E0E6F0",
  tableBorder: "2A3570",
  tableHeader: "1A2050",
  tableAlt: "1E2761",
  tableBase: "161D45",
};

const FONT_HEAD = "Georgia";
const FONT_BODY = "Calibri";

// ── Helpers ──

function verdictColor(verdict: string): string {
  const v = verdict.toUpperCase();
  if (v.includes("STRONG BUY") || v.includes("BUY")) return C.green;
  if (v.includes("HOLD")) return C.amber;
  return C.red;
}

function verdictBadge(verdict: string): string {
  const v = verdict.toUpperCase();
  if (v.includes("STRONG BUY")) return "STRONG BUY";
  if (v.includes("BUY")) return "BUY";
  if (v.includes("HOLD")) return "HOLD";
  if (v.includes("PASS")) return "PASS";
  return verdict.toUpperCase();
}

interface Recommendation {
  name: string;
  tagline: string;
  verdict: string;
  confidence: string;
  pitchedBy: string;
  opportunity: string;
  solution: string;
  whyEnsoWins: string;
  competitiveTable: string[][];
  buildPlan: string[];
  financialTable: string[][];
  riskTable: string[][];
  committeeNote: string;
}

interface ParsedMemo {
  title: string;
  date: string;
  vcTeam: string;
  preparedBy: string;
  executiveSummaryBullets: string[];
  discoveryProcess: string[];
  marketLandscape: string[];
  recommendations: Recommendation[];
  comparisonTable: string[][];
  committeeVerdict: string[];
  conditions: string[];
  portfolioStrategy: string;
  crossCuttingConcern: string;
  nextSteps: string[];
}

// ── Markdown Parser ──

function parseMarkdownTable(block: string): string[][] {
  const lines = block.trim().split("\n").filter(l => l.includes("|"));
  if (lines.length < 2) return [];
  // Skip separator row (contains ---)
  const dataLines = lines.filter(l => !l.match(/^\s*\|[\s-:|]+\|\s*$/));
  return dataLines.map(l =>
    l.split("|").slice(1, -1).map(cell => cell.trim().replace(/\*\*/g, ""))
  );
}

function extractSection(md: string, heading: string, nextHeading?: string): string {
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = nextHeading
    ? new RegExp(`#{1,4}\\s*${esc}[\\s\\S]*?(?=#{1,4}\\s*${nextHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|$)`, "i")
    : new RegExp(`#{1,4}\\s*${esc}[\\s\\S]*?(?=\\r?\\n#{1,3}\\s|$)`, "i");
  const match = md.match(pattern);
  return match ? match[0] : "";
}

function extractBullets(text: string): string[] {
  return text
    .split("\n")
    .filter(l => l.match(/^\s*[-*]\s/))
    .map(l => l.replace(/^\s*[-*]\s+/, "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim());
}

function extractRecommendation(md: string, num: number): Recommendation | null {
  // Find the recommendation block
  const recPattern = new RegExp(
    `## Recommendation #${num}:\\s*(.+?)\\r?\\n###\\s*Committee Verdict:\\s*(.+?)\\|\\s*Pitched by:\\s*(.+?)\\r?\\n([\\s\\S]*?)(?=## Recommendation #${num + 1}|## Comparison|$)`,
    "i"
  );
  const match = md.match(recPattern);
  if (!match) return null;

  const [, nameAndTagline, verdict, pitchedBy, body] = match;
  const [name, ...taglineParts] = nameAndTagline.split("—").map(s => s.trim());
  const tagline = taglineParts.join(" — ") || "";

  // Extract confidence from verdict
  const confMatch = verdict.match(/\(([^)]+)\)/);
  const confidence = confMatch ? confMatch[1] : "";
  const cleanVerdict = verdict.replace(/\([^)]+\)/, "").trim();

  // Sub-sections
  const oppSection = extractSection(body, "The Opportunity");
  const solSection = extractSection(body, "The Solution");
  const whySection = extractSection(body, "Why Enso") || extractSection(body, "Why Enso Could Win");
  const compSection = extractSection(body, "Competitive Position");
  const buildSection = extractSection(body, "Build Plan");
  const finSection = extractSection(body, "Financial Model");
  const riskSection = extractSection(body, "Risk Assessment");
  const noteMatch = body.match(/\*\*COMMITTEE NOTE\*\*:?\s*([\s\S]*?)(?=####|$)/i);

  return {
    name,
    tagline,
    verdict: cleanVerdict,
    confidence,
    pitchedBy: pitchedBy.trim(),
    opportunity: oppSection.split("\n").filter(l => l.startsWith("**") || l.match(/^\s/)).map(l => l.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")).join(" ").trim().substring(0, 500),
    solution: solSection.split("\n").filter(l => !l.startsWith("#")).map(l => l.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")).join(" ").trim().substring(0, 400),
    whyEnsoWins: whySection.split("\n").filter(l => !l.startsWith("#")).map(l => l.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")).join(" ").trim().substring(0, 400),
    competitiveTable: parseMarkdownTable(compSection),
    buildPlan: extractBullets(buildSection),
    financialTable: parseMarkdownTable(finSection),
    riskTable: parseMarkdownTable(riskSection),
    committeeNote: noteMatch ? noteMatch[1].replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim().substring(0, 300) : "",
  };
}

function parseMemo(mdRaw: string): ParsedMemo {
  // Normalize line endings (Windows \r\n → \n)
  const md = mdRaw.replace(/\r\n/g, "\n");
  // Header
  const dateMatch = md.match(/###\s*Date:\s*(.+)/);
  const teamMatch = md.match(/###\s*VC Team:\s*(.+)/);
  const prepMatch = md.match(/###\s*Prepared by:\s*(.+)/);
  const titleMatch = md.match(/# AI VC Discovery:\s*(.+)/);

  // Executive Summary
  const execSection = extractSection(md, "Executive Summary");
  const execBullets = extractBullets(execSection);

  // Discovery Process
  const procSection = extractSection(md, "Discovery Process");
  const procBullets = extractBullets(procSection);

  // Market Landscape
  const marketSection = extractSection(md, "Market Landscape");
  const marketBullets = extractBullets(marketSection);

  // Recommendations
  const recommendations: Recommendation[] = [];
  for (let i = 1; i <= 5; i++) {
    const rec = extractRecommendation(md, i);
    if (rec) recommendations.push(rec);
  }

  // Comparison table
  const compSection = extractSection(md, "Comparison & Ranking");
  const compTable = parseMarkdownTable(compSection);

  // Committee verdict
  const verdictSection = extractSection(md, "Investment Committee Verdict");
  const verdictBullets = verdictSection.split("\n")
    .filter(l => l.match(/^\s*[-*0-9]/) || l.startsWith("**"))
    .map(l => l.replace(/^\s*[-*0-9.]+\s*/, "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim())
    .filter(l => l.length > 5);

  // Conditions
  const condSection = extractSection(md, "Conditions for");
  const conditions = extractBullets(condSection);

  // Portfolio strategy
  const portSection = extractSection(md, "Portfolio Strategy");
  const portfolioStrategy = portSection.split("\n").filter(l => !l.startsWith("#") && l.trim()).map(l => l.replace(/\*\*/g, "")).join(" ").trim().substring(0, 300);

  // Cross-cutting
  const crossSection = extractSection(md, "Cross-Cutting Concern");
  const crossCutting = crossSection.split("\n").filter(l => !l.startsWith("#") && l.trim()).map(l => l.replace(/\*\*/g, "")).join(" ").trim().substring(0, 300);

  // Next steps
  const nextSection = extractSection(md, "Next Steps");
  const nextSteps = nextSection.split("\n")
    .filter(l => l.match(/^\s*[0-9]+\./))
    .map(l => l.replace(/^\s*[0-9]+\.\s*/, "").replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim());

  return {
    title: titleMatch ? titleMatch[1].trim() : "AI VC Discovery",
    date: dateMatch ? dateMatch[1].trim() : new Date().toISOString().split("T")[0],
    vcTeam: teamMatch ? teamMatch[1].trim() : "",
    preparedBy: prepMatch ? prepMatch[1].trim() : "",
    executiveSummaryBullets: execBullets,
    discoveryProcess: procBullets,
    marketLandscape: marketBullets,
    recommendations,
    comparisonTable: compTable,
    committeeVerdict: verdictBullets,
    conditions,
    portfolioStrategy,
    crossCuttingConcern: crossCutting,
    nextSteps,
  };
}

// ── Slide Builders ──

function makeShadow(): pptxgen.ShadowProps {
  return { type: "outer", blur: 6, offset: 2, angle: 135, color: "000000", opacity: 0.2 };
}

function addDarkBg(slide: pptxgen.Slide) {
  slide.background = { color: C.deepNavy };
}

function addLightBg(slide: pptxgen.Slide) {
  slide.background = { color: C.offWhite };
}

function addFooter(slide: pptxgen.Slide, text: string) {
  slide.addText(text, {
    x: 0.5, y: 5.2, w: 9, h: 0.3,
    fontSize: 8, fontFace: FONT_BODY, color: C.muted, align: "right",
  });
}

function buildTitleSlide(pres: pptxgen, memo: ParsedMemo) {
  const slide = pres.addSlide();
  addDarkBg(slide);

  // Top accent line
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent },
  });

  // Enso branding
  slide.addText("ENSO", {
    x: 0.6, y: 0.4, w: 2, h: 0.4,
    fontSize: 14, fontFace: FONT_BODY, color: C.accent, charSpacing: 6, bold: true,
  });

  // Main title
  slide.addText(`AI VC Discovery`, {
    x: 0.6, y: 1.4, w: 8.8, h: 0.8,
    fontSize: 38, fontFace: FONT_HEAD, color: C.white, bold: true,
  });
  slide.addText(memo.title, {
    x: 0.6, y: 2.2, w: 8.8, h: 0.6,
    fontSize: 24, fontFace: FONT_HEAD, color: C.ice, italic: true,
  });

  // Thin separator
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 3.1, w: 2.5, h: 0.03, fill: { color: C.accent },
  });

  // Meta info
  slide.addText(`Investment Memo  |  ${memo.date}`, {
    x: 0.6, y: 3.4, w: 8.8, h: 0.35,
    fontSize: 13, fontFace: FONT_BODY, color: C.muted,
  });
  slide.addText(`Prepared by: ${memo.preparedBy}`, {
    x: 0.6, y: 3.75, w: 8.8, h: 0.35,
    fontSize: 12, fontFace: FONT_BODY, color: C.muted,
  });
  slide.addText(`VC Team: ${memo.vcTeam}`, {
    x: 0.6, y: 4.1, w: 8.8, h: 0.35,
    fontSize: 12, fontFace: FONT_BODY, color: C.muted,
  });
}

function buildExecSummarySlide(pres: pptxgen, memo: ParsedMemo) {
  const slide = pres.addSlide();
  addDarkBg(slide);

  slide.addText("EXECUTIVE SUMMARY", {
    x: 0.6, y: 0.3, w: 8.8, h: 0.5,
    fontSize: 11, fontFace: FONT_BODY, color: C.accent, charSpacing: 4, bold: true,
  });

  // Verdict badges row
  const recs = memo.recommendations;
  if (recs.length > 0) {
    const badgeW = 2.6;
    const gap = 0.3;
    const startX = 0.6;
    recs.forEach((rec, i) => {
      const x = startX + i * (badgeW + gap);
      // Badge card
      slide.addShape(pres.shapes.RECTANGLE, {
        x, y: 0.95, w: badgeW, h: 1.1,
        fill: { color: C.navy },
        shadow: makeShadow(),
      });
      // Verdict badge
      slide.addShape(pres.shapes.RECTANGLE, {
        x: x + 0.15, y: 1.05, w: 0.9, h: 0.3,
        fill: { color: verdictColor(rec.verdict) },
      });
      slide.addText(verdictBadge(rec.verdict), {
        x: x + 0.15, y: 1.05, w: 0.9, h: 0.3,
        fontSize: 9, fontFace: FONT_BODY, color: C.white, bold: true, align: "center", valign: "middle",
      });
      // Name
      slide.addText(rec.name, {
        x: x + 0.15, y: 1.4, w: badgeW - 0.3, h: 0.3,
        fontSize: 12, fontFace: FONT_HEAD, color: C.white, bold: true,
      });
      // Confidence
      slide.addText(rec.confidence, {
        x: x + 0.15, y: 1.7, w: badgeW - 0.3, h: 0.25,
        fontSize: 9, fontFace: FONT_BODY, color: C.muted,
      });
    });
  }

  // Summary bullets
  const bullets = memo.executiveSummaryBullets.slice(0, 4);
  const bulletItems = bullets.map((b, i) => ({
    text: b.substring(0, 200),
    options: { bullet: true, breakLine: i < bullets.length - 1, color: C.lightText } as pptxgen.TextPropsOptions,
  }));

  if (bulletItems.length > 0) {
    slide.addText(bulletItems, {
      x: 0.6, y: 2.3, w: 8.8, h: 2.8,
      fontSize: 11, fontFace: FONT_BODY, color: C.lightText, paraSpaceAfter: 8,
      valign: "top",
    });
  }

  addFooter(slide, "Enso AI VC Discovery — Confidential");
}

function buildDiscoveryProcessSlide(pres: pptxgen, memo: ParsedMemo) {
  const slide = pres.addSlide();
  addLightBg(slide);

  slide.addText("DISCOVERY PROCESS", {
    x: 0.6, y: 0.3, w: 8.8, h: 0.5,
    fontSize: 11, fontFace: FONT_BODY, color: C.navy, charSpacing: 4, bold: true,
  });

  // Phase cards across the top
  const phases = [
    { label: "Phase 1", title: "Deal Sourcing", desc: "3 parallel research tracks", color: C.accent },
    { label: "Phase 2", title: "Pitch Session", desc: "Partner pitches", color: "7C4DFF" },
    { label: "Phase 3", title: "IC Challenge", desc: "Rigorous fact-checking", color: "FF6D00" },
    { label: "Phase 4", title: "Deliverables", desc: "Memo + dashboard", color: C.green },
  ];

  const cardW = 2.05;
  const cardGap = 0.2;
  phases.forEach((ph, i) => {
    const x = 0.6 + i * (cardW + cardGap);
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y: 0.95, w: cardW, h: 1.2,
      fill: { color: C.white },
      shadow: makeShadow(),
    });
    // Top accent
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y: 0.95, w: cardW, h: 0.05, fill: { color: ph.color },
    });
    slide.addText(ph.label, {
      x: x + 0.15, y: 1.08, w: cardW - 0.3, h: 0.22,
      fontSize: 8, fontFace: FONT_BODY, color: C.muted, bold: true,
    });
    slide.addText(ph.title, {
      x: x + 0.15, y: 1.32, w: cardW - 0.3, h: 0.3,
      fontSize: 13, fontFace: FONT_HEAD, color: C.darkText, bold: true,
    });
    slide.addText(ph.desc, {
      x: x + 0.15, y: 1.65, w: cardW - 0.3, h: 0.3,
      fontSize: 9, fontFace: FONT_BODY, color: C.muted,
    });
  });

  // Detail bullets
  const bullets = memo.discoveryProcess.slice(0, 6);
  const bulletItems = bullets.map((b, i) => ({
    text: b.substring(0, 180),
    options: { bullet: true, breakLine: i < bullets.length - 1, color: C.darkText } as pptxgen.TextPropsOptions,
  }));

  if (bulletItems.length > 0) {
    slide.addText(bulletItems, {
      x: 0.6, y: 2.45, w: 8.8, h: 2.7,
      fontSize: 10, fontFace: FONT_BODY, color: C.darkText, paraSpaceAfter: 6,
      valign: "top",
    });
  }

  addFooter(slide, "Enso AI VC Discovery — Confidential");
}

function buildMarketLandscapeSlide(pres: pptxgen, memo: ParsedMemo) {
  const slide = pres.addSlide();
  addLightBg(slide);

  slide.addText("MARKET LANDSCAPE", {
    x: 0.6, y: 0.3, w: 5, h: 0.5,
    fontSize: 11, fontFace: FONT_BODY, color: C.navy, charSpacing: 4, bold: true,
  });
  slide.addText(memo.title, {
    x: 0.6, y: 0.65, w: 8.8, h: 0.35,
    fontSize: 16, fontFace: FONT_HEAD, color: C.darkText, bold: true,
  });

  const bullets = memo.marketLandscape.slice(0, 7);
  const bulletItems = bullets.map((b, i) => ({
    text: b.substring(0, 200),
    options: { bullet: true, breakLine: i < bullets.length - 1, color: C.darkText } as pptxgen.TextPropsOptions,
  }));

  if (bulletItems.length > 0) {
    slide.addText(bulletItems, {
      x: 0.6, y: 1.2, w: 8.8, h: 3.8,
      fontSize: 10.5, fontFace: FONT_BODY, color: C.darkText, paraSpaceAfter: 8,
      valign: "top",
    });
  }

  addFooter(slide, "Enso AI VC Discovery — Confidential");
}

function buildRecommendationSlides(pres: pptxgen, rec: Recommendation, idx: number) {
  // Slide 1: Overview + Competitive Position
  const slide1 = pres.addSlide();
  addDarkBg(slide1);

  // Header row
  slide1.addText(`RECOMMENDATION #${idx + 1}`, {
    x: 0.6, y: 0.25, w: 5, h: 0.35,
    fontSize: 10, fontFace: FONT_BODY, color: C.accent, charSpacing: 4, bold: true,
  });

  // Verdict badge
  slide1.addShape(pres.shapes.RECTANGLE, {
    x: 7.5, y: 0.2, w: 1.5, h: 0.4,
    fill: { color: verdictColor(rec.verdict) },
  });
  slide1.addText(verdictBadge(rec.verdict), {
    x: 7.5, y: 0.2, w: 1.5, h: 0.4,
    fontSize: 12, fontFace: FONT_BODY, color: C.white, bold: true, align: "center", valign: "middle",
  });

  // Title
  slide1.addText(rec.name, {
    x: 0.6, y: 0.65, w: 8.8, h: 0.5,
    fontSize: 26, fontFace: FONT_HEAD, color: C.white, bold: true,
  });
  if (rec.tagline) {
    slide1.addText(rec.tagline, {
      x: 0.6, y: 1.1, w: 8.8, h: 0.35,
      fontSize: 13, fontFace: FONT_BODY, color: C.ice, italic: true,
    });
  }

  // Pitched by + confidence
  slide1.addText(`Pitched by: ${rec.pitchedBy}  |  Confidence: ${rec.confidence}`, {
    x: 0.6, y: 1.45, w: 8.8, h: 0.25,
    fontSize: 9, fontFace: FONT_BODY, color: C.muted,
  });

  // Two-column: Opportunity + Solution
  const colW = 4.2;
  // Left: Opportunity
  slide1.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 1.9, w: colW, h: 1.6,
    fill: { color: C.navy },
  });
  slide1.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 1.9, w: colW, h: 0.04, fill: { color: C.accent },
  });
  slide1.addText("THE OPPORTUNITY", {
    x: 0.8, y: 2.0, w: colW - 0.4, h: 0.25,
    fontSize: 8, fontFace: FONT_BODY, color: C.accent, bold: true,
  });
  slide1.addText(rec.opportunity.substring(0, 280), {
    x: 0.8, y: 2.3, w: colW - 0.4, h: 1.1,
    fontSize: 9, fontFace: FONT_BODY, color: C.lightText, valign: "top",
  });

  // Right: Solution
  slide1.addShape(pres.shapes.RECTANGLE, {
    x: 5.2, y: 1.9, w: colW, h: 1.6,
    fill: { color: C.navy },
  });
  slide1.addShape(pres.shapes.RECTANGLE, {
    x: 5.2, y: 1.9, w: colW, h: 0.04, fill: { color: "7C4DFF" },
  });
  slide1.addText("THE SOLUTION", {
    x: 5.4, y: 2.0, w: colW - 0.4, h: 0.25,
    fontSize: 8, fontFace: FONT_BODY, color: "7C4DFF", bold: true,
  });
  slide1.addText(rec.solution.substring(0, 280), {
    x: 5.4, y: 2.3, w: colW - 0.4, h: 1.1,
    fontSize: 9, fontFace: FONT_BODY, color: C.lightText, valign: "top",
  });

  // Competitive table (compact)
  if (rec.competitiveTable.length > 1) {
    const tbl = rec.competitiveTable;
    const maxCols = Math.min(tbl[0].length, 6);
    const maxRows = Math.min(tbl.length, 6);
    const colWidths = Array(maxCols).fill(8.8 / maxCols);

    const tableRows: pptxgen.TableRow[] = tbl.slice(0, maxRows).map((row, ri) => {
      return row.slice(0, maxCols).map(cell => ({
        text: cell.substring(0, 30),
        options: {
          fontSize: 7,
          fontFace: FONT_BODY,
          color: ri === 0 ? C.white : C.lightText,
          fill: { color: ri === 0 ? C.tableHeader : (ri % 2 === 0 ? C.tableAlt : C.tableBase) },
          border: [{ pt: 0.5, color: C.tableBorder }],
          bold: ri === 0,
          valign: "middle" as const,
          margin: [2, 4, 2, 4] as [number, number, number, number],
        },
      }));
    });

    slide1.addTable(tableRows, {
      x: 0.6, y: 3.7, w: 8.8, colW: colWidths,
      rowH: 0.28,
    });
  }

  addFooter(slide1, `Enso AI VC Discovery — ${rec.name}`);

  // Slide 2: Why Enso Wins + Financials + Risk
  const slide2 = pres.addSlide();
  addLightBg(slide2);

  slide2.addText(`${rec.name.toUpperCase()} — DEEP DIVE`, {
    x: 0.6, y: 0.25, w: 6, h: 0.35,
    fontSize: 10, fontFace: FONT_BODY, color: C.navy, charSpacing: 3, bold: true,
  });

  // Verdict badge
  slide2.addShape(pres.shapes.RECTANGLE, {
    x: 7.5, y: 0.2, w: 1.5, h: 0.4,
    fill: { color: verdictColor(rec.verdict) },
  });
  slide2.addText(verdictBadge(rec.verdict), {
    x: 7.5, y: 0.2, w: 1.5, h: 0.4,
    fontSize: 12, fontFace: FONT_BODY, color: C.white, bold: true, align: "center", valign: "middle",
  });

  // Why Enso Wins card
  slide2.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 0.75, w: 8.8, h: 1.3,
    fill: { color: C.white },
    shadow: makeShadow(),
  });
  slide2.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 0.75, w: 0.06, h: 1.3, fill: { color: C.green },
  });
  slide2.addText("WHY ENSO WINS", {
    x: 0.9, y: 0.82, w: 8.2, h: 0.25,
    fontSize: 9, fontFace: FONT_BODY, color: C.green, bold: true,
  });
  slide2.addText(rec.whyEnsoWins.substring(0, 350), {
    x: 0.9, y: 1.1, w: 8.2, h: 0.85,
    fontSize: 9.5, fontFace: FONT_BODY, color: C.darkText, valign: "top",
  });

  // Financial table (left) + Risk table (right)
  const halfW = 4.2;

  // Financial Model
  if (rec.financialTable.length > 1) {
    slide2.addText("FINANCIAL MODEL", {
      x: 0.6, y: 2.2, w: halfW, h: 0.25,
      fontSize: 9, fontFace: FONT_BODY, color: C.navy, bold: true,
    });

    const finRows: pptxgen.TableRow[] = rec.financialTable.slice(0, 7).map((row, ri) => {
      const maxCols = Math.min(row.length, 3);
      return row.slice(0, maxCols).map(cell => ({
        text: cell.substring(0, 35),
        options: {
          fontSize: 7.5,
          fontFace: FONT_BODY,
          color: ri === 0 ? C.white : C.darkText,
          fill: { color: ri === 0 ? C.navy : (ri % 2 === 0 ? "E8EAF6" : C.white) },
          border: [{ pt: 0.3, color: "D0D4E8" }],
          bold: ri === 0,
          valign: "middle" as const,
          margin: [2, 3, 2, 3] as [number, number, number, number],
        },
      }));
    });

    const finCols = rec.financialTable[0] ? rec.financialTable[0].slice(0, 3).length : 3;
    slide2.addTable(finRows, {
      x: 0.6, y: 2.5, w: halfW, colW: Array(finCols).fill(halfW / finCols),
      rowH: 0.26,
    });
  }

  // Risk Assessment
  if (rec.riskTable.length > 1) {
    slide2.addText("RISK ASSESSMENT", {
      x: 5.2, y: 2.2, w: halfW, h: 0.25,
      fontSize: 9, fontFace: FONT_BODY, color: C.navy, bold: true,
    });

    const riskRows: pptxgen.TableRow[] = rec.riskTable.slice(0, 6).map((row, ri) => {
      const maxCols = Math.min(row.length, 3);
      return row.slice(0, maxCols).map(cell => ({
        text: cell.substring(0, 35),
        options: {
          fontSize: 7,
          fontFace: FONT_BODY,
          color: ri === 0 ? C.white : C.darkText,
          fill: { color: ri === 0 ? C.navy : (ri % 2 === 0 ? "E8EAF6" : C.white) },
          border: [{ pt: 0.3, color: "D0D4E8" }],
          bold: ri === 0,
          valign: "middle" as const,
          margin: [2, 3, 2, 3] as [number, number, number, number],
        },
      }));
    });

    const riskCols = rec.riskTable[0] ? rec.riskTable[0].slice(0, 3).length : 3;
    slide2.addTable(riskRows, {
      x: 5.2, y: 2.5, w: halfW, colW: Array(riskCols).fill(halfW / riskCols),
      rowH: 0.26,
    });
  }

  // Committee note
  if (rec.committeeNote) {
    slide2.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y: 4.65, w: 8.8, h: 0.55,
      fill: { color: "FFF8E1" },
    });
    slide2.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y: 4.65, w: 0.06, h: 0.55, fill: { color: C.amber },
    });
    slide2.addText(`COMMITTEE NOTE: ${rec.committeeNote.substring(0, 200)}`, {
      x: 0.85, y: 4.68, w: 8.35, h: 0.48,
      fontSize: 7.5, fontFace: FONT_BODY, color: "5D4037", italic: true, valign: "middle",
    });
  }

  addFooter(slide2, `Enso AI VC Discovery — ${rec.name}`);
}

function buildComparisonSlide(pres: pptxgen, memo: ParsedMemo) {
  const slide = pres.addSlide();
  addLightBg(slide);

  slide.addText("COMPARISON & RANKING", {
    x: 0.6, y: 0.3, w: 8.8, h: 0.5,
    fontSize: 11, fontFace: FONT_BODY, color: C.navy, charSpacing: 4, bold: true,
  });

  if (memo.comparisonTable.length > 1) {
    const tbl = memo.comparisonTable;
    const maxCols = Math.min(tbl[0].length, 5);
    const maxRows = Math.min(tbl.length, 20);
    const colWidths = [2.5, ...Array(maxCols - 1).fill((8.8 - 2.5) / (maxCols - 1))];

    const tableRows: pptxgen.TableRow[] = tbl.slice(0, maxRows).map((row, ri) => {
      return row.slice(0, maxCols).map((cell, ci) => {
        const isVerdict = cell.includes("BUY") || cell.includes("HOLD") || cell.includes("PASS");
        return {
          text: cell.substring(0, 40),
          options: {
            fontSize: 8,
            fontFace: FONT_BODY,
            color: ri === 0 ? C.white : (isVerdict ? verdictColor(cell) : C.darkText),
            fill: { color: ri === 0 ? C.navy : (ri % 2 === 0 ? "E8EAF6" : C.white) },
            border: [{ pt: 0.3, color: "D0D4E8" }],
            bold: ri === 0 || ci === 0 || isVerdict,
            valign: "middle" as const,
            margin: [2, 4, 2, 4] as [number, number, number, number],
          },
        };
      });
    });

    slide.addTable(tableRows, {
      x: 0.6, y: 0.9, w: 8.8, colW: colWidths,
      rowH: 0.22,
    });
  }

  addFooter(slide, "Enso AI VC Discovery — Confidential");
}

function buildVerdictSlide(pres: pptxgen, memo: ParsedMemo) {
  const slide = pres.addSlide();
  addDarkBg(slide);

  slide.addText("INVESTMENT COMMITTEE VERDICT", {
    x: 0.6, y: 0.25, w: 8.8, h: 0.5,
    fontSize: 11, fontFace: FONT_BODY, color: C.accent, charSpacing: 4, bold: true,
  });

  // Recommendation cards
  const recs = memo.recommendations;
  const cardW = 2.6;
  const gap = 0.3;
  recs.forEach((rec, i) => {
    const x = 0.6 + i * (cardW + gap);
    const vc = verdictColor(rec.verdict);

    slide.addShape(pres.shapes.RECTANGLE, {
      x, y: 0.9, w: cardW, h: 1.7,
      fill: { color: C.navy },
      shadow: makeShadow(),
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y: 0.9, w: cardW, h: 0.05, fill: { color: vc },
    });

    // Badge
    slide.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.15, y: 1.1, w: 1.0, h: 0.32,
      fill: { color: vc },
    });
    slide.addText(verdictBadge(rec.verdict), {
      x: x + 0.15, y: 1.1, w: 1.0, h: 0.32,
      fontSize: 10, fontFace: FONT_BODY, color: C.white, bold: true, align: "center", valign: "middle",
    });

    slide.addText(rec.name, {
      x: x + 0.15, y: 1.5, w: cardW - 0.3, h: 0.35,
      fontSize: 13, fontFace: FONT_HEAD, color: C.white, bold: true,
    });
    slide.addText(rec.confidence, {
      x: x + 0.15, y: 1.85, w: cardW - 0.3, h: 0.25,
      fontSize: 9, fontFace: FONT_BODY, color: C.muted,
    });
    slide.addText(`Pitched by ${rec.pitchedBy}`, {
      x: x + 0.15, y: 2.1, w: cardW - 0.3, h: 0.25,
      fontSize: 8, fontFace: FONT_BODY, color: C.muted, italic: true,
    });
  });

  // Verdict bullets
  const verdictBullets = memo.committeeVerdict.slice(0, 6);
  if (verdictBullets.length > 0) {
    const bulletItems = verdictBullets.map((b, i) => ({
      text: b.substring(0, 180),
      options: { bullet: true, breakLine: i < verdictBullets.length - 1, color: C.lightText } as pptxgen.TextPropsOptions,
    }));

    slide.addText(bulletItems, {
      x: 0.6, y: 2.85, w: 8.8, h: 2.3,
      fontSize: 10, fontFace: FONT_BODY, color: C.lightText, paraSpaceAfter: 6,
      valign: "top",
    });
  }

  addFooter(slide, "Enso AI VC Discovery — Confidential");
}

function buildNextStepsSlide(pres: pptxgen, memo: ParsedMemo) {
  const slide = pres.addSlide();
  addDarkBg(slide);

  slide.addText("NEXT STEPS", {
    x: 0.6, y: 0.3, w: 8.8, h: 0.5,
    fontSize: 11, fontFace: FONT_BODY, color: C.accent, charSpacing: 4, bold: true,
  });

  // Conditions card (if any)
  if (memo.conditions.length > 0) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y: 0.9, w: 8.8, h: 1.2,
      fill: { color: C.navy },
      shadow: makeShadow(),
    });
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y: 0.9, w: 0.06, h: 1.2, fill: { color: C.amber },
    });
    slide.addText("CONDITIONS FOR INVESTMENT", {
      x: 0.85, y: 0.98, w: 8.3, h: 0.25,
      fontSize: 9, fontFace: FONT_BODY, color: C.amber, bold: true,
    });
    const condItems = memo.conditions.slice(0, 4).map((c, i) => ({
      text: c.substring(0, 150),
      options: { bullet: true, breakLine: i < Math.min(memo.conditions.length, 4) - 1, color: C.lightText } as pptxgen.TextPropsOptions,
    }));
    slide.addText(condItems, {
      x: 0.85, y: 1.28, w: 8.3, h: 0.75,
      fontSize: 9, fontFace: FONT_BODY, color: C.lightText, paraSpaceAfter: 4,
    });
  }

  // Next steps
  const stepsY = memo.conditions.length > 0 ? 2.3 : 1.0;
  const steps = memo.nextSteps.slice(0, 8);
  if (steps.length > 0) {
    const stepItems = steps.map((s, i) => ({
      text: s.substring(0, 160),
      options: {
        bullet: { type: "number" as const },
        breakLine: i < steps.length - 1,
        color: C.lightText,
      } as pptxgen.TextPropsOptions,
    }));

    slide.addText(stepItems, {
      x: 0.6, y: stepsY, w: 8.8, h: 2.8,
      fontSize: 10, fontFace: FONT_BODY, color: C.lightText, paraSpaceAfter: 6,
      valign: "top",
    });
  }

  // Portfolio strategy note
  if (memo.portfolioStrategy) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y: 4.7, w: 8.8, h: 0.55,
      fill: { color: C.navy },
    });
    slide.addText(`Portfolio Strategy: ${memo.portfolioStrategy.substring(0, 200)}`, {
      x: 0.8, y: 4.73, w: 8.4, h: 0.48,
      fontSize: 8, fontFace: FONT_BODY, color: C.ice, italic: true, valign: "middle",
    });
  }

  addFooter(slide, "Enso AI VC Discovery — Confidential");
}

function buildClosingSlide(pres: pptxgen, memo: ParsedMemo) {
  const slide = pres.addSlide();
  addDarkBg(slide);

  // Top accent
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.06, fill: { color: C.accent },
  });

  slide.addText("ENSO", {
    x: 0.6, y: 1.5, w: 8.8, h: 0.6,
    fontSize: 20, fontFace: FONT_BODY, color: C.accent, charSpacing: 8, bold: true, align: "center",
  });

  slide.addText("AI VC Discovery", {
    x: 0.6, y: 2.1, w: 8.8, h: 0.6,
    fontSize: 32, fontFace: FONT_HEAD, color: C.white, bold: true, align: "center",
  });

  slide.addShape(pres.shapes.RECTANGLE, {
    x: 4.2, y: 2.9, w: 1.6, h: 0.03, fill: { color: C.accent },
  });

  slide.addText(`${memo.title}  |  ${memo.date}`, {
    x: 0.6, y: 3.2, w: 8.8, h: 0.4,
    fontSize: 13, fontFace: FONT_BODY, color: C.muted, align: "center",
  });

  if (memo.crossCuttingConcern) {
    slide.addText(memo.crossCuttingConcern.substring(0, 200), {
      x: 1.5, y: 4.0, w: 7, h: 0.6,
      fontSize: 9, fontFace: FONT_BODY, color: C.muted, italic: true, align: "center",
    });
  }

  slide.addText("Confidential — For Internal Use Only", {
    x: 0.6, y: 5.0, w: 8.8, h: 0.3,
    fontSize: 8, fontFace: FONT_BODY, color: C.muted, align: "center",
  });
}

// ── Public API ──

/**
 * Generate a PPTX Buffer from a discovery's investment memo.
 */
export async function generateDiscoveryPptx(discoveryId: string): Promise<Buffer | null> {
  try {
    const meta = loadDiscoveryResult(discoveryId);
    if (!meta) return null;

    const memoContent = getDiscoveryFile(discoveryId, "investment-memo.md");
    if (!memoContent) return null;

    const memo = parseMemo(memoContent);

    const pres = new pptxgen();
    pres.layout = "LAYOUT_16x9";
    pres.author = "Enso AI VC Discovery";
    pres.title = `AI VC Discovery: ${memo.title}`;
    pres.subject = "Investment Memo";

    // Build slides
    buildTitleSlide(pres, memo);
    buildExecSummarySlide(pres, memo);
    buildDiscoveryProcessSlide(pres, memo);
    buildMarketLandscapeSlide(pres, memo);

    // Per-recommendation slides (2 slides each)
    for (let i = 0; i < memo.recommendations.length; i++) {
      buildRecommendationSlides(pres, memo.recommendations[i], i);
    }

    buildComparisonSlide(pres, memo);
    buildVerdictSlide(pres, memo);
    buildNextStepsSlide(pres, memo);
    buildClosingSlide(pres, memo);

    // Generate buffer
    const data = await pres.write({ outputType: "nodebuffer" });
    return data as Buffer;
  } catch (err) {
    logError("discovery-pptx", "Failed to generate PPTX", err);
    return null;
  }
}
