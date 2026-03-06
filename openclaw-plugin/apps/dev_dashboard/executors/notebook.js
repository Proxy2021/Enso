var action = (params.action || "").trim() || "view";
var notes = (await ctx.store.get("notes")) || [];

if (action === "add") {
  var content = (params.content || "").trim();
  var tag = (params.tag || "").trim() || "note";

  if (!content) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_dev_notebook", action: "add", success: false, error: "Content is required" })
      }]
    };
  }

  var newNote = {
    id: "n" + Date.now(),
    content: content,
    tag: tag,
    createdAt: new Date().toISOString().split("T")[0]
  };

  notes.push(newNote);
  await ctx.store.set("notes", notes);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_dev_notebook", action: "add", success: true, note: newNote, totalNotes: notes.length })
    }]
  };
}

if (action === "delete") {
  var noteId = (params.noteId || "").trim();
  var newNotes = notes.filter(function(n) { return n.id !== noteId; });

  if (newNotes.length === notes.length) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_dev_notebook", action: "delete", success: false, error: "Note not found" })
      }]
    };
  }

  await ctx.store.set("notes", newNotes);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_dev_notebook", action: "delete", success: true, removedId: noteId, totalNotes: newNotes.length })
    }]
  };
}

// Default: view (most recent first)
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_dev_notebook",
      action: "view",
      notes: notes.slice().reverse(),
      totalNotes: notes.length
    })
  }]
};
