var query = (params.query || "").toLowerCase().trim();

if (!query) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_note_keeper_search_notes",
        query: "",
        count: 0,
        results: [],
        error: "Please provide a search query"
      })
    }]
  };
}

var docs = ctx.store.docs("notes");
var entries = await docs.list();
var results = [];

for (var i = 0; i < entries.length; i++) {
  var entry = entries[i];
  var note = await docs.load(entry.id);
  if (!note) continue;

  var title = (note.title || "").toLowerCase();
  var body = (note.body || "").toLowerCase();
  var tags = (note.tags || []).join(" ").toLowerCase();

  if (title.indexOf(query) >= 0 || body.indexOf(query) >= 0 || tags.indexOf(query) >= 0) {
    var bodyText = note.body || "";
    results.push({
      id: entry.id,
      title: note.title || "Untitled",
      preview: bodyText.length > 100 ? bodyText.substring(0, 100) + "..." : bodyText,
      tags: note.tags || [],
      updatedAt: note.updatedAt || ""
    });
  }
}

results.sort(function(a, b) {
  return (b.updatedAt || "").localeCompare(a.updatedAt || "");
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_note_keeper_search_notes",
      query: params.query,
      count: results.length,
      results: results
    })
  }]
};
