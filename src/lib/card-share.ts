/**
 * Unified card share utilities.
 *
 * Provides image capture, PDF generation, and blob sharing/download
 * that work for any Enso card (dynamic UI, text, researcher, etc.).
 *
 * PDF generation supports per-family overrides: card families (e.g. "researcher")
 * can register a custom PDF generator via `registerCardPDF()`. When no override
 * is registered the default screenshot-based PDF is used.
 */

/** Capture result returned by captureCardAsImage. */
export interface CardCapture {
  dataUrl: string;
  blob: Blob;
  filename: string;
}

/** Signature for a custom per-family PDF generator. */
export type CardPDFGenerator = (
  data: Record<string, unknown>,
  title: string,
) => Promise<{ blob: Blob; filename: string }>;

const pdfGenerators = new Map<string, CardPDFGenerator>();

/** Register a custom PDF generator for a card family (e.g. "researcher"). */
export function registerCardPDF(family: string, gen: CardPDFGenerator): void {
  pdfGenerators.set(family, gen);
}

/** Check whether a family has a custom PDF generator. */
export function hasCustomPDF(family: string | undefined): boolean {
  return !!family && pdfGenerators.has(family);
}

/**
 * Resolve the best PDF generator for a card.
 * Uses the family override if one is registered, otherwise falls back
 * to the default screenshot-based PDF.
 */
export async function resolveCardPDF(
  cardId: string,
  title: string,
  family?: string,
  data?: Record<string, unknown>,
): Promise<{ blob: Blob; filename: string }> {
  if (family && pdfGenerators.has(family)) {
    return pdfGenerators.get(family)!(data ?? {}, title);
  }
  return generateCardPDF(cardId, title);
}

/**
 * Capture a card's DOM element as a PNG image.
 * Looks up the element via `[data-card-id="<cardId>"]`.
 */
export async function captureCardAsImage(
  cardId: string,
  title: string,
): Promise<CardCapture> {
  const el = document.querySelector(
    `[data-card-id="${cardId}"]`,
  ) as HTMLElement | null;
  if (!el) throw new Error(`Card element not found: ${cardId}`);

  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(el, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#030712",
    filter: (node: HTMLElement) => {
      if (node.classList?.contains("group-hover:opacity-100")) return false;
      return true;
    },
  });

  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const slug = title.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
  const filename = `enso-${slug}.png`;

  return { dataUrl, blob, filename };
}

/**
 * Share or download a blob, using the best available mechanism:
 * 1. Native (Capacitor) share sheet
 * 2. Web Share API (mobile browsers)
 * 3. Download fallback (desktop)
 */
export async function shareOrDownloadBlob(
  blob: Blob,
  filename: string,
  title: string,
  mimeType: string,
): Promise<void> {
  const { isNative: isNativePlatform } = await import("./native-share");

  if (isNativePlatform) {
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

    if (mimeType.startsWith("image/")) {
      const { nativeShareImage } = await import("./native-share");
      await nativeShareImage({ dataUrl, title, filename });
    } else {
      const { nativeShareFile } = await import("./native-share");
      await nativeShareFile({ dataUrl, title, filename, mimeType });
    }
    return;
  }

  const file = new File([blob], filename, { type: mimeType });
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  if (isMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title, files: [file] });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Capture a card as a PNG and share/download it.
 */
export async function shareCardAsImage(
  cardId: string,
  title: string,
): Promise<void> {
  const { dataUrl, blob, filename } = await captureCardAsImage(cardId, title);

  const { isNative: isNativePlatform, nativeShareImage } = await import(
    "./native-share"
  );
  if (isNativePlatform) {
    await nativeShareImage({ dataUrl, title, filename });
    return;
  }

  await shareOrDownloadBlob(blob, filename, title, "image/png");
}

/**
 * Capture a card's DOM as a screenshot and embed it into a single-page PDF.
 * Returns the PDF blob and filename. Works for any card type.
 */
export async function generateCardPDF(
  cardId: string,
  title: string,
): Promise<{ blob: Blob; filename: string }> {
  const { dataUrl } = await captureCardAsImage(cardId, title);

  const jsPDF = (await import("jspdf")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });

  const aspectRatio = img.naturalHeight / img.naturalWidth;
  let imgWidth = contentWidth;
  let imgHeight = imgWidth * aspectRatio;

  // Title
  doc.setFontSize(14);
  doc.setTextColor(30, 64, 175);
  const titleLines = doc.splitTextToSize(title, contentWidth);
  let y = margin;
  for (const line of titleLines) {
    doc.text(line, margin, y + 5);
    y += 6;
  }
  y += 2;

  // Date
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(
    new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    margin,
    y + 3,
  );
  y += 8;

  const maxImgHeight = pageHeight - y - 12;
  if (imgHeight > maxImgHeight) {
    // Scale down or span multiple pages
    if (imgHeight > maxImgHeight * 3) {
      imgHeight = maxImgHeight;
      imgWidth = imgHeight / aspectRatio;
    }
  }

  // If the image fits on one page, add it directly
  if (imgHeight <= maxImgHeight) {
    doc.addImage(dataUrl, "PNG", margin, y, imgWidth, imgHeight);
  } else {
    // Span multiple pages by slicing the image
    let remainingHeight = imgHeight;
    let sourceY = 0;
    let firstPage = true;

    while (remainingHeight > 0) {
      if (!firstPage) {
        doc.addPage();
        y = margin;
      }
      const availableHeight = firstPage ? maxImgHeight : pageHeight - margin * 2;
      const sliceHeight = Math.min(remainingHeight, availableHeight);

      doc.addImage(
        dataUrl,
        "PNG",
        margin,
        y - sourceY,
        imgWidth,
        imgHeight,
      );

      sourceY += sliceHeight;
      remainingHeight -= sliceHeight;
      firstPage = false;
    }
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text("Shared from Enso", pageWidth / 2, pageHeight - 6, {
      align: "center",
    });
    doc.text(`${i}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  const slug = title.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
  const filename = `enso-${slug}.pdf`;
  return { blob: doc.output("blob"), filename };
}

/**
 * Generate and share/download a PDF for a card.
 * Uses a per-family custom generator if registered, otherwise
 * falls back to the default screenshot-based PDF.
 */
/**
 * Generate and share/download a PDF for a card.
 * Uses a per-family custom generator if registered, otherwise
 * falls back to the default screenshot-based PDF.
 */
export async function shareCardAsPDF(
  cardId: string,
  title: string,
  family?: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const { blob, filename } = await resolveCardPDF(cardId, title, family, data);
  await shareOrDownloadBlob(blob, filename, title, "application/pdf");
}

// ── Built-in PDF overrides ──

registerCardPDF("researcher", async (data, title) => {
  const { shareResearchAsPDF } = await import("./research-pdf");
  return shareResearchAsPDF({
    topic: typeof data.topic === "string" ? data.topic : title,
    summary: typeof data.summary === "string" ? data.summary : "",
    keyFindings: Array.isArray(data.keyFindings) ? data.keyFindings : [],
    sections: Array.isArray(data.sections) ? data.sections : [],
    sources: Array.isArray(data.sources) ? data.sources : [],
    narrative: typeof data.narrative === "string" ? data.narrative : "",
    videos: Array.isArray(data.videos) ? data.videos : [],
    books: Array.isArray(data.books) ? data.books : [],
    movies: Array.isArray(data.movies) ? data.movies : [],
    contradictions: Array.isArray(data.contradictions) ? data.contradictions : [],
  });
});
