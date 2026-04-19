export default function GeneratedUI({ data, onAction }) {
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [hoursWindow, setHoursWindow] = useState(24);
  const [expandedError, setExpandedError] = useState(null);
  const [activityType, setActivityType] = useState("all");

  const isOverview = data?.tool === "enso_error_monitor_overview";
  const isErrors = data?.tool === "enso_error_monitor_errors";
  const isTrends = data?.tool === "enso_error_monitor_trends";
  const isCategories = data?.tool === "enso_error_monitor_categories";
  const isFixes = data?.tool === "enso_error_monitor_fixes";
  const isActivity = data?.tool === "enso_error_monitor_activity";

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
                    <SevIcon className={`w-4 h-4 mt-0.5 text-${severityColor(e.severity)}-400`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200 truncate">{e.message}</div>
                      <div className="text-xs text-zinc-500 flex gap-2">
                        <span>{e.category}</span>
                        <span>{formatTime(e.ts)}</span>
                        {e.requestId && <span className="font-mono">{e.requestId}</span>}
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
          <Button variant="outline" icon={LucideReact.List} onClick={() => onAction("errors")}>Error Log</Button>
          <Button variant="outline" icon={LucideReact.TrendingUp} onClick={() => onAction("trends")}>Trends</Button>
          <Button variant="outline" icon={LucideReact.BarChart3} onClick={() => onAction("categories")}>Categories</Button>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-lg font-semibold text-white">Error Log</span>
            <Badge variant="outline">{data.total} entries</Badge>
          </div>
          <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={() => onAction("overview")}>Back</Button>
        </div>

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
                    <SevIcon className={`w-4 h-4 mt-0.5 flex-shrink-0`} style={{ color: e.severity === "critical" ? "#f43f5e" : e.severity === "error" ? "#ef4444" : e.severity === "warning" ? "#f59e0b" : "#3b82f6" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-200">{e.message}</div>
                      <div className="text-xs text-zinc-500 flex gap-2 mt-0.5">
                        <Badge variant={severityColor(e.severity)} size="sm">{e.severity || "error"}</Badge>
                        <span>{e.category}</span>
                        <span>{formatTime(e.ts)}</span>
                      </div>
                    </div>
                    <LucideReact.ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                  {isExpanded && (
                    <div className="mt-2 ml-6 p-2 rounded bg-zinc-900/60 text-xs space-y-1">
                      {e.error && <div><span className="text-zinc-500">Error: </span><span className="text-red-300 font-mono">{e.error}</span></div>}
                      {e.requestId && <div><span className="text-zinc-500">Request ID: </span><span className="text-zinc-300 font-mono">{e.requestId}</span></div>}
                      {e.cardId && <div><span className="text-zinc-500">Card ID: </span><span className="text-zinc-300 font-mono">{e.cardId}</span></div>}
                      {e.toolFamily && <div><span className="text-zinc-500">Tool: </span><span className="text-zinc-300">{e.toolFamily}</span></div>}
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.TrendingUp className="w-5 h-5 text-amber-400" />
            <span className="text-lg font-semibold text-white">Error Trends</span>
            <Badge variant="outline">{data.hours || 24}h window</Badge>
          </div>
          <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={() => onAction("overview")}>Back</Button>
        </div>

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.BarChart3 className="w-5 h-5 text-purple-400" />
            <span className="text-lg font-semibold text-white">Error Categories</span>
            <Badge variant="outline">{data.totalCategories || 0} sources</Badge>
          </div>
          <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={() => onAction("overview")}>Back</Button>
        </div>

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.Wrench className="w-5 h-5 text-emerald-400" />
            <span className="text-lg font-semibold text-white">Bug Fixes</span>
            <Badge variant="outline">{data.total || 0} total</Badge>
            {data.unacknowledged > 0 && <Badge variant="warning">{data.unacknowledged} new</Badge>}
          </div>
          <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={() => onAction("overview")}>Back</Button>
        </div>

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.Activity className="w-5 h-5 text-blue-400" />
            <span className="text-lg font-semibold text-white">Activity Log</span>
            <Badge variant="outline">{data.total} entries</Badge>
          </div>
          <Button variant="ghost" icon={LucideReact.ArrowLeft} onClick={() => onAction("overview")}>Back</Button>
        </div>

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

  // ── FALLBACK ──
  return (
    <EmptyState
      icon={LucideReact.Activity}
      title="Error Monitor"
      description="Monitor system errors, trends, and fixes"
      action={<Button onClick={() => onAction("overview")}>Load Dashboard</Button>}
    />
  );
}
