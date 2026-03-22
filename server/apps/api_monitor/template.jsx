export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var fmtDate = (d) => {
    if (!d) return "\u2014";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return String(d); }
  };

  var statusColor = (s) => {
    if (s === "healthy" || s === "up" || s === "resolved") return { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", dot: "#22c55e" };
    if (s === "warning" || s === "degraded") return { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30", dot: "#eab308" };
    if (s === "critical" || s === "down") return { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/30", dot: "#ef4444" };
    return { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30", dot: "#3b82f6" };
  };

  var severityBadge = (sev) => {
    if (sev === "critical") return "danger";
    if (sev === "warning") return "warning";
    return "info";
  };

  var severityOrder = { critical: 0, warning: 1, info: 2 };

  var maskUrl = (url) => {
    if (!url) return "\u2014";
    try {
      var u = new URL(url);
      return u.protocol + "//" + u.hostname + "/\u2022\u2022\u2022\u2022";
    } catch (e) { return (url || "").substring(0, 30) + "\u2022\u2022\u2022"; }
  };

  // ── Hooks ──
  var [expandedRow, setExpandedRow] = useState(null);
  var [historyMetric, setHistoryMetric] = useState("latency");
  var [timeRange, setTimeRange] = useState("24h");

  // ── Detect view type ──
  var tool = data?.tool || "";
  var isOverview = tool === "enso_api_monitor_overview";
  var isEndpoint = tool === "enso_api_monitor_endpoint_detail";
  var isAlerts = tool === "enso_api_monitor_alerts";
  var isWebhooks = tool === "enso_api_monitor_webhooks";
  var isHistory = tool === "enso_api_monitor_history";
  var isIncidents = tool === "enso_api_monitor_incidents";
  var isExport = tool === "enso_api_monitor_export";

  // ── Components ──
  var StatusDot = ({ status, size }) => {
    var s = size || 8;
    var c = statusColor(status);
    var isCrit = status === "critical" || status === "down";
    return (
      <span className="relative inline-flex" style={{ width: s + 4, height: s + 4 }}>
        {isCrit && <span className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ backgroundColor: c.dot }} />}
        <span className="relative inline-block rounded-full" style={{ width: s, height: s, backgroundColor: c.dot, margin: 2 }} />
      </span>
    );
  };

  var Sparkline = ({ data: sparkData, color, width, height }) => {
    if (!sparkData?.length) return null;
    var w = width || 80;
    var h = height || 24;
    var min = Math.min(...sparkData);
    var max = Math.max(...sparkData);
    var range = max - min || 1;
    var points = sparkData.map((v, i) => {
      var x = (i / (sparkData.length - 1)) * w;
      var y = h - ((v - min) / range) * (h - 4) - 2;
      return x + "," + y;
    }).join(" ");
    return (
      <svg width={w} height={h} className="inline-block">
        <polyline points={points} fill="none" stroke={color || "#3b82f6"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  var SvgLineChart = ({ data: chartData, lines, width, height, yLabel }) => {
    if (!chartData?.length || !lines?.length) return null;
    var w = width || 560;
    var h = height || 200;
    var pad = { top: 20, right: 16, bottom: 40, left: 50 };
    var cw = w - pad.left - pad.right;
    var ch = h - pad.top - pad.bottom;
    var allVals = [];
    lines.forEach(function(line) { chartData.forEach(function(d) { if (d?.[line?.key] != null) allVals.push(d[line.key]); }); });
    var maxVal = Math.max(...allVals, 1);
    var minVal = Math.min(...allVals, 0);
    var vRange = maxVal - minVal || 1;
    var yTicks = [];
    for (var t = 0; t <= 5; t++) yTicks.push(minVal + (vRange * t / 5));
    var getPath = (key) => chartData.map((d, i) => {
      var x = pad.left + (i / (chartData.length - 1)) * cw;
      var y = pad.top + ch - ((((d?.[key] ?? 0) - minVal) / vRange) * ch);
      return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    return (
      <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
        <svg width={w} height={h} style={{ minWidth: w }}>
          {yTicks.map((tick, i) => { var y = pad.top + ch - (((tick - minVal) / vRange) * ch); return (
            <g key={i}><line x1={pad.left} y1={y} x2={w - pad.right} y2={y} stroke="#374151" strokeWidth="0.5" strokeDasharray="4,4" /><text x={pad.left - 6} y={y + 3} textAnchor="end" fill="#6b7280" fontSize="9">{tick < 10 ? tick.toFixed(1) : Math.round(tick)}</text></g>
          ); })}
          {lines.map((line, i) => <path key={i} d={getPath(line.key)} fill="none" stroke={line.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />)}
        </svg>
        <div className="flex flex-wrap gap-3 mt-1 px-2">{lines.map((line, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[10px] text-gray-400"><div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: line.color }} />{line.label}</div>
        ))}</div>
      </div>
    );
  };

  // ── Export view ──
  if (isExport) {
    var exportSummary = data?.summary ?? "";
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("overview", {})}><LucideReact.ArrowLeft className="w-3.5 h-3.5" /></Button>
          <LucideReact.Download className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-gray-100">Data Export</span>
          <Badge variant="outline">{data?.format ?? "text"}</Badge>
          <Badge variant="info">{data?.timeRange ?? "24h"}</Badge>
        </div>
        <div className="text-[10px] text-gray-500">{data?.endpointCount ?? 0} endpoints exported</div>
        <div className="bg-gray-800/60 rounded-xl p-3 text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {exportSummary || "No export data available."}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("export", { format: "csv", timeRange: data?.timeRange ?? "24h" })}>
            <LucideReact.FileText className="w-3 h-3 mr-1" /> CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onAction("export", { format: "text", timeRange: data?.timeRange ?? "24h" })}>
            <LucideReact.AlignLeft className="w-3 h-3 mr-1" /> Text
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onAction("overview", {})}>
            <LucideReact.ArrowLeft className="w-3 h-3 mr-1" /> Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // ── Error view ──
  if (data?.error) {
    return (
      <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
        <EmptyState icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />} title="Something went wrong" description={data.error}
          action={<Button size="sm" onClick={() => onAction("overview", {})}>Go to Dashboard</Button>} />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── OVERVIEW VIEW ──
  // ════════════════════════════════════════════════════════════════════
  if (isOverview) {
    var statCards = data?.statCards ?? [];
    var activeAlerts = data?.activeAlerts ?? [];
    var endpoints = data?.endpoints ?? [];
    var sortedAlerts = [...activeAlerts].sort((a, b) => (severityOrder[a?.severity] ?? 9) - (severityOrder[b?.severity] ?? 9));

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LucideReact.Activity className="w-5 h-5 text-blue-400" />
            <div>
              <div className="text-sm font-bold text-gray-100">{data?.title ?? "API Monitor"}</div>
              <div className="text-[10px] text-gray-500">Last updated: {fmtDate(data?.lastUpdated)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onAction("export", { format: "text" })} className="p-1 rounded-lg hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 cursor-pointer transition-all"><LucideReact.Download className="w-3.5 h-3.5" /></button>
            <StatusDot status={data?.systemStatus ?? "healthy"} size={8} />
            <span className={"text-[10px] font-medium " + statusColor(data?.systemStatus ?? "healthy").text}>{(data?.systemStatus ?? "healthy").toUpperCase()}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {statCards.map((card) => {
            var c = statusColor(card?.status ?? "healthy");
            return (
              <div key={card?.key} className={"rounded-xl p-3 border " + c.bg + " " + c.border}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">{card?.label ?? ""}</span>
                  <Sparkline data={card?.sparkline} color={c.dot} width={60} height={20} />
                </div>
                <span className={"text-xl font-bold " + c.text}>{card?.format === "percent" ? (card?.value ?? 0).toFixed(2) + "%" : (card?.value ?? 0)}</span>
                {card?.unit && <span className="text-xs text-gray-500 ml-1">{card.unit}</span>}
              </div>
            );
          })}
        </div>

        {sortedAlerts.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Active Alerts</span>
              <Button size="sm" variant="ghost" onClick={() => onAction("alerts", {})}><LucideReact.ArrowRight className="w-3 h-3" /></Button>
            </div>
            {sortedAlerts.slice(0, 3).map((alert) => (
              <div key={alert?.id} className={"flex items-center gap-2 px-3 py-2 rounded-lg border " + statusColor(alert?.severity ?? "info").bg + " " + statusColor(alert?.severity ?? "info").border}>
                <StatusDot status={alert?.severity ?? "info"} size={6} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-200 truncate">{alert?.title ?? ""}</div>
                  <div className="text-[10px] text-gray-500">{alert?.method ?? ""} {alert?.endpoint ?? ""} \u00b7 {alert?.duration ?? ""}</div>
                </div>
                <Badge variant={severityBadge(alert?.severity)}>{alert?.severity ?? ""}</Badge>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Endpoints</span>
            <span className="text-[10px] text-gray-600">{endpoints.length} monitored</span>
          </div>
          {endpoints.map((ep) => (
            <button key={ep?.id} onClick={() => onAction("endpoint_detail", { endpointId: ep?.id })}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-800/40 rounded-lg border border-gray-700/30 cursor-pointer hover:bg-gray-800/60 text-left transition-all">
              <StatusDot status={ep?.status ?? "healthy"} size={6} />
              <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-gray-700/50 text-gray-400">{ep?.method ?? ""}</span>
              <span className="text-xs text-gray-200 truncate flex-1">{ep?.path ?? ""}</span>
              <Sparkline data={ep?.sparkline} color={statusColor(ep?.status ?? "healthy").dot} width={50} height={18} />
              <span className="text-[10px] text-gray-400 w-12 text-right">{ep?.latency_p50 ?? 0}ms</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── ENDPOINT DETAIL VIEW ──
  // ════════════════════════════════════════════════════════════════════
  if (isEndpoint) {
    var ep = data?.endpoint ?? {};
    var c = statusColor(ep?.status ?? "healthy");
    var latTS = data?.latencyTimeSeries ?? [];
    var scb = data?.statusCodeBreakdown ?? [];

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("overview", {})}><LucideReact.ArrowLeft className="w-3.5 h-3.5" /></Button>
          <StatusDot status={ep?.status ?? "healthy"} size={8} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">{ep?.method ?? ""} {ep?.path ?? ""}</div>
            <div className="text-[10px] text-gray-500">{ep?.rps ?? 0} req/s \u00b7 {ep?.uptime ?? 0}% uptime</div>
          </div>
          <Badge variant={ep?.status === "healthy" ? "success" : ep?.status === "warning" ? "warning" : "danger"}>{(ep?.status ?? "unknown").toUpperCase()}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2 text-center"><div className="text-[10px] text-blue-400/60">p50</div><div className="text-sm font-bold text-blue-400">{ep?.latency_p50 ?? 0}<span className="text-[10px] font-normal">ms</span></div></div>
          <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-2 text-center"><div className="text-[10px] text-violet-400/60">p95</div><div className="text-sm font-bold text-violet-400">{ep?.latency_p95 ?? 0}<span className="text-[10px] font-normal">ms</span></div></div>
          <div className="bg-pink-500/5 border border-pink-500/20 rounded-lg p-2 text-center"><div className="text-[10px] text-pink-400/60">p99</div><div className="text-sm font-bold text-pink-400">{ep?.latency_p99 ?? 0}<span className="text-[10px] font-normal">ms</span></div></div>
        </div>

        {latTS.length > 0 && (
          <div className="bg-gray-800/30 rounded-lg border border-gray-700/20 p-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Latency Over Time</div>
            <SvgLineChart data={latTS} lines={[{ key: "p50", color: "#3b82f6", label: "p50" }, { key: "p95", color: "#8b5cf6", label: "p95" }, { key: "p99", color: "#ec4899", label: "p99" }]} width={520} height={180} yLabel="ms" />
          </div>
        )}

        {scb.length > 0 && (
          <div className="space-y-1"><div className="text-[10px] text-gray-500 uppercase tracking-wider">Response Codes</div>
            {scb.map((item) => (
              <div key={item?.code} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-6">{item?.code ?? ""}</span>
                <div className="flex-1 bg-gray-700/30 rounded-full h-3 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: (item?.percentage ?? 0) + "%", backgroundColor: item?.code === "2xx" ? "#22c55e" : item?.code === "4xx" ? "#f59e0b" : "#ef4444" }} />
                </div>
                <span className="text-[10px] text-gray-400 w-12 text-right">{item?.percentage ?? 0}%</span>
              </div>
            ))}
          </div>
        )}

        {ep?.tags && (
          <div className="flex flex-wrap gap-1 mt-1">{Object.entries(ep.tags).map(([k, v]) => <Badge key={k} variant="outline">{k}: {v}</Badge>)}</div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── ALERTS VIEW ──
  // ════════════════════════════════════════════════════════════════════
  if (isAlerts) {
    var activeAlerts = data?.activeAlerts ?? [];
    var resolvedAlerts = data?.resolvedAlerts ?? [];
    var rules = data?.rules ?? [];
    var summary = data?.summary ?? {};
    var sortedActive = [...activeAlerts].sort((a, b) => (severityOrder[a?.severity] ?? 9) - (severityOrder[b?.severity] ?? 9));

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("overview", {})}><LucideReact.ArrowLeft className="w-3.5 h-3.5" /></Button>
          <LucideReact.AlertTriangle className="w-4 h-4 text-rose-400" />
          <span className="text-sm font-semibold text-gray-100">Alerts</span>
          <Badge variant="outline">{activeAlerts.length} active</Badge>
        </div>

        <Tabs tabs={[{ value: "active", label: "Active" }, { value: "rules", label: "Rules" }]} defaultValue="active" variant="pills">
          {(tab) => {
            if (tab === "active") return (
              <div className="space-y-1.5 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {sortedActive.map((alert) => {
                  var ac = statusColor(alert?.severity ?? "info");
                  return (
                    <div key={alert?.id} className={"px-3 py-2.5 rounded-lg border " + ac.bg + " " + ac.border}>
                      <div className="flex items-center gap-2">
                        <StatusDot status={alert?.severity ?? "info"} size={6} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-200 font-medium truncate">{alert?.title ?? ""}</div>
                          <div className="text-[10px] text-gray-500">{alert?.method ?? ""} {alert?.endpoint ?? ""} \u00b7 {alert?.duration ?? ""}</div>
                        </div>
                        <Badge variant={severityBadge(alert?.severity)}>{alert?.severity ?? ""}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
            if (tab === "rules") return (
              <div className="space-y-1 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                {rules.map((rule) => (
                  <div key={rule?.id} className={"flex items-center gap-2 px-3 py-2 bg-gray-800/40 rounded-lg border border-gray-700/30 " + (!(rule?.enabled) ? "opacity-50" : "")}>
                    <div className={"w-1.5 h-1.5 rounded-full " + (rule?.enabled ? "bg-emerald-400" : "bg-gray-600")} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-200 truncate">{rule?.name ?? ""}</div>
                      <div className="text-[10px] text-gray-500">{rule?.metric ?? ""} {rule?.condition ?? ""} {rule?.threshold ?? ""}{rule?.unit ?? ""}</div>
                    </div>
                    <Badge variant={severityBadge(rule?.severity)}>{rule?.severity ?? ""}</Badge>
                  </div>
                ))}
              </div>
            );
            return null;
          }}
        </Tabs>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── WEBHOOKS VIEW ──
  // ════════════════════════════════════════════════════════════════════
  if (isWebhooks) {
    var webhooks = data?.webhooks ?? [];
    var payload = data?.webhookPayloadExample ? JSON.stringify(data.webhookPayloadExample, null, 2) : "";

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("overview", {})}><LucideReact.ArrowLeft className="w-3.5 h-3.5" /></Button>
          <LucideReact.Webhook className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-100">Webhooks</span>
          <Badge variant="outline">{webhooks.length}</Badge>
        </div>

        {webhooks.map((wh) => (
          <div key={wh?.id} className={"px-3 py-2.5 bg-gray-800/40 rounded-lg border border-gray-700/30 " + (!(wh?.enabled) ? "opacity-60" : "")}>
            <div className="flex items-center gap-2">
              <div className={"w-2 h-2 rounded-full " + (wh?.enabled ? "bg-emerald-400" : "bg-gray-600")} />
              <span className="text-xs text-gray-200 font-medium flex-1 truncate">{wh?.name ?? ""}</span>
              <Badge variant={wh?.enabled ? "success" : "outline"}>{wh?.enabled ? "Active" : "Paused"}</Badge>
            </div>
            <div className="ml-4 mt-1 space-y-0.5 text-[10px]">
              <div><span className="text-gray-500">URL: </span><span className="text-gray-400 font-mono">{maskUrl(wh?.url)}</span></div>
              <div className="flex gap-1 flex-wrap"><span className="text-gray-500">Events: </span>{(wh?.events ?? []).map((ev, i) => <span key={i} className="px-1 py-0.5 bg-gray-700/50 rounded text-gray-400">{ev}</span>)}</div>
              <div><span className="text-gray-500">Success: </span><span className={(wh?.successRate ?? 0) >= 95 ? "text-emerald-400" : "text-amber-400"}>{wh?.successRate ?? 0}%</span> ({wh?.delivered ?? 0}/{wh?.total ?? 0})</div>
            </div>
          </div>
        ))}

        {payload && (
          <>
            <Separator />
            <div className="space-y-1">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Sample Payload</div>
              <div className="bg-gray-800/60 rounded-lg border border-gray-700/30 p-3 overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
                <pre className="text-[10px] text-gray-300 font-mono whitespace-pre">{payload}</pre>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── HISTORY VIEW ──
  // ════════════════════════════════════════════════════════════════════
  if (isHistory) {
    var latChart = data?.latencyChart ?? [];
    var errChart = data?.errorRateChart ?? [];
    var incidents = data?.incidents ?? [];

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("overview", {})}><LucideReact.ArrowLeft className="w-3.5 h-3.5" /></Button>
          <LucideReact.Clock className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-100">History</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-gray-700/50">
            {(data?.availableRanges ?? ["1h", "24h", "7d", "30d"]).map((r) => (
              <button key={r} onClick={() => onAction("history", { timeRange: r })}
                className={"px-2.5 py-1 text-[10px] cursor-pointer transition-all " + ((data?.timeRange ?? "24h") === r ? "bg-blue-500/20 text-blue-300" : "text-gray-500 hover:text-gray-300")}>{r}</button>
            ))}
          </div>
          <div className="flex rounded-lg overflow-hidden border border-gray-700/50 ml-auto">
            <button onClick={() => setHistoryMetric("latency")} className={"px-2.5 py-1 text-[10px] cursor-pointer transition-all " + (historyMetric === "latency" ? "bg-violet-500/20 text-violet-300" : "text-gray-500")}>Latency</button>
            <button onClick={() => setHistoryMetric("errors")} className={"px-2.5 py-1 text-[10px] cursor-pointer transition-all " + (historyMetric === "errors" ? "bg-rose-500/20 text-rose-300" : "text-gray-500")}>Errors</button>
          </div>
        </div>

        {historyMetric === "latency" && latChart.length > 0 && (
          <div className="bg-gray-800/30 rounded-lg border border-gray-700/20 p-2">
            <SvgLineChart data={latChart} lines={[{ key: "p50", color: "#3b82f6", label: "p50" }, { key: "p95", color: "#8b5cf6", label: "p95" }, { key: "p99", color: "#ec4899", label: "p99" }]} width={520} height={200} yLabel="ms" />
          </div>
        )}

        {historyMetric === "errors" && errChart.length > 0 && (
          <div className="bg-gray-800/30 rounded-lg border border-gray-700/20 p-2">
            <SvgLineChart data={errChart} lines={[{ key: "total", color: "#ef4444", label: "Total %" }, { key: "rate_5xx", color: "#f97316", label: "5xx %" }]} width={520} height={200} yLabel="%" />
          </div>
        )}

        {incidents.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Incidents</span>
              {incidents.map((inc) => (
                <div key={inc?.id} className="flex items-center gap-2 px-3 py-2 bg-gray-800/30 rounded-lg border border-gray-700/20">
                  <StatusDot status={inc?.resolvedAt ? "resolved" : (inc?.severity ?? "info")} size={6} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-200 truncate">{inc?.title ?? ""}</div>
                    <div className="text-[10px] text-gray-500">{fmtDate(inc?.startedAt)} \u00b7 {inc?.duration ?? ""} \u00b7 {inc?.affected ?? ""}</div>
                  </div>
                  <Badge variant={inc?.resolvedAt ? "outline" : "danger"}>{inc?.resolvedAt ? "resolved" : (inc?.status ?? "active")}</Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ── INCIDENTS VIEW ──
  // ════════════════════════════════════════════════════════════════════
  if (isIncidents) {
    var incidents = data?.incidents ?? [];
    var summary = data?.summary ?? {};

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("overview", {})}><LucideReact.ArrowLeft className="w-3.5 h-3.5" /></Button>
          <LucideReact.ShieldAlert className="w-4 h-4 text-rose-400" />
          <span className="text-sm font-semibold text-gray-100">Incidents</span>
          <Badge variant={summary?.active > 0 ? "danger" : "outline"}>{summary?.active ?? 0} active</Badge>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 text-center"><div className="text-[10px] text-rose-400/60">Active</div><div className="text-lg font-bold text-rose-400">{summary?.active ?? 0}</div></div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center"><div className="text-[10px] text-emerald-400/60">Resolved (7d)</div><div className="text-lg font-bold text-emerald-400">{summary?.resolved_7d ?? 0}</div></div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center"><div className="text-[10px] text-blue-400/60">MTTR</div><div className="text-lg font-bold text-blue-400">{summary?.mttr_hours ?? 0}h</div></div>
          <div className="bg-gray-500/10 border border-gray-500/20 rounded-lg p-2 text-center"><div className="text-[10px] text-gray-400/60">Total (30d)</div><div className="text-lg font-bold text-gray-400">{summary?.total_30d ?? 0}</div></div>
        </div>

        <div className="space-y-1 max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {incidents.map((inc) => {
            var isActive = !(inc?.resolvedAt);
            var ic = statusColor(isActive ? (inc?.severity ?? "info") : "resolved");
            return (
              <div key={inc?.id} className={"px-3 py-2.5 rounded-lg border " + (isActive ? ic.bg + " " + ic.border : "bg-gray-800/30 border-gray-700/20")}>
                <div className="flex items-center gap-2">
                  <StatusDot status={isActive ? (inc?.severity ?? "info") : "resolved"} size={6} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-200 truncate">{inc?.title ?? ""}</div>
                    <div className="text-[10px] text-gray-500">{fmtDate(inc?.startedAt)} \u00b7 {inc?.duration ?? ""}</div>
                    <div className="text-[10px] text-gray-500">{inc?.affected ?? ""}{inc?.impact ? " \u2014 " + inc.impact : ""}</div>
                  </div>
                  <Badge variant={isActive ? severityBadge(inc?.severity) : "outline"}>{isActive ? (inc?.status ?? "active") : "resolved"}</Badge>
                </div>
                {inc?.notes && <div className="ml-6 mt-1 text-[10px] text-gray-500 italic">{inc.notes}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Fallback ──
  return (
    <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
      <EmptyState icon={<LucideReact.Activity className="w-8 h-8 text-blue-400" />} title="API Monitor"
        description="Select a view to get started."
        action={<Button size="sm" onClick={() => onAction("overview", {})}>Open Dashboard</Button>} />
    </div>
  );
}
