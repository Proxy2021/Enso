import jsPDF from "jspdf";

interface ResearchData {
  topic: string;
  summary: string;
  keyFindings: Array<{ claim: string; type?: string; confidence?: string }>;
  sections: Array<{ title: string; summary?: string; bullets?: string[] }>;
  sources: Array<{ title: string; url?: string; snippet?: string }>;
  narrative: string;
  images?: Array<{ url: string; title?: string }>;
  videos?: Array<{ title: string; url?: string }>;
  books?: Array<{ title: string; author?: string; year?: string; url?: string; description?: string }>;
  movies?: Array<{ title: string; year?: string; type?: string; url?: string; description?: string }>;
  contradictions?: Array<{ claim: string; claim1?: string; claim2?: string; perspectives?: string[] }>;
}

/**
 * Generate a PDF document from research results.
 * Returns a Blob of the PDF.
 */
export function generateResearchPDF(data: ResearchData): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const colors = {
    title: [30, 64, 175] as [number, number, number],       // blue-800
    heading: [55, 65, 81] as [number, number, number],       // gray-700
    subheading: [75, 85, 99] as [number, number, number],    // gray-500
    body: [31, 41, 55] as [number, number, number],          // gray-800
    muted: [107, 114, 128] as [number, number, number],      // gray-500
    accent: [59, 130, 246] as [number, number, number],      // blue-500
    divider: [229, 231, 235] as [number, number, number],    // gray-200
    finding: {
      fact: [16, 185, 129] as [number, number, number],      // emerald-500
      trend: [59, 130, 246] as [number, number, number],     // blue-500
      insight: [139, 92, 246] as [number, number, number],   // purple-500
      warning: [245, 158, 11] as [number, number, number],   // amber-500
    } as Record<string, [number, number, number]>,
  };

  function checkPageBreak(needed: number): void {
    if (y + needed > pageHeight - 20) {
      addFooter();
      doc.addPage();
      y = margin;
    }
  }

  function addFooter(): void {
    doc.setFontSize(7);
    doc.setTextColor(...colors.muted);
    doc.text("Researched with Enso", pageWidth / 2, pageHeight - 8, { align: "center" });
    const pageNum = doc.getNumberOfPages();
    doc.text(`${pageNum}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  function drawDivider(): void {
    doc.setDrawColor(...colors.divider);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  }

  function addWrappedText(text: string, fontSize: number, color: [number, number, number], lineHeight: number = 1.4, indent: number = 0): void {
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentWidth - indent);
    for (const line of lines) {
      checkPageBreak(fontSize * 0.35 * lineHeight + 1);
      doc.text(line, margin + indent, y);
      y += fontSize * 0.35 * lineHeight;
    }
  }

  // ── Title ──
  doc.setFontSize(22);
  doc.setTextColor(...colors.title);
  const titleLines = doc.splitTextToSize(data.topic, contentWidth);
  for (const line of titleLines) {
    doc.text(line, margin, y);
    y += 9;
  }
  y += 2;

  // Date line
  doc.setFontSize(9);
  doc.setTextColor(...colors.muted);
  const dateStr = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  doc.text(dateStr, margin, y);
  y += 8;
  drawDivider();

  // ── Summary ──
  if (data.summary) {
    y += 1;
    addWrappedText(data.summary, 11, colors.body, 1.5);
    y += 6;
    drawDivider();
  }

  // ── Key Findings ──
  if (data.keyFindings.length > 0) {
    checkPageBreak(14);
    doc.setFontSize(14);
    doc.setTextColor(...colors.heading);
    doc.text("Key Findings", margin, y);
    y += 8;

    for (const f of data.keyFindings) {
      checkPageBreak(12);
      const typeColor = colors.finding[f.type || "insight"] || colors.finding.insight;

      // Colored bullet
      doc.setFillColor(...typeColor);
      doc.circle(margin + 2, y - 1.2, 1.2, "F");

      // Type badge
      if (f.type) {
        doc.setFontSize(7);
        doc.setTextColor(...typeColor);
        doc.text(f.type.toUpperCase(), margin + 5, y - 0.5);
      }

      // Confidence
      if (f.confidence) {
        doc.setFontSize(7);
        doc.setTextColor(...colors.muted);
        const typeWidth = f.type ? doc.getTextWidth(f.type.toUpperCase()) + 2 : 0;
        doc.text(`[${f.confidence}]`, margin + 5 + typeWidth, y - 0.5);
      }

      y += 2;
      // Claim text
      addWrappedText(f.claim, 10, colors.body, 1.4, 5);
      y += 3;
    }
    y += 3;
    drawDivider();
  }

  // ── Sections (detailed research) ──
  if (data.sections.length > 0) {
    checkPageBreak(14);
    doc.setFontSize(14);
    doc.setTextColor(...colors.heading);
    doc.text("Detailed Research", margin, y);
    y += 8;

    for (const section of data.sections) {
      checkPageBreak(16);
      // Section title
      doc.setFontSize(12);
      doc.setTextColor(...colors.accent);
      const sectionTitleLines = doc.splitTextToSize(section.title, contentWidth);
      for (const line of sectionTitleLines) {
        doc.text(line, margin, y);
        y += 5;
      }
      y += 1;

      // Section summary
      if (section.summary) {
        addWrappedText(section.summary, 9.5, colors.subheading, 1.4, 2);
        y += 2;
      }

      // Section bullets
      if (section.bullets && section.bullets.length > 0) {
        for (const bullet of section.bullets) {
          checkPageBreak(8);
          doc.setFontSize(9.5);
          doc.setTextColor(...colors.muted);
          doc.text("•", margin + 3, y);
          addWrappedText(bullet, 9.5, colors.body, 1.35, 7);
          y += 1.5;
        }
      }
      y += 4;
    }
    drawDivider();
  }

  // ── Narrative / Analysis ──
  if (data.narrative) {
    checkPageBreak(14);
    doc.setFontSize(14);
    doc.setTextColor(...colors.heading);
    doc.text("Analysis", margin, y);
    y += 7;

    const paragraphs = data.narrative.split(/\n\n+/).filter((p) => p.trim());
    for (const para of paragraphs) {
      addWrappedText(para.trim(), 10, colors.body, 1.45);
      y += 4;
    }
    y += 2;
    drawDivider();
  }

  // ── Contradictions ──
  if (data.contradictions && data.contradictions.length > 0) {
    checkPageBreak(14);
    doc.setFontSize(14);
    doc.setTextColor(...colors.heading);
    doc.text("Contradictions Found", margin, y);
    y += 7;

    for (const c of data.contradictions) {
      checkPageBreak(14);
      // Contradiction claim
      if (c.claim) {
        doc.setFontSize(9.5);
        doc.setTextColor(...colors.finding.warning);
        doc.text("⚠", margin + 1, y);
        addWrappedText(c.claim, 9.5, colors.body, 1.35, 6);
        y += 1;
      }
      // Perspectives
      if (c.perspectives && c.perspectives.length > 0) {
        for (const p of c.perspectives) {
          checkPageBreak(6);
          doc.setFontSize(8.5);
          doc.setTextColor(...colors.muted);
          doc.text("→", margin + 7, y);
          addWrappedText(p, 8.5, colors.subheading, 1.3, 11);
          y += 1;
        }
      }
      // Legacy format fallback
      if (c.claim1 && c.claim2) {
        doc.setFontSize(9);
        doc.setTextColor(...colors.finding.warning);
        doc.text("⚠", margin + 1, y);
        addWrappedText(`"${c.claim1}"  vs.  "${c.claim2}"`, 9.5, colors.body, 1.35, 6);
      }
      y += 3;
    }
    y += 2;
    drawDivider();
  }

  // ── Videos ──
  if (data.videos && data.videos.length > 0) {
    checkPageBreak(14);
    doc.setFontSize(14);
    doc.setTextColor(...colors.heading);
    doc.text("Recommended Videos", margin, y);
    y += 7;

    for (let i = 0; i < Math.min(data.videos.length, 10); i++) {
      const v = data.videos[i];
      checkPageBreak(10);
      doc.setFontSize(9.5);
      doc.setTextColor(...colors.body);
      doc.text(`${i + 1}.`, margin + 1, y);
      // Video title — clickable if URL available
      if (v.url) {
        doc.setFontSize(9.5);
        doc.setTextColor(...colors.accent);
        const titleLines = doc.splitTextToSize(v.title, contentWidth - 7);
        doc.textWithLink(titleLines[0], margin + 7, y, { url: v.url });
        y += 9.5 * 0.35 * 1.3;
        for (let tl = 1; tl < titleLines.length; tl++) {
          checkPageBreak(5);
          doc.text(titleLines[tl], margin + 7, y);
          y += 9.5 * 0.35 * 1.3;
        }
        // Show URL in smaller text
        doc.setFontSize(7);
        doc.setTextColor(...colors.muted);
        const urlDisplay = v.url.length > 80 ? v.url.slice(0, 77) + "..." : v.url;
        doc.text(urlDisplay, margin + 7, y);
        y += 3;
      } else {
        addWrappedText(v.title, 9.5, colors.body, 1.3, 7);
      }
      y += 2;
    }
    y += 2;
    drawDivider();
  }

  // ── Books ──
  if (data.books && data.books.length > 0) {
    checkPageBreak(14);
    doc.setFontSize(14);
    doc.setTextColor(...colors.heading);
    doc.text("Recommended Books", margin, y);
    y += 7;

    for (let i = 0; i < Math.min(data.books.length, 10); i++) {
      const b = data.books[i];
      checkPageBreak(10);
      doc.setFontSize(9.5);
      doc.setTextColor(...colors.body);
      doc.text(`${i + 1}.`, margin + 1, y);
      // Book title — clickable if URL available
      if (b.url) {
        doc.setFontSize(9.5);
        doc.setTextColor(...colors.accent);
        doc.textWithLink(b.title, margin + 7, y, { url: b.url });
        y += 9.5 * 0.35 * 1.3;
      } else {
        addWrappedText(b.title, 9.5, colors.body, 1.3, 7);
      }
      // Author + year
      const meta = [b.author, b.year].filter(Boolean).join(", ");
      if (meta) {
        doc.setFontSize(8);
        doc.setTextColor(...colors.muted);
        doc.text(meta, margin + 7, y);
        y += 3;
      }
      // Description
      if (b.description) {
        addWrappedText(b.description, 8, colors.subheading, 1.3, 7);
      }
      y += 2;
    }
    y += 2;
    drawDivider();
  }

  // ── Movies ──
  if (data.movies && data.movies.length > 0) {
    checkPageBreak(14);
    doc.setFontSize(14);
    doc.setTextColor(...colors.heading);
    doc.text("Related Movies & Documentaries", margin, y);
    y += 7;

    for (let i = 0; i < Math.min(data.movies.length, 10); i++) {
      const m = data.movies[i];
      checkPageBreak(10);
      doc.setFontSize(9.5);
      doc.setTextColor(...colors.body);
      doc.text(`${i + 1}.`, margin + 1, y);
      // Movie title — clickable if URL available
      if (m.url) {
        doc.setFontSize(9.5);
        doc.setTextColor(...colors.accent);
        const titleText = m.year ? `${m.title} (${m.year})` : m.title;
        doc.textWithLink(titleText, margin + 7, y, { url: m.url });
        y += 9.5 * 0.35 * 1.3;
      } else {
        const titleText = m.year ? `${m.title} (${m.year})` : m.title;
        addWrappedText(titleText, 9.5, colors.body, 1.3, 7);
      }
      // Type badge + description
      if (m.type) {
        doc.setFontSize(7.5);
        doc.setTextColor(...colors.finding.insight);
        doc.text(m.type.toUpperCase(), margin + 7, y);
        y += 3;
      }
      if (m.description) {
        addWrappedText(m.description, 8, colors.subheading, 1.3, 7);
      }
      y += 2;
    }
    y += 2;
    drawDivider();
  }

  // ── Sources ──
  if (data.sources.length > 0) {
    checkPageBreak(14);
    doc.setFontSize(14);
    doc.setTextColor(...colors.heading);
    doc.text("Sources", margin, y);
    y += 7;

    for (let i = 0; i < data.sources.length; i++) {
      const s = data.sources[i];
      checkPageBreak(10);
      // Source number
      doc.setFontSize(9);
      doc.setTextColor(...colors.body);
      doc.text(`${i + 1}.`, margin + 1, y);
      // Source title — clickable if URL available
      if (s.url) {
        doc.setFontSize(9);
        doc.setTextColor(...colors.accent);
        const titleLines = doc.splitTextToSize(s.title || "Untitled", contentWidth - 7);
        doc.textWithLink(titleLines[0], margin + 7, y, { url: s.url });
        y += 9 * 0.35 * 1.3;
        for (let tl = 1; tl < titleLines.length; tl++) {
          checkPageBreak(5);
          doc.text(titleLines[tl], margin + 7, y);
          y += 9 * 0.35 * 1.3;
        }
        // Show URL in smaller text below
        checkPageBreak(5);
        doc.setFontSize(7);
        doc.setTextColor(...colors.muted);
        const urlDisplay = s.url.length > 80 ? s.url.slice(0, 77) + "..." : s.url;
        doc.text(urlDisplay, margin + 7, y);
        y += 3;
      } else {
        addWrappedText(s.title || "Untitled", 9, colors.body, 1.3, 7);
      }
      y += 2;
    }
  }

  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter();
  }

  return doc.output("blob");
}

/**
 * Generate PDF and trigger download or share.
 */
export async function shareResearchAsPDF(data: ResearchData): Promise<{ blob: Blob; filename: string }> {
  const blob = generateResearchPDF(data);
  const filename = `enso-research-${data.topic.replace(/[^a-zA-Z0-9\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/g, "-").slice(0, 40)}.pdf`;
  return { blob, filename };
}
