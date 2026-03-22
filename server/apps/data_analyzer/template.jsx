export default function GeneratedUI({ data, onAction }) {
  const [inputData, setInputData] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [xCol, setXCol] = useState("");
  const [yCol, setYCol] = useState("");
  const [filterCol, setFilterCol] = useState("");
  const [filterOp, setFilterOp] = useState("eq");
  const [filterVal, setFilterVal] = useState("");
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState("asc");

  const isChart = data?.tool === "enso_data_analyzer_chart";
  const isQuery = data?.tool === "enso_data_analyzer_query";

  if (data?.error && !data?.columns) {
    return (
      <UICard accent="rose" header="Data Analyzer">
        <Alert variant="danger" title="Error">{data.error}</Alert>
        <div className="mt-3">
          <Textarea
            value={inputData}
            onChange={setInputData}
            placeholder="Paste CSV or JSON data here..."
            rows={6}
          />
          <Button variant="primary" className="mt-2" onClick={() => onAction("analyze", { data: inputData, format: "auto" })}>
            Analyze Data
          </Button>
        </div>
      </UICard>
    );
  }

  if (isChart) {
    const chartData = data?.chartData ?? [];
    const type = data?.chartType ?? "bar";
    const COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#f97316", "#6366f1", "#14b8a6"];

    return (
      <UICard accent="cyan" header={<span className="font-semibold">Chart — {type} ({data?.xColumn} vs {data?.yColumn})</span>}>
        <div className="mb-3">
          <Badge variant="info">{chartData.length} data points</Badge>
        </div>
        {chartData.length === 0 ? (
          <EmptyState icon={<LucideReact.BarChart3 size={28} />} title="No chart data" description="Check your column selection" />
        ) : type === "pie" ? (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={100} label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 6 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : type === "line" ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 6 }} />
              <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : type === "area" ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 6 }} />
              <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 6 }} />
              <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
        <Button variant="ghost" className="mt-2" onClick={() => onAction("analyze", { data: "" })}>
          <LucideReact.ArrowLeft size={14} /> Back to Analysis
        </Button>
      </UICard>
    );
  }

  if (isQuery) {
    const rows = data?.rows ?? [];
    const applied = data?.applied ?? {};
    const colKeys = rows.length > 0 ? Object.keys(rows[0]) : [];

    return (
      <UICard accent="amber" header={<span className="font-semibold">Query Results — {data?.rowCount ?? 0} rows</span>}>
        {Object.keys(applied).length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {applied.filter && <Badge variant="info">Filter: {applied.filter}</Badge>}
            {applied.sort && <Badge variant="info">Sort: {applied.sort}</Badge>}
          </div>
        )}
        {rows.length === 0 ? (
          <EmptyState icon={<LucideReact.SearchX size={28} />} title="No matching rows" description="Try adjusting your filters" />
        ) : (
          <DataTable
            columns={colKeys.map(k => ({ key: k, label: k, sortable: true }))}
            data={rows}
            pageSize={15}
            striped
          />
        )}
        <Button variant="ghost" className="mt-2" onClick={() => onAction("analyze", { data: "" })}>
          <LucideReact.ArrowLeft size={14} /> Back to Analysis
        </Button>
      </UICard>
    );
  }

  const columns = data?.columns ?? [];
  const preview = data?.preview ?? [];
  const numericCols = columns.filter(c => c.type === "number").map(c => c.name);
  const allColNames = columns.map(c => c.name);

  return (
    <div className="space-y-4">
      <UICard accent="violet" header={
        <div className="flex items-center justify-between w-full">
          <span className="font-semibold flex items-center gap-2">
            <LucideReact.Database size={16} /> Data Analyzer
          </span>
          {data?.rowCount != null && (
            <Badge variant="info">{data.rowCount} rows x {data.columnCount ?? columns.length} cols</Badge>
          )}
        </div>
      }>
        <Tabs
          tabs={[
            { value: "stats", label: "Statistics", icon: <LucideReact.BarChart3 size={13} /> },
            { value: "data", label: "Data", icon: <LucideReact.Table size={13} /> },
            { value: "chart", label: "Chart", icon: <LucideReact.PieChart size={13} /> },
            { value: "query", label: "Query", icon: <LucideReact.Filter size={13} /> },
            { value: "input", label: "New Data", icon: <LucideReact.Upload size={13} /> },
          ]}
          defaultValue={columns.length > 0 ? "stats" : "input"}
        >
          {(tab) => (
            <>
              {tab === "stats" && (
                <div className="space-y-3">
                  {columns.length === 0 ? (
                    <EmptyState icon={<LucideReact.Database size={28} />} title="No data" description="Paste data in the New Data tab" />
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {columns.filter(c => c.type === "number").map(c => (
                          <Stat key={c.name} label={c.name} value={c.mean ?? "—"} accent="violet" change={c.max !== undefined ? Math.round((c.max - c.min) / (c.mean || 1) * 100) : undefined} />
                        ))}
                      </div>
                      <Separator />
                      <DataTable
                        columns={[
                          { key: "name", label: "Column", sortable: true },
                          { key: "type", label: "Type", render: v => <Badge variant={v === "number" ? "info" : "default"}>{v}</Badge> },
                          { key: "unique", label: "Unique", sortable: true },
                          { key: "nulls", label: "Nulls", sortable: true, render: v => v > 0 ? <Badge variant="warning">{v}</Badge> : <span className="text-gray-500">0</span> },
                          { key: "min", label: "Min", render: v => v != null ? String(v) : "—" },
                          { key: "max", label: "Max", render: v => v != null ? String(v) : "—" },
                          { key: "mean", label: "Mean", render: v => v != null ? String(v) : "—" },
                        ]}
                        data={columns}
                        compact
                      />
                    </>
                  )}
                </div>
              )}

              {tab === "data" && (
                <div>
                  {preview.length === 0 ? (
                    <EmptyState icon={<LucideReact.Table size={28} />} title="No data loaded" />
                  ) : (
                    <DataTable
                      columns={allColNames.map(k => ({ key: k, label: k, sortable: true }))}
                      data={preview}
                      pageSize={10}
                      striped
                    />
                  )}
                </div>
              )}

              {tab === "chart" && (
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap items-end">
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">Chart Type</p>
                      <Select options={[{ value: "bar", label: "Bar" }, { value: "line", label: "Line" }, { value: "pie", label: "Pie" }, { value: "area", label: "Area" }]} value={chartType} onChange={setChartType} />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">X Column</p>
                      <Select options={allColNames.map(c => ({ value: c, label: c }))} value={xCol} onChange={setXCol} placeholder="Select..." />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">Y Column</p>
                      <Select options={numericCols.map(c => ({ value: c, label: c }))} value={yCol} onChange={setYCol} placeholder="Select..." />
                    </div>
                    <Button variant="primary" onClick={() => onAction("chart", { chart_type: chartType, x_column: xCol, y_column: yCol })} disabled={!xCol || !yCol}>
                      Generate Chart
                    </Button>
                  </div>
                  {allColNames.length === 0 && <Alert variant="info">Load data first to generate charts</Alert>}
                </div>
              )}

              {tab === "query" && (
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap items-end">
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">Filter Column</p>
                      <Select options={allColNames.map(c => ({ value: c, label: c }))} value={filterCol} onChange={setFilterCol} placeholder="Column..." />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">Operator</p>
                      <Select options={[{ value: "eq", label: "=" }, { value: "neq", label: "!=" }, { value: "gt", label: ">" }, { value: "lt", label: "<" }, { value: "gte", label: ">=" }, { value: "lte", label: "<=" }, { value: "contains", label: "Contains" }]} value={filterOp} onChange={setFilterOp} />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">Value</p>
                      <Input value={filterVal} onChange={setFilterVal} placeholder="Value..." />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap items-end">
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">Sort Column</p>
                      <Select options={allColNames.map(c => ({ value: c, label: c }))} value={sortCol} onChange={setSortCol} placeholder="Sort by..." />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">Direction</p>
                      <Select options={[{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]} value={sortDir} onChange={setSortDir} />
                    </div>
                    <Button variant="primary" onClick={() => onAction("query", { filter_column: filterCol, filter_op: filterOp, filter_value: filterVal, sort_column: sortCol, sort_dir: sortDir })}>
                      Run Query
                    </Button>
                  </div>
                </div>
              )}

              {tab === "input" && (
                <div className="space-y-3">
                  <Textarea
                    value={inputData}
                    onChange={setInputData}
                    placeholder={"Paste CSV or JSON data here...\n\nCSV example:\nname,age,score\nAlice,30,85\nBob,25,92\n\nJSON example:\n[{\"name\":\"Alice\",\"age\":30}]"}
                    rows={8}
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => onAction("analyze", { data: inputData, format: "auto" })} disabled={!inputData.trim()}>
                      <LucideReact.Play size={14} /> Analyze
                    </Button>
                    <Button variant="ghost" onClick={() => setInputData("")}>Clear</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Tabs>
      </UICard>
    </div>
  );
}
