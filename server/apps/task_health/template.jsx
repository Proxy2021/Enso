export default function GeneratedUI({ data, onAction }) {
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskFilter, setTaskFilter] = useState("all");
  const [hoursWindow, setHoursWindow] = useState(24);
  const [daysWindow, setDaysWindow] = useState(7);
  const [expandedRun, setExpandedRun] = useState(null);

  const isOverview = data?.tool === "enso_task_health_overview";
  const isTaskList = data?.tool === "enso_task_health_task_list";
  const isTaskRuns = data?.tool === "enso_task_health_task_runs";
  const isFailureAnalysis = data?.tool === "enso_task_health_failure_analysis";
  const isTimeline = data?.tool === "enso_task_health_timeline";
  const isHealthReport = data?.tool === "enso_task_health_health_report";

  const statusColor = (s) => {
    if (s === "success") return "emerald";
    if (s === "failed") return "red";
    if (s === "timeout") return "amber";
    if (s === "running") return "blue";
    return "gray";
  };

  const statusIcon = (s) => {
    if (s === "success") return LucideReact.CheckCircle;
    if (s === "failed") return LucideReact.XCircle;
    if (s === "timeout") return LucideReact.Clock;
    if (s === "running") return LucideReact.Loader;
    return LucideReact.Circle;
  };

  const healthColor = (level) => {
    if (level === "excellent") return "emerald";
    if (level === "good") return "emerald";
    if (level === "fair") return "amber";
    if (level === "degraded") return "orange";
    if (level === "critical") return "rose";
    return "gray";
  };

  const riskIcon = (level) => {
    if (level === "critical") return LucideReact.AlertOctagon;
    if (level === "high") return LucideReact.AlertTriangle;
    if (level === "medium") return LucideReact.AlertCircle;
    return LucideReact.Info;
  };

  const formatTime = (ts) => {
    if (!ts) return "-";
    var d = new Date(ts);
    var now = new Date();
    var diff = now - d;
    if (diff < 0) {
      var absDiff = Math.abs(diff);
      if (absDiff < 3600000) return "in " + Math.ceil(absDiff / 60000) + "m";
      if (absDiff < 86400000) return "in " + Math.round(absDiff / 3600000) + "h";
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diff < 60000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDuration = (ms) => {
    if (!ms || ms <= 0) return "-";
    if (ms < 1000) return ms + "ms";
    if (ms < 60000) return Math.round(ms / 1000) + "s";
    if (ms < 3600000) return Math.floor(ms / 60000) + "m " + Math.round((ms % 60000) / 1000) + "s";
    return Math.floor(ms / 3600000) + "h " + Math.round((ms % 3600000) / 60000) + "m";
  };

  const NavBar = ({ title, icon: Icon, iconColor, badge, badgeVariant }) => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className={"w-5 h-5 text-" + (iconColor || "zinc") + "-400"} />}
        <span className="text-lg font-semibold text-white">{title}</span>
        {badge != null && <Badge variant={badgeVariant || "outline"}>{badge}</Badge>}
      </div>
      <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={() => onAction("overview")}>Dashboard</Button>
    </div>
  );

  const ScoreRing = ({ score, size }) => {
    var sz = size || 80;
    var r = (sz / 2) - 8;
    var circ = 2 * Math.PI * r;
    var color = score >= 90 ? "#10b981" : score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : score >= 30 ? "#f97316" : "#ef4444";
    return (
      <div className="relative flex-shrink-0" style={{ width: sz, height: sz }}>
        <svg viewBox={"0 0 " + sz + " " + sz} className="w-full h-full -rotate-90">
          <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="#27272a" strokeWidth="6" />
          <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white">{score}</span>
        </div>
      </div>
    );
  };

  // ── OVERVIEW ──
  if (isOverview) {
    var byStatus = data.byStatus || {};
    var upcoming = data.upcoming || [];
    var recentFailures = data.recentFailures || [];
    var circuitBroken = data.circuitBroken || [];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.CalendarClock className="w-5 h-5 text-violet-400" />
            <span className="text-lg font-semibold text-white">Task Health</span>
          </div>
          <Badge variant={healthColor(data.healthLevel) === "emerald" ? "success" : healthColor(data.healthLevel) === "amber" ? "warning" : "danger"}>
            {(data.healthLevel || "unknown").charAt(0).toUpperCase() + (data.healthLevel || "unknown").slice(1)}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <ScoreRing score={data.healthScore || 0} size={96} />
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Stat label="Total Tasks" value={data.totalTasks || 0} accent="violet" />
            <Stat label="Enabled" value={data.enabled || 0} accent="emerald" />
            <Stat label="Disabled" value={data.disabled || 0} accent="gray" />
            <Stat label="Failed" value={byStatus.failed || 0} accent={byStatus.failed > 0 ? "red" : "gray"} />
          </div>
        </div>

        {circuitBroken.length > 0 && (
          <UICard accent="rose" header={"Circuit Broken (" + circuitBroken.length + ")"}>
            <div className="space-y-2">
              {circuitBroken.map((t, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-red-900/20 border border-red-800/30 cursor-pointer"
                  onClick={() => onAction("task_runs", { taskId: t.taskId })}>
                  <div>
                    <div className="text-sm font-medium text-red-300">{t.name}</div>
                    <div className="text-xs text-zinc-500">{t.consecutiveFailures} consecutive failures · {formatTime(t.lastFiredAt)}</div>
                  </div>
                  <LucideReact.ChevronRight className="w-4 h-4 text-zinc-500" />
                </div>
              ))}
            </div>
          </UICard>
        )}

        {recentFailures.length > 0 && (
          <UICard header="Recent Failures">
            <div className="space-y-2">
              {recentFailures.slice(0, 5).map((t, i) => {
                var StatusIcon = statusIcon(t.lastRunStatus);
                return (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-zinc-800/50 cursor-pointer hover:bg-zinc-700/50"
                    onClick={() => onAction("task_runs", { taskId: t.taskId })}>
                    <div className="flex items-center gap-2">
                      <StatusIcon className={"w-4 h-4 text-" + statusColor(t.lastRunStatus) + "-400"} />
                      <div>
                        <div className="text-sm text-zinc-200">{t.name}</div>
                        <div className="text-xs text-zinc-500">{t.consecutiveFailures} failures · {formatTime(t.lastFiredAt)}</div>
                      </div>
                    </div>
                    <Badge variant="danger">{t.consecutiveFailures}x</Badge>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {upcoming.length > 0 && (
          <UICard header="Upcoming Executions">
            <div className="space-y-1">
              {upcoming.map((t, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded hover:bg-zinc-800/40 cursor-pointer"
                  onClick={() => onAction("task_runs", { taskId: t.taskId })}>
                  <div className="flex items-center gap-2">
                    <LucideReact.Timer className="w-4 h-4 text-violet-400" />
                    <span className="text-sm text-zinc-200">{t.name}</span>
                  </div>
                  <span className="text-xs text-zinc-400">{formatTime(t.nextFireAt)}</span>
                </div>
              ))}
            </div>
          </UICard>
        )}

        <div className="grid grid-cols-4 gap-1 text-center">
          <div className="p-2 rounded bg-zinc-800/40">
            <div className="text-lg font-bold text-emerald-400">{byStatus.success || 0}</div>
            <div className="text-xs text-zinc-500">Success</div>
          </div>
          <div className="p-2 rounded bg-zinc-800/40">
            <div className="text-lg font-bold text-red-400">{byStatus.failed || 0}</div>
            <div className="text-xs text-zinc-500">Failed</div>
          </div>
          <div className="p-2 rounded bg-zinc-800/40">
            <div className="text-lg font-bold text-amber-400">{byStatus.timeout || 0}</div>
            <div className="text-xs text-zinc-500">Timeout</div>
          </div>
          <div className="p-2 rounded bg-zinc-800/40">
            <div className="text-lg font-bold text-zinc-400">{byStatus.never_run || 0}</div>
            <div className="text-xs text-zinc-500">Pending</div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" icon={LucideReact.HeartPulse} onClick={() => onAction("health_report")}>Health Report</Button>
          <Button variant="outline" icon={LucideReact.List} onClick={() => onAction("task_list")}>All Tasks</Button>
          <Button variant="outline" icon={LucideReact.Activity} onClick={() => onAction("timeline")}>Timeline</Button>
          <Button variant="outline" icon={LucideReact.TrendingDown} onClick={() => onAction("failure_analysis")}>Failures</Button>
        </div>
      </div>
    );
  }

  // ── TASK LIST ──
  if (isTaskList) {
    var tasks = data.tasks || [];
    var filters = ["all", "enabled", "disabled", "failing", "circuit-broken"];

    return (
      <div className="space-y-3">
        <NavBar title="Scheduled Tasks" icon={LucideReact.List} iconColor="violet" badge={data.total + " tasks"} />

        <div className="flex gap-1 flex-wrap">
          {filters.map(function(f) {
            return (
              <Button key={f} variant={taskFilter === f ? "primary" : "ghost"} size="sm"
                onClick={() => { setTaskFilter(f); onAction("task_list", { filter: f }); }}>
                {f === "circuit-broken" ? "Broken" : f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            );
          })}
        </div>

        {tasks.length === 0 ? (
          <EmptyState icon={LucideReact.CalendarOff} title="No tasks" description={"No " + taskFilter + " tasks found"} />
        ) : (
          <div className="space-y-2">
            {tasks.map(function(t, i) {
              var StatusIcon = statusIcon(t.lastRunStatus);
              var isBroken = !t.enabled && t.consecutiveFailures >= 3;
              return (
                <UICard key={i} accent={isBroken ? "rose" : t.consecutiveFailures > 0 ? "amber" : t.enabled ? "violet" : "gray"}>
                  <div className="cursor-pointer" onClick={() => onAction("task_runs", { taskId: t.taskId })}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={"w-4 h-4 text-" + statusColor(t.lastRunStatus) + "-400"} />
                        <span className="text-sm font-medium text-white">{t.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {!t.enabled && <Badge variant="default">Disabled</Badge>}
                        {isBroken && <Badge variant="danger">Broken</Badge>}
                        {t.consecutiveFailures > 0 && !isBroken && <Badge variant="warning">{t.consecutiveFailures}x fail</Badge>}
                        <LucideReact.ChevronRight className="w-4 h-4 text-zinc-500" />
                      </div>
                    </div>
                    {t.description && <div className="text-xs text-zinc-500 mb-1 truncate">{t.description}</div>}
                    <div className="flex gap-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <LucideReact.Clock className="w-3 h-3" />
                        {t.cronHuman}
                      </span>
                      {t.lastFiredAt && <span>Last: {formatTime(t.lastFiredAt)}</span>}
                      {t.nextFireAt && <span>Next: {formatTime(t.nextFireAt)}</span>}
                    </div>
                  </div>
                </UICard>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── TASK RUNS (DRILL-DOWN) ──
  if (isTaskRuns) {
    var runs = data.runs || [];
    var stats = data.stats || {};
    var taskName = data.taskName || data.taskId;

    var durationData = runs.filter(function(r) { return r.durationMs > 0; }).slice(0, 20).reverse().map(function(r, i) {
      return {
        idx: i + 1,
        duration: Math.round(r.durationMs / 1000),
        status: r.status
      };
    });

    return (
      <div className="space-y-3">
        <NavBar title={taskName} icon={LucideReact.CalendarClock} iconColor="violet" />

        <div className="flex items-center gap-2">
          <Badge variant={data.taskEnabled === false ? "default" : "success"}>
            {data.taskEnabled === false ? "Disabled" : "Enabled"}
          </Badge>
          {data.taskCron && <span className="text-xs text-zinc-500">{data.taskCron}</span>}
          {data.consecutiveFailures > 0 && (
            <Badge variant={data.consecutiveFailures >= 3 ? "danger" : "warning"}>
              {data.consecutiveFailures} consecutive failures
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Success Rate" value={stats.successRate + "%"} accent={stats.successRate >= 80 ? "emerald" : stats.successRate >= 50 ? "amber" : "red"} />
          <Stat label="Total Runs" value={stats.total || 0} accent="violet" />
          <Stat label="Failures" value={stats.failures || 0} accent={stats.failures > 0 ? "red" : "gray"} />
          <Stat label="Avg Duration" value={formatDuration(stats.avgDurationMs)} accent="blue" />
        </div>

        {durationData.length > 2 && (
          <UICard header="Execution Duration (seconds)">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={durationData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="idx" tick={{ fill: "#999", fontSize: 10 }} label={{ value: "Run #", position: "bottom", fill: "#666", fontSize: 10 }} />
                <YAxis tick={{ fill: "#999", fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: "#1f1f23", border: "1px solid #333", borderRadius: 6 }} />
                <Bar dataKey="duration" name="Duration (s)" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </UICard>
        )}

        {runs.length === 0 ? (
          <EmptyState icon={LucideReact.CalendarOff} title="No runs" description="This task has not been executed yet" />
        ) : (
          <div className="space-y-1">
            {runs.map(function(r, i) {
              var StatusIcon = statusIcon(r.status);
              var isExp = expandedRun === i;
              return (
                <div key={i} className={"p-2 rounded cursor-pointer transition-colors " + (r.status === "failed" || r.status === "timeout" ? "bg-zinc-800/70 hover:bg-zinc-700/70" : "bg-zinc-800/40 hover:bg-zinc-700/40")}
                  onClick={() => setExpandedRun(isExp ? null : i)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={"w-4 h-4 text-" + statusColor(r.status) + "-400"} />
                      <Badge variant={statusColor(r.status)}>{r.status}</Badge>
                      <span className="text-xs text-zinc-500">{formatTime(r.firedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">{formatDuration(r.durationMs)}</span>
                      <LucideReact.ChevronDown className={"w-3 h-3 text-zinc-500 transition-transform " + (isExp ? "rotate-180" : "")} />
                    </div>
                  </div>
                  {isExp && (
                    <div className="mt-2 ml-6 p-2 rounded bg-zinc-900/60 text-xs space-y-1">
                      <div><span className="text-zinc-500">Run ID: </span><span className="text-zinc-300 font-mono">{r.runId}</span></div>
                      <div><span className="text-zinc-500">Fired: </span><span className="text-zinc-300">{r.firedAt ? new Date(r.firedAt).toLocaleString() : "-"}</span></div>
                      <div><span className="text-zinc-500">Completed: </span><span className="text-zinc-300">{r.completedAt ? new Date(r.completedAt).toLocaleString() : "-"}</span></div>
                      <div><span className="text-zinc-500">Duration: </span><span className="text-zinc-300">{formatDuration(r.durationMs)}</span></div>
                      {r.errorCategory && <div><span className="text-zinc-500">Error Type: </span><Badge variant="warning">{r.errorCategory}</Badge></div>}
                      {r.severity && <div><span className="text-zinc-500">Severity: </span><Badge variant={r.severity === "critical" ? "danger" : r.severity === "error" ? "danger" : "warning"}>{r.severity}</Badge></div>}
                      {r.error && <div><span className="text-zinc-500">Error: </span><span className="text-red-300 font-mono">{r.error}</span></div>}
                      {r.resultSummary && <div><span className="text-zinc-500">Result: </span><span className="text-zinc-300">{r.resultSummary}</span></div>}
                      {r.circuitBroken && <div className="text-red-400 font-medium mt-1">Circuit breaker triggered — task auto-disabled</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" icon={LucideReact.RefreshCw} onClick={() => onAction("task_runs", { taskId: data.taskId, count: 50 })}>Load More</Button>
          <Button variant="outline" icon={LucideReact.List} onClick={() => onAction("task_list")}>All Tasks</Button>
        </div>
      </div>
    );
  }

  // ── FAILURE ANALYSIS ──
  if (isFailureAnalysis) {
    var byCategory = data.byCategory || [];
    var bySeverity = data.bySeverity || {};
    var worstTasks = data.worstTasks || [];
    var dailyTrend = data.dailyTrend || [];

    var catChartData = byCategory.map(function(c) { return { name: c.category, value: c.count }; });
    var CAT_COLORS = { timeout: "#f59e0b", crash: "#ef4444", "tool-error": "#f97316", network: "#3b82f6", auth: "#8b5cf6", unknown: "#6b7280" };

    return (
      <div className="space-y-3">
        <NavBar title="Failure Analysis" icon={LucideReact.TrendingDown} iconColor="red" badge={data.totalFailures + " failures"} />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Total Failures" value={data.totalFailures || 0} accent="red" />
          <Stat label="Failure Rate" value={(data.failureRate || 0) + "%"} accent={data.failureRate > 20 ? "red" : data.failureRate > 10 ? "amber" : "emerald"} />
          <Stat label="Critical" value={bySeverity.critical || 0} accent="rose" />
          <Stat label="Warnings" value={bySeverity.warning || 0} accent="amber" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {catChartData.length > 0 && (
            <UICard header="By Error Category">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={catChartData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3} dataKey="value" nameKey="name">
                    {catChartData.map(function(entry, i) {
                      return <Cell key={i} fill={CAT_COLORS[entry.name] || "#6b7280"} />;
                    })}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#1f1f23", border: "1px solid #333", borderRadius: 6 }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </UICard>
          )}

          {worstTasks.length > 0 && (
            <UICard header="Most Failing Tasks">
              <div className="space-y-2">
                {worstTasks.slice(0, 5).map(function(t, i) {
                  return (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-zinc-800/50 cursor-pointer hover:bg-zinc-700/50"
                      onClick={() => onAction("task_runs", { taskId: t.taskId })}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200">{t.name}</div>
                        {t.lastError && <div className="text-xs text-red-400 truncate">{t.lastError}</div>}
                      </div>
                      <Badge variant="danger">{t.failures}x</Badge>
                    </div>
                  );
                })}
              </div>
            </UICard>
          )}
        </div>

        {dailyTrend.length > 1 && (
          <UICard header="Daily Success vs Failure">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyTrend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" tick={{ fill: "#999", fontSize: 10 }} tickFormatter={function(v) { return v.slice(5); }} />
                <YAxis tick={{ fill: "#999", fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "#1f1f23", border: "1px solid #333", borderRadius: 6 }} />
                <Bar dataKey="successes" stackId="a" fill="#10b981" name="Success" />
                <Bar dataKey="failures" stackId="a" fill="#ef4444" name="Failure" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </UICard>
        )}

        <div className="flex gap-2 flex-wrap">
          {[3, 7, 14, 30].map(function(d) {
            return (
              <Button key={d} variant={daysWindow === d ? "primary" : "ghost"} size="sm"
                onClick={() => { setDaysWindow(d); onAction("failure_analysis", { days: d }); }}>
                {d}d
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── TIMELINE ──
  if (isTimeline) {
    var execs = data.executions || [];
    var summary = data.summary || {};

    return (
      <div className="space-y-3">
        <NavBar title="Execution Timeline" icon={LucideReact.Activity} iconColor="blue" badge={summary.total + " runs"} />

        <div className="grid grid-cols-4 gap-2">
          <Stat label="Total" value={summary.total || 0} accent="blue" />
          <Stat label="Success" value={summary.successes || 0} accent="emerald" />
          <Stat label="Failed" value={summary.failures || 0} accent={summary.failures > 0 ? "red" : "gray"} />
          <Stat label="Timeout" value={summary.timeouts || 0} accent={summary.timeouts > 0 ? "amber" : "gray"} />
        </div>

        {execs.length === 0 ? (
          <EmptyState icon={LucideReact.CalendarOff} title="No executions" description={"No task executions in the last " + (data.hours || 24) + " hours"} />
        ) : (
          <div className="space-y-1">
            {execs.map(function(e, i) {
              var StatusIcon = statusIcon(e.status);
              return (
                <div key={i} className="flex items-center gap-2 p-2 rounded bg-zinc-800/40 hover:bg-zinc-700/40 cursor-pointer"
                  onClick={() => onAction("task_runs", { taskId: e.taskId })}>
                  <StatusIcon className={"w-4 h-4 flex-shrink-0 text-" + statusColor(e.status) + "-400"} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200">{e.taskName}</div>
                    <div className="flex gap-2 text-xs text-zinc-500">
                      <span>{formatTime(e.firedAt)}</span>
                      <span>{formatDuration(e.durationMs)}</span>
                      {e.errorCategory && <Badge variant="warning" size="sm">{e.errorCategory}</Badge>}
                    </div>
                  </div>
                  <Badge variant={statusColor(e.status)}>{e.status}</Badge>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {[6, 12, 24, 48, 168].map(function(h) {
            return (
              <Button key={h} variant={hoursWindow === h ? "primary" : "ghost"} size="sm"
                onClick={() => { setHoursWindow(h); onAction("timeline", { hours: h }); }}>
                {h <= 48 ? h + "h" : "7d"}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── HEALTH REPORT ──
  if (isHealthReport) {
    var taskScores = data.taskScores || [];
    var risks = data.risks || [];
    var recs = data.recommendations || [];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.HeartPulse className="w-5 h-5 text-emerald-400" />
            <span className="text-lg font-semibold text-white">Task Health Report</span>
          </div>
          <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={() => onAction("overview")}>Dashboard</Button>
        </div>

        <div className="flex items-center gap-4">
          <ScoreRing score={data.overallScore || 0} size={96} />
          <div className="flex-1">
            <div className="text-lg font-semibold text-white mb-1">
              {(data.healthLevel || "unknown").charAt(0).toUpperCase() + (data.healthLevel || "").slice(1)}
            </div>
            <div className="text-sm text-zinc-400">{data.totalTasks || 0} tasks monitored</div>
            <div className="flex gap-3 mt-1 text-xs">
              <span className="text-emerald-400">{taskScores.filter(function(t) { return t.status === "healthy"; }).length} healthy</span>
              <span className="text-amber-400">{taskScores.filter(function(t) { return t.status === "at-risk" || t.status === "degraded"; }).length} at risk</span>
              <span className="text-red-400">{taskScores.filter(function(t) { return t.status === "broken"; }).length} broken</span>
            </div>
          </div>
        </div>

        {risks.length > 0 && (
          <UICard accent="rose" header={"Risks (" + risks.length + ")"}>
            <div className="space-y-2">
              {risks.map(function(r, i) {
                var RiskIcon = riskIcon(r.level);
                var riskColor = r.level === "critical" ? "rose" : r.level === "high" ? "red" : "amber";
                return (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-zinc-800/50 cursor-pointer hover:bg-zinc-700/50"
                    onClick={() => onAction("task_runs", { taskId: r.taskId })}>
                    <RiskIcon className={"w-4 h-4 mt-0.5 flex-shrink-0 text-" + riskColor + "-400"} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-zinc-200">{r.task}</span>
                        <Badge variant={r.level === "critical" ? "danger" : r.level === "high" ? "danger" : "warning"}>
                          {r.level}
                        </Badge>
                      </div>
                      <div className="text-xs text-zinc-400">{r.reason}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {recs.length > 0 && (
          <UICard header="Recommendations">
            <div className="space-y-2">
              {recs.map(function(r, i) {
                var isUrgent = r.startsWith("URGENT");
                return (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    {isUrgent ? <LucideReact.AlertOctagon className="w-4 h-4 mt-0.5 text-red-400 flex-shrink-0" /> : <LucideReact.ArrowRight className="w-4 h-4 mt-0.5 text-violet-400 flex-shrink-0" />}
                    <span className={isUrgent ? "text-red-300" : "text-zinc-300"}>{r}</span>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        <UICard header="Per-Task Scores">
          <div className="space-y-2">
            {taskScores.map(function(t, i) {
              var barColor = t.score >= 80 ? "bg-emerald-500" : t.score >= 50 ? "bg-amber-500" : t.score > 0 ? "bg-orange-500" : "bg-red-500";
              return (
                <div key={i} className="cursor-pointer hover:bg-zinc-800/40 p-1.5 rounded" onClick={() => onAction("task_runs", { taskId: t.taskId })}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-200">{t.name}</span>
                      {!t.enabled && <Badge variant="default" size="sm">Off</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">{t.reliability}% reliable</span>
                      <span className="text-sm font-bold text-white">{t.score}</span>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5">
                    <div className={"h-1.5 rounded-full " + barColor} style={{ width: Math.max(t.score, 2) + "%" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </UICard>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" icon={LucideReact.RefreshCw} onClick={() => onAction("health_report")}>Refresh</Button>
          <Button variant="outline" icon={LucideReact.TrendingDown} onClick={() => onAction("failure_analysis")}>Failure Analysis</Button>
          <Button variant="outline" icon={LucideReact.Activity} onClick={() => onAction("timeline")}>Timeline</Button>
        </div>
      </div>
    );
  }

  // ── FALLBACK ──
  return (
    <EmptyState
      icon={LucideReact.CalendarClock}
      title="Task Health Dashboard"
      description="Monitor scheduled task health, failures, and execution history"
      action={<Button onClick={() => onAction("overview")}>Open Dashboard</Button>}
    />
  );
}
