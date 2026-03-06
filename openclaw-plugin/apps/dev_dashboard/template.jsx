export default function GeneratedUI({ data, onAction }) {
  const [taskTitle, setTaskTitle] = useState("");
  const [taskProject, setTaskProject] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskNotes, setTaskNotes] = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteTag, setNoteTag] = useState("note");
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [scanPath, setScanPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const tool = data?.tool || "";
  const isOverview = tool === "enso_dev_overview";
  const isScan = tool === "enso_dev_scan_repos";
  const isTask = tool === "enso_dev_manage_task";
  const isNotebook = tool === "enso_dev_notebook";
  const isGithubSearch = tool === "enso_dev_search_github";

  const priorityColors = { high: "rose", medium: "amber", low: "blue" };
  const statusColors = { "in-progress": "amber", todo: "blue", idea: "purple", done: "emerald" };
  const tagColors = { snippet: "cyan", idea: "purple", link: "blue", bug: "rose", note: "gray" };

  const navBar = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      <Button variant={isOverview ? "primary" : "outline"} onClick={() => onAction("overview", {})}>
        {LucideReact.LayoutDashboard && <LucideReact.LayoutDashboard size={14} />} Dashboard
      </Button>
      <Button variant={isNotebook ? "primary" : "outline"} onClick={() => onAction("notebook", { action: "view" })}>
        {LucideReact.FileText && <LucideReact.FileText size={14} />} Notebook
      </Button>
      <Button variant={isGithubSearch ? "primary" : "outline"} onClick={() => onAction("search_github", { query: "trending" })}>
        {LucideReact.Search && <LucideReact.Search size={14} />} GitHub
      </Button>
    </div>
  );

  // Task Action Result
  if (isTask) {
    return (
      <div className="space-y-3">
        {navBar}
        <UICard accent={data?.success ? "emerald" : "red"}>
          <Badge variant={data?.success ? "success" : "danger"}>
            {data?.action === "create" && (data?.success ? "Task created: " + (data?.task?.title || "") : (data?.error || "Failed"))}
            {data?.action === "update" && (data?.success ? "Task updated: " + (data?.task?.title || "") : (data?.error || "Failed"))}
            {data?.action === "delete" && (data?.success ? "Task deleted" : (data?.error || "Failed"))}
          </Badge>
        </UICard>
        <Button variant="primary" onClick={() => onAction("overview", {})}>Back to Dashboard</Button>
      </div>
    );
  }

  // Scan Results
  if (isScan) {
    const found = data?.found || [];
    return (
      <div className="space-y-3">
        {navBar}
        <UICard accent="emerald" header={"Scanned: " + (data?.scannedPath || "")}>
          <div style={{ display: "flex", gap: 12 }}>
            <Stat label="Repos Found" value={data?.totalFound || 0} accent="emerald" />
            <Stat label="Total Projects" value={data?.totalProjects || 0} accent="blue" />
          </div>
        </UICard>
        {found.map((repo, i) => (
          <UICard key={i} accent="blue">
            <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 14 }}>{repo.name}</div>
            <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{repo.path}</div>
            <Badge variant="outline">{repo.branch}</Badge>
          </UICard>
        ))}
        {found.length === 0 && <EmptyState title="No repos found" description="Try a different directory" icon={LucideReact.FolderGit2} />}
        <Button variant="primary" onClick={() => onAction("overview", {})}>Back to Dashboard</Button>
      </div>
    );
  }

  // Notebook
  if (isNotebook) {
    const isActionResult = data?.action === "add" || data?.action === "delete";
    if (isActionResult) {
      return (
        <div className="space-y-3">
          {navBar}
          <UICard accent={data?.success ? "emerald" : "red"}>
            <Badge variant={data?.success ? "success" : "danger"}>
              {data?.action === "add" ? (data?.success ? "Note saved" : (data?.error || "Failed")) : (data?.success ? "Note deleted" : (data?.error || "Failed"))}
            </Badge>
          </UICard>
          <Button variant="primary" onClick={() => onAction("notebook", { action: "view" })}>View Notebook</Button>
        </div>
      );
    }

    const notes = data?.notes || [];
    return (
      <div className="space-y-3">
        {navBar}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#e5e7eb" }}>
            {LucideReact.FileText && <LucideReact.FileText size={16} style={{ display: "inline", marginRight: 6 }} />}
            Dev Notebook ({data?.totalNotes || 0})
          </div>
          <Button variant="primary" onClick={() => setShowNoteForm(!showNoteForm)}>
            {showNoteForm ? "Cancel" : "+ Note"}
          </Button>
        </div>
        {showNoteForm && (
          <UICard accent="blue">
            <div className="space-y-2">
              <Input placeholder="Write a note, snippet, or idea..." value={noteContent} onChange={e => setNoteContent(e.target.value)} />
              <Select
                options={[
                  { value: "note", label: "Note" },
                  { value: "snippet", label: "Code Snippet" },
                  { value: "idea", label: "Idea" },
                  { value: "link", label: "Link" },
                  { value: "bug", label: "Bug" }
                ]}
                value={noteTag}
                onChange={v => setNoteTag(v)}
              />
              <Button variant="primary" onClick={() => {
                if (noteContent.trim()) {
                  onAction("notebook", { action: "add", content: noteContent, tag: noteTag });
                  setNoteContent(""); setShowNoteForm(false);
                }
              }}>Save Note</Button>
            </div>
          </UICard>
        )}
        {notes.length > 0 ? notes.map((note, i) => (
          <UICard key={note.id || i} accent={tagColors[note.tag] || "gray"}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                  <Badge variant="outline">{note.tag}</Badge>
                  <span style={{ color: "#6b7280", fontSize: 11 }}>{note.createdAt}</span>
                </div>
                <div style={{ color: "#e5e7eb", fontSize: 13, whiteSpace: "pre-wrap" }}>{note.content}</div>
              </div>
              <Button variant="ghost" onClick={() => onAction("notebook", { action: "delete", noteId: note.id })}>
                {LucideReact.Trash2 && <LucideReact.Trash2 size={14} />}
              </Button>
            </div>
          </UICard>
        )) : (
          <EmptyState title="No notes yet" description="Jot down ideas, snippets, and links" icon={LucideReact.FileText} />
        )}
      </div>
    );
  }

  // GitHub Search
  if (isGithubSearch) {
    const results = data?.results || [];
    const langColors = { Python: "#3572A5", JavaScript: "#f1e05a", TypeScript: "#3178c6", Go: "#00ADD8", Rust: "#dea584" };
    return (
      <div className="space-y-3">
        {navBar}
        <div style={{ display: "flex", gap: 8 }}>
          <Input placeholder="Search GitHub repos..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} icon={LucideReact.Search} />
          <Button variant="primary" onClick={() => { if (searchQuery.trim()) onAction("search_github", { query: searchQuery }); }}>Search</Button>
        </div>
        {data?.query && <div style={{ color: "#9ca3af", fontSize: 13 }}>Results for "{data.query}"</div>}
        {results.map((repo, i) => (
          <UICard key={i} accent="blue">
            <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 14 }}>
              {LucideReact.GitBranch && <LucideReact.GitBranch size={14} style={{ display: "inline", marginRight: 6 }} />}
              {repo.name}
            </div>
            <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>{repo.description}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              <span style={{ color: "#f59e0b", fontSize: 13 }}>
                {LucideReact.Star && <LucideReact.Star size={12} style={{ display: "inline", marginRight: 2 }} />}
                {repo.stars}
              </span>
              {repo.language && (
                <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: langColors[repo.language] || "#6b7280", display: "inline-block" }}></span>
                  {repo.language}
                </span>
              )}
            </div>
          </UICard>
        ))}
        {results.length === 0 && <EmptyState title="No results" description="Try a different search" icon={LucideReact.Search} />}
      </div>
    );
  }

  // Overview (Default)
  const projects = data?.projects || [];
  const tasks = data?.tasks || [];
  const completedTasks = data?.completedTasks || [];
  const stats = data?.stats || {};

  return (
    <div className="space-y-3">
      {navBar}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Stat label="Projects" value={stats.totalProjects || 0} accent="blue" />
        <Stat label="Active Tasks" value={stats.activeTasks || 0} accent="amber" />
        <Stat label="Done Today" value={stats.completedToday || 0} accent="emerald" />
        <Stat label="Notes" value={stats.totalNotes || 0} accent="purple" />
      </div>

      <Tabs tabs={[
        { value: "tasks", label: "Tasks" },
        { value: "projects", label: "Projects" }
      ]} defaultValue="tasks" variant="pills">
        {(tab) => {
          if (tab === "projects") {
            return (
              <div className="space-y-3" style={{ marginTop: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <Input placeholder="Path to scan (e.g. ~/projects)" value={scanPath} onChange={e => setScanPath(e.target.value)} />
                  <Button variant="primary" onClick={() => onAction("scan_repos", { path: scanPath || "~/Desktop/Github" })}>
                    Scan
                  </Button>
                </div>
                {projects.length > 0 ? projects.map((proj, i) => (
                  <UICard key={proj.id || i} accent="blue">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 14 }}>
                          {LucideReact.FolderGit2 && <LucideReact.FolderGit2 size={14} style={{ display: "inline", marginRight: 6 }} />}
                          {proj.name}
                        </div>
                        <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{proj.path}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Badge variant="outline">{proj.branch || "main"}</Badge>
                        <Badge variant={proj.status === "active" ? "success" : "default"}>{proj.status}</Badge>
                      </div>
                    </div>
                  </UICard>
                )) : (
                  <EmptyState title="No projects tracked" description="Scan a directory to find git repos" icon={LucideReact.FolderGit2} />
                )}
              </div>
            );
          }

          // Tasks tab
          return (
            <div className="space-y-3" style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#e5e7eb" }}>Active Tasks</div>
                <Button variant="primary" onClick={() => setShowTaskForm(!showTaskForm)}>
                  {showTaskForm ? "Cancel" : "+ Task"}
                </Button>
              </div>
              {showTaskForm && (
                <UICard accent="blue">
                  <div className="space-y-2">
                    <Input placeholder="Task title" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Input placeholder="Project (optional)" value={taskProject} onChange={e => setTaskProject(e.target.value)} />
                      <Select
                        options={[
                          { value: "high", label: "High" },
                          { value: "medium", label: "Medium" },
                          { value: "low", label: "Low" }
                        ]}
                        value={taskPriority}
                        onChange={v => setTaskPriority(v)}
                      />
                    </div>
                    <Input placeholder="Notes (optional)" value={taskNotes} onChange={e => setTaskNotes(e.target.value)} />
                    <Button variant="primary" onClick={() => {
                      if (taskTitle.trim()) {
                        onAction("manage_task", { action: "create", title: taskTitle, project: taskProject, priority: taskPriority, notes: taskNotes });
                        setTaskTitle(""); setTaskProject(""); setTaskNotes(""); setShowTaskForm(false);
                      }
                    }}>Create Task</Button>
                  </div>
                </UICard>
              )}
              {tasks.length > 0 ? tasks.map((task, i) => (
                <UICard key={task.id || i} accent={priorityColors[task.priority] || "blue"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 14 }}>{task.title}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <Badge variant={task.priority === "high" ? "danger" : task.priority === "low" ? "info" : "warning"}>{task.priority}</Badge>
                        <Badge variant={statusColors[task.status] === "emerald" ? "success" : statusColors[task.status] === "amber" ? "warning" : "info"}>{task.status}</Badge>
                        {task.project && <Badge variant="outline">{task.project}</Badge>}
                      </div>
                      {task.notes && <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>{task.notes}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <Select
                        options={[
                          { value: "idea", label: "Idea" },
                          { value: "todo", label: "Todo" },
                          { value: "in-progress", label: "In Progress" },
                          { value: "done", label: "Done" }
                        ]}
                        value={task.status}
                        onChange={v => onAction("manage_task", { action: "update", taskId: task.id, status: v })}
                      />
                      <Button variant="ghost" onClick={() => onAction("manage_task", { action: "delete", taskId: task.id })}>
                        {LucideReact.Trash2 && <LucideReact.Trash2 size={14} />}
                      </Button>
                    </div>
                  </div>
                </UICard>
              )) : (
                <EmptyState title="No active tasks" description="Create a task to start tracking your work" icon={LucideReact.CheckSquare} />
              )}
              {completedTasks.length > 0 && (
                <Accordion items={[{
                  value: "completed",
                  title: "Completed (" + completedTasks.length + ")",
                  content: (
                    <div className="space-y-2">
                      {completedTasks.map((task, i) => (
                        <div key={task.id || i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", opacity: 0.6 }}>
                          <span style={{ color: "#9ca3af", fontSize: 13 }}>{task.title}</span>
                          <span style={{ color: "#6b7280", fontSize: 11 }}>{task.completedAt || task.createdAt}</span>
                        </div>
                      ))}
                    </div>
                  )
                }]} />
              )}
            </div>
          );
        }}
      </Tabs>
    </div>
  );
}
