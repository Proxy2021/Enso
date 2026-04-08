// Books — Add Book: search Google Books API and return results for user to add
var p = params || {};
var query = p.query || "";

if (!query) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_books_add",
    error: "Please provide a search query (book title, author, or ISBN).",
    results: [],
  }) }] };
}

ctx.log("Searching Google Books for: " + query);

var results = [];
try {
  var response = await ctx.fetch("https://www.googleapis.com/books/v1/volumes?q=" + encodeURIComponent(query) + "&maxResults=5");

  if (response.ok || response.data) {
    var data = response.data || response;
    var items = data.items || [];

    results = items.map(function(item) {
      var vol = item.volumeInfo || {};
      var isbn13 = "";
      var isbn10 = "";
      if (vol.industryIdentifiers) {
        vol.industryIdentifiers.forEach(function(id) {
          if (id.type === "ISBN_13") isbn13 = id.identifier;
          if (id.type === "ISBN_10") isbn10 = id.identifier;
        });
      }
      var coverUrl = "";
      if (vol.imageLinks) {
        coverUrl = (vol.imageLinks.thumbnail || vol.imageLinks.smallThumbnail || "").replace("http://", "https://");
      }
      return {
        title: vol.title || "",
        subtitle: vol.subtitle || "",
        author: (vol.authors || []).join(", "),
        publisher: vol.publisher || "",
        publishedDate: vol.publishedDate || "",
        description: (vol.description || "").replace(/<[^>]+>/g, "").slice(0, 500),
        pageCount: vol.pageCount || 0,
        categories: vol.categories || [],
        rating: vol.averageRating || 0,
        ratingsCount: vol.ratingsCount || 0,
        language: vol.language || "",
        isbn: isbn13 || isbn10,
        coverUrl: coverUrl,
        googleBooksId: item.id || "",
      };
    }).filter(function(r) { return r.title; });

    ctx.log("Found " + results.length + " results");
  } else {
    ctx.log("Google Books API error: " + (response.status || "unknown"));
  }
} catch (e) {
  ctx.log("Search error: " + (e.message || e));
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_books_add",
  query: query,
  totalResults: results.length,
  results: results,
}) }] };
