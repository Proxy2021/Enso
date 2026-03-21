var bookId = (params.bookId || "").trim();
var pageNum = params.page;
var templateId = (params.templateId || "").trim();
var photoUpdates = params.photoUpdates || "";
var textUpdates = params.textUpdates || "";

if (!bookId || pageNum === undefined) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photobook_edit",
        error: "bookId and page number are required"
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
        tool: "enso_photobook_edit",
        error: "Photobook not found: " + bookId
      })
    }]
  };
}

var book = books[bookIdx];
var pages = book.pages || [];
if (pageNum < 0 || pageNum >= pages.length) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photobook_edit",
        error: "Page " + pageNum + " out of range (0-" + (pages.length - 1) + ")"
      })
    }]
  };
}

var page = pages[pageNum];
var changes = [];

// Update template
if (templateId) {
  page.templateId = templateId;
  changes.push("template → " + templateId);
}

// Update photos
if (photoUpdates) {
  try {
    var updates = JSON.parse(photoUpdates);
    if (Array.isArray(updates)) {
      for (var u = 0; u < updates.length; u++) {
        var up = updates[u];
        if (up.slotIndex !== undefined && up.newPhotoPath) {
          var viewResult = await ctx.callTool("enso_media_view_photo", { path: up.newPhotoPath });
          var d = viewResult.success ? viewResult.data : null;
          if (typeof d === "string") { try { d = JSON.parse(d); } catch(e) { d = null; } }
          // Update in the all-photos array
          var allPhotos = book.photos || [];
          // Calculate the absolute photo index from slot index
          var absIdx = 0;
          for (var p = 0; p < pageNum; p++) {
            absIdx += (pages[p].photoCount || 0);
          }
          absIdx += up.slotIndex;
          if (absIdx < allPhotos.length) {
            allPhotos[absIdx] = {
              id: "p-" + absIdx,
              url: d ? (d.mediaUrl || "") : "",
              caption: d ? (d.name || "") : "",
              path: up.newPhotoPath
            };
          }
          changes.push("photo slot " + up.slotIndex + " swapped");
        }
      }
    }
  } catch(e) { /* ignore parse errors */ }
}

// Update text
if (textUpdates) {
  try {
    var txtUp = JSON.parse(textUpdates);
    page.textContent = txtUp;
    changes.push("text updated");
  } catch(e) { /* ignore */ }
}

// Persist
books[bookIdx] = book;
await ctx.store.set("books", books);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photobook_edit",
      bookId: bookId,
      page: pageNum,
      templateId: page.templateId,
      message: "Page " + pageNum + " updated: " + (changes.join(", ") || "no changes"),
      updatedPage: page
    })
  }]
};
