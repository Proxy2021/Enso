export default function GeneratedUI({ data, onAction }) {
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [hoursWindow, setHoursWindow] = useState(24);
  const [expandedError, setExpandedError] = useState(null);
  const [activityType, setActivityType] = useState("all");
  const [expandedCluster, setExpandedCluster] = useState(null);
  const [expandedAction, setExpandedAction] = useState(null);
  const [expandedAlert, setExpandedAlert] = useState(null);

  const isOverview = data?.tool === "enso_error_monitor_overview";
  const isErrors = data?.tool === "enso_error_monitor_errors";
  const isTrends = data?.tool === "enso_error_monitor_trends";
  const isCategories = data?.tool === "enso_error_monitor_categories";
  const isFixes = data?.tool === "enso_error_monitor_fixes";
  const isActivity = data?.tool === "enso_error_monitor_activity";
  const isCircuitBreakers = data?.tool === "enso_error_monitor_circuit_breakers";
  const isHealthCheck = data?.tool === "enso_error_monitor_health_check";
  const isErrorCodes = data?.tool === "enso_error_monitor_error_codes";
  const isRecurring = data?.tool === "enso_error_monitor_recurring";
  const isTlReport = data?.tool === "enso_error_monitor_tl_report";
  const isAlertStatus = data?.tool === "enso_error_monitor_alert_status";

  const severityColor = (sev) => {
    if (sev === "critical") return "rose";
    if (sev === "error") return "red";
    if (sev === "warning") return "amber";
    if (sev === "info") return "blue";
    return "gray";
  };

  const severityIcon = (sev) => {
    if (sev === "critical") return LucideReact.AlertOctagon;
    if (sev === "error") return LucideReact.AlertCircle;
    if (sev === "warning") return LucideReact.AlertTriangle;
    if (sev === "info") return LucideReact.Info;
    return LucideReact.Circle;
  };

  const typeIcon = (type) => {
    if (type === "error") return LucideReact.AlertCircle;
    if (type === "action") return LucideReact.Zap;
    if (type === "build") return LucideReact.Hammer;
    if (type === "system") return LucideReact.Server;
    if (type === "claude-code") return LucideReact.Code;
    if (type === "fix") return LucideReact.Wrench;
    return LucideReact.Activity;
  };

  const formatTime = (ts) => {
    if (!ts) return "-";
    var d = new Date(ts);
    var now = new Date();
    var diff = now - d;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const NavBar = ({ title, icon: Icon, iconColor, badge, badgeVariant }) => (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className={"w-5 h-5 text-" + (iconColor || "zinc") + "-400"} />}
        <span className="text-lg font-semibold text-white">{title}</span>
        {badge != null && <Badge variant={badgeVariant || "outline"}>{badge}</Badge>}
      </div>
      <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={() => onAction("overview")}>Back</Button>
    </div>
  );

  // ── HEALTH CHECK (new primary TL view) ──
  if (isHealthCheck) {
    var score = data.score || 0;
    var level = data.healthLevel || "unknown";
    var recs = data.recommendations || [];
    var codes = data.errorCodes || [];
    var clusters = data.clusters || [];
    var cb = data.circuitBreakers || {};
    var sum = data.summary || {};
    var sev = sum.bySeverity || {};
    var fixes = data.fixes || {};

    var scoreColor = score >= 90 ? "#10b981" : score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : score >= 30 ? "#f97316" : "#ef4444";
    var scoreAccent = score >= 90 ? "emerald" : score >= 70 ? "emerald" : score >= 50 ? "amber" : score >= 30 ? "orange" : "rose";

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.HeartPulse className="w-5 h-5 text-emerald-400" />
            <span className="text-lg font-semibold text-white">System Health</span>
          </div>
          <Badge variant={score >= 70 ? "success" : score >= 50 ? "warning" : "danger"}>
            {level.charAt(0).toUpperCase() + level.slice(1)}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative w-24 h-24 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#27272a" strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="8"
                strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - score / 100)}
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">{score}</span>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Stat label="Total Errors" value={sum.total || 0} accent={scoreAccent} />
            <Stat label="Critical" value={sev.critical || 0} accent="rose" />
            <Stat label="Circuits Open" value={cb.open || 0} accent={cb.open > 0 ? "rose" : "emerald"} />
            <Stat label="Unacked Fixes" value={fixes.unacknowledged || 0} accent={fixes.unacknowledged > 0 ? "amber" : "gray"} />
          </div>
        </div>

        {recs.length > 0 && (
          <UICard header="Recommendations" accent={score >= 70 ? "emerald" : "amber"}>
            <div className="space-y-2">
              {recs.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <LucideReact.ArrowRight className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
                  <span className="text-zinc-300">{r}</span>
                </div>
              ))}
            </div>
          </UICard>
        )}

        {cb.states && cb.states.length > 0 && (
          <UICard header="Circuit Breakers">
            <div className="flex gap-3">
              {cb.states.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={"w-2.5 h-2.5 rounded-full " + (b.state === "closed" ? "bg-emerald-400" : b.state === "open" ? "bg-red-400 animate-pulse" : "bg-amber-400")} />
                  <span className="text-sm text-zinc-300">{b.name}</span>
                  <Badge variant={b.state === "closed" ? "success" : b.state === "open" ? "danger" : "warning"} size="sm">
                    {b.state}
                  </Badge>
                </div>
              ))}
            </div>
          </UICard>
        )}

        {clusters.length > 0 && (
          <UICard header={"Recurring Patterns (" + clusters.length + ")"}>
            <div className="space-y-2">
              {clusters.slice(0, 5).map((c, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-zinc-800/50">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{c.message}</div>
                    <div className="text-xs text-zinc-500">{c.category} · every {c.frequency}</div>
                  </div>
                  <Badge variant="danger">{c.count}x</Badge>
                </div>
              ))}
            </div>
          </UICard>
        )}

        {codes.length > 0 && (
          <UICard header="Top Error Codes">
            <div className="space-y-1">
              {codes.slice(0, 5).map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-1.5 rounded hover:bg-zinc-800/40 cursor-pointer"
                  onClick={() => onAction("error_codes", { code: c.code })}>
                  <span className="text-zinc-300 font-mono text-xs">{c.code}</span>
                  <Badge variant="outline">{c.count}</Badge>
                </div>
              ))}
            </div>
          </UICard>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" icon={LucideReact.FileText} onClick={() => onAction("tl_report")}>TL Report</Button>
          <Button variant="outline" icon={LucideReact.Bell} onClick={() => onAction("alert_status")}>Alerts</Button>
          <Button variant="outline" icon={LucideReact.Activity} onClick={() => onAction("overview")}>Overview</Button>
          <Button variant="outline" icon={LucideReact.TrendingUp} onClick={() => onAction("trends")}>Trends</Button>
          <Button variant="outline" icon={LucideReact.Repeat} onClick={() => onAction("recurring")}>Recurring</Button>
          <Button variant="outline" icon={LucideReact.Shield} onClick={() => onAction("circuit_breakers")}>Circuits</Button>
          <Button variant="outline" icon={LucideReact.Code} onClick={() => onAction("error_codes")}>Codes</Button>
        </div>
      </div>
    );
  }

  // ── OVERVIEW ──
  if (isOverview) {
    const s = data.summary || {};
    const sev = s.bySeverity || {};
    const cats = (s.byCategory || []).slice(0, 8);
    const recent = (s.recentErrors || []).slice(0, 5);
    const fixes = data.fixes || {};
    const hasErrors = s.total > 0;

    const healthStatus = sev.critical > 0 ? "Critical" : sev.error > 5 ? "Degraded" : sev.error > 0 ? "Fair" : "Healthy";
    const healthColor = sev.critical > 0 ? "rose" : sev.error > 5 ? "amber" : sev.error > 0 ? "orange" : "emerald";

    const pieData = Object.entries(sev).filter(([_, v]) => v > 0).map(([k, v]) => ({ name: k, value: v }));
    const COLORS = { critical: "#f43f5e", error: "#ef4444", warning: "#f59e0b", info: "#3b82f6" };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.Activity className="w-5 h-5 text-red-400" />
            <span className="text-lg font-semibold text-white">Error Monitor</span>
          </div>
          <Badge variant={healthColor === "emerald" ? "success" : healthColor === "rose" ? "danger" : "warning"}>
            {healthStatus}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Total Errors" value={s.total || 0} accent={healthColor} />
          <Stat label="Critical" value={sev.critical || 0} accent="rose" />
          <Stat label="Errors" value={sev.error || 0} accent="red" />
          <Stat label="Warnings" value={sev.warning || 0} accent="amber" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pieData.length > 0 && (
            <UICard header="Severity Distribution">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" nameKey="name">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={COLORS[entry.name] || "#6b7280"} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </UICard>
          )}

          <UICard header="Top Error Sources">
            {cats.length === 0 ? (
              <EmptyState icon={LucideReact.CheckCircle} title="No errors" description="All clear!" />
            ) : (
              <div className="space-y-2">
                {cats.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300 truncate flex-1">{c.category}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{c.count}</Badge>
                      <span className="text-zinc-500 text-xs">{formatTime(c.lastSeen)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </UICard>
        </div>

        {recent.length > 0 && (
          <UICard header="Recent Errors">
            <div className="space-y-2">
              {recent.map((e, i) => {
                const SevIcon = severityIcon(e.severity);
                return (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-zinc-800/50">
                    <SevIcon className={"w-4 h-4 mt-0.5 text-" + severityColor(e.severity) + "-400"} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200 truncate">{e.message}</div>
                      <div className="text-xs text-zinc-500 flex gap-2">
                        <span>{e.category}</span>
                        <span>{formatTime(e.ts)}</span>
                        {e.code && <span className="font-mono text-zinc-600">{e.code}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {fixes.unacknowledged > 0 && (
          <div className="flex items-center gap-2 p-2 rounded bg-emerald-900/30 border border-emerald-800">
            <LucideReact.Wrench className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-emerald-300">{fixes.unacknowledged} unacknowledged fix{fixes.unacknowledged !== 1 ? "es" : ""}</span>
            <Button variant="ghost" size="sm" onClick={() => onAction("fixes")}>View</Button>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button variant="primary" icon={LucideReact.HeartPulse} onClick={() => onAction("health_check")}>Health Check</Button>
          <Button variant="primary" icon={LucideReact.FileText} onClick={() => onAction("tl_report")}>TL Report</Button>
          <Button variant="outline" icon={LucideReact.Bell} onClick={() => onAction("alert_status")}>Alerts</Button>
          <Button variant="outline" icon={LucideReact.List} onClick={() => onAction("errors")}>Error Log</Button>
          <Button variant="outline" icon={LucideReact.TrendingUp} onClick={() => onAction("trends")}>Trends</Button>
          <Button variant="outline" icon={LucideReact.BarChart3} onClick={() => onAction("categories")}>Categories</Button>
          <Button variant="outline" icon={LucideReact.Shield} onClick={() => onAction("circuit_breakers")}>Circuits</Button>
          <Button variant="outline" icon={LucideReact.Code} onClick={() => onAction("error_codes")}>Codes</Button>
          <Button variant="outline" icon={LucideReact.Repeat} onClick={() => onAction("recurring")}>Recurring</Button>
          <Button variant="outline" icon={LucideReact.Wrench} onClick={() => onAction("fixes")}>Fixes</Button>
          <Button variant="outline" icon={LucideReact.Activity} onClick={() => onAction("activity")}>Activity</Button>
        </div>
      </div>
    );
  }

  // ── ERRORS LIST ──
  if (isErrors) {
    const entries = data.entries || [];
    const severities = ["all", "critical", "error", "warning", "info"];

    return (
      <div className="space-y-3">
        <NavBar title="Error Log" icon={LucideReact.AlertCircle} iconColor="red" badge={data.total + " entries"} />

        <div className="flex gap-1 flex-wrap">
          {severities.map(s => (
            <Button
              key={s}
              variant={selectedSeverity === s ? "primary" : "ghost"}
              size="sm"
              onClick={() => { setSelectedSeverity(s); onAction("errors", { severity: s }); }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>

        {entries.length === 0 ? (
          <EmptyState icon={LucideReact.CheckCircle} title="No errors" description="No errors matching this filter" />
        ) : (
          <div className="space-y-1">
            {entries.map((e, i) => {
              const SevIcon = severityIcon(e.severity);
              const isExpanded = expandedError === i;
              return (
                <div key={i}
                  className="p-2 rounded bg-zinc-800/60 cursor-pointer hover:bg-zinc-700/60 transition-colors"
                  onClick={() => setExpandedError(isExpanded ? null : i)}
                >
                  <div className="flex items-start gap-2">
                    <SevIcon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: e.severity === "critical" ? "#f43f5e" : e.severity === "error" ? "#ef4444" : e.severity === "warning" ? "#f59e0b" : "#3b82f6" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200">{e.message}</div>
                      <div className="text-xs text-zinc-500 flex gap-2 mt-0.5">
                        <Badge variant={severityColor(e.severity)} size="sm">{e.severity || "error"}</Badge>
                        <span>{e.category}</span>
                        <span>{formatTime(e.ts)}</span>
                      </div>
                    </div>
                    <LucideReact.ChevronDown className={"w-4 h-4 text-zinc-500 transition-transform " + (isExpanded ? "rotate-180" : "")} />
                  </div>
                  {isExpanded && (
                    <div className="mt-2 ml-6 p-2 rounded bg-zinc-900/60 text-xs space-y-1">
                      {e.code && <div><span className="text-zinc-500">Code: </span><span className="text-amber-300 font-mono">{e.code}</span></div>}
                      {e.error && <div><span className="text-zinc-500">Error: </span><span className="text-red-300 font-mono">{e.error}</span></div>}
                      {e.fingerprint && <div><span className="text-zinc-500">Fingerprint: </span><span className="text-zinc-400 font-mono">{e.fingerprint}</span></div>}
                      {e.requestId && <div><span className="text-zinc-500">Request ID: </span><span className="text-zinc-300 font-mono">{e.requestId}</span></div>}
                      {e.cardId && <div><span className="text-zinc-500">Card ID: </span><span className="text-zinc-300 font-mono">{e.cardId}</span></div>}
                      {e.toolFamily && <div><span className="text-zinc-500">Tool: </span><span className="text-zinc-300">{e.toolFamily}</span></div>}
                      {e.stack && <div><span className="text-zinc-500">Stack: </span><pre className="text-zinc-400 font-mono text-xs mt-1 overflow-x-auto whitespace-pre-wrap">{e.stack}</pre></div>}
                      <div><span className="text-zinc-500">Time: </span><span className="text-zinc-300">{new Date(e.ts).toLocaleString()}</span></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── TRENDS ──
  if (isTrends) {
    const buckets = data.buckets || [];
    const displayBuckets = buckets.map(b => ({
      ...b,
      label: b.hour ? b.hour.slice(11, 16) : ""
    }));

    return (
      <div className="space-y-3">
        <NavBar title="Error Trends" icon={LucideReact.TrendingUp} iconColor="amber" badge={(data.hours || 24) + "h window"} />

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Total" value={data.totalErrors || 0} accent="red" />
          <Stat label="Avg/hour" value={data.average || 0} accent="amber" />
          <Stat label="Peak Hour" value={data.peak?.hour ? data.peak.hour.slice(11, 16) : "-"} accent="rose" />
        </div>

        {displayBuckets.length > 0 && (
          <UICard header="Errors Over Time">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={displayBuckets} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="label" tick={{ fill: "#999", fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#999", fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "#1f1f23", border: "1px solid #333", borderRadius: 6 }} />
                <Bar dataKey="critical" stackId="a" fill="#f43f5e" name="Critical" />
                <Bar dataKey="error" stackId="a" fill="#ef4444" name="Error" />
                <Bar dataKey="warning" stackId="a" fill="#f59e0b" name="Warning" />
                <Bar dataKey="info" stackId="a" fill="#3b82f6" name="Info" />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </UICard>
        )}

        <div className="flex gap-2">
          {[6, 12, 24, 48, 168].map(h => (
            <Button key={h} variant={hoursWindow === h ? "primary" : "ghost"} size="sm"
              onClick={() => { setHoursWindow(h); onAction("trends", { hours: h }); }}>
              {h <= 48 ? h + "h" : "7d"}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // ── CATEGORIES ──
  if (isCategories) {
    const cats = data.categories || [];

    return (
      <div className="space-y-3">
        <NavBar title="Error Categories" icon={LucideReact.BarChart3} iconColor="purple" badge={(data.totalCategories || 0) + " sources"} />

        <Stat label="Total Errors" value={data.totalErrors || 0} accent="red" />

        {cats.length === 0 ? (
          <EmptyState icon={LucideReact.CheckCircle} title="No errors" description="No error categories found" />
        ) : (
          <div className="space-y-2">
            {cats.map((c, i) => {
              var maxCount = cats[0]?.count || 1;
              var pct = (c.count / maxCount) * 100;
              return (
                <UICard key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-zinc-200">{c.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{c.count}</span>
                      <span className="text-xs text-zinc-500">{c.percentage}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2 mb-2">
                    <div className="h-2 rounded-full bg-gradient-to-r from-red-500 to-amber-500" style={{ width: pct + "%" }} />
                  </div>
                  <div className="flex gap-2 text-xs">
                    {c.critical > 0 && <Badge variant="danger">{c.critical} critical</Badge>}
                    {c.error > 0 && <Badge variant="danger">{c.error} error</Badge>}
                    {c.warning > 0 && <Badge variant="warning">{c.warning} warn</Badge>}
                    {c.info > 0 && <Badge variant="info">{c.info} info</Badge>}
                    <span className="text-zinc-500 ml-auto">{formatTime(c.lastSeen)}</span>
                  </div>
                </UICard>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── FIXES ──
  if (isFixes) {
    const fixes = data.fixes || [];

    return (
      <div className="space-y-3">
        <NavBar title="Bug Fixes" icon={LucideReact.Wrench} iconColor="emerald"
          badge={data.total || 0}
          badgeVariant={data.unacknowledged > 0 ? "warning" : "outline"} />

        {fixes.length === 0 ? (
          <EmptyState icon={LucideReact.Wrench} title="No fixes recorded" description="Bug fixes will appear here when auto-fix resolves issues" />
        ) : (
          <div className="space-y-2">
            {fixes.map((f, i) => (
              <UICard key={i} accent={f.acknowledged ? "gray" : "emerald"}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-zinc-200">{f.description || f.message}</div>
                    {f.error && <div className="text-xs text-red-400 font-mono mt-1">{f.error}</div>}
                    {f.resolution && <div className="text-xs text-emerald-400 mt-1">→ {f.resolution}</div>}
                    <div className="text-xs text-zinc-500 mt-1 flex gap-2">
                      <span>{f.category}</span>
                      <span>{formatTime(f.timestamp || f.ts)}</span>
                    </div>
                  </div>
                  <Badge variant={f.acknowledged ? "default" : "success"}>
                    {f.acknowledged ? "Ack" : "New"}
                  </Badge>
                </div>
              </UICard>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── ACTIVITY LOG ──
  if (isActivity) {
    const entries = data.entries || [];
    const types = ["all", "action", "error", "fix", "build", "system", "claude-code"];

    return (
      <div className="space-y-3">
        <NavBar title="Activity Log" icon={LucideReact.Activity} iconColor="blue" badge={data.total + " entries"} />

        <div className="flex gap-1 flex-wrap">
          {types.map(t => (
            <Button key={t} variant={activityType === t ? "primary" : "ghost"} size="sm"
              onClick={() => { setActivityType(t); onAction("activity", { type: t }); }}>
              {t === "claude-code" ? "Claude" : t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>

        {entries.length === 0 ? (
          <EmptyState icon={LucideReact.Activity} title="No activity" description="No log entries matching this filter" />
        ) : (
          <div className="space-y-1">
            {entries.map((e, i) => {
              const TypeIcon = typeIcon(e.type);
              const iconColor = e.type === "error" ? "#ef4444" : e.type === "fix" ? "#10b981" : e.type === "build" ? "#f59e0b" : e.type === "system" ? "#8b5cf6" : e.type === "claude-code" ? "#06b6d4" : "#6b7280";
              return (
                <div key={i} className="flex items-start gap-2 p-2 rounded bg-zinc-800/40 hover:bg-zinc-700/40 transition-colors">
                  <TypeIcon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: iconColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate">{e.message}</div>
                    <div className="text-xs text-zinc-500 flex gap-2">
                      <Badge variant="outline" size="sm">{e.type}</Badge>
                      <span>{e.category}</span>
                      <span>{formatTime(e.ts)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── CIRCUIT BREAKERS ──
  if (isCircuitBreakers) {
    var breakers = data.breakers || [];
    var health = data.overallHealth || "unknown";

    return (
      <div className="space-y-3">
        <NavBar title="Circuit Breakers" icon={LucideReact.Shield} iconColor="violet" />

        <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/60">
          <div className={"w-4 h-4 rounded-full " + (health === "healthy" ? "bg-emerald-400" : health === "degraded" ? "bg-red-400 animate-pulse" : "bg-amber-400")} />
          <div>
            <div className="text-sm font-medium text-white">Overall: {health.charAt(0).toUpperCase() + health.slice(1)}</div>
            <div className="text-xs text-zinc-500">Error rate (last hour): {data.recentErrorRate || 0}</div>
          </div>
        </div>

        {breakers.length === 0 ? (
          <EmptyState icon={LucideReact.Shield} title="No circuit breakers" description="Circuit breaker data unavailable" />
        ) : (
          <div className="space-y-3">
            {breakers.map((b, i) => (
              <UICard key={i} accent={b.state === "closed" ? "emerald" : b.state === "open" ? "rose" : "amber"}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <LucideReact.Cpu className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm font-semibold text-white">{b.name}</span>
                  </div>
                  <Badge variant={b.state === "closed" ? "success" : b.state === "open" ? "danger" : "warning"}>
                    {b.state.toUpperCase()}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-zinc-500">Failures: </span><span className="text-zinc-300">{b.failures}</span></div>
                  <div><span className="text-zinc-500">Last failure: </span><span className="text-zinc-300">{b.lastFailureTime > 0 ? formatTime(b.lastFailureTime) : "never"}</span></div>
                </div>
                {b.state === "open" && (
                  <div className="mt-2 p-2 rounded bg-red-900/20 border border-red-800/50 text-xs text-red-300">
                    Service unavailable — requests will use fallback until circuit resets
                  </div>
                )}
                {b.state === "half-open" && (
                  <div className="mt-2 p-2 rounded bg-amber-900/20 border border-amber-800/50 text-xs text-amber-300">
                    Probing — sending test requests to check if service recovered
                  </div>
                )}
              </UICard>
            ))}
          </div>
        )}

        <Button variant="outline" icon={LucideReact.RefreshCw} onClick={() => onAction("circuit_breakers")}>Refresh</Button>
      </div>
    );
  }

  // ── ERROR CODES ──
  if (isErrorCodes) {
    var codes = data.codes || [];

    return (
      <div className="space-y-3">
        <NavBar title={data.codeFilter ? "Code: " + data.codeFilter : "Error Codes"}
          icon={LucideReact.Code} iconColor="cyan"
          badge={(data.totalCodes || 0) + " types"} />

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Total Codes" value={data.totalCodes || 0} accent="cyan" />
          <Stat label="Total Errors" value={data.totalErrors || 0} accent="red" />
        </div>

        {codes.length === 0 ? (
          <EmptyState icon={LucideReact.Code} title="No error codes" description="No structured error codes found in this window" />
        ) : (
          <div className="space-y-2">
            {codes.map((c, i) => {
              var maxCount = codes[0]?.count || 1;
              var barPct = (c.count / maxCount) * 100;
              return (
                <UICard key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-mono text-cyan-300">{c.code}</span>
                    <Badge variant={c.critical > 0 ? "danger" : c.error > 0 ? "warning" : "info"}>{c.count}</Badge>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 mb-2">
                    <div className="h-1.5 rounded-full bg-cyan-500" style={{ width: barPct + "%" }} />
                  </div>
                  <div className="flex gap-2 text-xs flex-wrap">
                    {c.critical > 0 && <Badge variant="danger" size="sm">{c.critical} critical</Badge>}
                    {c.error > 0 && <Badge variant="danger" size="sm">{c.error} error</Badge>}
                    {c.warning > 0 && <Badge variant="warning" size="sm">{c.warning} warn</Badge>}
                    {c.info > 0 && <Badge variant="info" size="sm">{c.info} info</Badge>}
                  </div>
                  {c.topCategories && c.topCategories.length > 0 && (
                    <div className="mt-2 text-xs text-zinc-500">
                      Sources: {c.topCategories.map(function(tc) { return tc.category + " (" + tc.count + ")"; }).join(", ")}
                    </div>
                  )}
                  {c.sampleMessages && c.sampleMessages.length > 0 && (
                    <div className="mt-1 text-xs text-zinc-400 italic truncate">{c.sampleMessages[0]}</div>
                  )}
                  <div className="mt-1 text-xs text-zinc-600">
                    First: {formatTime(c.firstSeen)} · Last: {formatTime(c.lastSeen)}
                  </div>
                </UICard>
              );
            })}
          </div>
        )}

        {data.codeFilter && (
          <Button variant="outline" icon={LucideReact.X} onClick={() => onAction("error_codes")}>Clear Filter</Button>
        )}
      </div>
    );
  }

  // ── RECURRING PATTERNS ──
  if (isRecurring) {
    var patterns = data.patterns || [];

    return (
      <div className="space-y-3">
        <NavBar title="Recurring Errors" icon={LucideReact.Repeat} iconColor="orange"
          badge={(data.totalPatterns || 0) + " patterns"} />

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Patterns" value={data.totalPatterns || 0} accent="orange" />
          <Stat label="Total Errors" value={data.totalErrors || 0} accent="red" />
          <Stat label="Unique" value={data.uniqueErrors || 0} accent="blue" />
        </div>

        {patterns.length === 0 ? (
          <EmptyState icon={LucideReact.CheckCircle} title="No recurring patterns" description="No repeated errors detected — each error is unique" />
        ) : (
          <div className="space-y-2">
            {patterns.map((p, i) => {
              var isExp = expandedCluster === i;
              return (
                <UICard key={i} accent={p.severity === "critical" ? "rose" : p.severity === "error" ? "red" : "amber"}>
                  <div className="cursor-pointer" onClick={() => setExpandedCluster(isExp ? null : i)}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200">{p.message}</div>
                        <div className="flex gap-2 text-xs mt-1 items-center">
                          <Badge variant={severityColor(p.severity)} size="sm">{p.severity}</Badge>
                          <span className="text-zinc-500">{p.category}</span>
                          {p.code && <span className="text-zinc-500 font-mono">{p.code}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <Badge variant="danger">{p.count}x</Badge>
                        <LucideReact.ChevronDown className={"w-4 h-4 text-zinc-500 transition-transform " + (isExp ? "rotate-180" : "")} />
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs text-zinc-500 mt-1">
                      <span>Every: {p.frequency}</span>
                      <span>First: {formatTime(p.firstSeen)}</span>
                      <span>Last: {formatTime(p.lastSeen)}</span>
                    </div>
                  </div>
                  {isExp && p.occurrences && (
                    <div className="mt-2 pt-2 border-t border-zinc-700/50 space-y-1">
                      <div className="text-xs text-zinc-500 mb-1">Recent occurrences:</div>
                      {p.occurrences.map((o, j) => (
                        <div key={j} className="text-xs flex gap-2 p-1 rounded bg-zinc-900/40">
                          <span className="text-zinc-500 flex-shrink-0">{formatTime(o.ts)}</span>
                          <span className="text-zinc-400 truncate">{o.message}</span>
                        </div>
                      ))}
                      {p.fingerprint && (
                        <div className="text-xs text-zinc-600 mt-1">Fingerprint: {p.fingerprint}</div>
                      )}
                    </div>
                  )}
                </UICard>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── TL REPORT ──
  if (isTlReport) {
    var score = data.score || 0;
    var level = data.healthLevel || "unknown";
    var sum = data.summary || {};
    var sev = sum.bySeverity || {};
    var actions = data.actions || [];
    var trend = data.hourlyTrend || [];
    var spikes = data.spikes || [];
    var topCodes = data.topCodes || [];
    var recurring = data.recurring || [];
    var cbs = data.circuitBreakers || [];
    var fixes = data.fixes || {};
    var trendDir = sum.trendDirection || 0;
    var erRate = data.errorRate || {};

    var scoreColor = score >= 90 ? "#10b981" : score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : score >= 30 ? "#f97316" : "#ef4444";
    var trendColor = trendDir > 50 ? "rose" : trendDir > 20 ? "amber" : trendDir < -20 ? "emerald" : "gray";
    var trendArrow = trendDir > 0 ? "↑" : trendDir < 0 ? "↓" : "→";

    var priorityColor = function(p) {
      if (p === "critical") return "rose";
      if (p === "high") return "red";
      if (p === "medium") return "amber";
      if (p === "low") return "blue";
      return "emerald";
    };

    var priorityIcon = function(p) {
      if (p === "critical") return LucideReact.AlertOctagon;
      if (p === "high") return LucideReact.AlertCircle;
      if (p === "medium") return LucideReact.AlertTriangle;
      if (p === "low") return LucideReact.Info;
      return LucideReact.CheckCircle;
    };

    var displayTrend = trend.map(function(b) { return { label: b.label, count: b.count }; });

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.FileText className="w-5 h-5 text-violet-400" />
            <span className="text-lg font-semibold text-white">TL Error Briefing</span>
          </div>
          <Badge variant={score >= 70 ? "success" : score >= 50 ? "warning" : "danger"}>
            {level.charAt(0).toUpperCase() + level.slice(1)} ({score}/100)
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#27272a" strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="8"
                strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - score / 100)}
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-white">{score}</span>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-2 gap-2">
            <Stat label="Errors (window)" value={sum.total || 0} accent="red" />
            <Stat label="Today" value={sum.todayCount || 0} change={trendDir !== 0 ? trendArrow + " " + Math.abs(trendDir) + "%" : undefined} trend={trendDir > 20 ? "up" : trendDir < -20 ? "down" : undefined} accent={trendColor} />
            <Stat label="7d Daily Avg" value={sum.dailyAvg7d || 0} accent="gray" />
            <Stat label="Error Rate (5m)" value={erRate.count != null ? erRate.count + "/" + (erRate.threshold || 20) : "-"} accent={erRate.count >= (erRate.threshold || 20) ? "rose" : "emerald"} />
          </div>
        </div>

        {cbs.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {cbs.map(function(b, i) {
              return (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-zinc-800/60 text-xs">
                  <div className={"w-2 h-2 rounded-full " + (b.state === "closed" ? "bg-emerald-400" : b.state === "open" ? "bg-red-400 animate-pulse" : "bg-amber-400")} />
                  <span className="text-zinc-300">{b.name}</span>
                  <Badge variant={b.state === "closed" ? "success" : b.state === "open" ? "danger" : "warning"} size="sm">{b.state}</Badge>
                </div>
              );
            })}
          </div>
        )}

        <UICard header="Action Items" accent={actions.some(function(a) { return a.priority === "critical"; }) ? "rose" : actions.some(function(a) { return a.priority === "high"; }) ? "red" : "emerald"}>
          <div className="space-y-2">
            {actions.map(function(a, i) {
              var PIcon = priorityIcon(a.priority);
              return (
                <div key={i} className="flex items-start gap-2 p-2 rounded bg-zinc-800/40">
                  <PIcon className={"w-4 h-4 mt-0.5 flex-shrink-0 text-" + priorityColor(a.priority) + "-400"} />
                  <div className="flex-1">
                    <div className="text-sm text-zinc-200">{a.action}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={priorityColor(a.priority)} size="sm">{a.priority}</Badge>
                      <span className="text-xs text-zinc-500">{a.type}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </UICard>

        {displayTrend.length > 0 && (
          <UICard header={"Hourly Trend (" + (data.hours || 24) + "h)" + (spikes.length > 0 ? " — " + spikes.length + " spike(s)" : "")}>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={displayTrend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="label" tick={{ fill: "#999", fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#999", fontSize: 9 }} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: "#1f1f23", border: "1px solid #333", borderRadius: 6 }} />
                <Area type="monotone" dataKey="count" stroke="#ef4444" fill="url(#trendGrad)" name="Errors" />
              </AreaChart>
            </ResponsiveContainer>
          </UICard>
        )}

        {(topCodes.length > 0 || recurring.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {topCodes.length > 0 && (
              <UICard header="Top Error Codes">
                <div className="space-y-1.5">
                  {topCodes.slice(0, 5).map(function(c, i) {
                    return (
                      <div key={i} className="flex items-center justify-between text-sm cursor-pointer hover:bg-zinc-800/40 p-1 rounded"
                        onClick={function() { onAction("error_codes", { code: c.code }); }}>
                        <span className="text-cyan-300 font-mono text-xs truncate flex-1">{c.code}</span>
                        <Badge variant="outline" size="sm">{c.count}</Badge>
                      </div>
                    );
                  })}
                </div>
              </UICard>
            )}
            {recurring.length > 0 && (
              <UICard header="Recurring Patterns">
                <div className="space-y-1.5">
                  {recurring.slice(0, 5).map(function(r, i) {
                    return (
                      <div key={i} className="flex items-center justify-between text-sm p-1">
                        <span className="text-zinc-300 text-xs truncate flex-1 mr-2">{r.message}</span>
                        <Badge variant="danger" size="sm">{r.count}x</Badge>
                      </div>
                    );
                  })}
                </div>
              </UICard>
            )}
          </div>
        )}

        {fixes.unacknowledged > 0 && (
          <div className="flex items-center gap-2 p-2 rounded bg-emerald-900/20 border border-emerald-800/50 text-sm">
            <LucideReact.Wrench className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-300">{fixes.unacknowledged} unacknowledged fix(es)</span>
            <Button variant="ghost" size="sm" onClick={function() { onAction("fixes"); }}>Review</Button>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" icon={LucideReact.Bell} onClick={function() { onAction("alert_status"); }}>Alerts</Button>
          <Button variant="outline" icon={LucideReact.Activity} onClick={function() { onAction("overview"); }}>Overview</Button>
          <Button variant="outline" icon={LucideReact.TrendingUp} onClick={function() { onAction("trends"); }}>Trends</Button>
          <Button variant="outline" icon={LucideReact.Repeat} onClick={function() { onAction("recurring"); }}>Recurring</Button>
          <Button variant="outline" icon={LucideReact.List} onClick={function() { onAction("errors"); }}>Error Log</Button>
        </div>
      </div>
    );
  }

  // ── ALERT STATUS ──
  if (isAlertStatus) {
    var alerts = data.alerts || [];
    var status = data.status || "clear";
    var cs = data.circuitSummary || {};
    var ws = data.windowSummary || {};
    var erRate = data.errorRate || {};

    var statusConfig = {
      critical: { color: "rose", icon: LucideReact.AlertOctagon, label: "CRITICAL", bg: "bg-red-900/30 border-red-800" },
      warning: { color: "amber", icon: LucideReact.AlertTriangle, label: "WARNING", bg: "bg-amber-900/30 border-amber-800" },
      clear: { color: "emerald", icon: LucideReact.CheckCircle, label: "ALL CLEAR", bg: "bg-emerald-900/30 border-emerald-800" }
    };
    var sc = statusConfig[status] || statusConfig.clear;
    var StatusIcon = sc.icon;

    var alertLevelIcon = function(level) {
      if (level === "critical") return LucideReact.AlertOctagon;
      if (level === "warning") return LucideReact.AlertTriangle;
      return LucideReact.Info;
    };

    var alertLevelColor = function(level) {
      if (level === "critical") return "rose";
      if (level === "warning") return "amber";
      return "blue";
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.Bell className="w-5 h-5 text-amber-400" />
            <span className="text-lg font-semibold text-white">Alert Status</span>
          </div>
          <Button variant="ghost" icon={LucideReact.RefreshCw} size="sm" onClick={function() { onAction("alert_status", { hours: data.hours }); }}>Refresh</Button>
        </div>

        <div className={"flex items-center gap-3 p-3 rounded-lg border " + sc.bg}>
          <StatusIcon className={"w-6 h-6 text-" + sc.color + "-400" + (status === "critical" ? " animate-pulse" : "")} />
          <div>
            <div className={"text-sm font-bold text-" + sc.color + "-300"}>{sc.label}</div>
            <div className="text-xs text-zinc-400">
              {alerts.length === 0 ? "No active alerts" : alerts.length + " active alert" + (alerts.length !== 1 ? "s" : "")} · {data.hours || 6}h window
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Errors (window)" value={ws.total || 0} accent={ws.total > 0 ? "red" : "gray"} />
          <Stat label="Critical" value={ws.critical || 0} accent={ws.critical > 0 ? "rose" : "gray"} />
          <Stat label="Rate (5m)" value={erRate.count != null ? erRate.count : "-"} accent={erRate.count >= (erRate.threshold || 20) ? "rose" : "emerald"} />
          <Stat label="Circuits" value={(cs.open || 0) + " open / " + (cs.total || 0)} accent={cs.open > 0 ? "rose" : "emerald"} />
        </div>

        {alerts.length === 0 ? (
          <UICard accent="emerald">
            <div className="flex items-center gap-3 py-4 justify-center">
              <LucideReact.CheckCircle className="w-8 h-8 text-emerald-400" />
              <div>
                <div className="text-sm font-medium text-emerald-300">System Clear</div>
                <div className="text-xs text-zinc-400">No active alerts in the last {data.hours || 6} hours</div>
              </div>
            </div>
          </UICard>
        ) : (
          <div className="space-y-2">
            {alerts.map(function(a, i) {
              var AIcon = alertLevelIcon(a.level);
              var aColor = alertLevelColor(a.level);
              var isExp = expandedAlert === i;
              return (
                <UICard key={i} accent={aColor}>
                  <div className="cursor-pointer" onClick={function() { setExpandedAlert(isExp ? null : i); }}>
                    <div className="flex items-start gap-2">
                      <AIcon className={"w-4 h-4 mt-0.5 flex-shrink-0 text-" + aColor + "-400" + (a.level === "critical" ? " animate-pulse" : "")} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-200">{a.title}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={aColor} size="sm">{a.level.toUpperCase()}</Badge>
                          <span className="text-xs text-zinc-500">{a.source}</span>
                          <span className="text-xs text-zinc-500">{formatTime(a.ts)}</span>
                        </div>
                      </div>
                      <LucideReact.ChevronDown className={"w-4 h-4 text-zinc-500 transition-transform " + (isExp ? "rotate-180" : "")} />
                    </div>
                    {isExp && (
                      <div className="mt-2 ml-6 p-2 rounded bg-zinc-900/60 text-xs text-zinc-300">
                        {a.detail}
                      </div>
                    )}
                  </div>
                </UICard>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {[3, 6, 12, 24].map(function(h) {
            return (
              <Button key={h} variant={(data.hours || 6) === h ? "primary" : "ghost"} size="sm"
                onClick={function() { onAction("alert_status", { hours: h }); }}>
                {h}h
              </Button>
            );
          })}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" icon={LucideReact.FileText} onClick={function() { onAction("tl_report"); }}>TL Report</Button>
          <Button variant="outline" icon={LucideReact.HeartPulse} onClick={function() { onAction("health_check"); }}>Health Check</Button>
          <Button variant="outline" icon={LucideReact.Activity} onClick={function() { onAction("overview"); }}>Overview</Button>
          <Button variant="outline" icon={LucideReact.Shield} onClick={function() { onAction("circuit_breakers"); }}>Circuits</Button>
        </div>
      </div>
    );
  }

  // ── FALLBACK ──
  return (
    <EmptyState
      icon={LucideReact.Activity}
      title="Error Monitor"
      description="Monitor system errors, trends, and fixes"
      action={<Button onClick={() => onAction("health_check")}>Health Check</Button>}
    />
  );
}
