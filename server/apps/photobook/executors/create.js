var title = (params.title || "Untitled Photobook").trim();
var subtitle = (params.subtitle || "").trim();
var style = (params.style || "warm").trim();
var accentColor = (params.accentColor || "#C4785B").trim();
var fontPair = (params.fontPair || "lato-opensans").trim();
var photoPaths = params.photoPaths || [];

// Generate unique book ID
var bookId = "book-" + Date.now();

// Resolve photos
var photos = [];
for (var i = 0; i < photoPaths.length; i++) {
  var viewResult = await ctx.callTool("enso_media_view_photo", { path: photoPaths[i] });
  var d = viewResult.success ? viewResult.data : null;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch(e) { d = null; } }
  photos.push({
    id: "p-" + i,
    url: d ? (d.mediaUrl || "") : "",
    caption: d ? (d.caption || d.name || photoPaths[i].split("/").pop()) : photoPaths[i].split("/").pop(),
    location: "",
    path: photoPaths[i]
  });
}

// Auto-assign templates using rhythm algorithm
var pages = [];
// Cover
pages.push({ pageNumber: 0, templateId: "cover", photoCount: photos.length > 0 ? 1 : 0 });

var remaining = photos.slice(1);
var pageNum = 1;

while (remaining.length > 0) {
  // Hero (1 photo)
  if (remaining.length >= 1) {
    pages.push({ pageNumber: pageNum++, templateId: "hero", photoCount: 1 });
    remaining = remaining.slice(1);
  }
  // Duo (2 photos)
  if (remaining.length >= 2) {
    pages.push({ pageNumber: pageNum++, templateId: "duo", photoCount: 2 });
    remaining = remaining.slice(2);
  }
  // Trio (3 photos)
  if (remaining.length >= 3) {
    pages.push({ pageNumber: pageNum++, templateId: "trio", photoCount: 3 });
    remaining = remaining.slice(3);
  } else if (remaining.length >= 2) {
    pages.push({ pageNumber: pageNum++, templateId: "duo", photoCount: 2 });
    remaining = remaining.slice(2);
  }
  // Centered (1 photo)
  if (remaining.length >= 1) {
    pages.push({ pageNumber: pageNum++, templateId: "centered", photoCount: 1 });
    remaining = remaining.slice(1);
  }
  // Text divider if more sections
  if (remaining.length > 0) {
    pages.push({ pageNumber: pageNum++, templateId: "text", photoCount: 0 });
  }
}

// Save book to store
var storedBooks = await ctx.store.get("books");
var books = (storedBooks && Array.isArray(storedBooks)) ? storedBooks : [];

var newBook = {
  id: bookId,
  title: title,
  subtitle: subtitle,
  style: style,
  accentColor: accentColor,
  fontPair: fontPair,
  pageCount: pages.length,
  photoCount: photos.length,
  coverUrl: photos.length > 0 ? photos[0].url : "",
  createdAt: new Date().toISOString(),
  photos: photos,
  pages: pages
};
books.push(newBook);
await ctx.store.set("books", books);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_photobook_create",
      bookId: bookId,
      title: title,
      subtitle: subtitle,
      style: style,
      accentColor: accentColor,
      fontPair: fontPair,
      pageCount: pages.length,
      pages: pages,
      message: "Photobook created with " + pages.length + " pages from " + photos.length + " photos"
    })
  }]
};
