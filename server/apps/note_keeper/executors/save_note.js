var noteId = params.id || ctx.uuid();
var title = params.title || "Untitled";
var body = params.body || "";
var tagsStr = params.tags || "";
var tags = tagsStr ? tagsStr.split(",").map(function(t) { return t.trim(); }).filter(function(t) { return t.length > 0; }) : [];

var docs = ctx.store.docs("notes");
var existing = await docs.load(noteId);
var now = new Date().toISOString();

var note = {
  title: title,
  body: body,
  tags: tags,
  createdAt: existing ? existing.createdAt : now,
  updatedAt: now
};

await docs.save(noteId, note, { createdAt: note.createdAt, updatedAt: now });

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_note_keeper_save_note",
      success: true,
      id: noteId,
      title: title,
      isNew: !existing,
      message: existing ? "Note updated successfully" : "Note created successfully"
    })
  }]
};
