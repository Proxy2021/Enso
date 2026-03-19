export default function GeneratedUI({ data, onAction }) {
  // ── Hooks (all at top level) ──
  var [activeTab, setActiveTab] = useState("timeline");
  var [expandedId, setExpandedId] = useState(null);
  var [filterOwner, setFilterOwner] = useState("all");
  var [filterStatus, setFilterStatus] = useState("all");

  // ── Detect view ──
  var tool = data?.tool || "";
  var isCreate = tool === "enso_project_planner_create";
  var isTimeline = tool === "enso_project_planner_timeline";
  var isAddMilestone = tool === "enso_project_planner_add_milestone";
  var isUpdate = tool === "enso_project_planner_update";
  var isRisks = tool === "enso_project_planner_risks";
  var isSummary = tool === "enso_project_planner_summary";

  // ── Error view ──
  if (data?.error) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <EmptyState
          icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />}
          title="Something went wrong"
          description={data.error}
          action={<Button size="sm" onClick={() => onAction("create", { topic: "project plan" })}>New Plan</Button>}
        />
      </div>
    );
  }

  // ── Confirmation views (add_milestone, update) ──
  if (isAddMilestone) {
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <LucideReact.CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-100">Milestone Added</div>
            <div className="text-xs text-gray-500">{data?.milestone?.name || "New milestone"} — {data?.milestone?.dayRange || ""}</div>
          </div>
        </div>
        <Button size="sm" onClick={() => onAction("timeline", { planId: data?.planId || "" })}>
          <LucideReact.ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Timeline
        </Button>
      </div>
    );
  }

  if (isUpdate) {
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <LucideReact.RefreshCw className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-100">Status Updated</div>
            <div className="text-xs text-gray-500">{data?.itemName || "Item"} → <Badge variant={data?.newStatus === "Complete" ? "success" : data?.newStatus === "In Progress" ? "warning" : "outline"}>{data?.newStatus || "Updated"}</Badge></div>
          </div>
        </div>
        <Button size="sm" onClick={() => onAction("timeline", { planId: data?.planId || "" })}>
          <LucideReact.ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Timeline
        </Button>
      </div>
    );
  }

  // ── Risk matrix view ──
  if (isRisks) {
    var riskList = data?.risks || [];
    var highHigh = riskList.filter(r => (r?.likelihood || '') === "high" && (r?.impact || '') === "high");
    var highLow = riskList.filter(r => (r?.likelihood || '') === "high" && (r?.impact || '') === "low");
    var lowHigh = riskList.filter(r => (r?.likelihood || '') === "low" && (r?.impact || '') === "high");
    var lowLow = riskList.filter(r => (r?.likelihood || '') === "low" && (r?.impact || '') === "low");

    var chipColor = (phase) => {
      var colors = { "pre-launch": "info", "launch": "success", "post-launch": "default", "planning": "info", "execution": "success", "review": "default" };
      return colors[(phase || "").toLowerCase()] || "outline";
    };

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("timeline", { planId: data?.planId || "" })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <LucideReact.ShieldAlert className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-200">Risk Matrix</span>
          <Badge variant="outline">{riskList.length} risks</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-rose-400">High Likelihood / High Impact</div>
            <div className="flex flex-wrap gap-1">
              {(highHigh || []).map((r, i) => <Badge key={i} variant={chipColor(r?.phase)}>{r?.name || ""}</Badge>)}
              {highHigh.length === 0 && <span className="text-[10px] text-gray-600">None</span>}
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-amber-400">Low Likelihood / High Impact</div>
            <div className="flex flex-wrap gap-1">
              {(lowHigh || []).map((r, i) => <Badge key={i} variant={chipColor(r?.phase)}>{r?.name || ""}</Badge>)}
              {lowHigh.length === 0 && <span className="text-[10px] text-gray-600">None</span>}
            </div>
          </div>
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-orange-400">High Likelihood / Low Impact</div>
            <div className="flex flex-wrap gap-1">
              {(highLow || []).map((r, i) => <Badge key={i} variant={chipColor(r?.phase)}>{r?.name || ""}</Badge>)}
              {highLow.length === 0 && <span className="text-[10px] text-gray-600">None</span>}
            </div>
          </div>
          <div className="rounded-xl border border-gray-600/50 bg-gray-800/30 p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Low Likelihood / Low Impact</div>
            <div className="flex flex-wrap gap-1">
              {(lowLow || []).map((r, i) => <Badge key={i} variant={chipColor(r?.phase)}>{r?.name || ""}</Badge>)}
              {lowLow.length === 0 && <span className="text-[10px] text-gray-600">None</span>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Summary dashboard view ──
  if (isSummary) {
    var stats = data?.stats || {};
    var phaseBreakdown = data?.phaseBreakdown || [];
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("timeline", { planId: data?.planId || "" })}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <LucideReact.BarChart3 className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-200">Plan Summary</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Milestones" value={stats?.totalMilestones ?? 0} accent="blue" />
          <Stat label="Deliverables" value={stats?.totalDeliverables ?? 0} accent="emerald" />
          <Stat label="Complete" value={stats?.completedMilestones ?? 0} accent="purple" />
          <Stat label="At Risk" value={stats?.risksCount ?? 0} accent="rose" />
        </div>
        <Progress value={stats?.completionPct ?? 0} max={100} variant="emerald" showLabel />
        {phaseBreakdown.length > 0 && (
          <DataTable
            columns={[
              { key: "phase", label: "Phase", sortable: true },
              { key: "milestones", label: "Milestones" },
              { key: "deliverables", label: "Deliverables" },
              { key: "completed", label: "Done" },
              { key: "status", label: "Status", render: (row) => <Badge variant={row?.status === "Complete" ? "success" : row?.status === "In Progress" ? "warning" : "outline"}>{row?.status || "Planned"}</Badge> },
            ]}
            data={phaseBreakdown}
            striped
          />
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => onAction("risks", { planId: data?.planId || "" })}>
            <LucideReact.ShieldAlert className="w-3.5 h-3.5 mr-1" /> Risks
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // ── Main Timeline/Create View ──
  // ════════════════════════════════════════════════════════════════
  var phases = data?.phases || [];
  var allMilestones = data?.milestones || [];
  var planName = data?.planName || data?.topic || "Project Plan";
  var totalDays = data?.totalDays || 90;

  // Phase colors
  var phaseColorMap = {};
  var colorOptions = ["blue", "emerald", "purple", "amber", "cyan", "rose", "orange"];
  phases.forEach((p, i) => { phaseColorMap[p?.id || ("phase-" + i)] = colorOptions[i % colorOptions.length]; });

  var statusBadge = (status) => {
    var variants = { "Planned": "outline", "In Progress": "warning", "Complete": "success", "At Risk": "danger" };
    return variants[(status || "")] || "outline";
  };

  // Filter milestones
  var filtered = useMemo(() => {
    var result = allMilestones || [];
    if (filterOwner !== "all") result = result.filter(m => (m?.owner || "") === filterOwner);
    if (filterStatus !== "all") result = result.filter(m => (m?.status || "") === filterStatus);
    return result;
  }, [allMilestones, filterOwner, filterStatus]);

  // Unique owners
  var owners = useMemo(() => {
    var set = {};
    (allMilestones || []).forEach(m => { if (m?.owner) set[m.owner] = true; });
    return Object.keys(set).sort();
  }, [allMilestones]);

  // Unique statuses
  var statuses = ["Planned", "In Progress", "Complete", "At Risk"];

  return (
    <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <LucideReact.Rocket className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-bold text-gray-100 truncate">{planName}</div>
          <div className="text-xs text-gray-500">{phases.length} phases · {allMilestones.length} milestones · {totalDays} days</div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onAction("summary", { planId: data?.planId || "" })}>
            <LucideReact.BarChart3 className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAction("risks", { planId: data?.planId || "" })}>
            <LucideReact.ShieldAlert className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Phase timeline bar */}
      {phases.length > 0 && (
        <div className="space-y-1">
          <div className="flex rounded-xl overflow-hidden h-8 border border-gray-700/50">
            {phases.map((p, i) => {
              var pct = p?.pct || Math.round(100 / phases.length);
              var accent = phaseColorMap[p?.id || ("phase-" + i)] || "blue";
              var bgClass = "bg-" + accent + "-500";
              return (
                <div key={p?.id || i} className={bgClass + " flex items-center justify-center opacity-80"} style={{ width: pct + "%" }}>
                  <span className="text-[10px] font-medium text-white truncate px-1">{p?.label || ""}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-gray-500 px-1">
            <span>Day 1</span>
            <span>Day {totalDays}</span>
          </div>
        </div>
      )}

      <Separator />

      {/* Tabs */}
      <Tabs
        tabs={[
          { value: "timeline", label: "Milestones (" + filtered.length + ")" },
          { value: "owners", label: "By Owner (" + owners.length + ")" },
        ]}
        defaultValue="timeline"
        variant="underline"
      >
        {(tab) => tab === "timeline" ? (
          <div className="space-y-3 mt-3">
            {/* Filters */}
            <div className="flex gap-2">
              <Select size="sm" value={filterOwner} options={[{ value: "all", label: "All owners" }].concat(owners.map(o => ({ value: o, label: o })))} onChange={(v) => setFilterOwner(v)} />
              <Select size="sm" value={filterStatus} options={[{ value: "all", label: "All statuses" }].concat(statuses.map(s => ({ value: s, label: s })))} onChange={(v) => setFilterStatus(v)} />
            </div>

            {/* Milestone cards */}
            {filtered.length === 0 ? (
              <EmptyState
                icon={<LucideReact.ListChecks className="w-8 h-8" />}
                title="No milestones match"
                description="Try adjusting the filters."
              />
            ) : (
              <div className="space-y-2">
                {filtered.map((m, idx) => {
                  var isOpen = expandedId === (m?.id || ("m-" + idx));
                  var accent = phaseColorMap[m?.phase || ""] || "blue";
                  return (
                    <div key={m?.id || idx} className={"rounded-xl border transition-all " + (isOpen ? "border-" + accent + "-500/40 bg-" + accent + "-500/5" : "border-gray-700/50 bg-gray-800/40 hover:bg-gray-800/70")}>
                      <button onClick={() => setExpandedId(isOpen ? null : (m?.id || ("m-" + idx)))} className="w-full flex items-center gap-3 p-3 cursor-pointer text-left">
                        <div className={"w-2 h-2 rounded-full shrink-0 bg-" + accent + "-500"} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-100 truncate">{m?.name || "Milestone"}</div>
                          <div className="text-[11px] text-gray-500">{m?.dayRange || ""} · {m?.owner || "Unassigned"}</div>
                        </div>
                        <Badge variant={statusBadge(m?.status)}>{m?.status || "Planned"}</Badge>
                        {isOpen ? <LucideReact.ChevronUp className="w-4 h-4 text-gray-500 shrink-0" /> : <LucideReact.ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 space-y-1.5">
                          <Separator />
                          <div className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Deliverables</div>
                          {(m?.deliverables || []).map((d, di) => (
                            <div key={di} className="flex items-center gap-2 px-2 py-1.5 bg-gray-900/60 rounded-lg">
                              <LucideReact.CheckCircle2 className={"w-3.5 h-3.5 shrink-0 " + (d?.status === "Complete" ? "text-emerald-400" : "text-gray-600")} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-gray-300 truncate">{d?.title || ""}</div>
                              </div>
                              <span className="text-[10px] text-gray-500 shrink-0">Day {d?.day ?? "?"}</span>
                              <Badge variant="outline">{d?.owner || "TBD"}</Badge>
                            </div>
                          ))}
                          <div className="flex gap-1.5 mt-2">
                            <Button size="sm" variant="ghost" onClick={() => onAction("update", { planId: data?.planId || "", milestoneId: m?.id || "", status: "In Progress" })}>
                              <LucideReact.Play className="w-3 h-3 mr-1" /> Start
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => onAction("update", { planId: data?.planId || "", milestoneId: m?.id || "", status: "Complete" })}>
                              <LucideReact.Check className="w-3 h-3 mr-1" /> Complete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 mt-3">
            <Accordion
              type="single"
              items={owners.map(owner => {
                var ownerMilestones = (allMilestones || []).filter(m => (m?.owner || "") === owner);
                var ownerDeliverables = [];
                ownerMilestones.forEach(m => {
                  (m?.deliverables || []).forEach(d => {
                    ownerDeliverables.push({ title: d?.title || "", day: d?.day ?? 0, milestone: m?.name || "", phase: m?.phase || "" });
                  });
                });
                ownerDeliverables.sort((a, b) => (a?.day ?? 0) - (b?.day ?? 0));
                return {
                  value: owner,
                  title: (
                    <div className="flex items-center gap-2">
                      <LucideReact.User className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-sm text-gray-200">{owner}</span>
                      <Badge variant="outline">{ownerDeliverables.length} items</Badge>
                    </div>
                  ),
                  content: (
                    <div className="space-y-1">
                      {ownerDeliverables.map((d, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-gray-900/40 rounded-lg">
                          <div className={"w-1.5 h-1.5 rounded-full shrink-0 bg-" + (phaseColorMap[d?.phase || ""] || "gray") + "-500"} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-300 truncate">{d?.title || ""}</div>
                            <div className="text-[10px] text-gray-500">{d?.milestone || ""}</div>
                          </div>
                          <span className="text-[10px] text-gray-500 shrink-0">Day {d?.day ?? "?"}</span>
                        </div>
                      ))}
                    </div>
                  ),
                };
              })}
            />
          </div>
        )}
      </Tabs>
    </div>
  );
}