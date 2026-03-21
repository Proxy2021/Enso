var bookId = (params.bookId || "").trim();
var startPage = params.page || 0;

if (!bookId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photobook_view",
        error: "Book ID is required"
      })
    }]
  };
}

// Retrieve book from store
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
        tool: "enso_photobook_view",
        error: "Photobook not found: " + bookId
      })
    }]
  };
}

// Build full page data with photo details
var allPhotos = book.photos || [];
var pageDefinitions = book.pages || [];
var fullPages = [];
var photoIdx = 0;

for (var p = 0; p < pageDefinitions.length; p++) {
  var pageDef = pageDefinitions[p];
  var pageData = {
    pageNumber: pageDef.pageNumber || p,
    templateId: pageDef.templateId || "hero"
  };

  if (pageDef.templateId === "cover") {
    pageData.photos = photoIdx < allPhotos.length ? [allPhotos[photoIdx++]] : [];
    pageData.textContent = { heading: book.title, subtitle: book.subtitle };
  } else if (pageDef.templateId === "text") {
    pageData.textContent = pageDef.textContent || { heading: "Section", subtitle: "" };
  } else {
    var count = pageDef.photoCount || 1;
    var pagePhotos = [];
    for (var c = 0; c < count && photoIdx < allPhotos.length; c++) {
      pagePhotos.push(allPhotos[photoIdx++]);
    }
    pageData.photos = pagePhotos;
  }

  fullPages.push(pageData);
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photobook_view",
      bookId: bookId,
      title: book.title,
      subtitle: book.subtitle,
      style: book.style,
      accentColor: book.accentColor,
      fontPair: book.fontPair,
      currentPage: startPage,
      totalPages: fullPages.length,
      pages: fullPages
    })
  }]
};
