var bookId = (params.bookId || "").trim();
var format = (params.format || "html").trim();
var quality = (params.quality || "standard").trim();

if (!bookId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photobook_export",
        error: "bookId is required"
      })
    }]
  };
}

// Retrieve book
var storedBooks = await ctx.store.get("books");
var books = (storedBooks && Array.isArray(storedBooks)) ? storedBooks : [];
var book = null;
for (var i = 0; i < books.length; i++) {
  if (books[i].id === bookId) { book = books[i]; break; }
}

if (!book) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photobook_export",
        error: "Photobook not found: " + bookId
      })
    }]
  };
}

// Build HTML export with inline CSS — matches photobook template visual style
var safeName = (book.title || "photobook").replace(/[^a-zA-Z0-9 ]/g, "").replace(/ +/g, "_");
var bookStyle = book.style || "warm";
var accentColor = book.accentColor || "#C4785B";

var STYLES = {
  warm: { bg: "#FAF8F5", bg2: "#F0EDE8", text: "#2C2C2C", muted: "#888888" },
  pure: { bg: "#FFFFFF", bg2: "#F5F5F5", text: "#333333", muted: "#888888" },
  moody: { bg: "#2C2C2C", bg2: "#404040", text: "#E8E4DF", muted: "#999999" }
};
var theme = STYLES[bookStyle] || STYLES.warm;

var pages = book.pages || [];
var pageCount = pages.length;
var photoCount = 0;

// Build pages HTML
var pagesHtml = "";
for (var p = 0; p < pages.length; p++) {
  var page = pages[p];
  var layout = page.layout || "single";
  var photos = page.photos || [];
  photoCount += photos.length;

  pagesHtml += '<div class="page" style="page-break-after:always;margin:40px auto;max-width:800px;padding:40px;background:' + theme.bg + ';border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)">';

  if (page.caption) {
    pagesHtml += '<p style="text-align:center;font-style:italic;color:' + theme.muted + ';margin-bottom:20px;font-size:14px">' + page.caption.replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</p>';
  }

  var gridStyle = layout === "grid" ? "display:grid;grid-template-columns:repeat(2,1fr);gap:16px" :
                  layout === "collage" ? "display:grid;grid-template-columns:repeat(3,1fr);gap:12px" :
                  "display:flex;flex-direction:column;align-items:center;gap:16px";

  pagesHtml += '<div style="' + gridStyle + '">';
  for (var ph = 0; ph < photos.length; ph++) {
    var photo = photos[ph];
    var src = photo.url || photo.src || "";
    var alt = (photo.caption || photo.filename || "Photo").replace(/"/g, "&quot;");
    pagesHtml += '<div style="text-align:center">';
    pagesHtml += '<img src="' + src + '" alt="' + alt + '" style="max-width:100%;height:auto;border-radius:4px;border:1px solid ' + theme.bg2 + '" />';
    if (photo.caption) {
      pagesHtml += '<p style="margin-top:8px;font-size:12px;color:' + theme.muted + '">' + photo.caption.replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</p>';
    }
    pagesHtml += '</div>';
  }
  pagesHtml += '</div>';
  pagesHtml += '</div>';
}

var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' + (book.title || "Photobook").replace(/</g, "&lt;") + '</title>\n<style>\n' +
  '* { margin: 0; padding: 0; box-sizing: border-box; }\n' +
  'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: ' + theme.bg2 + '; color: ' + theme.text + '; padding: 40px 20px; }\n' +
  '.cover { text-align: center; max-width: 800px; margin: 0 auto 40px; padding: 60px 40px; background: ' + theme.bg + '; border-radius: 12px; border-bottom: 4px solid ' + accentColor + '; }\n' +
  '.cover h1 { font-size: 32px; font-weight: 300; letter-spacing: 2px; margin-bottom: 8px; }\n' +
  '.cover .subtitle { font-size: 14px; color: ' + theme.muted + '; }\n' +
  '.page img { display: block; }\n' +
  '@media print { body { background: white; padding: 0; } .page { box-shadow: none !important; margin: 0 auto !important; } }\n' +
  '</style>\n</head>\n<body>\n' +
  '<div class="cover"><h1>' + (book.title || "Photobook").replace(/</g, "&lt;") + '</h1>' +
  (book.subtitle ? '<p class="subtitle">' + book.subtitle.replace(/</g, "&lt;") + '</p>' : '') +
  '</div>\n' +
  pagesHtml +
  '\n</body>\n</html>';

// Write to filesystem
var fs = require("fs");
var path = require("path");
var os = require("os");

var docsDir = path.join(os.homedir(), "Documents", "Enso Photobooks");
try { fs.mkdirSync(docsDir, { recursive: true }); } catch (e) { /* exists */ }

var outputPath = path.join(docsDir, safeName + ".html");
fs.writeFileSync(outputPath, html, "utf-8");

var fileSizeBytes = fs.statSync(outputPath).size;
var fileSizeKB = Math.round(fileSizeBytes / 1024);

var message = "Exported " + pageCount + " pages (" + photoCount + " photos) as HTML — " + fileSizeKB + " KB";

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photobook_export",
      bookId: bookId,
      format: "html",
      quality: quality,
      title: book.title,
      pageCount: pageCount,
      photoCount: photoCount,
      message: message,
      exportPath: outputPath,
      fileSize: fileSizeKB + " KB",
      hint: "Open in any browser and use Print > Save as PDF for a PDF version."
    })
  }]
};
