export default function GeneratedUI({ data, onAction }) {
  var [searchQuery, setSearchQuery] = useState("");
  var [selectedPlayer, setSelectedPlayer] = useState(null);

  var tool = data?.tool ?? "";
  var isOverview = tool === "enso_market_intelligence_overview";
  var isRegions = tool === "enso_market_intelligence_regions";
  var isSegments = tool === "enso_market_intelligence_segments";
  var isPlayers = tool === "enso_market_intelligence_players";
  var isTrends = tool === "enso_market_intelligence_trends";
  var isSearch = tool === "enso_market_intelligence_search";

  var fmtMoney = (v) => {
    if (!v && v !== 0) return "N/A";
    if (typeof v === "string") return v;
    if (v >= 1000) return "$" + (v / 1000).toFixed(1) + "T";
    return "$" + v + "B";
  };

  var TrendArrow = ({ val }) => {
    var n = Number(val) || 0;
    if (n > 0) return <span className="text-emerald-400 text-xs">+{n}%</span>;
    if (n < 0) return <span className="text-rose-400 text-xs">{n}%</span>;
    return <span className="text-gray-400 text-xs">0%</span>;
  };

  var NavBar = ({ current }) => (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {[
        { key: "overview", label: "Overview", icon: LucideReact.BarChart3 },
        { key: "regions", label: "Regions", icon: LucideReact.Globe },
        { key: "segments", label: "Segments", icon: LucideReact.PieChart },
        { key: "players", label: "Players", icon: LucideReact.Trophy },
        { key: "trends", label: "Trends", icon: LucideReact.TrendingUp }
      ].map((item) => {
        var Icon = item?.icon ?? LucideReact.Circle;
        return (
          <Button key={item?.key ?? ""} size="sm"
            variant={current === item?.key ? "primary" : "ghost"}
            onClick={() => onAction(item?.key ?? "overview", data?.query ? { query: data.query } : {})}>
            <Icon className="w-3.5 h-3.5 mr-1" />
            {item?.label ?? ""}
          </Button>
        );
      })}
    </div>
  );

  // ════════════════════════════════════════════════
  // Search Results
  // ════════════════════════════════════════════════
  if (isSearch) {
    var results = data?.results ?? [];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAction("overview", {})}>
            <LucideReact.ArrowLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-sm font-semibold text-gray-100">Search: "{data?.query ?? ""}"</span>
          <Badge variant="outline">{results?.length ?? 0} results</Badge>
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1">
            <Input placeholder="Search markets, companies, trends..." value={searchQuery}
              onChange={(v) => setSearchQuery(v)}
              icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
          </div>
          <Button size="sm" variant="primary"
            onClick={() => { if ((searchQuery ?? "").trim()) onAction("search", { query: (searchQuery ?? "").trim() }); }}>
            Search
          </Button>
        </div>
        {(results?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<LucideReact.SearchX className="w-8 h-8" />}
            title="No results found"
            description="Try different search terms."
            action={<Button size="sm" onClick={() => onAction("overview", {})}>Back to Overview</Button>}
          />
        ) : (
          <div className="space-y-2">
            {results.map((r, i) => (
              <UICard key={i} accent={r?.type === "region" ? "blue" : r?.type === "company" ? "indigo" : "emerald"}>
                <div className="flex items-center gap-2">
                  <Badge variant={r?.type === "region" ? "info" : r?.type === "company" ? "default" : "success"}>
                    {(r?.type ?? "info")?.toUpperCase?.() ?? "INFO"}
                  </Badge>
                  <span className="text-sm font-medium text-gray-100">{r?.title ?? "Unknown"}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{r?.summary ?? ""}</p>
                {r?.metrics && (
                  <div className="flex gap-2 mt-2">
                    {Object.entries(r.metrics ?? {}).map(([k, v], j) => (
                      <Badge key={j} variant="outline">{k}: {String(v ?? "")}</Badge>
                    ))}
                  </div>
                )}
              </UICard>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // Regions View
  // ════════════════════════════════════════════════
  if (isRegions) {
    var regions = data?.regions ?? [];
    return (
      <div className="space-y-3">
        <NavBar current="regions" />
        <div className="text-sm font-semibold text-gray-100 mb-2">Regional E-Commerce Breakdown ({data?.year ?? "2026"})</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={regions} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
            <YAxis type="category" dataKey="region" tick={{ fill: "#94a3b8", fontSize: 10 }} width={100} />
            <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="marketSize" name="Market Size ($B)" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <DataTable
          columns={[
            { key: "region", label: "Region", sortable: true },
            { key: "marketSize", label: "Size ($B)", sortable: true, render: (v) => fmtMoney(v) },
            { key: "share", label: "Share", sortable: true, render: (v) => (v ?? 0) + "%" },
            { key: "growth", label: "CAGR", sortable: true, render: (v) => <Badge variant="success">{v ?? 0}%</Badge> },
            { key: "keyMarkets", label: "Key Markets" }
          ]}
          data={regions}
          striped
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // Segments View
  // ════════════════════════════════════════════════
  if (isSegments) {
    var segments = data?.segments ?? [];
    var pieData = (segments ?? []).filter((s) => (s?.share ?? 0) > 0).map((s) => ({
      name: s?.name ?? "", value: s?.share ?? 0, fill: s?.color ?? "#6366f1"
    }));
    return (
      <div className="space-y-3">
        <NavBar current="segments" />
        <div className="text-sm font-semibold text-gray-100 mb-2">E-Commerce Segments ({data?.year ?? "2026"})</div>
        {(pieData?.length ?? 0) > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value"
                label={({ name, value }) => (name ?? "") + " " + (value ?? 0) + "%"} labelLine={false}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry?.fill ?? "#6366f1"} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
        <DataTable
          columns={[
            { key: "name", label: "Segment", sortable: true },
            { key: "value", label: "Size ($B)", sortable: true, render: (v) => fmtMoney(v) },
            { key: "growth", label: "Growth", sortable: true, render: (v) => <TrendArrow val={v} /> }
          ]}
          data={segments}
          striped
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // Players View
  // ════════════════════════════════════════════════
  if (isPlayers) {
    var players = data?.players ?? [];
    return (
      <div className="space-y-3">
        <NavBar current="players" />
        <div className="text-sm font-semibold text-gray-100 mb-2">Top E-Commerce Players ({data?.year ?? "2026"})</div>
        <div className="flex gap-1.5 mb-2">
          <div className="flex-1">
            <Input placeholder="Filter players..." value={searchQuery}
              onChange={(v) => setSearchQuery(v)}
              icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
          </div>
        </div>
        {(players ?? [])
          .filter((p) => {
            if (!(searchQuery ?? "").trim()) return true;
            var q = (searchQuery ?? "").toLowerCase();
            return ((p?.name ?? "").toLowerCase().includes(q) || (p?.hq ?? "").toLowerCase().includes(q));
          })
          .map((p, i) => (
            <UICard key={i} accent={i < 3 ? "indigo" : i < 7 ? "blue" : "gray"}>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                  style={{ background: i < 3 ? "#4338ca" : i < 7 ? "#1d4ed8" : "#374151" }}>
                  <span className="text-sm font-bold text-white">#{p?.rank ?? i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-100 truncate">{p?.name ?? "Unknown"}</span>
                    <Badge variant="outline">{p?.hq ?? "N/A"}</Badge>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span>GMV: <span className="text-gray-200">{p?.gmv ?? "N/A"}</span></span>
                    <span>Rev: <span className="text-gray-200">{p?.revenue ?? "N/A"}</span></span>
                    <span>{p?.marketShare ?? ""}</span>
                  </div>
                </div>
                <div className="shrink-0"><TrendArrow val={p?.yoyGrowth} /></div>
              </div>
            </UICard>
          ))}
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // Trends View
  // ════════════════════════════════════════════════
  if (isTrends) {
    var drivers = data?.drivers ?? [];
    var risks = data?.headwinds ?? [];
    return (
      <div className="space-y-3">
        <NavBar current="trends" />
        <UICard header={<span className="text-sm font-semibold text-emerald-400 flex items-center gap-2"><LucideReact.Rocket className="w-4 h-4" /> Growth Drivers</span>}>
          <div className="space-y-2">
            {(drivers ?? []).map((d, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-gray-800/40">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                  <LucideReact.TrendingUp className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-100">{d?.title ?? ""}</span>
                    <Badge variant={(d?.impact ?? "") === "high" ? "danger" : "warning"}>
                      {(d?.impact ?? "")?.toUpperCase?.() ?? ""}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400">{d?.desc ?? ""}</p>
                </div>
              </div>
            ))}
          </div>
        </UICard>
        <UICard header={<span className="text-sm font-semibold text-rose-400 flex items-center gap-2"><LucideReact.AlertTriangle className="w-4 h-4" /> Headwinds</span>}>
          <div className="space-y-2">
            {(risks ?? []).map((h, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-gray-800/40">
                <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 shrink-0">
                  <LucideReact.AlertTriangle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-100">{h?.title ?? ""}</span>
                    <Badge variant={(h?.severity ?? "") === "high" ? "danger" : "warning"}>
                      {(h?.severity ?? "")?.toUpperCase?.() ?? ""}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400">{h?.desc ?? ""}</p>
                </div>
              </div>
            ))}
          </div>
        </UICard>
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // Overview (Default)
  // ════════════════════════════════════════════════
  var metrics = data?.metrics ?? {};
  var highlights = data?.highlights ?? [];
  var regionalPreview = data?.regionalPreview ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-1">
        <div className="p-2 rounded-xl bg-indigo-500/15">
          <LucideReact.ShoppingCart className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-100">{data?.title ?? "Market Intelligence"}</h2>
          <p className="text-xs text-gray-400">{data?.subtitle ?? ""}</p>
        </div>
      </div>

      <NavBar current="overview" />

      <div className="grid grid-cols-2 gap-2">
        <Stat label={metrics?.metric1Label ?? "Market Size"} value={metrics?.metric1Value ?? "N/A"} change={metrics?.metric1Change ?? ""} trend="up" accent="indigo" />
        <Stat label={metrics?.metric2Label ?? "Growth"} value={metrics?.metric2Value ?? "N/A"} change={metrics?.metric2Change ?? ""} trend="up" accent="blue" />
        <Stat label={metrics?.metric3Label ?? "Buyers"} value={metrics?.metric3Value ?? "N/A"} change={metrics?.metric3Change ?? ""} trend="up" accent="emerald" />
        <Stat label={metrics?.metric4Label ?? "Penetration"} value={metrics?.metric4Value ?? "N/A"} change={metrics?.metric4Change ?? ""} trend="up" accent="cyan" />
      </div>

      {(regionalPreview?.length ?? 0) > 0 && (
        <UICard header={<span className="text-sm font-semibold text-gray-100">Regional Overview</span>}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={regionalPreview} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="region" tick={{ fill: "#94a3b8", fontSize: 9 }} interval={0} angle={-15} textAnchor="end" height={45} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="marketSize" name="Size ($B)" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-end mt-1">
            <Button size="sm" variant="ghost" onClick={() => onAction("regions", { query: data?.query ?? "" })}>
              View All Regions <LucideReact.ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </UICard>
      )}

      {(highlights?.length ?? 0) > 0 && (
        <UICard header={<span className="text-sm font-semibold text-gray-100">Key Insights</span>}>
          <div className="space-y-1.5">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-2">
                <LucideReact.ChevronRight className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                <span className="text-xs text-gray-300">{h ?? ""}</span>
              </div>
            ))}
          </div>
        </UICard>
      )}

      <div className="flex gap-1.5">
        <div className="flex-1">
          <Input placeholder="Search markets, players, trends..." value={searchQuery}
            onChange={(v) => setSearchQuery(v)}
            icon={<LucideReact.Search className="w-3.5 h-3.5" />} size="sm" />
        </div>
        <Button size="sm" variant="primary"
          onClick={() => { if ((searchQuery ?? "").trim()) onAction("search", { query: (searchQuery ?? "").trim() }); }}>
          Search
        </Button>
      </div>

      <div className="text-center text-[10px] text-gray-600 mt-1">
        {data?.source ?? "Data sourced via web search and analyst reports"}
      </div>
    </div>
  );
}
