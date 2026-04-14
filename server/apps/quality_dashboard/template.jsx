export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var fmtDate = function(ts) {
    if (!ts) return "";
    try {
      var d = new Date(typeof ts === "number" ? ts : ts);
      if (isNaN(d.getTime())) return String(ts).substring(0, 10);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch(e) { return String(ts).substring(0, 10); }
  };
  var fmtShortDate = function(str) {
    if (!str) return "";
    var parts = String(str).split("-");
    if (parts.length === 3) return parts[1] + "/" + parts[2];
    return str;
  };
  var trendArrow = function(t) {
    if (t === "improving") return " ↑";
    if (t === "declining") return " ↓";
    return " →";
  };
  var trendColor = function(t) {
    if (t === "improving") return "#10b981";
    if (t === "declining") return "#ef4444";
    return "#6b7280";
  };
  var scoreColor = function(s) {
    if (s >= 80) return "#10b981";
    if (s >= 60) return "#f59e0b";
    return "#ef4444";
  };
  var scoreVariant = function(s) {
    if (s >= 80) return "success";
    if (s >= 60) return "warning";
    return "danger";
  };
  var qualityBadge = function(q) {
    if (q === "good") return "success";
    if (q === "poor") return "danger";
    return "outline";
  };
  var typeBadge = function(t) {
    if (t === "chat") return "info";
    if (t === "action") return "success";
    if (t === "orchestration") return "warning";
    if (t === "proactive") return "default";
    return "outline";
  };
  var confidenceBar = function(c) {
    return Math.round((c || 0) * 100);
  };

  // ── Hooks (all at top level, unconditional) ──
  var tabState = useState("overview");
  var activeTab = tabState[0];
  var setActiveTab = tabState[1];

  var filterState = useState("all");
  var activityFilter = filterState[0];
  var setActivityFilter = filterState[1];

  var qualFilterState = useState("all");
  var qualityFilter = qualFilterState[0];
  var setQualityFilter = qualFilterState[1];

  var detailState = useState(null);
  var detailItem = detailState[0];
  var setDetailItem = detailState[1];

  var periodState = useState("7d");
  var selectedPeriod = periodState[0];
  var setSelectedPeriod = periodState[1];

  var deleteConfirmState = useState(null);
  var deleteConfirm = deleteConfirmState[0];
  var setDeleteConfirm = deleteConfirmState[1];

  // ── Detect which tool view ──
  var tool = data && data.tool ? data.tool : "";
  var isOverview = tool === "enso_quality_dashboard_overview" || (!tool && data && data.compositeScore !== undefined);
  var isActivity = tool === "enso_quality_dashboard_activity";
  var isProfile = tool === "enso_quality_dashboard_profile";
  var isInsights = tool === "enso_quality_dashboard_insights";
  var isFeedback = tool === "enso_quality_dashboard_feedback";

  // ── Feedback Confirmation View ──
  if (isFeedback) {
    return (
      <div style={{ padding: "16px" }}>
        <UICard accent={data.success ? "emerald" : "red"}>
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>
              {data.success ? "✓" : "✗"}
            </div>
            <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "#e5e7eb" }}>
              {data.message || "Feedback recorded"}
            </div>
            {data.totalFeedback > 0 && (
              <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px" }}>
                Total feedback given: {data.totalFeedback}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "16px" }}>
            <Button variant="primary" onClick={() => onAction("overview", {})}>Back to Dashboard</Button>
          </div>
        </UICard>
      </div>
    );
  }

  // ── Profile Delete Confirmation View ──
  if (isProfile && data.action === "delete") {
    return (
      <div style={{ padding: "16px" }}>
        <UICard accent={data.success ? "emerald" : "red"}>
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#e5e7eb" }}>
              {data.success ? "Preference removed" : "Could not remove preference"}
            </div>
            <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px" }}>
              {data.message}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "16px" }}>
            <Button variant="primary" onClick={() => onAction("profile", {})}>Back to Profile</Button>
          </div>
        </UICard>
      </div>
    );
  }

  // ── Navigation Bar ──
  var navTabs = [
    { value: "overview", label: "Quality" },
    { value: "activity", label: "Activity" },
    { value: "profile", label: "Profile" },
    { value: "insights", label: "Insights" }
  ];

  // Determine active section from data
  var currentSection = "overview";
  if (isActivity) currentSection = "activity";
  else if (isProfile) currentSection = "profile";
  else if (isInsights) currentSection = "insights";

  // ── OVERVIEW SCREEN ──
  var renderOverview = function() {
    var score = data && data.compositeScore !== undefined ? data.compositeScore : 75;
    var dims = data && data.dimensions ? data.dimensions : {};
    var dailyScores = data && data.dailyScores ? data.dailyScores : [];
    var sigCounts = data && data.signalCounts ? data.signalCounts : {};
    var confidence = data && data.confidence ? data.confidence : "medium";
    var trend = data && data.trend ? data.trend : "stable";

    // CSS gauge circle
    var circumference = 2 * Math.PI * 54;
    var offset = circumference - (score / 100) * circumference;

    var dimKeys = ["accuracy", "completion", "proactive", "orchestration"];

    // Bar chart — compute max for scaling
    var maxDayScore = 0;
    for (var mi = 0; mi < dailyScores.length; mi++) {
      if (dailyScores[mi].score > maxDayScore) maxDayScore = dailyScores[mi].score;
    }
    if (maxDayScore === 0) maxDayScore = 100;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Score Gauge */}
        <UICard>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "32px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", width: "140px", height: "140px" }}>
              <svg width="140" height="140" viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="60" cy="60" r="54" fill="none" stroke="#1f2937" strokeWidth="8" />
                <circle cx="60" cy="60" r="54" fill="none" stroke={scoreColor(score)} strokeWidth="8"
                  strokeDasharray={circumference} strokeDashoffset={offset}
                  strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
              </svg>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
                <div style={{ fontSize: "36px", fontWeight: 700, color: scoreColor(score), lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>/ 100</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: "180px" }}>
              <div style={{ fontSize: "20px", fontWeight: 600, color: "#e5e7eb", marginBottom: "4px" }}>
                Quality Score
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
                <Badge variant={scoreVariant(score)}>
                  {score >= 80 ? "Excellent" : score >= 60 ? "Good" : "Needs Work"}
                </Badge>
                <span style={{ fontSize: "13px", color: trendColor(trend), fontWeight: 500 }}>
                  {trend.charAt(0).toUpperCase() + trend.slice(1)}{trendArrow(trend)}
                </span>
                <span style={{ fontSize: "12px", color: "#6b7280" }}>
                  Confidence: {confidence}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280" }}>
                Based on {data && data.totalSignals ? data.totalSignals : 0} quality signals
              </div>
              {data && !data.hasRealData && (
                <div style={{ fontSize: "11px", color: "#f59e0b", marginTop: "4px" }}>
                  Sample data — quality tracking will auto-populate as you use Enso
                </div>
              )}
            </div>
          </div>
        </UICard>

        {/* Dimension Breakdown */}
        <UICard header="Quality Dimensions">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            {dimKeys.map(function(key) {
              var dim = dims[key] || { score: 0, trend: "stable", sampleSize: 0, label: key };
              return (
                <div key={key} style={{
                  background: "#111827", borderRadius: "10px", padding: "14px",
                  border: "1px solid " + (dim.score >= 80 ? "#065f4620" : dim.score >= 60 ? "#78350f20" : "#7f1d1d20")
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "13px", color: "#9ca3af", fontWeight: 500 }}>{dim.label}</span>
                    <span style={{ fontSize: "12px", color: trendColor(dim.trend), fontWeight: 500 }}>
                      {trendArrow(dim.trend)}
                    </span>
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: scoreColor(dim.score), marginBottom: "6px" }}>
                    {dim.score}
                  </div>
                  <Progress value={dim.score} max={100} variant={scoreVariant(dim.score)} />
                  <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
                    {dim.sampleSize} signals
                  </div>
                </div>
              );
            })}
          </div>
        </UICard>

        {/* Trend Chart */}
        {dailyScores.length > 0 && (
          <UICard header={"Score Trend — Last " + dailyScores.length + " Days"}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "120px", padding: "8px 0" }}>
              {dailyScores.map(function(day, idx) {
                var barHeight = Math.max(8, (day.score / 100) * 100);
                return (
                  <div key={idx} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: 500 }}>{day.score}</span>
                    <div style={{
                      width: "100%", maxWidth: "32px", height: barHeight + "px",
                      background: "linear-gradient(to top, " + scoreColor(day.score) + "40, " + scoreColor(day.score) + ")",
                      borderRadius: "4px 4px 0 0", minWidth: "12px",
                      transition: "height 0.3s ease"
                    }} />
                    <span style={{ fontSize: "9px", color: "#6b7280", whiteSpace: "nowrap" }}>{fmtShortDate(day.date)}</span>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {/* Signal Counts */}
        <UICard header="Signal Breakdown">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
            {Object.keys(sigCounts).map(function(sigKey) {
              var label = sigKey.replace(".", " ").replace(/^\w/, function(c) { return c.toUpperCase(); });
              return (
                <Stat key={sigKey} label={label} value={sigCounts[sigKey]}
                  accent={sigKey.indexOf("succeeded") >= 0 || sigKey.indexOf("accepted") >= 0 ? "emerald" : sigKey.indexOf("ignored") >= 0 || sigKey.indexOf("regenerated") >= 0 ? "amber" : "blue"} />
              );
            })}
          </div>
        </UICard>

        {/* Period Toggle + Nav */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button variant={selectedPeriod === "7d" ? "primary" : "ghost"} onClick={() => { setSelectedPeriod("7d"); onAction("overview", { period: "7d" }); }}>7 Days</Button>
          <Button variant={selectedPeriod === "30d" ? "primary" : "ghost"} onClick={() => { setSelectedPeriod("30d"); onAction("overview", { period: "30d" }); }}>30 Days</Button>
          <div style={{ flex: 1 }} />
          <Button variant="outline" onClick={() => onAction("activity", {})}>View Activity →</Button>
          <Button variant="outline" onClick={() => onAction("insights", {})}>View Insights →</Button>
        </div>
      </div>
    );
  };

  // ── ACTIVITY FEED SCREEN ──
  var renderActivity = function() {
    var entries = data && data.entries ? data.entries : [];
    var curFilter = data && data.filter ? data.filter : "all";
    var curQuality = data && data.quality ? data.quality : "all";

    var filterOpts = [
      { value: "all", label: "All" },
      { value: "chat", label: "Chat" },
      { value: "action", label: "Actions" },
      { value: "proactive", label: "Proactive" },
      { value: "orchestration", label: "Sprints" }
    ];

    var qualOpts = [
      { value: "all", label: "All Quality" },
      { value: "good", label: "Good" },
      { value: "neutral", label: "Neutral" },
      { value: "poor", label: "Poor" }
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Filters */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {filterOpts.map(function(opt) {
            return (
              <Button key={opt.value}
                variant={curFilter === opt.value ? "primary" : "ghost"}
                onClick={() => { setActivityFilter(opt.value); onAction("activity", { filter: opt.value, quality: curQuality }); }}>
                {opt.label}
              </Button>
            );
          })}
          <div style={{ flex: 1 }} />
          <Select options={qualOpts} value={curQuality}
            onChange={(val) => { setQualityFilter(val); onAction("activity", { filter: curFilter, quality: val }); }} />
        </div>

        {/* Entry Count */}
        <div style={{ fontSize: "13px", color: "#6b7280" }}>
          Showing {entries.length} {curFilter !== "all" ? curFilter : ""} interactions
        </div>

        {/* Activity List */}
        {entries.length === 0 ? (
          <EmptyState icon="activity" title="No activity yet" description="Interactions will appear here as you use Enso" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {entries.map(function(entry) {
              return (
                <div key={entry.id} style={{
                  background: "#111827", borderRadius: "10px", padding: "14px",
                  border: "1px solid #1f2937", cursor: "pointer",
                  transition: "border-color 0.2s"
                }} onClick={() => setDetailItem(detailItem && detailItem.id === entry.id ? null : entry)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                        <Badge variant={typeBadge(entry.type)}>{entry.type}</Badge>
                        <Badge variant={qualityBadge(entry.quality)}>{entry.quality}</Badge>
                        <span style={{ fontSize: "11px", color: "#6b7280" }}>{fmtDate(entry.timestamp)}</span>
                      </div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#e5e7eb", marginBottom: "2px" }}>
                        {entry.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                        {entry.description}
                      </div>
                    </div>
                    {entry.feedback && (
                      <div style={{ fontSize: "20px" }}>
                        {entry.feedback === "thumbs_up" ? "👍" : entry.feedback === "thumbs_down" ? "👎" : "🔄"}
                      </div>
                    )}
                    {entry.sprintScore !== undefined && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: scoreColor(entry.sprintScore * 10) }}>{entry.sprintScore}</div>
                        <div style={{ fontSize: "10px", color: "#6b7280" }}>/10</div>
                      </div>
                    )}
                  </div>

                  {/* Detail expansion */}
                  {detailItem && detailItem.id === entry.id && (
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #1f2937" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
                        <div><span style={{ color: "#6b7280" }}>Signal: </span><span style={{ color: "#d1d5db" }}>{entry.signal || "—"}</span></div>
                        <div><span style={{ color: "#6b7280" }}>Value: </span><span style={{ color: "#d1d5db" }}>{entry.signalValue !== undefined ? entry.signalValue : "—"}</span></div>
                        {entry.toolFamily && <div><span style={{ color: "#6b7280" }}>App: </span><span style={{ color: "#d1d5db" }}>{entry.toolFamily}</span></div>}
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                        <Button variant="ghost" onClick={(e) => { e.stopPropagation(); onAction("feedback", { type: "rating", value: 1, contextId: entry.id }); }}>
                          👍 Helpful
                        </Button>
                        <Button variant="ghost" onClick={(e) => { e.stopPropagation(); onAction("feedback", { type: "rating", value: 0, contextId: entry.id }); }}>
                          👎 Not helpful
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Nav */}
        <div style={{ display: "flex", gap: "8px" }}>
          <Button variant="outline" onClick={() => onAction("overview", {})}>← Quality Overview</Button>
          <div style={{ flex: 1 }} />
          <Button variant="outline" onClick={() => onAction("profile", {})}>My Profile →</Button>
        </div>
      </div>
    );
  };

  // ── PROFILE SCREEN ──
  var renderProfile = function() {
    var categories = data && data.categories ? data.categories : [];
    var totalPrefs = data && data.totalPreferences ? data.totalPreferences : 0;

    var iconMap = {
      briefcase: "💼",
      "message-circle": "💬",
      star: "⭐",
      wrench: "🔧"
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Header */}
        <UICard accent="purple">
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#e5e7eb", marginBottom: "4px" }}>
              What Enso Knows About You
            </div>
            <div style={{ fontSize: "13px", color: "#9ca3af" }}>
              {totalPrefs} learned preferences across {categories.length} categories
            </div>
            <div style={{ fontSize: "12px", color: "#a78bfa", marginTop: "8px" }}>
              You're always in control — edit or remove any preference below
            </div>
          </div>
        </UICard>

        {/* Category Sections */}
        {categories.map(function(cat, ci) {
          return (
            <UICard key={ci} header={
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span>{iconMap[cat.icon] || "📋"}</span>
                <span>{cat.name}</span>
                <Badge variant="outline">{cat.preferences ? cat.preferences.length : 0}</Badge>
              </div>
            }>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {(cat.preferences || []).map(function(pref) {
                  var confPct = confidenceBar(pref.confidence);
                  return (
                    <div key={pref.id} style={{
                      background: "#0f172a", borderRadius: "8px", padding: "12px",
                      border: "1px solid #1e293b"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "2px" }}>{pref.label}</div>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "#e5e7eb" }}>{pref.value}</div>
                        </div>
                        <Button variant="ghost" onClick={() => {
                          if (deleteConfirm === pref.id) {
                            setDeleteConfirm(null);
                            onAction("profile", { action: "delete", preferenceId: pref.id });
                          } else {
                            setDeleteConfirm(pref.id);
                          }
                        }}>
                          {deleteConfirm === pref.id ? "Confirm?" : "✕"}
                        </Button>
                      </div>
                      <div style={{ display: "flex", gap: "16px", alignItems: "center", marginTop: "8px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#6b7280", marginBottom: "2px" }}>
                            <span>Confidence</span>
                            <span>{confPct}%</span>
                          </div>
                          <div style={{ height: "4px", background: "#1f2937", borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{
                              width: confPct + "%", height: "100%",
                              background: confPct >= 80 ? "#10b981" : confPct >= 50 ? "#f59e0b" : "#ef4444",
                              borderRadius: "2px", transition: "width 0.3s"
                            }} />
                          </div>
                        </div>
                        <div style={{ fontSize: "11px", color: "#6b7280", whiteSpace: "nowrap" }}>
                          {pref.evidenceCount} evidence
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </UICard>
          );
        })}

        {categories.length === 0 && (
          <EmptyState icon="user" title="No profile data yet" description="Enso will learn your preferences as you interact" />
        )}

        {/* Nav */}
        <div style={{ display: "flex", gap: "8px" }}>
          <Button variant="outline" onClick={() => onAction("activity", {})}>← Activity Feed</Button>
          <div style={{ flex: 1 }} />
          <Button variant="outline" onClick={() => onAction("insights", {})}>Insights →</Button>
        </div>
      </div>
    );
  };

  // ── INSIGHTS SCREEN ──
  var renderInsights = function() {
    var insights = data && data.insights ? data.insights : [];
    var recs = data && data.recommendations ? data.recommendations : [];
    var summary = data && data.weeklySummary ? data.weeklySummary : {};
    var topApps = summary.topApps || [];
    var compared = summary.comparedToLastWeek || {};

    var impactColors = { high: "#ef4444", medium: "#f59e0b", low: "#6b7280" };
    var insightIcons = { "trending-up": "📈", zap: "⚡", repeat: "🔄", lightbulb: "💡" };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Weekly Summary Stats */}
        <UICard header="This Week at a Glance">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
            <Stat label="Interactions" value={summary.totalInteractions || 0} accent="blue"
              change={compared.interactions ? (compared.interactions > 0 ? "+" + compared.interactions : String(compared.interactions)) : undefined}
              trend={compared.interactions > 0 ? "up" : compared.interactions < 0 ? "down" : "flat"} />
            <Stat label="Tasks Done" value={summary.tasksCompleted || 0} accent="emerald"
              change={compared.tasks ? (compared.tasks > 0 ? "+" + compared.tasks : String(compared.tasks)) : undefined}
              trend={compared.tasks > 0 ? "up" : compared.tasks < 0 ? "down" : "flat"} />
            <Stat label="Entities Created" value={summary.entitiesCreated || 0} accent="purple"
              change={compared.entities ? (compared.entities > 0 ? "+" + compared.entities : String(compared.entities)) : undefined}
              trend={compared.entities > 0 ? "up" : compared.entities < 0 ? "down" : "flat"} />
            <Stat label="Sprints Run" value={summary.orchestrationsRun || 0} accent="amber" />
          </div>
        </UICard>

        {/* Top Apps */}
        {topApps.length > 0 && (
          <UICard header="Most Used Apps">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {topApps.map(function(app, idx) {
                var maxSessions = topApps[0].sessions || 1;
                var barWidth = Math.round((app.sessions / maxSessions) * 100);
                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "120px", fontSize: "13px", color: "#d1d5db", fontWeight: 500 }}>{app.name}</div>
                    <div style={{ flex: 1, height: "20px", background: "#1f2937", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{
                        width: barWidth + "%", height: "100%",
                        background: idx === 0 ? "#3b82f6" : idx === 1 ? "#8b5cf6" : "#6b7280",
                        borderRadius: "4px", transition: "width 0.3s"
                      }} />
                    </div>
                    <div style={{ width: "50px", textAlign: "right", fontSize: "12px", color: "#9ca3af" }}>{app.sessions}</div>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {/* AI Insights */}
        <UICard header="AI-Generated Insights">
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {insights.map(function(insight) {
              return (
                <div key={insight.id} style={{
                  background: "#0f172a", borderRadius: "10px", padding: "14px",
                  borderLeft: "3px solid " + (impactColors[insight.impact] || "#6b7280")
                }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "20px" }}>{insightIcons[insight.icon] || "💡"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "#e5e7eb" }}>{insight.title}</span>
                        <Badge variant={insight.impact === "high" ? "danger" : insight.impact === "medium" ? "warning" : "outline"}>
                          {insight.impact}
                        </Badge>
                      </div>
                      <div style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.5 }}>
                        {insight.description}
                      </div>
                      {insight.confidence && (
                        <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
                          Confidence: {Math.round(insight.confidence * 100)}%
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {insights.length === 0 && (
              <EmptyState icon="sparkles" title="No insights yet" description="Use Enso for a few days to generate personalized insights" />
            )}
          </div>
        </UICard>

        {/* Recommendations */}
        {recs.length > 0 && (
          <UICard header="Recommendations">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {recs.map(function(rec) {
                return (
                  <div key={rec.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "#111827", borderRadius: "8px", padding: "12px", gap: "12px"
                  }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#e5e7eb" }}>{rec.title}</div>
                      <div style={{ fontSize: "12px", color: "#9ca3af" }}>{rec.description}</div>
                    </div>
                    <Button variant="outline" onClick={() => onAction("feedback", { type: "freeform", text: "Interested in: " + rec.title })}>
                      Try
                    </Button>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {data && !data.hasRealData && (
          <div style={{ fontSize: "11px", color: "#f59e0b", textAlign: "center", padding: "8px" }}>
            Insights are based on sample data — they'll become personalized as quality tracking activates
          </div>
        )}

        {/* Period toggle + Nav */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button variant="outline" onClick={() => onAction("insights", { period: "week" })}>This Week</Button>
          <Button variant="outline" onClick={() => onAction("insights", { period: "month" })}>This Month</Button>
          <div style={{ flex: 1 }} />
          <Button variant="outline" onClick={() => onAction("overview", {})}>← Quality Overview</Button>
        </div>
      </div>
    );
  };

  // ── Render active section ──
  return (
    <div style={{ padding: "4px 0" }}>
      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px", background: "#111827", borderRadius: "10px", padding: "4px", overflow: "auto" }}>
        {navTabs.map(function(tab) {
          var isActive = tab.value === currentSection;
          return (
            <button key={tab.value} onClick={() => onAction(tab.value === "overview" ? "overview" : tab.value, {})}
              style={{
                flex: 1, padding: "8px 12px", borderRadius: "8px", border: "none", cursor: "pointer",
                fontSize: "13px", fontWeight: isActive ? 600 : 400, whiteSpace: "nowrap",
                background: isActive ? "#1f2937" : "transparent",
                color: isActive ? "#e5e7eb" : "#6b7280",
                transition: "all 0.2s"
              }}>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isOverview && renderOverview()}
      {isActivity && renderActivity()}
      {isProfile && renderProfile()}
      {isInsights && renderInsights()}
    </div>
  );
}
