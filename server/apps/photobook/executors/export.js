var bookId = (params.bookId || "").trim();
var format = (params.format || "pdf").trim();
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

// Generate export path
var safeName = (book.title || "photobook").replace(/[^a-zA-Z0-9 ]/g, "").replace(/ +/g, "_");
var ext = format === "images" ? "zip" : "pdf";
var exportPath = "~/Documents/" + safeName + "." + ext;

// Estimate size based on photo count and quality
var photoCount = book.photoCount || 0;
var baseSizePerPhoto = quality === "high" ? 3.5 : 2.0;
var estimatedMB = Math.round(photoCount * baseSizePerPhoto * 10) / 10;

var message = "Export ready — " + (book.pageCount || 0) + " pages as " + format.toUpperCase();
if (format === "images") {
  message = "Export ready — " + (book.pageCount || 0) + " page images in ZIP";
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photobook_export",
      bookId: bookId,
      format: format,
      quality: quality,
      title: book.title,
      pageCount: book.pageCount || 0,
      message: message,
      exportPath: exportPath,
      estimatedSize: estimatedMB + " MB"
    })
  }]
};
