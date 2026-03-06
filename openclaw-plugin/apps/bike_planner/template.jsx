export default function GeneratedUI({ data, onAction }) {
  const [logName, setLogName] = useState("");
  const [logDist, setLogDist] = useState("");
  const [logDur, setLogDur] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [showLogForm, setShowLogForm] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [diffFilter, setDiffFilter] = useState("all");

  const tool = data?.tool || "";
  const isDashboard = tool === "enso_bike_dashboard";
  const isLogResult = tool === "enso_bike_log_ride";
  const isRoutes = tool === "enso_bike_find_routes";
  const isDeleteResult = tool === "enso_bike_delete_ride";

  // ── Log Ride Result ──
  if (isLogResult) {
    const ride = data?.ride;
    return (
      <div className="space-y-3">
        <UICard accent={data?.success ? "emerald" : "red"} header={data?.success ? "Ride Logged!" : "Error"}>
          {data?.success ? (
            <div className="space-y-2">
              <div className="flex gap-3 flex-wrap">
                <Stat label="Route" value={ride?.name || ""} accent="blue" />
                <Stat label="Distance" value={(ride?.distance || 0) + " mi"} accent="emerald" />
                <Stat label="Duration" value={ride?.duration || ""} accent="amber" />
                <Stat label="Avg Speed" value={(ride?.avgSpeed || 0) + " mph"} accent="purple" />
              </div>
              {ride?.notes && <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 8 }}>{ride.notes}</div>}
            </div>
          ) : (
            <Badge variant="danger">{data?.error || "Failed to log ride"}</Badge>
          )}
        </UICard>
        <Button variant="primary" onClick={() => onAction("dashboard", {})}>Back to Dashboard</Button>
      </div>
    );
  }

  // ── Delete Result ──
  if (isDeleteResult) {
    return (
      <div className="space-y-3">
        <UICard accent={data?.success ? "emerald" : "red"}>
          <Badge variant={data?.success ? "success" : "danger"}>
            {data?.success ? "Ride deleted" : (data?.error || "Failed to delete")}
          </Badge>
        </UICard>
        <Button variant="primary" onClick={() => onAction("dashboard", {})}>Back to Dashboard</Button>
      </div>
    );
  }

  // ── Find Routes View ──
  if (isRoutes) {
    const routes = data?.routes || [];
    const diffColors = { easy: "emerald", moderate: "amber", hard: "rose" };
    return (
      <div className="space-y-3">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#e5e7eb" }}>
            {LucideReact.MapPin && <LucideReact.MapPin size={18} style={{ display: "inline", marginRight: 6 }} />}
            Routes near {data?.location || "your area"}
          </div>
          <Button variant="ghost" onClick={() => onAction("dashboard", {})}>
            {LucideReact.ArrowLeft && <LucideReact.ArrowLeft size={14} />} Dashboard
          </Button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", "easy", "moderate", "hard"].map(d => (
            <Button key={d} variant={diffFilter === d ? "primary" : "outline"} onClick={() => setDiffFilter(d)}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </Button>
          ))}
        </div>
        {routes.filter(r => diffFilter === "all" || r.difficulty === diffFilter).map((route, i) => (
          <UICard key={i} accent={diffColors[route.difficulty] || "blue"}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, color: "#e5e7eb", fontSize: 15 }}>{route.name}</div>
                <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>{route.description}</div>
              </div>
              <Badge variant={route.difficulty === "easy" ? "success" : route.difficulty === "hard" ? "danger" : "warning"}>
                {route.difficulty}
              </Badge>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <Stat label="Distance" value={route.distance || "N/A"} accent="blue" />
              <Stat label="Elevation" value={route.elevation || "N/A"} accent="amber" />
            </div>
          </UICard>
        ))}
        {routes.length === 0 && <EmptyState title="No routes found" description="Try a different location or difficulty" icon={LucideReact.MapPin} />}
      </div>
    );
  }

  // ── Dashboard (Default) ──
  const weather = data?.weather || {};
  const stats = data?.stats || {};
  const recentRides = data?.recentRides || [];
  const scoreColor = (weather.rideScore || 0) >= 7 ? "emerald" : (weather.rideScore || 0) >= 4 ? "amber" : "rose";

  return (
    <div className="space-y-3">
      <Tabs tabs={[
        { value: "overview", label: "Overview" },
        { value: "rides", label: "Ride Log" },
        { value: "routes", label: "Find Routes" }
      ]} defaultValue="overview" variant="pills">
        {(tab) => {
          if (tab === "routes") {
            return (
              <div className="space-y-3" style={{ marginTop: 12 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <Input
                    placeholder="Enter city or area..."
                    value={locationInput}
                    onChange={e => setLocationInput(e.target.value)}
                  />
                  <Button variant="primary" onClick={() => onAction("find_routes", { location: locationInput || data?.location || "San Francisco" })}>
                    Search
                  </Button>
                </div>
              </div>
            );
          }

          if (tab === "rides") {
            return (
              <div className="space-y-3" style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#e5e7eb" }}>Ride History</div>
                  <Button variant="primary" onClick={() => setShowLogForm(!showLogForm)}>
                    {showLogForm ? "Cancel" : "+ Log Ride"}
                  </Button>
                </div>
                {showLogForm && (
                  <UICard accent="blue">
                    <div className="space-y-2">
                      <Input placeholder="Route name" value={logName} onChange={e => setLogName(e.target.value)} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <Input placeholder="Distance (mi)" value={logDist} onChange={e => setLogDist(e.target.value)} />
                        <Input placeholder="Duration (e.g. 1h 30m)" value={logDur} onChange={e => setLogDur(e.target.value)} />
                      </div>
                      <Input placeholder="Notes (optional)" value={logNotes} onChange={e => setLogNotes(e.target.value)} />
                      <Button variant="primary" onClick={() => {
                        onAction("log_ride", { name: logName, distance: parseFloat(logDist) || 0, duration: logDur, notes: logNotes });
                        setLogName(""); setLogDist(""); setLogDur(""); setLogNotes(""); setShowLogForm(false);
                      }}>Save Ride</Button>
                    </div>
                  </UICard>
                )}
                {recentRides.length > 0 ? (
                  <DataTable
                    columns={[
                      { key: "date", label: "Date", sortable: true },
                      { key: "name", label: "Route", sortable: true },
                      { key: "distance", label: "Miles", sortable: true, render: (v) => (v || 0).toFixed(1) },
                      { key: "duration", label: "Time" },
                      { key: "avgSpeed", label: "Avg MPH", sortable: true, render: (v) => (v || 0).toFixed(1) },
                      { key: "actions", label: "", render: (_, row) => (
                        <Button variant="ghost" onClick={() => onAction("delete_ride", { rideId: row.id })}>
                          {LucideReact.Trash2 && <LucideReact.Trash2 size={14} />}
                        </Button>
                      )}
                    ]}
                    data={recentRides}
                    striped
                    pageSize={10}
                  />
                ) : (
                  <EmptyState title="No rides yet" description="Log your first ride to start tracking!" icon={LucideReact.Bike} />
                )}
              </div>
            );
          }

          // Overview tab
          return (
            <div className="space-y-3" style={{ marginTop: 12 }}>
              <UICard accent={scoreColor} header={"Weather — " + (data?.location || "")}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Stat label="Temperature" value={weather.temp || "N/A"} accent="amber" />
                  <Stat label="Condition" value={weather.condition || "N/A"} accent="blue" />
                  <Stat label="Wind" value={weather.wind || "N/A"} accent="cyan" />
                  <Stat label="Ride Score" value={(weather.rideScore || "?") + "/10"} accent={scoreColor} />
                </div>
                {weather.recommendation && (
                  <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 8 }}>{weather.recommendation}</div>
                )}
              </UICard>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Stat label="Total Rides" value={stats.totalRides || 0} accent="blue" />
                <Stat label="Total Miles" value={(stats.totalDistance || 0).toFixed(1)} accent="emerald" />
                <Stat label="Avg Speed" value={(stats.avgSpeed || 0) + " mph"} accent="purple" />
                <Stat label="Longest" value={(stats.longestRide || 0) + " mi"} accent="amber" />
                <Stat label="This Month" value={(stats.thisMonth || 0) + " rides"} accent="cyan" />
              </div>

              {recentRides.length > 0 && (
                <UICard header="Recent Rides">
                  {recentRides.slice(0, 5).map((ride, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < Math.min(recentRides.length, 5) - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                      <div>
                        <span style={{ color: "#e5e7eb", fontWeight: 500 }}>{ride.name}</span>
                        <span style={{ color: "#6b7280", fontSize: 12, marginLeft: 8 }}>{ride.date}</span>
                      </div>
                      <div style={{ color: "#9ca3af", fontSize: 13 }}>
                        {(ride.distance || 0).toFixed(1)} mi · {ride.duration}
                      </div>
                    </div>
                  ))}
                </UICard>
              )}
            </div>
          );
        }}
      </Tabs>
    </div>
  );
}
