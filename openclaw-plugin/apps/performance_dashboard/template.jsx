export default function GeneratedUI({ data, onAction }) {
  // ── Hooks (always at top level) ──
  var _activeTab = useState("overview");
  var activeTab = _activeTab[0];
  var setActiveTab = _activeTab[1];

  var _metricTab = useState(null);
  var metricTab = _metricTab[0];
  var setMetricTab = _metricTab[1];

  // ── Detect view type ──
  var tool = data?.tool ?? "";
  var isOverview = tool === "enso_performance_dashboard_overview";
  var isDetail = tool === "enso_performance_dashboard_detail";
  var isCompare = tool === "enso_performance_dashboard_compare";
  var isBenchmark = tool === "enso_performance_dashboard_benchmark";
  var isExport = tool === "enso_performance_dashboard_export";

  // ── Helpers ──
  var fmtVal = function (val, format) {
    if (val == null) return "—";
    if (format === "currency") {
      if (Math.abs(val) >= 1e6) return "$" + (val / 1e6).toFixed(2) + "M";
      if (Math.abs(val) >= 1e3) return "$" + (val / 1e3).toFixed(1) + "K";
      return "$" + val.toFixed(0);
    }
    if (format === "percent") return val.toFixed(1) + "%";
    if (format === "dollars") return "$" + val.toFixed(0);
    return String(val);
  };

  var calcChange = function (curr, prev) {
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
  };

  var changeColor = function (val, inverse) {
    if (val == null) return "text-gray-400";
    if (inverse) return val <= 0 ? "text-emerald-400" : "text-rose-400";
    return val >= 0 ? "text-emerald-400" : "text-rose-400";
  };

  var changeArrow = function (val, inverse) {
    if (val == null) return "";
    var positive = inverse ? val <= 0 : val >= 0;
    return positive ? "↑" : "↓";
  };

  // ── Mini Sparkline ──
  var Sparkline = function (props) {
    var values = props?.values ?? [];
    var color = props?.color ?? "#60a5fa";
    var w = props?.width ?? 56;
    var h = props?.height ?? 20;
    if (values.length < 2) return null;
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var range = max - min || 1;
    var pts = values.map(function (v, i) {
      return (i / (values.length - 1)) * w + "," + (h - ((v - min) / range) * (h - 4) - 2);
    }).join(" ");
    return (
      <svg width={w} height={h} viewBox={"0 0 " + w + " " + h} style={{ display: "block" }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  // ── Error view ──
  if (data?.error) {
    return (
      <EmptyState
        icon={<LucideReact.AlertCircle className="w-8 h-8 text-rose-400" />}
        title="Error"
        description={data.error}
        action={<Button size="sm" onClick={function () { onAction("overview", {}); }}>Back to Overview</Button>}
      />
    );
  }

  // ════════════════════════════════════════════════════════════
  // ── EXPORT VIEW ──
  // ════════════════════════════════════════════════════════════
  if (isExport) {
    var summary = data?.summary ?? "";
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function () { onAction("overview", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-sm font-semibold text-gray-100">Data Export</span>
        </div>
        <div className="bg-gray-800/60 rounded-xl p-3 text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {summary || "No export data available."}
        </div>
        <Button variant="ghost" size="sm" onClick={function () { onAction("overview", {}); }}>
          <LucideReact.ArrowLeft className="w-3 h-3 mr-1" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // ── BENCHMARK VIEW ──
  // ════════════════════════════════════════════════════════════
  if (isBenchmark) {
    var benchmarks = data?.benchmarks ?? [];
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function () { onAction("overview", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-sm font-semibold text-gray-100">Industry Benchmarks</span>
          <Badge variant="info">{data?.industry ?? "E-Commerce"}</Badge>
        </div>
        <div className="space-y-2">
          {benchmarks.map(function (bm, i) {
            return (
              <div key={i} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-gray-200">{bm?.name ?? "Metric"}</div>
                  <div className="text-[10px] text-gray-500">{bm?.description ?? ""}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-gray-100">{bm?.value ?? "—"}</div>
                  <div className="text-[10px] text-gray-500">{bm?.source ?? ""}</div>
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" onClick={function () { onAction("overview", {}); }}>
          <LucideReact.ArrowLeft className="w-3 h-3 mr-1" /> Dashboard
        </Button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // ── DETAIL VIEW (single metric deep-dive) ──
  // ════════════════════════════════════════════════════════════
  if (isDetail) {
    var metric = data?.metric ?? {};
    var periods = metric?.periods ?? [];
    var format = metric?.format ?? "number";
    var mName = metric?.name ?? "Metric";
    var mColor = metric?.color ?? "#3b82f6";
    var benchmarkVal = metric?.benchmark ?? null;
    var inverse = metric?.inverse === true;

    var detailChartData = periods.map(function (p) {
      var obj = { period: p?.label ?? "", value: p?.value ?? 0 };
      return obj;
    });

    var detailTableData = periods.map(function (p, i) {
      var prev = i > 0 ? (periods[i - 1]?.value ?? null) : null;
      var change = calcChange(p?.value, prev);
      return {
        period: p?.label ?? "",
        value: fmtVal(p?.value, format),
        change: change != null ? (change >= 0 ? "+" : "") + change.toFixed(1) + "%" : "—",
      };
    });

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function () { onAction("overview", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-100">{mName}</div>
            <div className="text-[11px] text-gray-500">Detailed Performance</div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={detailChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={{ stroke: "#4b5563" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={{ stroke: "#4b5563" }} width={55} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", fontSize: "12px" }} />
            <Bar dataKey="value" fill={mColor} radius={[4, 4, 0, 0]} />
            {benchmarkVal != null && (
              <ReferenceLine y={benchmarkVal} stroke="#f43f5e" strokeDasharray="6 3" strokeWidth={1.5} />
            )}
          </BarChart>
        </ResponsiveContainer>

        <DataTable
          columns={[
            { key: "period", label: "Period", sortable: true },
            { key: "value", label: mName, sortable: true },
            { key: "change", label: "Change", sortable: false, render: function (row) {
              var v = row?.change ?? "—";
              var pos = typeof v === "string" && v.startsWith("+");
              return <span className={pos && !inverse ? "text-emerald-400" : v === "—" ? "text-gray-500" : inverse && !pos ? "text-emerald-400" : "text-rose-400"}>{v}</span>;
            }},
          ]}
          data={detailTableData}
          striped
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // ── COMPARE VIEW (normalized multi-metric) ──
  // ════════════════════════════════════════════════════════════
  if (isCompare) {
    var metrics = data?.metrics ?? [];
    var compPeriods = data?.periods ?? [];

    var normalizeArr = function (vals) {
      var min = Math.min.apply(null, vals);
      var max = Math.max.apply(null, vals);
      var r = max - min || 1;
      return vals.map(function (v) { return Math.round(((v - min) / r) * 100); });
    };

    var compChartData = compPeriods.map(function (label, i) {
      var point = { period: label };
      metrics.forEach(function (m) {
        var vals = (m?.values ?? []).map(function (v) { return v ?? 0; });
        var normed = normalizeArr(vals);
        point[m?.name ?? "m" + i] = normed[i] ?? 0;
      });
      return point;
    });

    var colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e", "#06b6d4"];

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={function () { onAction("overview", {}); }}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-sm font-semibold text-gray-100">Metric Comparison</span>
          <Badge variant="outline">{metrics.length} metrics</Badge>
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={compChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={{ stroke: "#4b5563" }} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={{ stroke: "#4b5563" }} domain={[0, 100]} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", fontSize: "12px" }} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            {metrics.map(function (m, idx) {
              return <Line key={m?.name ?? idx} type="monotone" dataKey={m?.name ?? "m"} stroke={colors[idx % colors.length]} strokeWidth={2} dot={{ r: 3 }} />;
            })}
          </LineChart>
        </ResponsiveContainer>

        <Button variant="ghost" size="sm" onClick={function () { onAction("overview", {}); }}>
          <LucideReact.ArrowLeft className="w-3 h-3 mr-1" /> Dashboard
        </Button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // ── OVERVIEW (primary view) ──
  // ════════════════════════════════════════════════════════════
  var title = data?.title ?? "Performance Dashboard";
  var subtitle = data?.subtitle ?? "KPI Overview";
  var kpis = data?.kpis ?? [];
  var chartDataArr = data?.chartData ?? [];
  var tableRows = data?.tableData ?? [];
  var insightsArr = data?.insights ?? [];
  var periodLabels = data?.periods ?? [];

  // Determine metric tabs from kpis
  var metricKeys = kpis.map(function (k) { return k?.key ?? ""; });
  var currentMetric = metricTab ?? (metricKeys[0] ?? "");

  var currentKpi = kpis.find(function (k) { return (k?.key ?? "") === currentMetric; });
  var currentColor = currentKpi?.color ?? "#3b82f6";
  var currentFormat = currentKpi?.format ?? "number";
  var currentBenchmark = currentKpi?.benchmark ?? null;
  var currentLabel = currentKpi?.name ?? currentMetric;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600/20 via-purple-600/15 to-emerald-600/20 rounded-2xl p-4 border border-gray-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <LucideReact.BarChart3 className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-100">{title}</h1>
            <p className="text-xs text-gray-400">{subtitle}</p>
          </div>
          <div className="flex gap-1">
            <EnsoUI.Tooltip content="Benchmarks">
              <button onClick={function () { onAction("benchmark", { industry: data?.industry ?? "e-commerce" }); }}
                className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 cursor-pointer transition-all">
                <LucideReact.Award className="w-4 h-4" />
              </button>
            </EnsoUI.Tooltip>
            <EnsoUI.Tooltip content="Export">
              <button onClick={function () { onAction("export", { format: "text" }); }}
                className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 cursor-pointer transition-all">
                <LucideReact.Download className="w-4 h-4" />
              </button>
            </EnsoUI.Tooltip>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={"grid gap-2 " + (kpis.length <= 2 ? "grid-cols-2" : kpis.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {kpis.map(function (kpi) {
          var vals = (kpi?.values ?? []).map(function (v) { return v ?? 0; });
          var latest = vals.length > 0 ? vals[vals.length - 1] : null;
          var prev = vals.length > 1 ? vals[vals.length - 2] : null;
          var change = calcChange(latest, prev);
          var inv = kpi?.inverse === true;
          return (
            <button key={kpi?.key ?? Math.random()} onClick={function () { onAction("detail", { metric: kpi?.key ?? "" }); }}
              className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40 hover:border-blue-500/30 cursor-pointer text-left transition-all">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{kpi?.name ?? "Metric"}</span>
                <Sparkline values={vals} color={kpi?.color ?? "#60a5fa"} width={48} height={18} />
              </div>
              <div className="text-xl font-bold text-gray-100">{fmtVal(latest, kpi?.format)}</div>
              <div className={"text-xs font-medium mt-0.5 " + changeColor(change, inv)}>
                {changeArrow(change, inv)} {change != null ? (change >= 0 ? "+" : "") + change.toFixed(1) + "%" : ""} {periodLabels.length > 1 ? "vs prev" : ""}
              </div>
            </button>
          );
        })}
      </div>

      {/* Metric Tab Charts */}
      {kpis.length > 0 && (
        <div className="bg-gray-800/40 rounded-xl border border-gray-700/40 overflow-hidden">
          <div className="flex border-b border-gray-700/50 overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
            {kpis.map(function (kpi) {
              var isActive = (kpi?.key ?? "") === currentMetric;
              return (
                <button key={kpi?.key ?? Math.random()} onClick={function () { setMetricTab(kpi?.key ?? ""); }}
                  className={"flex-1 whitespace-nowrap px-3 py-2.5 text-xs font-medium cursor-pointer transition-all border-b-2 " +
                    (isActive ? "text-blue-400 border-blue-400 bg-blue-500/5" : "text-gray-500 border-transparent hover:text-gray-300")}>
                  {kpi?.name ?? "Metric"}
                </button>
              );
            })}
          </div>
          <div className="p-3">
            <div className="text-xs text-gray-400 mb-2 flex items-center gap-2">
              <span className="font-medium">{currentLabel} by Period</span>
              {currentBenchmark != null && (
                <span className="text-[10px] text-gray-500">
                  Benchmark: {fmtVal(currentBenchmark, currentFormat)}
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartDataArr} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={{ stroke: "#4b5563" }} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={{ stroke: "#4b5563" }} width={55} />
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey={currentMetric} fill={currentColor} radius={[4, 4, 0, 0]} />
                {currentBenchmark != null && (
                  <ReferenceLine y={currentBenchmark} stroke="#f43f5e" strokeDasharray="6 3" strokeWidth={1.5} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Data Table */}
      {tableRows.length > 0 && (
        <DataTable
          columns={[
            { key: "period", label: "Period", sortable: true },
          ].concat(kpis.map(function (k) {
            return { key: k?.key ?? "", label: k?.name ?? "", sortable: true };
          }))}
          data={tableRows}
          striped
        />
      )}

      {/* Insights */}
      {insightsArr.length > 0 && (
        <div className="bg-gradient-to-b from-purple-500/5 to-transparent rounded-xl border border-purple-500/20 p-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <LucideReact.Lightbulb className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-gray-200">Insights</span>
          </div>
          {insightsArr.map(function (text, idx) {
            return (
              <div key={idx} className="flex gap-2 items-start">
                <div className="w-5 h-5 rounded-full bg-purple-500/15 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] text-purple-300 font-bold">{idx + 1}</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{text ?? ""}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Compare CTA */}
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={function () { onAction("compare", {}); }}>
          <LucideReact.GitCompare className="w-3 h-3 mr-1" /> Compare All Metrics
        </Button>
      </div>
    </div>
  );
}
