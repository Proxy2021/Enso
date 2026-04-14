export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var THEME_COLORS = {
    light_shadow: { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-400", hex: "#f59e0b", label: "Light & Shadow" },
    faces: { bg: "bg-red-500/15", border: "border-red-500/30", text: "text-red-400", hex: "#ef4444", label: "Faces" },
    architecture: { bg: "bg-blue-500/15", border: "border-blue-500/30", text: "text-blue-400", hex: "#3b82f6", label: "Architecture" },
    nature: { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400", hex: "#22c55e", label: "Nature" },
    culture: { bg: "bg-purple-500/15", border: "border-purple-500/30", text: "text-purple-400", hex: "#a855f7", label: "Culture" },
    street: { bg: "bg-orange-500/15", border: "border-orange-500/30", text: "text-orange-400", hex: "#f97316", label: "Street" },
    food: { bg: "bg-pink-500/15", border: "border-pink-500/30", text: "text-pink-400", hex: "#ec4899", label: "Food" },
    transport: { bg: "bg-cyan-500/15", border: "border-cyan-500/30", text: "text-cyan-400", hex: "#06b6d4", label: "Transport" }
  };

  var LAYOUT_LABELS = {
    full_bleed: "Full Bleed (Hero)",
    two_side_by_side: "Two Side by Side",
    large_small: "Large + Small Accent",
    three_grid: "Three Image Grid",
    text_page: "Text / Chapter Break"
  };

  var LAYOUT_ICONS = {
    full_bleed: "[ \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 ]",
    two_side_by_side: "[ \u2588\u2588\u2588\u2588 \u2588\u2588\u2588\u2588 ]",
    large_small: "[ \u2588\u2588\u2588\u2588\u2588\u2588 \u2588\u2588 ]",
    three_grid: "[ \u2588\u2588 \u2588\u2588 \u2588\u2588 ]",
    text_page: "[ Aa  Text ]"
  };

  var ARC_LABELS = { opening: "Opening", rising: "Rising", climax: "Climax", resolution: "Resolution" };
  var ARC_ACCENTS = { opening: "cyan", rising: "amber", climax: "rose", resolution: "emerald" };

  var STATUS_CONFIG = {
    planning: { label: "Planning", color: "info", icon: "Lightbulb" },
    culling: { label: "Culling", color: "warning", icon: "Scissors" },
    selecting: { label: "Selecting", color: "warning", icon: "Star" },
    sequencing: { label: "Sequencing", color: "info", icon: "List" },
    layout: { label: "Layout", color: "info", icon: "LayoutGrid" },
    printing: { label: "Printing", color: "warning", icon: "Printer" },
    done: { label: "Done", color: "success", icon: "CheckCircle" }
  };

  var PRINTER_LABELS = {
    saal_digital: "Saal Digital",
    printique: "Printique",
    whitewall: "WhiteWall"
  };

  var getTheme = function(tag) { return THEME_COLORS[tag] || THEME_COLORS.nature; };

  // ── Hooks (always at top level) ──
  var tabState = useState("overview");
  var activeTab = tabState[0];
  var setActiveTab = tabState[1];

  var addSpreadState = useState(false);
  var showAddSpread = addSpreadState[0];
  var setShowAddSpread = addSpreadState[1];

  var newLayoutState = useState("full_bleed");
  var newLayout = newLayoutState[0];
  var setNewLayout = newLayoutState[1];

  var newDescState = useState("");
  var newDesc = newDescState[0];
  var setNewDesc = newDescState[1];

  var newThemeState = useState("nature");
  var newTheme = newThemeState[0];
  var setNewTheme = newThemeState[1];

  var newArcState = useState("rising");
  var newArc = newArcState[0];
  var setNewArc = newArcState[1];

  var editIdxState = useState(-1);
  var editIdx = editIdxState[0];
  var setEditIdx = editIdxState[1];

  var editPassState = useState(-1);
  var editPass = editPassState[0];
  var setEditPass = editPassState[1];

  var countInputState = useState("");
  var countInput = countInputState[0];
  var setCountInput = countInputState[1];

  var createFormState = useState(false);
  var showCreate = createFormState[0];
  var setShowCreate = createFormState[1];

  var createTitleState = useState("");
  var createTitle = createTitleState[0];
  var setCreateTitle = createTitleState[1];

  var createRecipientState = useState("");
  var createRecipient = createRecipientState[0];
  var setCreateRecipient = createRecipientState[1];

  var createThemeState = useState("");
  var createTheme = createThemeState[0];
  var setCreateTheme = createThemeState[1];

  var createPrinterState = useState("saal_digital");
  var createPrinter = createPrinterState[0];
  var setCreatePrinter = createPrinterState[1];

  var createDueDateState = useState("");
  var createDueDate = createDueDateState[0];
  var setCreateDueDate = createDueDateState[1];

  var createOccasionState = useState("");
  var createOccasion = createOccasionState[0];
  var setCreateOccasion = createOccasionState[1];

  var createCandidatesState = useState("");
  var createCandidates = createCandidatesState[0];
  var setCreateCandidates = createCandidatesState[1];

  var addChapterState = useState(false);
  var showAddChapter = addChapterState[0];
  var setShowAddChapter = addChapterState[1];

  var chapterNameState = useState("");
  var chapterName = chapterNameState[0];
  var setChapterName = chapterNameState[1];

  var chapterSpreadsState = useState("4");
  var chapterSpreads = chapterSpreadsState[0];
  var setChapterSpreads = chapterSpreadsState[1];

  var chapterNotesState = useState("");
  var chapterNotes = chapterNotesState[0];
  var setChapterNotes = chapterNotesState[1];

  var chapterTagsState = useState("");
  var chapterTags = chapterTagsState[0];
  var setChapterTags = chapterTagsState[1];

  // ── Error view ──
  if (data && data.error) {
    return (
      <UICard accent="rose" header="Album Designer">
        <div className="text-red-400 text-sm">{data.error}</div>
        <Button variant="outline" onClick={function() { onAction("setup_project", { action: "list" }); }}>Back to Projects</Button>
      </UICard>
    );
  }

  // ── Route by tool ──
  var tool = (data && data.tool) || "";

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD VIEW
  // ═══════════════════════════════════════════════════════════════
  if (tool === "enso_album_designer_dashboard") {
    var dashProjects = data.projects || [];
    var summary = data.summary || {};

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Project Dashboard</div>
            <div className="text-xs text-zinc-500">{summary.totalProjects || 0} projects ({summary.activeProjects || 0} active)</div>
          </div>
          <Button variant="primary" icon={LucideReact.Plus} onClick={function() { setShowCreate(true); }}>New Project</Button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Active" value={summary.activeProjects || 0} accent="amber" />
          <Stat label="Completed" value={summary.completedProjects || 0} accent="emerald" />
          <Stat label="Est. Total Cost" value={(summary.totalEstimatedCost || 0).toFixed(0)} accent="blue" />
        </div>

        {/* Create form dialog */}
        <Dialog open={showCreate} onClose={function() { setShowCreate(false); }} title="New Photo Book Project" footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={function() { setShowCreate(false); }}>Cancel</Button>
            <Button variant="primary" onClick={function() {
              onAction("setup_project", {
                action: "create",
                title: createTitle,
                recipient: createRecipient,
                theme: createTheme,
                printer: createPrinter,
                dueDate: createDueDate,
                occasion: createOccasion,
                totalCandidates: parseInt(createCandidates) || 2400
              });
              setShowCreate(false);
              setCreateTitle(""); setCreateRecipient(""); setCreateTheme("");
              setCreatePrinter("saal_digital"); setCreateDueDate(""); setCreateOccasion(""); setCreateCandidates("");
            }}>Create</Button>
          </div>
        }>
          <div className="space-y-3">
            <Input placeholder="Album title (e.g. Summer in Kyoto)" value={createTitle} onChange={function(e) { setCreateTitle(e.target.value); }} icon={LucideReact.BookOpen} />
            <Input placeholder="Gift recipient (e.g. Mom)" value={createRecipient} onChange={function(e) { setCreateRecipient(e.target.value); }} icon={LucideReact.Heart} />
            <Input placeholder="Trip / theme (e.g. Japan 2025)" value={createTheme} onChange={function(e) { setCreateTheme(e.target.value); }} icon={LucideReact.MapPin} />
            <div>
              <div className="text-xs text-zinc-400 mb-1">Print Service</div>
              <Select options={[
                { value: "saal_digital", label: "Saal Digital (Professional Line)" },
                { value: "printique", label: "Printique (10\u00d710 Lay-flat)" },
                { value: "whitewall", label: "WhiteWall (Coffee Table Book)" }
              ]} value={createPrinter} onChange={function(v) { setCreatePrinter(v); }} />
            </div>
            <Input placeholder="Total candidate photos (e.g. 2400)" value={createCandidates} onChange={function(e) { setCreateCandidates(e.target.value); }} type="number" icon={LucideReact.Camera} />
            <Input placeholder="Due date (e.g. 2026-06-15)" value={createDueDate} onChange={function(e) { setCreateDueDate(e.target.value); }} icon={LucideReact.Calendar} />
            <Input placeholder="Occasion (e.g. Mom's birthday)" value={createOccasion} onChange={function(e) { setCreateOccasion(e.target.value); }} icon={LucideReact.Gift} />
          </div>
        </Dialog>

        {/* Project cards */}
        {dashProjects.length === 0 ? (
          <EmptyState icon={LucideReact.BookOpen} title="No Photo Book Projects" description="Create your first photo book project to start planning." action={<Button variant="primary" onClick={function() { setShowCreate(true); }}>Create Project</Button>} />
        ) : (
          <div className="space-y-3">
            {dashProjects.map(function(p, i) {
              var sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.planning;
              var isUrgent = p.daysRemaining >= 0 && p.daysRemaining <= 14;
              var isOverdue = p.daysRemaining < 0 && p.dueDate;

              return (
                <div key={p.id || i} className={"rounded-lg border p-4 space-y-3 bg-zinc-900/50 " + (isOverdue ? "border-red-500/40" : isUrgent ? "border-amber-500/40" : "border-zinc-700/50") + " hover:border-zinc-600/60 transition-colors"}>
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-100 truncate">{p.title}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {p.recipient ? "For " + p.recipient : ""}{p.recipient && p.theme ? " \u00b7 " : ""}{p.theme || ""}
                      </div>
                    </div>
                    <Badge variant={sc.color}>{sc.label}</Badge>
                  </div>

                  {/* Photo funnel */}
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-zinc-500">{(p.totalCandidates || 0).toLocaleString()}</span>
                    <LucideReact.ChevronRight className="w-3 h-3 text-zinc-600" />
                    <span className="text-amber-400 font-medium">{(p.currentCount || 0).toLocaleString()}</span>
                    <LucideReact.ChevronRight className="w-3 h-3 text-zinc-600" />
                    <span className="text-emerald-400 font-medium">{p.finalCount || "?"}</span>
                    <span className="text-zinc-600 ml-1">/ {p.targetImages} target</span>
                  </div>

                  {/* Progress + info row */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Curation</span>
                      <span className="text-zinc-300">{p.curationProgress}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Spreads</span>
                      <span className="text-zinc-300">{p.spreadCount} / {p.targetSpreads}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Est. Cost</span>
                      <span className="text-zinc-300">{p.currency === "EUR" ? "\u20ac" : "$"}{p.estimatedCost}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Printer</span>
                      <span className="text-zinc-300">{p.printer}</span>
                    </div>
                  </div>

                  {/* Due date */}
                  {p.dueDate && (
                    <div className={"flex items-center gap-1.5 text-xs " + (isOverdue ? "text-red-400" : isUrgent ? "text-amber-400" : "text-zinc-500")}>
                      <LucideReact.Calendar className="w-3 h-3" />
                      <span>{p.occasion ? p.occasion + " \u2014 " : ""}{p.dueDate}</span>
                      {p.daysRemaining >= 0 && <span className="font-medium">({p.daysRemaining}d left)</span>}
                      {isOverdue && <span className="font-medium">(overdue)</span>}
                    </div>
                  )}

                  {/* Curation progress bar */}
                  <Progress value={p.curationProgress} max={100} variant={p.curationProgress === 100 ? "emerald" : "amber"} />

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="primary" size="sm" onClick={function() { onAction("setup_project", { action: "load", projectId: p.id }); }}>Open</Button>
                    <Button variant="outline" size="sm" icon={LucideReact.Filter} onClick={function() { onAction("update_curation", { projectId: p.id }); }}>Cull</Button>
                    <Button variant="outline" size="sm" icon={LucideReact.List} onClick={function() { onAction("sequence_builder", { projectId: p.id, action: "list" }); }}>Chapters</Button>
                    <Button variant="outline" size="sm" icon={LucideReact.CheckSquare} onClick={function() { onAction("print_checklist", { projectId: p.id }); }}>Print</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SETUP PROJECT VIEW
  // ═══════════════════════════════════════════════════════════════
  if (tool === "enso_album_designer_setup_project") {
    var project = data.project;
    var projects = data.projects || [];
    var action = data.action || "list";

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Album Designer</div>
            <div className="text-xs text-zinc-500">Photo Book Project Planner</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" icon={LucideReact.LayoutDashboard} onClick={function() { onAction("dashboard", {}); }}>Dashboard</Button>
            <Button variant="primary" icon={LucideReact.Plus} onClick={function() { setShowCreate(true); }}>New Album</Button>
          </div>
        </div>

        {/* Create form dialog */}
        <Dialog open={showCreate} onClose={function() { setShowCreate(false); }} title="New Photo Book Project" footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={function() { setShowCreate(false); }}>Cancel</Button>
            <Button variant="primary" onClick={function() {
              onAction("setup_project", {
                action: "create",
                title: createTitle,
                recipient: createRecipient,
                theme: createTheme,
                printer: createPrinter,
                dueDate: createDueDate,
                occasion: createOccasion,
                totalCandidates: parseInt(createCandidates) || 2400
              });
              setShowCreate(false);
              setCreateTitle(""); setCreateRecipient(""); setCreateTheme("");
              setCreatePrinter("saal_digital"); setCreateDueDate(""); setCreateOccasion(""); setCreateCandidates("");
            }}>Create</Button>
          </div>
        }>
          <div className="space-y-3">
            <Input placeholder="Album title (e.g. Summer in Kyoto)" value={createTitle} onChange={function(e) { setCreateTitle(e.target.value); }} icon={LucideReact.BookOpen} />
            <Input placeholder="Gift recipient (e.g. Mom)" value={createRecipient} onChange={function(e) { setCreateRecipient(e.target.value); }} icon={LucideReact.Heart} />
            <Input placeholder="Trip / theme (e.g. Japan 2025)" value={createTheme} onChange={function(e) { setCreateTheme(e.target.value); }} icon={LucideReact.MapPin} />
            <div>
              <div className="text-xs text-zinc-400 mb-1">Print Service</div>
              <Select options={[
                { value: "saal_digital", label: "Saal Digital (Professional Line)" },
                { value: "printique", label: "Printique (10\u00d710 Lay-flat)" },
                { value: "whitewall", label: "WhiteWall (Coffee Table Book)" }
              ]} value={createPrinter} onChange={function(v) { setCreatePrinter(v); }} />
            </div>
            <Input placeholder="Total candidate photos (e.g. 2400)" value={createCandidates} onChange={function(e) { setCreateCandidates(e.target.value); }} type="number" icon={LucideReact.Camera} />
            <Input placeholder="Due date (e.g. 2026-06-15)" value={createDueDate} onChange={function(e) { setCreateDueDate(e.target.value); }} icon={LucideReact.Calendar} />
            <Input placeholder="Occasion (e.g. Mom's birthday)" value={createOccasion} onChange={function(e) { setCreateOccasion(e.target.value); }} icon={LucideReact.Gift} />
          </div>
        </Dialog>

        {/* Active project card */}
        {project && (
          <UICard accent="amber" header={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <LucideReact.BookOpen className="w-4 h-4 text-amber-400" />
                <span>{project.title}</span>
              </div>
              <Badge variant={(STATUS_CONFIG[project.status] || STATUS_CONFIG.planning).color}>
                {(STATUS_CONFIG[project.status] || STATUS_CONFIG.planning).label}
              </Badge>
            </div>
          }>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Recipient</div>
                <div className="text-sm text-zinc-200">{project.recipient || "\u2014"}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Theme</div>
                <div className="text-sm text-zinc-200">{project.theme || "\u2014"}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Printer</div>
                <div className="text-sm text-zinc-200">{project.format ? project.format.printer : PRINTER_LABELS[project.printer] || "Saal Digital"}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Target</div>
                <div className="text-sm text-zinc-200">{project.targetImages || 60} images / {project.targetSpreads || 35} spreads</div>
              </div>
              {project.dueDate && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Due Date</div>
                  <div className="text-sm text-zinc-200">{project.occasion ? project.occasion + " \u2014 " : ""}{project.dueDate}</div>
                </div>
              )}
              {project.totalCandidates && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Candidates</div>
                  <div className="text-sm text-zinc-200">{project.totalCandidates.toLocaleString()} photos</div>
                </div>
              )}
            </div>
            <Separator />
            <div className="flex gap-2 flex-wrap">
              <Button variant="primary" icon={LucideReact.Filter} onClick={function() { onAction("update_curation", { projectId: project.id }); }}>Curation Tracker</Button>
              <Button variant="outline" icon={LucideReact.List} onClick={function() { onAction("sequence_builder", { projectId: project.id, action: "list" }); }}>Chapters</Button>
              <Button variant="outline" icon={LucideReact.LayoutGrid} onClick={function() { onAction("manage_spreads", { projectId: project.id, action: "list" }); }}>Spread Planner</Button>
              <Button variant="outline" icon={LucideReact.TrendingUp} onClick={function() { onAction("view_narrative", { projectId: project.id }); }}>Narrative Arc</Button>
              <Button variant="outline" icon={LucideReact.CheckSquare} onClick={function() { onAction("print_checklist", { projectId: project.id }); }}>Print Checklist</Button>
            </div>
          </UICard>
        )}

        {/* Project list */}
        {projects.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">All Projects</div>
            {projects.map(function(p, i) {
              var psc = STATUS_CONFIG[p.status] || STATUS_CONFIG.planning;
              return (
                <div key={p.id || i} className="flex items-center justify-between bg-zinc-800/40 rounded-lg px-3 py-2 border border-zinc-700/50 hover:border-amber-500/30 transition-colors cursor-pointer" onClick={function() { onAction("setup_project", { action: "load", projectId: p.id }); }}>
                  <div>
                    <div className="text-sm text-zinc-200 font-medium">{p.title}</div>
                    <div className="text-xs text-zinc-500">{p.recipient ? "For " + p.recipient + " \u00b7 " : ""}{p.theme || "No theme"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={psc.color}>{psc.label}</Badge>
                    <LucideReact.ChevronRight className="w-4 h-4 text-zinc-600" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {projects.length === 0 && !project && (
          <EmptyState icon={LucideReact.BookOpen} title="No Album Projects" description="Create your first gift album project to start planning." action={<Button variant="primary" onClick={function() { setShowCreate(true); }}>Create Album</Button>} />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // CURATION TRACKER VIEW
  // ═══════════════════════════════════════════════════════════════
  if (tool === "enso_album_designer_update_curation") {
    var curation = data.curation || {};
    var passes = curation.passes || [];
    var overall = curation.overallProgress || 0;
    var currentPass = curation.currentPass || 1;
    var pid = data.projectId;
    var dailyGoal = curation.dailyGoal || null;

    var PASS_DESCRIPTIONS = [
      "Mechanical rejection: out-of-focus, motion blur, blown highlights, duplicates. 2\u20133 sec/image.",
      "Would you pay $20 to print this at 16\u00d720? Trust your gut. 3\u20135 sec/image.",
      "Group by theme, keep only the top 10% of each group. 5\u20138 sec/image.",
      "Sequence for emotional storytelling \u2014 opening, build, climax, resolve. 10\u201315 sec/image.",
      "Final cut for the album. Every image must earn its spread. 30+ sec/image."
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Curation Journey</div>
            <div className="text-xs text-zinc-500">5-Pass Reduction System</div>
          </div>
          <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={function() { onAction("setup_project", { action: "load", projectId: pid }); }}>Back</Button>
        </div>

        {/* Overall progress */}
        <UICard accent="amber">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-zinc-300">Overall Progress</div>
            <Badge variant={overall === 100 ? "success" : "info"}>{overall}%</Badge>
          </div>
          <Progress value={overall} max={100} variant="amber" showLabel />
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
            <LucideReact.Camera className="w-3 h-3" />
            <span>{curation.startCount ? curation.startCount.toLocaleString() : "?"} photos \u2192 50\u201370 heroes</span>
          </div>
        </UICard>

        {/* Daily goal card */}
        {dailyGoal && (
          <UICard accent="blue">
            <div className="flex items-center gap-2 mb-2">
              <LucideReact.Target className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-zinc-300">Daily Culling Goal</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Per Day" value={dailyGoal.photosPerDay} accent="blue" />
              <Stat label="Remaining" value={dailyGoal.photosRemaining.toLocaleString()} accent="amber" />
              <Stat label="Days Left" value={dailyGoal.daysRemaining} accent={dailyGoal.daysRemaining <= 14 ? "rose" : "emerald"} />
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              Review <span className="text-blue-400 font-medium">{dailyGoal.photosPerDay}</span> photos/day to finish <span className="text-zinc-300">{dailyGoal.passName}</span> on time
            </div>
          </UICard>
        )}

        {/* Individual passes */}
        <div className="space-y-3">
          {passes.map(function(p, i) {
            var isActive = (i + 1) === currentPass && !p.completed;
            var isPast = p.completed;
            var isFuture = (i + 1) > currentPass;

            var stars = "";
            for (var s = 0; s < p.starRating; s++) stars += "\u2605";

            var borderClass = isPast ? "border-emerald-500/30" : isActive ? "border-amber-500/40" : "border-zinc-700/30";
            var bgClass = isActive ? "bg-amber-500/5" : "bg-zinc-800/30";

            return (
              <div key={i} className={"rounded-lg border p-3 space-y-2 " + borderClass + " " + bgClass}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isPast && <LucideReact.CheckCircle className="w-4 h-4 text-emerald-400" />}
                    {isActive && <LucideReact.Play className="w-4 h-4 text-amber-400 animate-pulse" />}
                    {isFuture && <LucideReact.Circle className="w-4 h-4 text-zinc-600" />}
                    <span className="text-sm font-medium text-zinc-200">Pass {p.pass}: {p.name}</span>
                    <span className="text-amber-400 text-xs">{stars}</span>
                  </div>
                  <span className="text-xs text-zinc-500">Target: {p.targetRange}</span>
                </div>

                <div className="text-xs text-zinc-500 italic">{PASS_DESCRIPTIONS[i]}</div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-zinc-400">In: <span className="text-zinc-200">{p.startCount ? p.startCount.toLocaleString() : "\u2014"}</span></span>
                  {p.remainingCount !== null && (
                    <span className="text-zinc-400">Out: <span className="text-zinc-200">{p.remainingCount.toLocaleString()}</span></span>
                  )}
                  {p.culledPercent !== null && (
                    <Badge variant={p.culledPercent > 70 ? "danger" : "warning"}>{p.culledPercent}% culled</Badge>
                  )}
                </div>

                {p.notes && <div className="text-xs text-zinc-400 bg-zinc-800/50 rounded px-2 py-1">{p.notes}</div>}

                {/* Action buttons for active/incomplete passes */}
                {!isPast && (i + 1) <= currentPass && (
                  <div className="space-y-2">
                    {editPass === p.pass ? (
                      <div className="flex gap-2 items-center">
                        <Input placeholder="Remaining count" value={countInput} onChange={function(e) { setCountInput(e.target.value); }} type="number" icon={LucideReact.Hash} />
                        <Button variant="primary" size="sm" onClick={function() {
                          var val = parseInt(countInput);
                          if (!isNaN(val) && val >= 0) {
                            onAction("update_curation", { projectId: pid, pass: p.pass, remainingCount: val });
                            setEditPass(-1); setCountInput("");
                          }
                        }}>Save</Button>
                        <Button variant="ghost" size="sm" onClick={function() { setEditPass(-1); setCountInput(""); }}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center flex-wrap">
                        <Button variant={isActive ? "primary" : "outline"} size="sm" onClick={function() { setEditPass(p.pass); setCountInput(p.remainingCount !== null ? String(p.remainingCount) : ""); }}>
                          <LucideReact.Hash className="w-3 h-3 mr-1" />Update Count
                        </Button>
                        <Button variant="outline" size="sm" onClick={function() {
                          onAction("update_curation", { projectId: pid, pass: p.pass, completed: true });
                        }}>
                          <LucideReact.Check className="w-3 h-3 mr-1" />Mark Complete
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SEQUENCE BUILDER VIEW
  // ═══════════════════════════════════════════════════════════════
  if (tool === "enso_album_designer_sequence_builder") {
    var chapters = data.chapters || [];
    var totalChapters = data.totalChapters || 0;
    var allocatedSpreads = data.totalAllocatedSpreads || 0;
    var targetSpreadsSeq = data.targetSpreads || 35;
    var printSpec = data.printSpec || {};
    var pidSeq = data.projectId;

    var VARIETY_COLORS = {
      wide: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      detail: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      portrait: "bg-red-500/20 text-red-400 border-red-500/30",
      food: "bg-pink-500/20 text-pink-400 border-pink-500/30",
      street: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      aerial: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Sequence Builder</div>
            <div className="text-xs text-zinc-500">{totalChapters} chapters \u00b7 {allocatedSpreads} / {targetSpreadsSeq} spreads allocated</div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={function() { onAction("setup_project", { action: "load", projectId: pidSeq }); }}>Back</Button>
            <Button variant="primary" icon={LucideReact.Plus} onClick={function() { setShowAddChapter(true); }}>Add Chapter</Button>
          </div>
        </div>

        {/* Allocation progress */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Chapters" value={totalChapters} accent="amber" />
          <Stat label="Spreads" value={allocatedSpreads + " / " + targetSpreadsSeq} accent={allocatedSpreads > targetSpreadsSeq ? "rose" : "blue"} />
          <Stat label="Pages" value={printSpec.pageCount || 0} accent="purple" />
        </div>
        <Progress value={allocatedSpreads} max={targetSpreadsSeq} variant={allocatedSpreads > targetSpreadsSeq ? "rose" : "amber"} showLabel />

        {/* Add chapter dialog */}
        <Dialog open={showAddChapter} onClose={function() { setShowAddChapter(false); }} title="Add Chapter" footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={function() { setShowAddChapter(false); }}>Cancel</Button>
            <Button variant="primary" onClick={function() {
              onAction("sequence_builder", {
                projectId: pidSeq,
                action: "add",
                name: chapterName,
                spreadCount: parseInt(chapterSpreads) || 4,
                pacingNotes: chapterNotes,
                varietyTags: chapterTags
              });
              setShowAddChapter(false);
              setChapterName(""); setChapterSpreads("4"); setChapterNotes(""); setChapterTags("");
            }}>Add</Button>
          </div>
        }>
          <div className="space-y-3">
            <Input placeholder="Chapter name (e.g. Arrival, The Old City)" value={chapterName} onChange={function(e) { setChapterName(e.target.value); }} icon={LucideReact.BookOpen} />
            <Input placeholder="Spreads for this chapter (e.g. 4)" value={chapterSpreads} onChange={function(e) { setChapterSpreads(e.target.value); }} type="number" icon={LucideReact.LayoutGrid} />
            <Input placeholder="Pacing notes (e.g. slow intro, mix wide + detail)" value={chapterNotes} onChange={function(e) { setChapterNotes(e.target.value); }} icon={LucideReact.FileText} />
            <Input placeholder="Variety: wide, detail, portrait, food, street, aerial" value={chapterTags} onChange={function(e) { setChapterTags(e.target.value); }} icon={LucideReact.Tag} />
          </div>
        </Dialog>

        {/* Chapters list */}
        {chapters.length === 0 ? (
          <EmptyState icon={LucideReact.List} title="No Chapters Yet" description="Plan your album's narrative flow by adding chapters." action={<Button variant="primary" onClick={function() { setShowAddChapter(true); }}>Add First Chapter</Button>} />
        ) : (
          <div className="space-y-2">
            {chapters.map(function(ch, idx) {
              var tags = ch.varietyTags || [];
              return (
                <div key={idx} className="rounded-lg border border-zinc-700/50 p-3 space-y-2 bg-zinc-800/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-xs font-mono text-zinc-500 w-6 text-center flex-shrink-0">{idx + 1}</div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-200">{ch.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="info">{ch.spreadCount} spreads</Badge>
                          {tags.map(function(tag, ti) {
                            var vc = VARIETY_COLORS[tag] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
                            return <span key={ti} className={"text-[10px] px-1.5 py-0.5 rounded border " + vc}>{tag}</span>;
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {idx > 0 && (
                        <button className="p-1 text-zinc-500 hover:text-zinc-300" onClick={function() { onAction("sequence_builder", { projectId: pidSeq, action: "reorder", moveFrom: idx, moveTo: idx - 1 }); }}>
                          <LucideReact.ChevronUp className="w-3 h-3" />
                        </button>
                      )}
                      {idx < chapters.length - 1 && (
                        <button className="p-1 text-zinc-500 hover:text-zinc-300" onClick={function() { onAction("sequence_builder", { projectId: pidSeq, action: "reorder", moveFrom: idx, moveTo: idx + 1 }); }}>
                          <LucideReact.ChevronDown className="w-3 h-3" />
                        </button>
                      )}
                      <button className="p-1 text-zinc-500 hover:text-red-400" onClick={function() { onAction("sequence_builder", { projectId: pidSeq, action: "remove", chapterIndex: idx }); }}>
                        <LucideReact.Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {ch.pacingNotes && (
                    <div className="text-xs text-zinc-500 italic pl-8">{ch.pacingNotes}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Print spec summary */}
        {printSpec.printer && (
          <UICard accent="blue" header={
            <div className="flex items-center gap-2">
              <LucideReact.Printer className="w-4 h-4 text-blue-400" />
              <span>Print Specification</span>
            </div>
          }>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-1">
                <div className="text-zinc-500">Printer</div>
                <div className="text-zinc-200">{printSpec.printer}</div>
              </div>
              <div className="space-y-1">
                <div className="text-zinc-500">Pages</div>
                <div className="text-zinc-200">{printSpec.pageCount}</div>
              </div>
              <div className="space-y-1">
                <div className="text-zinc-500">Binding</div>
                <div className="text-zinc-200">{printSpec.binding}</div>
              </div>
              <div className="space-y-1">
                <div className="text-zinc-500">Paper</div>
                <div className="text-zinc-200">{printSpec.paper}</div>
              </div>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-xs text-zinc-400">Estimated Cost</span>
              <span className="text-lg font-bold text-amber-400">{printSpec.currency === "EUR" ? "\u20ac" : "$"}{printSpec.estimatedCost}</span>
            </div>
          </UICard>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SPREAD PLANNER VIEW
  // ═══════════════════════════════════════════════════════════════
  if (tool === "enso_album_designer_manage_spreads") {
    var spreads = data.spreads || [];
    var totalSpreads = data.totalSpreads || 0;
    var targetSpreads = data.targetSpreads || 35;
    var totalImages = data.totalImages || 0;
    var pid2 = data.projectId;

    // Count images from spreads
    if (!totalImages) {
      totalImages = 0;
      for (var ci = 0; ci < spreads.length; ci++) totalImages += (spreads[ci].imageCount || 0);
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Spread Planner</div>
            <div className="text-xs text-zinc-500">{totalSpreads} / {targetSpreads} spreads planned</div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={function() { onAction("setup_project", { action: "load", projectId: pid2 }); }}>Back</Button>
            <Button variant="primary" icon={LucideReact.Plus} onClick={function() { setShowAddSpread(true); }}>Add Spread</Button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Spreads" value={totalSpreads + " / " + targetSpreads} accent="amber" />
          <Stat label="Images" value={totalImages} accent="blue" />
          <Stat label="Pages" value={totalSpreads * 2} accent="purple" />
        </div>

        <Progress value={totalSpreads} max={targetSpreads} variant="amber" showLabel />

        {/* Add spread dialog */}
        <Dialog open={showAddSpread} onClose={function() { setShowAddSpread(false); }} title="Add Spread" footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={function() { setShowAddSpread(false); }}>Cancel</Button>
            <Button variant="primary" onClick={function() {
              onAction("manage_spreads", { projectId: pid2, action: "add", layout: newLayout, imageDesc: newDesc, themeTag: newTheme, narrativePos: newArc });
              setShowAddSpread(false); setNewDesc(""); setNewLayout("full_bleed"); setNewTheme("nature"); setNewArc("rising");
            }}>Add</Button>
          </div>
        }>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-zinc-400 mb-1">Layout Type</div>
              <Select options={[
                { value: "full_bleed", label: "Full Bleed (Hero Shot)" },
                { value: "two_side_by_side", label: "Two Side by Side" },
                { value: "large_small", label: "Large + Small Accent" },
                { value: "three_grid", label: "Three Image Grid" },
                { value: "text_page", label: "Text / Chapter Break" }
              ]} value={newLayout} onChange={function(v) { setNewLayout(v); }} />
            </div>
            <Input placeholder="Image description (e.g. Golden hour over Kinkaku-ji)" value={newDesc} onChange={function(e) { setNewDesc(e.target.value); }} icon={LucideReact.Image} />
            <div>
              <div className="text-xs text-zinc-400 mb-1">Theme</div>
              <Select options={[
                { value: "light_shadow", label: "Light & Shadow" },
                { value: "faces", label: "Faces & Portraits" },
                { value: "architecture", label: "Architecture" },
                { value: "nature", label: "Nature & Landscape" },
                { value: "culture", label: "Culture" },
                { value: "street", label: "Street" },
                { value: "food", label: "Food" },
                { value: "transport", label: "Transport" }
              ]} value={newTheme} onChange={function(v) { setNewTheme(v); }} />
            </div>
            <div>
              <div className="text-xs text-zinc-400 mb-1">Narrative Position</div>
              <Select options={[
                { value: "opening", label: "Opening (calm introduction)" },
                { value: "rising", label: "Rising (building energy)" },
                { value: "climax", label: "Climax (peak moment)" },
                { value: "resolution", label: "Resolution (peaceful close)" }
              ]} value={newArc} onChange={function(v) { setNewArc(v); }} />
            </div>
          </div>
        </Dialog>

        {/* Spreads list */}
        {spreads.length === 0 ? (
          <EmptyState icon={LucideReact.LayoutGrid} title="No Spreads Yet" description="Add your first spread to start planning the album layout." action={<Button variant="primary" onClick={function() { setShowAddSpread(true); }}>Add First Spread</Button>} />
        ) : (
          <div className="space-y-2">
            {spreads.map(function(sp, idx) {
              var thm = getTheme(sp.themeTag);
              var arcAccent = ARC_ACCENTS[sp.narrativePos] || "blue";

              return (
                <div key={idx} className={"rounded-lg border p-3 " + thm.bg + " " + thm.border}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-xs font-mono text-zinc-500 w-6 text-center flex-shrink-0">{idx + 1}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-zinc-500">{LAYOUT_ICONS[sp.layout] || ""}</span>
                          <Badge variant="outline">{LAYOUT_LABELS[sp.layout] || sp.layout}</Badge>
                          <Badge variant={arcAccent === "rose" ? "danger" : arcAccent === "amber" ? "warning" : arcAccent === "emerald" ? "success" : "info"}>
                            {ARC_LABELS[sp.narrativePos] || sp.narrativePos}
                          </Badge>
                          <span className={"text-xs " + thm.text}>{thm.label}</span>
                        </div>
                        {sp.imageDesc && <div className="text-xs text-zinc-400 mt-1 truncate">{sp.imageDesc}</div>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {idx > 0 && (
                        <button className="p-1 text-zinc-500 hover:text-zinc-300" onClick={function() { onAction("manage_spreads", { projectId: pid2, action: "reorder", moveFrom: idx, moveTo: idx - 1 }); }}>
                          <LucideReact.ChevronUp className="w-3 h-3" />
                        </button>
                      )}
                      {idx < spreads.length - 1 && (
                        <button className="p-1 text-zinc-500 hover:text-zinc-300" onClick={function() { onAction("manage_spreads", { projectId: pid2, action: "reorder", moveFrom: idx, moveTo: idx + 1 }); }}>
                          <LucideReact.ChevronDown className="w-3 h-3" />
                        </button>
                      )}
                      <button className="p-1 text-zinc-500 hover:text-red-400" onClick={function() { onAction("manage_spreads", { projectId: pid2, action: "remove", spreadIndex: idx }); }}>
                        <LucideReact.Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick navigation */}
        {spreads.length > 0 && (
          <div className="flex gap-2 justify-center flex-wrap">
            <Button variant="ghost" icon={LucideReact.TrendingUp} onClick={function() { onAction("view_narrative", { projectId: pid2 }); }}>View Narrative Arc</Button>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // NARRATIVE ARC VIEW
  // ═══════════════════════════════════════════════════════════════
  if (tool === "enso_album_designer_view_narrative") {
    var arcData = data.arcData || [];
    var themeDistribution = data.themeDistribution || [];
    var layoutDistribution = data.layoutDistribution || [];
    var warnings = data.pacingWarnings || [];
    var arcBalance = data.arcBalance || {};
    var pid3 = data.projectId;
    var albumTitle = data.title || "Album";

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Narrative Arc</div>
            <div className="text-xs text-zinc-500">{albumTitle} \u2014 {data.totalSpreads || 0} spreads</div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={function() { onAction("setup_project", { action: "load", projectId: pid3 }); }}>Back</Button>
            <Button variant="outline" icon={LucideReact.LayoutGrid} onClick={function() { onAction("manage_spreads", { projectId: pid3, action: "list" }); }}>Spreads</Button>
          </div>
        </div>

        {arcData.length === 0 ? (
          <EmptyState icon={LucideReact.TrendingUp} title="No Spreads to Visualize" description="Add spreads in the Spread Planner to see the narrative arc." action={<Button variant="primary" onClick={function() { onAction("manage_spreads", { projectId: pid3, action: "list" }); }}>Go to Spread Planner</Button>} />
        ) : (
          <Fragment>
            {/* Emotional arc chart */}
            <UICard accent="amber" header={
              <div className="flex items-center gap-2">
                <LucideReact.TrendingUp className="w-4 h-4 text-amber-400" />
                <span>Emotional Arc</span>
              </div>
            }>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={arcData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="spread" tick={{ fill: "#999", fontSize: 10 }} label={{ value: "Spread", position: "bottom", fill: "#666", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#999", fontSize: 10 }} domain={[0, 100]} ticks={[20, 50, 85]} tickFormatter={function(v) { return v === 20 ? "Calm" : v === 50 ? "Build" : "Peak"; }} />
                    <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }} labelFormatter={function(v) { return "Spread " + v; }} />
                    <Line type="monotone" dataKey="arcValue" stroke="#f59e0b" strokeWidth={2} dot={function(props) {
                      var d = arcData[props.index] || {};
                      var color = d.themeColor || "#f59e0b";
                      return <circle cx={props.cx} cy={props.cy} r={5} fill={color} stroke="#1a1a2e" strokeWidth={2} />;
                    }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </UICard>

            {/* Arc balance */}
            <div className="grid grid-cols-4 gap-2">
              <Stat label="Opening" value={arcBalance.opening || 0} accent="cyan" />
              <Stat label="Rising" value={arcBalance.rising || 0} accent="amber" />
              <Stat label="Climax" value={arcBalance.climax || 0} accent="rose" />
              <Stat label="Resolution" value={arcBalance.resolution || 0} accent="emerald" />
            </div>

            {/* Theme distribution */}
            {themeDistribution.length > 0 && (
              <UICard accent="purple" header={
                <div className="flex items-center gap-2">
                  <LucideReact.Palette className="w-4 h-4 text-purple-400" />
                  <span>Theme Distribution</span>
                </div>
              }>
                <div style={{ width: "100%", height: 180 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={themeDistribution} dataKey="count" nameKey="theme" cx="50%" cy="50%" outerRadius={60} label={function(entry) { return entry.theme; }}>
                        {themeDistribution.map(function(entry, i) {
                          return <Cell key={i} fill={entry.color || "#666"} />;
                        })}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </UICard>
            )}

            {/* Layout distribution */}
            {layoutDistribution.length > 0 && (
              <UICard accent="blue" header={
                <div className="flex items-center gap-2">
                  <LucideReact.LayoutGrid className="w-4 h-4 text-blue-400" />
                  <span>Layout Mix</span>
                </div>
              }>
                <div style={{ width: "100%", height: 160 }}>
                  <ResponsiveContainer>
                    <BarChart data={layoutDistribution} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="layout" tick={{ fill: "#999", fontSize: 9 }} tickFormatter={function(v) {
                        var short = { full_bleed: "Hero", two_side_by_side: "Duo", large_small: "L+S", three_grid: "Grid", text_page: "Text" };
                        return short[v] || v;
                      }} />
                      <YAxis tick={{ fill: "#999", fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </UICard>
            )}

            {/* Pacing warnings */}
            {warnings.length > 0 && (
              <UICard accent="rose" header={
                <div className="flex items-center gap-2">
                  <LucideReact.AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Pacing Alerts</span>
                </div>
              }>
                <div className="space-y-2">
                  {warnings.map(function(w, i) {
                    return (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <LucideReact.AlertCircle className="w-3 h-3 text-rose-400 mt-0.5 flex-shrink-0" />
                        <span className="text-zinc-300">{w.message}</span>
                      </div>
                    );
                  })}
                </div>
              </UICard>
            )}
          </Fragment>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // PRINT CHECKLIST VIEW
  // ═══════════════════════════════════════════════════════════════
  if (tool === "enso_album_designer_print_checklist") {
    var checklist = data.checklist || [];
    var completed = data.completedCount || 0;
    var total = data.totalCount || 10;
    var specs = data.specs || {};
    var budget = data.budget || {};
    var pid4 = data.projectId;
    var spText = data.spineText || "";
    var coverDesc = data.coverImageDesc || "";
    var printerKey = data.printer || "saal_digital";

    // Group by category
    var categories = {};
    for (var ci2 = 0; ci2 < checklist.length; ci2++) {
      var cat = checklist[ci2].category || "Other";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(checklist[ci2]);
    }

    var CAT_ICONS = { Export: "Upload", Quality: "Shield", Review: "Eye", Design: "Palette" };
    var CAT_ACCENTS = { Export: "blue", Quality: "cyan", Review: "amber", Design: "purple" };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Print Checklist</div>
            <div className="text-xs text-zinc-500">{data.title || "Album"} \u2014 {completed}/{total} complete</div>
          </div>
          <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={function() { onAction("setup_project", { action: "load", projectId: pid4 }); }}>Back</Button>
        </div>

        <Progress value={completed} max={total} variant={completed === total ? "emerald" : "amber"} showLabel />

        {/* Checklist by category */}
        {Object.keys(categories).map(function(cat) {
          var items = categories[cat];
          var accent = CAT_ACCENTS[cat] || "blue";
          var iconName = CAT_ICONS[cat] || "CheckSquare";
          var IconComp = LucideReact[iconName] || LucideReact.CheckSquare;
          return (
            <UICard key={cat} accent={accent} header={
              <div className="flex items-center gap-2">
                <IconComp className="w-4 h-4" />
                <span>{cat}</span>
              </div>
            }>
              <div className="space-y-2">
                {items.map(function(item) {
                  return (
                    <div key={item.key} className="flex items-center gap-3 cursor-pointer hover:bg-zinc-800/30 rounded px-2 py-1.5 transition-colors" onClick={function() { onAction("print_checklist", { projectId: pid4, toggleItem: item.key }); }}>
                      <div className={"w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 " + (item.checked ? "bg-emerald-500/20 border-emerald-500/50" : "border-zinc-600")}>
                        {item.checked && <LucideReact.Check className="w-3 h-3 text-emerald-400" />}
                      </div>
                      <span className={"text-sm " + (item.checked ? "text-zinc-400 line-through" : "text-zinc-200")}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </UICard>
          );
        })}

        {/* Spine text and cover */}
        <UICard accent="amber" header={
          <div className="flex items-center gap-2">
            <LucideReact.Type className="w-4 h-4 text-amber-400" />
            <span>Design Details</span>
          </div>
        }>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-zinc-400 mb-1">Spine Text</div>
              <div className="text-sm text-zinc-200 bg-zinc-800/50 rounded px-3 py-2 font-medium">{spText || "Not set \u2014 tap to update"}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-400 mb-1">Cover Image</div>
              <div className="text-sm text-zinc-200 bg-zinc-800/50 rounded px-3 py-2">{coverDesc || "Not selected"}</div>
            </div>
          </div>
        </UICard>

        {/* Specs & Budget */}
        <UICard accent="blue" header={
          <div className="flex items-center gap-2">
            <LucideReact.Printer className="w-4 h-4 text-blue-400" />
            <span>{specs.printer || "Printer"} Specs & Budget</span>
          </div>
        }>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-1">
              <div className="text-zinc-500">Printer</div>
              <div className="text-zinc-200">{specs.printer || "Saal Digital"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-zinc-500">Size</div>
              <div className="text-zinc-200">{specs.size || "28\u00d728cm"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-zinc-500">Binding</div>
              <div className="text-zinc-200">{specs.binding || "Lay-flat"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-zinc-500">Paper</div>
              <div className="text-zinc-200">{specs.paper || "Fine Art"}</div>
            </div>
            {specs.line && (
              <div className="space-y-1">
                <div className="text-zinc-500">Line</div>
                <div className="text-zinc-200">{specs.line}</div>
              </div>
            )}
            <div className="space-y-1">
              <div className="text-zinc-500">Color Profile</div>
              <div className="text-zinc-200">{specs.colorProfile || "sRGB"}</div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">Base price</span>
              <span className="text-zinc-200">{budget.currency === "EUR" ? "\u20ac" : "$"}{budget.basePrice || "59.95"}</span>
            </div>
            {budget.perPage && (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">{budget.actualPages || 0} pages \u00d7 {budget.currency === "EUR" ? "\u20ac" : "$"}{budget.perPage}/page</span>
                <span className="text-zinc-200">{budget.currency === "EUR" ? "\u20ac" : "$"}{((budget.actualPages || 0) * (budget.perPage || 0)).toFixed(2)}</span>
              </div>
            )}
            {budget.extraSpreads > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">{budget.extraSpreads} extra spreads \u00d7 ${budget.perExtraSpread}</span>
                <span className="text-zinc-200">${(budget.extraSpreads * budget.perExtraSpread).toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between">
              <span className="text-sm font-medium text-zinc-300">Estimated Total</span>
              <span className="text-lg font-bold text-amber-400">{budget.currency === "EUR" ? "\u20ac" : "$"}{budget.estimatedTotal || "0.00"}</span>
            </div>
            <div className="text-[10px] text-zinc-600">{budget.note || ""}</div>
          </div>

          {specs.orderUrl && (
            <div className="mt-2 text-xs text-blue-400">
              Order at: {specs.orderUrl}
            </div>
          )}
        </UICard>

        {completed === total && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-center space-y-2">
            <LucideReact.PartyPopper className="w-8 h-8 text-emerald-400 mx-auto" />
            <div className="text-sm font-medium text-emerald-300">All checks passed! Ready to order.</div>
            {specs.orderUrl && (
              <div className="text-xs text-zinc-400">Visit {specs.printer || "your printer"} to place your order</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // FALLBACK
  // ═══════════════════════════════════════════════════════════════
  return (
    <UICard accent="amber" header="Photo Book Planner">
      <EmptyState icon={LucideReact.BookOpen} title="Photo Book Project Planner" description="Plan gift-quality photo books \u2014 from culling to print." action={
        <div className="flex gap-2">
          <Button variant="primary" onClick={function() { onAction("dashboard", {}); }}>Dashboard</Button>
          <Button variant="outline" onClick={function() { onAction("setup_project", { action: "list" }); }}>All Projects</Button>
        </div>
      } />
    </UICard>
  );
}
