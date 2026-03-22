var noteId = params.id || "";

if (!noteId) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_note_keeper_delete_note",
        success: false,
        error: "No note ID provided"
      })
    }]
  };
}

var docs = ctx.store.docs("notes");
var exists = await docs.has(noteId);

if (!exists) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_note_keeper_delete_note",
        success: false,
        id: noteId,
        error: "Note not found"
      })
    }]
  };
}

await docs.remove(noteId);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_note_keeper_delete_note",
      success: true,
      id: noteId,
      message: "Note deleted"
    })
  }]
};
