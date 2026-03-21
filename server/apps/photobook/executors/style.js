var bookId = (params.bookId || "").trim();
var styleId = (params.styleId || "").trim();
var accentColor = (params.accentColor || "").trim();
var fontPair = (params.fontPair || "").trim();

if (!bookId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_photobook_style",
        error: "bookId is required"
      })
    }]
  };
}

// Style presets
var STYLES = {
  warm: { bg: "#FAF8F5", bg2: "#F0EDE8", text: "#2C2C2C", name: "Warm" },
  pure: { bg: "#FFFFFF", bg2: "#F5F5F5", text: "#333333", name: "Pure" },
  moody: { bg: "#2C2C2C", bg2: "#404040", text: "#E8E4DF", name: "Moody" }
};

var ACCENT_NAMES = {
  "#C4785B": "Terracotta",
  "#B2BDA0": "Sage",
  "#D4A5A5": "Dusty Rose",
  "#708090": "Slate",
  "#A89F91": "Neutral"
};

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
        tool: "enso_photobook_style",
        error: "Photobook not found: " + bookId
      })
    }]
  };
}

var book = books[bookIdx];
var changes = [];

if (styleId && STYLES[styleId]) {
  book.style = styleId;
  changes.push("style → " + STYLES[styleId].name);
}
if (accentColor) {
  book.accentColor = accentColor;
  changes.push("accent → " + (ACCENT_NAMES[accentColor] || accentColor));
}
if (fontPair) {
  book.fontPair = fontPair;
  changes.push("fonts → " + fontPair);
}

books[bookIdx] = book;
await ctx.store.set("books", books);

var resolvedStyle = STYLES[book.style] || STYLES.warm;

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photobook_style",
      bookId: bookId,
      style: book.style,
      accentColor: book.accentColor,
      fontPair: book.fontPair,
      bgPrimary: resolvedStyle.bg,
      bgSecondary: resolvedStyle.bg2,
      textColor: resolvedStyle.text,
      message: "Style updated: " + (changes.join(", ") || "no changes")
    })
  }]
};
