var tagFilter = params.tag || "";
var docs = ctx.store.docs("notes");
var entries = await docs.list();

var notes = [];
var allTagsSet = {};

for (var i = 0; i < entries.length; i++) {
  var entry = entries[i];
  var note = await docs.load(entry.id);
  if (!note) continue;

  var noteTags = note.tags || [];
  for (var ti = 0; ti < noteTags.length; ti++) {
    allTagsSet[noteTags[ti]] = true;
  }

  if (tagFilter && noteTags.indexOf(tagFilter) === -1) continue;

  var body = note.body || "";
  notes.push({
    id: entry.id,
    title: note.title || "Untitled",
    preview: body.length > 100 ? body.substring(0, 100) + "..." : body,
    tags: noteTags,
    createdAt: note.createdAt || entry.meta?.createdAt || "",
    updatedAt: note.updatedAt || entry.meta?.updatedAt || ""
  });
}

notes.sort(function(a, b) {
  return (b.updatedAt || "").localeCompare(a.updatedAt || "");
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_note_keeper_list_notes",
      count: notes.length,
      notes: notes,
      allTags: Object.keys(allTagsSet).sort(),
      filterTag: tagFilter || null
    })
  }]
};
