export default function GeneratedUI({ data, onAction }) {
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTags, setEditTags] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [activeTag, setActiveTag] = useState("");

  const isSave = data?.tool === "enso_note_keeper_save_note";
  const isDelete = data?.tool === "enso_note_keeper_delete_note";
  const isSearch = data?.tool === "enso_note_keeper_search_notes";

  if (isSave) {
    return (
      <UICard accent="emerald" header="Note Saved">
        <Alert variant="success" title={data?.isNew ? "Created" : "Updated"}>
          {data?.message ?? "Note saved successfully"}
        </Alert>
        <div className="mt-2 text-xs text-gray-400">ID: {data?.id}</div>
        <Button variant="ghost" className="mt-3" onClick={() => onAction("list_notes", {})}>
          <LucideReact.ArrowLeft size={14} /> Back to Notes
        </Button>
      </UICard>
    );
  }

  if (isDelete) {
    return (
      <UICard accent={data?.success ? "emerald" : "rose"} header="Note Deleted">
        <Alert variant={data?.success ? "success" : "danger"}>
          {data?.message ?? data?.error ?? "Operation complete"}
        </Alert>
        <Button variant="ghost" className="mt-3" onClick={() => onAction("list_notes", {})}>
          <LucideReact.ArrowLeft size={14} /> Back to Notes
        </Button>
      </UICard>
    );
  }

  if (isSearch) {
    const results = data?.results ?? [];
    return (
      <UICard accent="cyan" header={
        <div className="flex items-center justify-between w-full">
          <span className="font-semibold flex items-center gap-2">
            <LucideReact.Search size={16} /> Search Results
          </span>
          <Badge variant="info">{results.length} found for "{data?.query}"</Badge>
        </div>
      }>
        {results.length === 0 ? (
          <EmptyState icon={<LucideReact.SearchX size={28} />} title="No notes found" description="Try a different search term" />
        ) : (
          <div className="space-y-2">
            {results.map((note) => (
              <div key={note.id} className="p-2.5 rounded-lg bg-gray-800/60 border border-gray-700/40 hover:border-gray-600/60 active:bg-gray-800 active:scale-[0.99] transition-all duration-150 cursor-pointer" onClick={() => {
                setEditId(note.id);
                setEditTitle(note.title);
                setEditBody(note.preview.replace(/\.\.\.$/, ""));
                setEditTags((note.tags || []).join(", "));
              }}>
                <div className="flex items-start justify-between">
                  <p className="text-xs font-medium text-gray-200">{note.title}</p>
                  <span className="text-[10px] text-gray-500 shrink-0 ml-2">{note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : ""}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{note.preview}</p>
                {note.tags?.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {note.tags.map(t => <Badge key={t} variant="outline">{t}</Badge>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <Button variant="ghost" className="mt-3" onClick={() => onAction("list_notes", {})}>
          <LucideReact.ArrowLeft size={14} /> Back to Notes
        </Button>
      </UICard>
    );
  }

  const notes = data?.notes ?? [];
  const allTags = data?.allTags ?? [];
  const isEditing = editId !== null || editTitle || editBody;

  return (
    <div className="space-y-4">
      <UICard accent="violet" header={
        <div className="flex items-center justify-between w-full">
          <span className="font-semibold flex items-center gap-2">
            <LucideReact.StickyNote size={16} /> Note Keeper
          </span>
          <Badge variant="default">{data?.count ?? notes.length} notes</Badge>
        </div>
      }>
        <Tabs
          tabs={[
            { value: "notes", label: "Notes", icon: <LucideReact.List size={13} /> },
            { value: "edit", label: isEditing ? "Edit Note" : "New Note", icon: <LucideReact.Edit size={13} /> },
            { value: "search", label: "Search", icon: <LucideReact.Search size={13} /> },
          ]}
          defaultValue="notes"
        >
          {(tab) => (
            <>
              {tab === "notes" && (
                <div className="space-y-2">
                  {allTags.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      <button
                        onClick={() => { setActiveTag(""); onAction("list_notes", {}); }}
                        className={`px-2 py-0.5 text-[10px] rounded-full border transition-all duration-150 cursor-pointer active:scale-[0.95] ${!activeTag ? "bg-violet-600/20 border-violet-500/40 text-violet-300" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}
                      >All</button>
                      {allTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => { setActiveTag(tag); onAction("list_notes", { tag }); }}
                          className={`px-2 py-0.5 text-[10px] rounded-full border transition-all duration-150 cursor-pointer active:scale-[0.95] ${activeTag === tag ? "bg-violet-600/20 border-violet-500/40 text-violet-300" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}
                        >{tag}</button>
                      ))}
                    </div>
                  )}
                  {notes.length === 0 ? (
                    <EmptyState
                      icon={<LucideReact.StickyNote size={28} />}
                      title="No notes yet"
                      description="Create your first note in the New Note tab"
                    />
                  ) : (
                    notes.map((note) => (
                      <div key={note.id} className="p-2.5 rounded-lg bg-gray-800/60 border border-gray-700/40 hover:border-gray-600/60 active:bg-gray-800 transition-all duration-150 group">
                        <div className="flex items-start justify-between">
                          <button className="text-left flex-1 min-w-0 cursor-pointer" onClick={() => {
                            setEditId(note.id);
                            setEditTitle(note.title);
                            setEditBody(note.preview.replace(/\.\.\.$/, ""));
                            setEditTags((note.tags || []).join(", "));
                          }}>
                            <p className="text-xs font-medium text-gray-200">{note.title}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{note.preview}</p>
                          </button>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <span className="text-[10px] text-gray-600">{note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : ""}</span>
                            <button
                              onClick={() => setConfirmDelete(note.id)}
                              className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-rose-400 active:scale-[0.9] transition-all duration-150 cursor-pointer p-0.5"
                            >
                              <LucideReact.Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        {note.tags?.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {note.tags.map(t => <Badge key={t} variant="outline">{t}</Badge>)}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "edit" && (
                <div className="space-y-3">
                  <Input
                    value={editTitle}
                    onChange={setEditTitle}
                    placeholder="Note title..."
                    size="md"
                    className="w-full"
                  />
                  <Textarea
                    value={editBody}
                    onChange={setEditBody}
                    placeholder="Write your note here..."
                    rows={8}
                  />
                  <Input
                    value={editTags}
                    onChange={setEditTags}
                    placeholder="Tags (comma-separated): work, personal, ideas..."
                    icon={<LucideReact.Tag size={13} />}
                    className="w-full"
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => {
                      var saveParams = { title: editTitle, body: editBody, tags: editTags };
                      if (editId) saveParams.id = editId;
                      onAction("save_note", saveParams);
                      setEditId(null);
                      setEditTitle("");
                      setEditBody("");
                      setEditTags("");
                    }} disabled={!editTitle.trim() || !editBody.trim()}>
                      <LucideReact.Save size={14} /> {editId ? "Update Note" : "Save Note"}
                    </Button>
                    {isEditing && (
                      <Button variant="ghost" onClick={() => { setEditId(null); setEditTitle(""); setEditBody(""); setEditTags(""); }}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {tab === "search" && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder="Search notes..."
                      icon={<LucideReact.Search size={13} />}
                      className="flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter" && searchQuery.trim()) onAction("search_notes", { query: searchQuery }); }}
                    />
                    <Button variant="primary" onClick={() => onAction("search_notes", { query: searchQuery })} disabled={!searchQuery.trim()}>
                      Search
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Tabs>
      </UICard>

      <Dialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete Note"
        description="Are you sure you want to delete this note? This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { onAction("delete_note", { id: confirmDelete }); setConfirmDelete(null); }}>Delete</Button>
          </>
        }
      >
        <p className="text-xs text-gray-400">This will permanently remove the note.</p>
      </Dialog>
    </div>
  );
}
