export default function GeneratedUI({ data, onAction }) {
  // ── Constants ──
  var PHASE_CONFIG = {
    curation: { label: "Curation", accent: "amber", icon: "Scissors", color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/30" },
    sequencing: { label: "Sequencing", accent: "blue", icon: "List", color: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/30" },
    layout: { label: "Layout & Design", accent: "purple", icon: "LayoutGrid", color: "text-purple-400", bg: "bg-purple-500/15", border: "border-purple-500/30" },
    print: { label: "Order & Print", accent: "emerald", icon: "Printer", color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30" }
  };

  var THEME_ICONS = {
    golden_hours: "Sunrise",
    street_life: "Users",
    landscapes_light: "Mountain",
    year_in_photos: "Calendar",
    one_trip_one_story: "Map",
    custom: "Palette"
  };

  var THEME_ACCENTS = {
    golden_hours: "amber",
    street_life: "orange",
    landscapes_light: "emerald",
    year_in_photos: "blue",
    one_trip_one_story: "purple",
    custom: "cyan"
  };

  // ── All hooks at top level (React rules) ──
  var tabState = useState("overview");
  var activeTab = tabState[0];
  var setActiveTab = tabState[1];

  var showStartState = useState(false);
  var showStart = showStartState[0];
  var setShowStart = showStartState[1];

  var titleState = useState("");
  var newTitle = titleState[0];
  var setNewTitle = titleState[1];

  var recipientState = useState("");
  var newRecipient = recipientState[0];
  var setNewRecipient = recipientState[1];

  var guideTabState = useState("overview");
  var guideTab = guideTabState[0];
  var setGuideTab = guideTabState[1];

  var countInputState = useState("");
  var countInput = countInputState[0];
  var setCountInput = countInputState[1];

  var notesInputState = useState("");
  var notesInput = notesInputState[0];
  var setNotesInput = notesInputState[1];

  // ── Helper ──
  var getPhase = function(id) { return PHASE_CONFIG[id] || PHASE_CONFIG.curation; };
  var Icon = function(name) {
    var I = LucideReact[name];
    return I ? I : LucideReact.Circle;
  };

  // ── Detect tool view ──
  var tool = data && data.tool ? data.tool : "";
  var isDashboard = tool === "enso_album_pipeline_pipeline_dashboard";
  var isDailyTask = tool === "enso_album_pipeline_daily_task";
  var isPrintique = tool === "enso_album_pipeline_printique_guide";
  var isThemePicker = tool === "enso_album_pipeline_album_theme_picker";
  var isCuration = tool === "enso_album_pipeline_curation_checklist";

  // ══════════════════════════════════════════
  // DASHBOARD VIEW
  // ══════════════════════════════════════════
  if (isDashboard) {
    var p = data.pipeline;

    // Empty state — no pipeline started
    if (!p) {
      return (
        <div className="space-y-4">
          <div className="text-center py-8">
            <div className="text-4xl mb-3">📷</div>
            <h2 className="text-xl font-bold text-white mb-2">60-Day Album Pipeline</h2>
            <p className="text-zinc-400 mb-4 max-w-md mx-auto">
              Create your first gift-quality Printique layflat album in 60 days.
              From 124,626 photos to a beautiful printed album, one task per day.
            </p>
            {!showStart ? (
              <Button variant="primary" onClick={function() { setShowStart(true); }}>
                Start Your Album Journey
              </Button>
            ) : (
              <UICard accent="blue">
                <div className="space-y-3">
                  <Input
                    placeholder="Album title (e.g., Golden Hours)"
                    value={newTitle}
                    onChange={function(e) { setNewTitle(e.target.value); }}
                  />
                  <Input
                    placeholder="Gift recipient (optional)"
                    value={newRecipient}
                    onChange={function(e) { setNewRecipient(e.target.value); }}
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={function() {
                      onAction("pipeline_dashboard", { action: "start", albumTitle: newTitle || "My First Photo Album", recipient: newRecipient });
                    }}>
                      Begin 60-Day Pipeline
                    </Button>
                    <Button variant="ghost" onClick={function() { setShowStart(false); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </UICard>
            )}
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={function() { onAction("album_theme_picker", { action: "browse" }); }}>
              Browse Themes
            </Button>
            <Button variant="outline" onClick={function() { onAction("printique_guide", { section: "overview" }); }}>
              Printique Guide
            </Button>
            <Button variant="outline" onClick={function() { onAction("curation_checklist", { action: "view" }); }}>
              Curation Method
            </Button>
            <Button variant="outline" onClick={function() { onAction("daily_task", { action: "view" }); }}>
              Daily Tasks
            </Button>
          </div>
        </div>
      );
    }

    // Active pipeline dashboard
    var phaseConf = getPhase(p.currentPhase);
    var StarIcon = Icon("Star");
    var FlameIcon = Icon("Flame");
    var CameraIcon = Icon("Camera");
    var BookOpenIcon = Icon("BookOpen");
    var DollarSignIcon = Icon("DollarSign");
    var CalendarIcon = Icon("Calendar");
    var CheckCircleIcon = Icon("CheckCircle");
    var TargetIcon = Icon("Target");

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{p.albumTitle}</h2>
            {p.recipient && <p className="text-zinc-400 text-sm">Gift for: {p.recipient}</p>}
          </div>
          <Badge variant={p.percentComplete >= 100 ? "success" : "info"}>Day {p.currentDay}/60</Badge>
        </div>

        {/* Overall Progress */}
        <Progress value={p.percentComplete} max={100} variant={p.percentComplete >= 100 ? "success" : "default"} showLabel />

        {/* KPI Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Photos Selected" value={p.photosSelected} accent="cyan" />
          <Stat label="Target" value={p.targetPhotos + " photos"} accent="amber" />
          <Stat label="Spreads Planned" value={p.pagesPlanned} accent="purple" />
          <Stat label="Est. Cost" value={"$" + p.estimatedCost} accent="emerald" />
        </div>

        {/* Streak & Days */}
        <div className="flex gap-3">
          {p.dailyStreak > 0 && (
            <div className="flex items-center gap-1 text-orange-400 text-sm">
              <FlameIcon size={14} />
              <span>{p.dailyStreak} day streak</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-zinc-400 text-sm">
            <CalendarIcon size={14} />
            <span>{p.daysRemaining} days remaining</span>
          </div>
        </div>

        {/* Theme badge */}
        {p.selectedTheme && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-xs">Theme:</span>
            <Badge variant="info">{p.selectedTheme.replace(/_/g, " ")}</Badge>
          </div>
        )}

        <Separator />

        {/* Phases */}
        <h3 className="text-sm font-semibold text-zinc-300">Pipeline Phases</h3>
        <div className="space-y-2">
          {(p.phases || []).map(function(phase, idx) {
            var conf = getPhase(phase.id);
            var pct = phase.tasks > 0 ? Math.round((phase.completed / phase.tasks) * 100) : 0;
            var PhaseIcon = Icon(conf.icon);
            return (
              <UICard key={phase.id} accent={phase.status === "active" ? conf.accent : "gray"}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <PhaseIcon size={16} className={phase.status === "active" ? conf.color : "text-zinc-500"} />
                    <span className={phase.status === "active" ? "text-white font-medium" : "text-zinc-400"}>
                      {phase.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Days {phase.dayRange[0]}-{phase.dayRange[1]}</span>
                    <Badge variant={phase.status === "completed" ? "success" : phase.status === "active" ? "info" : "outline"}>
                      {phase.status === "completed" ? "Done" : phase.status === "active" ? "Active" : phase.status === "partial" ? pct + "%" : "Locked"}
                    </Badge>
                  </div>
                </div>
                <Progress value={pct} max={100} variant={phase.status === "completed" ? "success" : "default"} />
                <p className="text-xs text-zinc-500 mt-1">{phase.description}</p>
              </UICard>
            );
          })}
        </div>

        <Separator />

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={function() { onAction("daily_task", { action: "view" }); }}>
            Today's Task
          </Button>
          <Button variant="outline" onClick={function() { onAction("album_theme_picker", { action: "browse" }); }}>
            Themes
          </Button>
          <Button variant="outline" onClick={function() { onAction("curation_checklist", { action: "view" }); }}>
            Curation
          </Button>
          <Button variant="outline" onClick={function() { onAction("printique_guide", { section: "overview" }); }}>
            Printique Guide
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // DAILY TASK VIEW
  // ══════════════════════════════════════════
  if (isDailyTask) {
    var task = data.task;

    if (!task) {
      return (
        <EmptyState
          icon="AlertCircle"
          title="No Pipeline Active"
          description="Start your 60-day pipeline from the dashboard first."
          action={<Button variant="primary" onClick={function() { onAction("pipeline_dashboard", { action: "view" }); }}>Go to Dashboard</Button>}
        />
      );
    }

    var pc = getPhase(task.phase);
    var TaskIcon = Icon(pc.icon);
    var dayPct = task.totalPhaseDays > 0 ? Math.round((task.dayInPhase / task.totalPhaseDays) * 100) : 0;
    var CheckIcon = Icon("CheckCircle");
    var SkipIcon = Icon("SkipForward");
    var ChevronLeftIcon = Icon("ChevronLeft");
    var ChevronRightIcon = Icon("ChevronRight");
    var HomeIcon = Icon("Home");
    var LightbulbIcon = Icon("Lightbulb");

    return (
      <div className="space-y-4">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {data.prevDay && (
              <Button variant="ghost" onClick={function() { onAction("daily_task", { action: "view_day", day: data.prevDay }); }}>
                <ChevronLeftIcon size={16} />
              </Button>
            )}
            <Badge variant="info">Day {data.targetDay} / {data.totalDays}</Badge>
            {data.nextDay && (
              <Button variant="ghost" onClick={function() { onAction("daily_task", { action: "view_day", day: data.nextDay }); }}>
                <ChevronRightIcon size={16} />
              </Button>
            )}
          </div>
          <Button variant="ghost" onClick={function() { onAction("pipeline_dashboard", { action: "view" }); }}>
            <HomeIcon size={16} />
          </Button>
        </div>

        {/* Phase indicator */}
        <div className={"px-3 py-2 rounded-lg border " + pc.bg + " " + pc.border}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TaskIcon size={16} className={pc.color} />
              <span className={"text-sm font-medium " + pc.color}>{task.phaseName}</span>
            </div>
            <span className="text-xs text-zinc-400">Day {task.dayInPhase} of {task.totalPhaseDays}</span>
          </div>
          <Progress value={dayPct} max={100} />
        </div>

        {/* Task Card */}
        <UICard accent={task.isCompleted ? "emerald" : task.isSkipped ? "gray" : pc.accent}>
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-white font-bold text-base">{task.title}</h3>
            {task.isCompleted && <Badge variant="success">Completed</Badge>}
            {task.isSkipped && <Badge variant="outline">Skipped</Badge>}
          </div>
          <p className="text-zinc-300 text-sm mb-3">{task.description}</p>
          {task.targetCount > 0 && (
            <div className="mb-3">
              <Stat label="Today's Target" value={task.targetCount + " photos"} accent="cyan" />
            </div>
          )}
        </UICard>

        {/* Tips */}
        {task.tips && task.tips.length > 0 && (
          <Accordion
            type="single"
            items={[{
              value: "tips",
              title: "Tips & Guidance",
              content: (
                <ul className="space-y-1.5">
                  {task.tips.map(function(tip, i) {
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                        <LightbulbIcon size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                        <span>{tip}</span>
                      </li>
                    );
                  })}
                </ul>
              )
            }]}
          />
        )}

        {/* Notes from past completion */}
        {task.notes && (
          <UICard accent="gray">
            <p className="text-xs text-zinc-500 mb-1">Your notes:</p>
            <p className="text-sm text-zinc-300">{task.notes}</p>
          </UICard>
        )}

        {/* Actions */}
        {!task.isCompleted && !task.isSkipped && (
          <div className="space-y-2">
            <Input
              placeholder="Add notes (optional)"
              value={notesInput}
              onChange={function(e) { setNotesInput(e.target.value); }}
            />
            <div className="flex gap-2">
              <Button variant="primary" onClick={function() {
                onAction("daily_task", { action: "complete", day: data.targetDay, notes: notesInput });
              }}>
                <CheckIcon size={16} />
                <span className="ml-1">Complete Task</span>
              </Button>
              <Button variant="ghost" onClick={function() {
                onAction("daily_task", { action: "skip", day: data.targetDay });
              }}>
                <SkipIcon size={16} />
                <span className="ml-1">Skip</span>
              </Button>
            </div>
          </div>
        )}

        {/* Nav to other tools */}
        <Separator />
        <div className="flex gap-2">
          <Button variant="outline" onClick={function() { onAction("curation_checklist", { action: "view" }); }}>
            Curation Guide
          </Button>
          <Button variant="outline" onClick={function() { onAction("printique_guide", { section: "overview" }); }}>
            Printique Specs
          </Button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // PRINTIQUE GUIDE VIEW
  // ══════════════════════════════════════════
  if (isPrintique) {
    var g = data.guide;
    var rec = g.recommended;
    var CheckIcon2 = Icon("Check");
    var StarIcon2 = Icon("Star");
    var InfoIcon = Icon("Info");
    var CameraIcon2 = Icon("Camera");
    var PaletteIcon = Icon("Palette");
    var HomeIcon2 = Icon("Home");

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Printique Layflat Guide</h2>
          <Button variant="ghost" onClick={function() { onAction("pipeline_dashboard", { action: "view" }); }}>
            <HomeIcon2 size={16} />
          </Button>
        </div>

        <Tabs
          tabs={[
            { value: "recommended", label: "Recommended" },
            { value: "sizes", label: "Sizes & Pricing" },
            { value: "materials", label: "Materials" },
            { value: "export", label: "Export Settings" }
          ]}
          defaultValue="recommended"
          variant="pills"
        >
          {function(tab) {
            if (tab === "recommended") {
              return (
                <div className="space-y-3 mt-3">
                  <UICard accent="emerald" header="Recommended First Album Spec">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <Stat label="Size" value={rec.size} accent="blue" />
                      <Stat label="Paper" value={rec.paper} accent="amber" />
                      <Stat label="Cover" value={rec.cover + " (" + rec.coverColor + ")"} accent="purple" />
                      <Stat label="Spreads" value={rec.spreads + " (" + rec.pages + " pages)"} accent="cyan" />
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <Stat label="Estimated Total" value={"$" + rec.totalWithShipping} accent="emerald" />
                    </div>
                    <div className="text-xs text-zinc-500 space-y-0.5">
                      <p>Base: ${rec.estimatedBasePrice} + Extra spreads: ${rec.extraSpreadsCost} + Shipping: ~${rec.shippingEstimate}</p>
                      <p>Production: {rec.productionTime} | Shipping: {rec.shippingTime}</p>
                    </div>
                  </UICard>

                  <Accordion
                    type="single"
                    defaultOpen={["why"]}
                    items={[{
                      value: "why",
                      title: "Why This Spec?",
                      content: (
                        <ul className="space-y-2">
                          {(rec.whyThisSpec || []).map(function(reason, i) {
                            return (
                              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                                <CheckIcon2 size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                                <span>{reason}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )
                    }]}
                  />

                  {g.proTips && (
                    <Accordion
                      type="single"
                      items={[{
                        value: "tips",
                        title: "Pro Tips",
                        content: (
                          <ul className="space-y-2">
                            {g.proTips.map(function(tip, i) {
                              return (
                                <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                                  <StarIcon2 size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                                  <span>{tip}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )
                      }]}
                    />
                  )}
                </div>
              );
            }

            if (tab === "sizes") {
              return (
                <div className="space-y-3 mt-3">
                  <DataTable
                    columns={[
                      { key: "size", label: "Size", sortable: true },
                      { key: "20spreads", label: "20 Spreads", render: function(v) { return "$" + v; } },
                      { key: "25spreads", label: "25 Spreads", render: function(v) { return "$" + v; } },
                      { key: "30spreads", label: "30 Spreads", render: function(v) { return "$" + v; } },
                      { key: "recommended", label: "", render: function(v) { return v ? "★" : ""; } }
                    ]}
                    data={g.costBreakdown || []}
                    striped
                  />
                  <p className="text-xs text-zinc-500">Prices before promotions. Printique frequently runs 20-40% off sales.</p>

                  {(g.sizes || []).map(function(sz) {
                    return (
                      <UICard key={sz.name} accent={sz.recommended ? "emerald" : "gray"}>
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-white font-medium">{sz.name}</span>
                            {sz.recommended && <Badge variant="success" className="ml-2">Recommended</Badge>}
                          </div>
                          <span className="text-zinc-400 text-sm">{sz.spreads} spreads</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">{sz.description}</p>
                      </UICard>
                    );
                  })}
                </div>
              );
            }

            if (tab === "materials") {
              return (
                <div className="space-y-3 mt-3">
                  <h3 className="text-sm font-semibold text-zinc-300">Paper Options</h3>
                  {(g.papers || []).map(function(paper) {
                    return (
                      <UICard key={paper.name} accent={paper.recommended ? "amber" : "gray"}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-white font-medium">{paper.name}</span>
                          {paper.recommended && <Badge variant="success">Recommended</Badge>}
                        </div>
                        <p className="text-sm text-zinc-300 mb-2">{paper.description}</p>
                        <div className="flex gap-4 text-xs text-zinc-500">
                          <span>Finish: {paper.finish}</span>
                          <span>Fingerprints: {paper.fingerprints}</span>
                        </div>
                      </UICard>
                    );
                  })}

                  <Separator />
                  <h3 className="text-sm font-semibold text-zinc-300">Cover Materials</h3>
                  {(g.covers || []).map(function(cover) {
                    return (
                      <UICard key={cover.name} accent={cover.recommended ? "purple" : "gray"}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-white font-medium">{cover.name}</span>
                          <div className="flex items-center gap-2">
                            {cover.priceAddon > 0 && <span className="text-xs text-zinc-500">+${cover.priceAddon}</span>}
                            {cover.recommended && <Badge variant="success">Recommended</Badge>}
                          </div>
                        </div>
                        <p className="text-sm text-zinc-300 mb-1">{cover.description}</p>
                        <p className="text-xs text-zinc-500">Colors: {cover.colors.join(", ")}</p>
                      </UICard>
                    );
                  })}
                </div>
              );
            }

            if (tab === "export") {
              var ex = g.exportSettings || {};
              var res = g.resolution || {};
              return (
                <div className="space-y-3 mt-3">
                  <UICard accent="blue" header="Lightroom Export Settings">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-zinc-400">Format:</span><span className="text-white">{ex.format}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Color Space:</span><span className="text-white">{ex.colorSpace}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Resolution:</span><span className="text-white">{ex.resolution}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Resize:</span><span className="text-white">{ex.resizeToFit}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Sharpening:</span><span className="text-white">{ex.sharpening}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">Naming:</span><span className="text-white">{ex.fileNaming}</span></div>
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">{ex.notes}</p>
                  </UICard>

                  <UICard accent="cyan" header="Your Camera Resolution">
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <CameraIcon2 size={14} className="text-cyan-400" />
                          <span className="text-white font-medium">Sony A7R V</span>
                        </div>
                        <div className="text-sm text-zinc-400">
                          <span>{res.sonyA7RV && res.sonyA7RV.sensor}</span> — <span>{res.sonyA7RV && res.sonyA7RV.maxRes}</span>
                        </div>
                        <p className="text-xs text-emerald-400">{res.sonyA7RV && res.sonyA7RV.verdict}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <CameraIcon2 size={14} className="text-cyan-400" />
                          <span className="text-white font-medium">Leica Q3</span>
                        </div>
                        <div className="text-sm text-zinc-400">
                          <span>{res.leicaQ3 && res.leicaQ3.sensor}</span> — <span>{res.leicaQ3 && res.leicaQ3.maxRes}</span>
                        </div>
                        <p className="text-xs text-emerald-400">{res.leicaQ3 && res.leicaQ3.verdict}</p>
                      </div>
                      <Separator />
                      <div>
                        <span className="text-zinc-400 text-sm">Minimum for 12x12 album:</span>
                        <p className="text-white text-sm">{res.minimumFor12x12 && res.minimumFor12x12.required}</p>
                        <p className="text-emerald-400 text-xs">{res.minimumFor12x12 && res.minimumFor12x12.headroom}</p>
                      </div>
                    </div>
                  </UICard>
                </div>
              );
            }

            return null;
          }}
        </Tabs>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // THEME PICKER VIEW
  // ══════════════════════════════════════════
  if (isThemePicker) {
    var themes = data.themes || [];
    var selectedTheme = data.selectedTheme;
    var HomeIcon3 = Icon("Home");
    var CheckIcon3 = Icon("Check");

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Album Themes</h2>
          <Button variant="ghost" onClick={function() { onAction("pipeline_dashboard", { action: "view" }); }}>
            <HomeIcon3 size={16} />
          </Button>
        </div>
        <p className="text-sm text-zinc-400">Choose a creative direction for your album. This guides photo selection, sequencing, and layout decisions.</p>

        <div className="space-y-3">
          {themes.map(function(theme) {
            var themeAccent = THEME_ACCENTS[theme.id] || "blue";
            var ThemeIcon = Icon(THEME_ICONS[theme.id] || "Image");
            var isSelected = theme.id === selectedTheme;

            return (
              <UICard key={theme.id} accent={isSelected ? themeAccent : "gray"}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ThemeIcon size={18} className={isSelected ? "text-white" : "text-zinc-400"} />
                    <div>
                      <h3 className={"font-bold " + (isSelected ? "text-white" : "text-zinc-200")}>{theme.name}</h3>
                      <p className="text-xs text-zinc-400">{theme.tagline}</p>
                    </div>
                  </div>
                  {isSelected ? (
                    <Badge variant="success">Selected</Badge>
                  ) : (
                    <Button variant="outline" onClick={function() { onAction("album_theme_picker", { action: "select", themeId: theme.id }); }}>
                      Select
                    </Button>
                  )}
                </div>

                <Accordion
                  type="single"
                  items={[{
                    value: "detail_" + theme.id,
                    title: "Details",
                    content: (
                      <div className="space-y-2 text-sm">
                        <p className="text-zinc-300">{theme.concept}</p>
                        <Separator />
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-zinc-500">Pages:</span> <span className="text-zinc-300">{theme.pageCount}</span></div>
                          <div><span className="text-zinc-500">Mood:</span> <span className="text-zinc-300">{theme.mood}</span></div>
                          <div className="col-span-2"><span className="text-zinc-500">Palette:</span> <span className="text-zinc-300">{theme.colorPalette}</span></div>
                          <div className="col-span-2"><span className="text-zinc-500">Layout:</span> <span className="text-zinc-300">{theme.layoutStyle}</span></div>
                        </div>
                        {theme.selectionCriteria && (
                          <div>
                            <p className="text-zinc-500 text-xs mb-1">Selection Criteria:</p>
                            <ul className="space-y-1">
                              {(Array.isArray(theme.selectionCriteria) ? theme.selectionCriteria : []).map(function(c, ci) {
                                return <li key={ci} className="text-xs text-zinc-400 flex items-start gap-1"><CheckIcon3 size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" /><span>{c}</span></li>;
                              })}
                            </ul>
                          </div>
                        )}
                        {theme.cameraNote && <p className="text-xs text-blue-400">{theme.cameraNote}</p>}
                      </div>
                    )
                  }]}
                />
              </UICard>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // CURATION CHECKLIST VIEW
  // ══════════════════════════════════════════
  if (isCuration) {
    var cur = data.curation;
    var passes = cur.passes || [];
    var HomeIcon4 = Icon("Home");
    var ScissorsIcon = Icon("Scissors");
    var HeartIcon = Icon("Heart");
    var BookOpenIcon2 = Icon("BookOpen");
    var PaletteIcon2 = Icon("Palette");
    var ActivityIcon = Icon("Activity");
    var AlertTriangleIcon = Icon("AlertTriangle");
    var LightbulbIcon2 = Icon("Lightbulb");

    var passIcons = [ScissorsIcon, HeartIcon, BookOpenIcon2, PaletteIcon2, ActivityIcon];

    // If focusPass is set, show detailed tips view
    if (cur.focusPass) {
      var fp = cur.focusPass;
      var FpIcon = passIcons[fp.number - 1] || ScissorsIcon;
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Pass {fp.number}: {fp.name}</h2>
            <Button variant="ghost" onClick={function() { onAction("curation_checklist", { action: "view" }); }}>Back</Button>
          </div>

          <UICard accent="blue">
            <p className="text-zinc-300 mb-2">{fp.criteria}</p>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>Est. time: {fp.estimatedTime}</span>
              {fp.startCount && <span>Start: {fp.startCount} photos</span>}
            </div>
          </UICard>

          <h3 className="text-sm font-semibold text-emerald-400">Tips</h3>
          <div className="space-y-1.5">
            {(fp.tips || []).map(function(tip, i) {
              return (
                <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                  <LightbulbIcon2 size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  <span>{tip}</span>
                </div>
              );
            })}
          </div>

          <h3 className="text-sm font-semibold text-rose-400">Common Mistakes</h3>
          <div className="space-y-1.5">
            {(fp.mistakes || []).map(function(m, i) {
              return (
                <div key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                  <AlertTriangleIcon size={14} className="text-rose-400 mt-0.5 flex-shrink-0" />
                  <span>{m}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">5-Pass Curation</h2>
          <Button variant="ghost" onClick={function() { onAction("pipeline_dashboard", { action: "view" }); }}>
            <HomeIcon4 size={16} />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Library" value={cur.totalPhotos ? cur.totalPhotos.toLocaleString() : "0"} accent="blue" />
          <Stat label="Candidates" value={cur.candidateCount || 200} accent="amber" />
          <Stat label="Target" value={cur.targetPhotos || 45} accent="emerald" />
        </div>

        <Progress value={cur.overallProgress || 0} max={100} variant={cur.overallProgress >= 100 ? "success" : "default"} showLabel />

        {cur.totalCulled > 0 && (
          <p className="text-xs text-zinc-500">Culled {cur.totalCulled} photos ({cur.cullPercentage}%) — Current count: {cur.currentCount}</p>
        )}

        <Separator />

        {/* Passes */}
        <div className="space-y-2">
          {passes.map(function(pass, idx) {
            var PassIcon = passIcons[idx] || ScissorsIcon;
            var isComplete = pass.completed;
            var accent = isComplete ? "emerald" : "gray";

            return (
              <UICard key={pass.number} accent={accent}>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <PassIcon size={16} className={isComplete ? "text-emerald-400" : "text-zinc-400"} />
                    <div>
                      <span className={"font-medium " + (isComplete ? "text-emerald-400" : "text-white")}>
                        Pass {pass.number}: {pass.name}
                      </span>
                      <p className="text-xs text-zinc-500">{pass.criteria}</p>
                    </div>
                  </div>
                  {isComplete ? (
                    <Badge variant="success">{pass.remainingCount} left</Badge>
                  ) : (
                    <Badge variant="outline">{pass.estimatedTime}</Badge>
                  )}
                </div>

                {pass.notes && <p className="text-xs text-zinc-400 mt-1">{pass.notes}</p>}

                <div className="flex gap-2 mt-2">
                  <Button variant="ghost" onClick={function() {
                    onAction("curation_checklist", { action: "tips", passNumber: pass.number });
                  }}>
                    Tips & Mistakes
                  </Button>
                  {!isComplete && (
                    <div className="flex items-center gap-1">
                      <Input
                        placeholder="Photos remaining"
                        value={countInput}
                        onChange={function(e) { setCountInput(e.target.value); }}
                        className="w-32"
                      />
                      <Button variant="primary" onClick={function() {
                        var cnt = parseInt(countInput, 10);
                        if (cnt > 0) {
                          onAction("curation_checklist", { action: "update_pass", passNumber: pass.number, remainingCount: cnt });
                        }
                      }}>
                        Done
                      </Button>
                    </div>
                  )}
                </div>
              </UICard>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // FALLBACK
  // ══════════════════════════════════════════
  return (
    <div className="space-y-4">
      <EmptyState
        icon="Camera"
        title="Album Pipeline"
        description="Your 60-day journey to a gift-quality printed photo album."
        action={<Button variant="primary" onClick={function() { onAction("pipeline_dashboard", { action: "view" }); }}>Open Dashboard</Button>}
      />
    </div>
  );
}