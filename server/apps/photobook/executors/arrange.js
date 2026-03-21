var bookId = (params.bookId || "").trim();
var action = (params.action || "").trim();
var fromPage = params.fromPage;
var toPage = params.toPage;
var templateId = (params.templateId || "centered").trim();

if (!bookId || !action) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photobook_arrange",
        error: "bookId and action are required"
      })
    }]
  };
}

// Retrieve book
var storedBooks = await ctx.store.get("books");
var books = (storedBooks && Array.isArray(storedBooks)) ? storedBooks : [];
var bookIdx = -1;
for (var i = 0; i < books.length; i++) {
  if (books[i].id === bookId) { bookIdx = i; break; }
}

if (bookIdx < 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photobook_arrange",
        error: "Photobook not found: " + bookId
      })
    }]
  };
}

var book = books[bookIdx];
var pages = book.pages || [];
var message = "";

if (action === "move" && fromPage !== undefined && toPage !== undefined) {
  if (fromPage >= 0 && fromPage < pages.length && toPage >= 0 && toPage < pages.length) {
    var moved = pages.splice(fromPage, 1)[0];
    pages.splice(toPage, 0, moved);
    // Re-number
    for (var i = 0; i < pages.length; i++) pages[i].pageNumber = i;
    message = "Page " + fromPage + " moved to position " + toPage;
  } else {
    message = "Invalid page numbers";
  }
} else if (action === "add") {
  var newPage = {
    pageNumber: pages.length,
    templateId: templateId,
    photoCount: templateId === "text" ? 0 : (templateId === "duo" ? 2 : (templateId === "trio" ? 3 : 1))
  };
  if (fromPage !== undefined && fromPage >= 0 && fromPage < pages.length) {
    pages.splice(fromPage + 1, 0, newPage);
  } else {
    pages.push(newPage);
  }
  for (var i = 0; i < pages.length; i++) pages[i].pageNumber = i;
  message = "New " + templateId + " page added";
} else if (action === "remove" && fromPage !== undefined) {
  if (fromPage >= 0 && fromPage < pages.length) {
    pages.splice(fromPage, 1);
    for (var i = 0; i < pages.length; i++) pages[i].pageNumber = i;
    message = "Page " + fromPage + " removed";
  } else {
    message = "Invalid page number";
  }
} else if (action === "duplicate" && fromPage !== undefined) {
  if (fromPage >= 0 && fromPage < pages.length) {
    var dup = JSON.parse(JSON.stringify(pages[fromPage]));
    pages.splice(fromPage + 1, 0, dup);
    for (var i = 0; i < pages.length; i++) pages[i].pageNumber = i;
    message = "Page " + fromPage + " duplicated";
  } else {
    message = "Invalid page number";
  }
} else {
  message = "Unknown action: " + action;
}

book.pages = pages;
book.pageCount = pages.length;
books[bookIdx] = book;
await ctx.store.set("books", books);

var pageOrder = [];
for (var i = 0; i < Math.min(pages.length, 20); i++) {
  pageOrder.push({ pageNumber: i, templateId: pages[i].templateId });
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photobook_arrange",
      bookId: bookId,
      action: action,
      fromPage: fromPage,
      toPage: toPage,
      totalPages: pages.length,
      message: message,
      pageOrder: pageOrder
    })
  }]
};
