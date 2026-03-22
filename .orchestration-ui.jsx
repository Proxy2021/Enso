export default function GeneratedUI({ data, onAction }) {
  // ── State ──
  var _tab = useState("compare");
  var activeTab = _tab[0]; var setActiveTab = _tab[1];

  var _chart = useState("radar");
  var chartType = _chart[0]; var setChartType = _chart[1];

  var _expanded = useState(null);
  var expandedFw = _expanded[0]; var setExpandedFw = _expanded[1];

  var _hovered = useState(null);
  var hoveredRow = _hovered[0]; var setHoveredRow = _hovered[1];

  var _scenarios = useState({
    teamSize: "small", priority: "speed", typescript: "optional",
    mobile: "webOnly", industry: "startup", hiring: "easy"
  });
  var scenarios = _scenarios[0]; var setScenarios = _scenarios[1];

  // ── Data Constants ──
  var FW = [
    { id: "react", name: "React", tagline: "The Ecosystem King", icon: "Code2" },
    { id: "vue", name: "Vue", tagline: "The DX Champion", icon: "Layers" },
    { id: "angular", name: "Angular", tagline: "The Enterprise Fortress", icon: "Shield" }
  ];

  var COLORS = {
    react: { pri: "#58a6ff", bg: "rgba(88,166,255,0.08)", border: "rgba(88,166,255,0.25)", fill: "rgba(88,166,255,0.12)" },
    vue: { pri: "#3fb950", bg: "rgba(63,185,80,0.08)", border: "rgba(63,185,80,0.25)", fill: "rgba(63,185,80,0.12)" },
    angular: { pri: "#f85149", bg: "rgba(248,81,73,0.08)", border: "rgba(248,81,73,0.25)", fill: "rgba(248,81,73,0.12)" }
  };

  var CATEGORIES = ["Performance", "Bundle Size", "Learning Curve", "TypeScript", "Ecosystem", "Job Market", "Enterprise", "DX Satisfaction", "Tooling", "Community", "Mobile", "SSR/SEO"];
  var SHORT_CATS = ["Perf", "Bundle", "Learn", "TS", "Ecosystem", "Jobs", "Enterprise", "DX", "Tooling", "Community", "Mobile", "SSR"];

  var SCORES = {
    react:   [7.5, 7.0, 7.0, 8.0, 10.0, 10.0, 8.0, 8.0, 8.0, 9.0, 9.0, 9.0],
    vue:     [8.5, 9.0, 9.0, 9.0, 6.0, 5.0, 6.0, 9.0, 9.0, 7.0, 6.0, 8.5],
    angular: [7.0, 5.0, 5.0, 10.0, 7.0, 7.0, 9.5, 7.0, 8.0, 7.5, 7.5, 6.5]
  };

  var OVERALL = { react: 8.4, vue: 7.7, angular: 7.2 };

  var ECO = {
    downloads: { react: 85, vue: 8.7, angular: 0.6, unit: "M/week" },
    stars: { react: 216, vue: 208, angular: 96, unit: "K stars" },
    jobs: { react: 52, vue: 8, angular: 26, unit: "K US jobs" },
    questions: { react: 450, vue: 110, angular: 310, unit: "K on SO" }
  };

  var PERF = [
    { metric: "Min Bundle (KB)", react: 42, vue: 33, angular: 167, lower: true },
    { metric: "Typical Bundle (KB)", react: 225, vue: 185, angular: 400, lower: true },
    { metric: "Startup Speed", react: 100, vue: 119, angular: 85, lower: false },
    { metric: "Memory Efficiency", react: 100, vue: 121, angular: 98, lower: false },
    { metric: "UI Update Speed", react: 100, vue: 105, angular: 125, lower: false }
  ];

  var USE_CASES = [
    { scenario: "Startup / MVP", react: 9, vue: 9, angular: 5, best: "React or Vue" },
    { scenario: "Enterprise (large team)", react: 8, vue: 6, angular: 9, best: "Angular" },
    { scenario: "E-commerce SPA", react: 9, vue: 8, angular: 7, best: "React" },
    { scenario: "Dashboard / Admin", react: 8, vue: 9, angular: 8, best: "Vue" },
    { scenario: "Real-time App", react: 8, vue: 7, angular: 8, best: "React or Angular" },
    { scenario: "Content Site / Blog", react: 8, vue: 8, angular: 5, best: "React or Vue" },
    { scenario: "PWA", react: 8, vue: 8, angular: 9, best: "Angular" },
    { scenario: "Mobile (hybrid)", react: 9, vue: 7, angular: 8, best: "React" },
    { scenario: "Government / Regulated", react: 6, vue: 5, angular: 9, best: "Angular" },
    { scenario: "Rapid Prototyping", react: 7, vue: 9, angular: 4, best: "Vue" },
    { scenario: "Micro-frontends", react: 8, vue: 7, angular: 8, best: "React or Angular" },
    { scenario: "AI/ML Dashboards", react: 9, vue: 7, angular: 6, best: "React" }
  ];

  var PROS_CONS = {
    react: {
      pros: ["Largest ecosystem — 85M weekly npm downloads", "Dominant job market (60% of frontend roles)", "React Native for true cross-platform mobile", "Server Components & Next.js innovation", "Massive community & learning resources"],
      cons: ["Ecosystem fragmentation (many competing libs)", "Steeper hooks learning curve than Vue", "No official state management solution", "JSX can feel alien to HTML-first devs"]
    },
    vue: {
      pros: ["Fastest learning curve (1-2 weeks)", "Best raw performance & smallest bundle (33KB)", "Excellent TypeScript support via Volar", "Pinia: clear official state management", "Fastest growing — 37% YoY download increase"],
      cons: ["Smallest job market (~10% of frontend)", "Smaller ecosystem than React", "No strong mobile story (no Vue Native)", "Fewer enterprise case studies"]
    },
    angular: {
      pros: ["Best TypeScript integration (native)", "Opinionated architecture scales to large teams", "Built-in everything: router, forms, HTTP, DI", "Signals + zoneless = 20-30% faster updates", "Dominant in finance, healthcare, government"],
      cons: ["Steepest learning curve (4-8 weeks)", "Largest bundle size (167KB minimum)", "RxJS complexity barrier for newcomers", "Slower startup than React/Vue", "Decorator-heavy syntax"]
    }
  };

  var SCENARIO_WEIGHTS = {
    teamSize: { small: { react: 2, vue: 3, angular: -1 }, large: { react: 1, vue: -1, angular: 3 } },
    priority: { speed: { react: 2, vue: 3, angular: -2 }, scale: { react: 1, vue: -1, angular: 3 } },
    typescript: { optional: { react: 1, vue: 1, angular: -1 }, required: { react: 0, vue: 1, angular: 3 } },
    mobile: { webOnly: { react: 1, vue: 2, angular: 1 }, crossPlatform: { react: 3, vue: -1, angular: 1 } },
    industry: { startup: { react: 3, vue: 2, angular: -1 }, enterprise: { react: 1, vue: -1, angular: 3 } },
    hiring: { easy: { react: 3, vue: -1, angular: 1 }, niche: { react: 0, vue: 2, angular: 1 } }
  };

  // ── Helpers ──
  var radarPt = function (i, val, n, cx, cy, maxR) {
    var angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + (val / 10) * maxR * Math.cos(angle), y: cy + (val / 10) * maxR * Math.sin(angle) };
  };

  var polyPoints = function (vals, cx, cy, maxR) {
    return vals.map(function (v, i) {
      var p = radarPt(i, v, vals.length, cx, cy, maxR);
      return p.x.toFixed(1) + "," + p.y.toFixed(1);
    }).join(" ");
  };

  var computeScores = function (sc) {
    var raw = { react: 10, vue: 10, angular: 10 };
    Object.keys(sc).forEach(function (k) {
      var w = SCENARIO_WEIGHTS[k] && SCENARIO_WEIGHTS[k][sc[k]];
      if (w) { raw.react += w.react; raw.vue += w.vue; raw.angular += w.angular; }
    });
    var mx = Math.max(raw.react, raw.vue, raw.angular);
    var mn = Math.min(raw.react, raw.vue, raw.angular);
    var rng = mx - mn || 1;
    return {
      react: Math.round(50 + (raw.react - mn) / rng * 50),
      vue: Math.round(50 + (raw.vue - mn) / rng * 50),
      angular: Math.round(50 + (raw.angular - mn) / rng * 50)
    };
  };

  var winner = function (r, v, a) {
    if (r >= v && r >= a) return "react";
    if (v >= r && v >= a) return "vue";
    return "angular";
  };

  var toggleScenario = function (key, a, b) {
    setScenarios(function (prev) {
      var next = {}; for (var k in prev) next[k] = prev[k];
      next[key] = prev[key] === a ? b : a;
      return next;
    });
  };

  // Count category wins
  var wins = { react: 0, vue: 0, angular: 0 };
  CATEGORIES.forEach(function (c, i) {
    var w = winner(SCORES.react[i], SCORES.vue[i], SCORES.angular[i]);
    wins[w]++;
  });

  var advisorScores = computeScores(scenarios);
  var ranked = [
    { id: "react", name: "React", score: advisorScores.react },
    { id: "vue", name: "Vue", score: advisorScores.vue },
    { id: "angular", name: "Angular", score: advisorScores.angular }
  ].sort(function (a, b) { return b.score - a.score; });

  // ── Styles ──
  var s = {
    root: {
      fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: "linear-gradient(145deg, #0d1117 0%, #161b22 50%, #0d1117 100%)",
      borderRadius: "16px",
      border: "1px solid #21262d",
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "14px",
      color: "#e6edf3",
      fontSize: "13px",
      lineHeight: "1.5",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(48,54,61,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
    },
    headerBar: {
      background: "linear-gradient(135deg, rgba(88,166,255,0.1) 0%, rgba(63,185,80,0.08) 40%, rgba(248,81,73,0.06) 100%)",
      borderRadius: "12px",
      border: "1px solid rgba(88,166,255,0.2)",
      padding: "16px",
      position: "relative",
      overflow: "hidden",
    },
    badge: function (fwId) {
      var c = COLORS[fwId] || { pri: "#8b949e", bg: "rgba(139,148,158,0.12)", border: "rgba(139,148,158,0.25)" };
      return {
        display: "inline-flex", alignItems: "center", gap: "4px",
        padding: "2px 8px", borderRadius: "12px",
        fontSize: "10px", fontWeight: "600", letterSpacing: "0.02em",
        background: c.bg, border: "1px solid " + c.border, color: c.pri,
        whiteSpace: "nowrap",
      };
    },
    card: {
      background: "rgba(22,27,34,0.8)", borderRadius: "12px",
      border: "1px solid #21262d", overflow: "hidden",
      backdropFilter: "blur(8px)",
    },
    tabBar: { display: "flex", borderBottom: "1px solid #21262d", background: "rgba(22,27,34,0.5)" },
    tab: function (active, color) {
      return {
        flex: 1, padding: "10px 12px", fontSize: "11px", fontWeight: "600",
        fontFamily: "inherit", textAlign: "center", cursor: "pointer",
        border: "none", borderBottom: active ? "2px solid " + (color || "#58a6ff") : "2px solid transparent",
        background: active ? "rgba(88,166,255,0.05)" : "transparent",
        color: active ? (color || "#58a6ff") : "#8b949e",
        transition: "all 0.2s ease", letterSpacing: "0.02em",
      };
    },
    cardBody: { padding: "14px" },
    statBox: function (fwId) {
      var c = COLORS[fwId] || COLORS.react;
      return {
        background: c.bg, borderRadius: "10px", border: "1px solid " + c.border,
        padding: "12px", display: "flex", flexDirection: "column", gap: "2px",
        flex: 1, minWidth: 0,
      };
    },
    progressBar: function (pct, color) {
      return {
        height: "8px", borderRadius: "4px",
        background: color || "#58a6ff",
        width: pct + "%",
        transition: "width 0.5s ease",
      };
    },
  };

  // ── Render ──
  return (
    <div style={s.root}>

      {/* ═══ HERO SECTION ═══ */}
      <div style={s.headerBar}>
        <div style={{ position: "absolute", top: "-30px", right: "-30px", width: "120px", height: "120px", background: "radial-gradient(circle, rgba(88,166,255,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", position: "relative", zIndex: 1 }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(88,166,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <LucideReact.Zap style={{ width: "18px", height: "18px", color: "#58a6ff" }} />
          </div>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "700", color: "#f0f6fc", letterSpacing: "-0.01em" }}>Frontend Framework Showdown 2026</div>
            <div style={{ fontSize: "11px", color: "#8b949e", marginTop: "2px" }}>React vs Vue vs Angular — Data-driven comparison</div>
          </div>
        </div>

        {/* Framework identity cards */}
        <div style={{ display: "flex", gap: "8px", position: "relative", zIndex: 1 }}>
          {FW.map(function (fw) {
            var Icon = LucideReact[fw.icon];
            var c = COLORS[fw.id];
            return (
              <div key={fw.id} style={{ flex: 1, background: c.bg, borderRadius: "10px", border: "1px solid " + c.border, padding: "12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: c.fill, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon style={{ width: "15px", height: "15px", color: c.pri }} />
                </div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: c.pri }}>{fw.name}</div>
                <div style={{ fontSize: "22px", fontWeight: "800", color: "#f0f6fc", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{OVERALL[fw.id]}</div>
                <div style={{ fontSize: "9px", color: "#8b949e", textAlign: "center", letterSpacing: "0.02em" }}>{fw.tagline}</div>
              </div>
            );
          })}
        </div>

        {/* Key stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px", marginTop: "10px", position: "relative", zIndex: 1 }}>
          {[
            { label: "Downloads", value: "85M/wk", fw: "react" },
            { label: "Smallest", value: "33KB", fw: "vue" },
            { label: "Most Jobs", value: "52K", fw: "react" },
            { label: "Top TS", value: "10/10", fw: "angular" }
          ].map(function (stat, i) {
            return (
              <div key={i} style={{ background: "rgba(22,27,34,0.6)", borderRadius: "8px", border: "1px solid #21262d", padding: "8px", textAlign: "center" }}>
                <div style={{ fontSize: "9px", fontWeight: "600", color: "#484f58", textTransform: "uppercase", letterSpacing: "0.05em" }}>{stat.label}</div>
                <div style={{ fontSize: "14px", fontWeight: "800", color: "#e6edf3", marginTop: "2px", fontVariantNumeric: "tabular-nums" }}>{stat.value}</div>
                <div style={{ fontSize: "9px", color: COLORS[stat.fw].pri, fontWeight: "600", marginTop: "1px" }}>{FW.find(function (f) { return f.id === stat.fw; }).name}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: "9px", color: "#484f58", textAlign: "center", marginTop: "8px", position: "relative", zIndex: 1 }}>Data: Stack Overflow 2025 Survey · NPM Trends March 2026 · Krausest Benchmarks</div>
      </div>

      {/* ═══ MAIN TABBED CONTENT ═══ */}
      <div style={s.card}>
        <div style={s.tabBar}>
          {[
            { key: "compare", label: "Compare", icon: "BarChart3" },
            { key: "visualize", label: "Visualize", icon: "PieChart" },
            { key: "deepdive", label: "Deep Dive", icon: "BookOpen" },
            { key: "advisor", label: "Advisor", icon: "Sparkles" }
          ].map(function (t) {
            var Icon = LucideReact[t.icon];
            return (
              <button key={t.key} style={s.tab(activeTab === t.key)} onClick={function () { setActiveTab(t.key); }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Icon style={{ width: "12px", height: "12px" }} />
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>

        <div style={s.cardBody}>

          {/* ─── COMPARE TAB ─── */}
          {activeTab === "compare" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {/* Table header */}
              <div style={{ display: "flex", padding: "8px 10px", borderRadius: "8px 8px 0 0", background: "rgba(22,27,34,0.6)", borderBottom: "1px solid #21262d" }}>
                <div style={{ flex: 2, fontSize: "10px", fontWeight: "700", color: "#484f58", textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</div>
                <div style={{ flex: 1, fontSize: "10px", fontWeight: "700", color: COLORS.react.pri, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>React</div>
                <div style={{ flex: 1, fontSize: "10px", fontWeight: "700", color: COLORS.vue.pri, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>Vue</div>
                <div style={{ flex: 1, fontSize: "10px", fontWeight: "700", color: COLORS.angular.pri, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>Angular</div>
                <div style={{ width: "60px", fontSize: "10px", fontWeight: "700", color: "#484f58", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>Best</div>
              </div>
              {/* Table rows */}
              {CATEGORIES.map(function (cat, i) {
                var r = SCORES.react[i]; var v = SCORES.vue[i]; var a = SCORES.angular[i];
                var w = winner(r, v, a);
                var isHovered = hoveredRow === i;
                return (
                  <div key={i} style={{
                    display: "flex", padding: "8px 10px", alignItems: "center",
                    background: isHovered ? "rgba(88,166,255,0.04)" : (i % 2 === 0 ? "transparent" : "rgba(22,27,34,0.3)"),
                    borderBottom: "1px solid rgba(33,38,45,0.4)",
                    transition: "background 0.15s",
                  }} onMouseEnter={function () { setHoveredRow(i); }} onMouseLeave={function () { setHoveredRow(null); }}>
                    <div style={{ flex: 2, fontSize: "12px", fontWeight: "500", color: "#c9d1d9" }}>{cat}</div>
                    <div style={{ flex: 1, textAlign: "center", fontSize: "13px", fontWeight: w === "react" ? "700" : "400", color: w === "react" ? COLORS.react.pri : "#6e7681", fontVariantNumeric: "tabular-nums" }}>
                      {r}{w === "react" && " ★"}
                    </div>
                    <div style={{ flex: 1, textAlign: "center", fontSize: "13px", fontWeight: w === "vue" ? "700" : "400", color: w === "vue" ? COLORS.vue.pri : "#6e7681", fontVariantNumeric: "tabular-nums" }}>
                      {v}{w === "vue" && " ★"}
                    </div>
                    <div style={{ flex: 1, textAlign: "center", fontSize: "13px", fontWeight: w === "angular" ? "700" : "400", color: w === "angular" ? COLORS.angular.pri : "#6e7681", fontVariantNumeric: "tabular-nums" }}>
                      {a}{w === "angular" && " ★"}
                    </div>
                    <div style={{ width: "60px", textAlign: "center" }}>
                      <span style={s.badge(w)}>{FW.find(function (f) { return f.id === w; }).name}</span>
                    </div>
                  </div>
                );
              })}
              {/* Summary */}
              <div style={{ display: "flex", justifyContent: "center", gap: "16px", padding: "10px", borderTop: "1px solid #21262d", marginTop: "4px" }}>
                {FW.map(function (fw) {
                  return (
                    <span key={fw.id} style={{ fontSize: "11px", color: COLORS[fw.id].pri, fontWeight: "600" }}>
                      {fw.name}: {wins[fw.id]} wins
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── VISUALIZE TAB ─── */}
          {activeTab === "visualize" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Chart type toggle */}
              <div style={{ display: "flex", gap: "4px", background: "rgba(22,27,34,0.6)", borderRadius: "8px", padding: "3px" }}>
                {[
                  { key: "radar", label: "Radar", icon: "Target" },
                  { key: "bar", label: "Bar Chart", icon: "BarChart3" },
                  { key: "ecosystem", label: "Ecosystem", icon: "Globe" }
                ].map(function (ct) {
                  var Icon = LucideReact[ct.icon];
                  var isActive = chartType === ct.key;
                  return (
                    <button key={ct.key} onClick={function () { setChartType(ct.key); }} style={{
                      flex: 1, padding: "6px 10px", borderRadius: "6px", border: "none",
                      fontSize: "11px", fontWeight: "600", fontFamily: "inherit", cursor: "pointer",
                      background: isActive ? "rgba(88,166,255,0.15)" : "transparent",
                      color: isActive ? "#58a6ff" : "#8b949e",
                      transition: "all 0.2s",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                    }}>
                      <Icon style={{ width: "12px", height: "12px" }} />
                      {ct.label}
                    </button>
                  );
                })}
              </div>

              {/* RADAR CHART */}
              {chartType === "radar" && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <svg viewBox="0 0 320 320" style={{ width: "100%", maxWidth: "320px" }}>
                    {/* Grid circles */}
                    {[2, 4, 6, 8, 10].map(function (level) {
                      return <circle key={level} cx="160" cy="160" r={level * 11} fill="none" stroke="#21262d" strokeWidth="0.5" opacity={level === 10 ? "0.8" : "0.4"} />;
                    })}
                    {/* Grid labels */}
                    {[2, 4, 6, 8, 10].map(function (level) {
                      return <text key={"gl" + level} x="163" y={160 - level * 11 + 3} fill="#484f58" fontSize="7" fontFamily="inherit">{level}</text>;
                    })}
                    {/* Axis lines */}
                    {CATEGORIES.map(function (cat, i) {
                      var angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
                      var x2 = 160 + 110 * Math.cos(angle);
                      var y2 = 160 + 110 * Math.sin(angle);
                      return <line key={i} x1="160" y1="160" x2={x2} y2={y2} stroke="#21262d" strokeWidth="0.5" />;
                    })}
                    {/* Framework polygons */}
                    <polygon points={polyPoints(SCORES.react, 160, 160, 110)} fill="rgba(88,166,255,0.1)" stroke="#58a6ff" strokeWidth="1.5" />
                    <polygon points={polyPoints(SCORES.vue, 160, 160, 110)} fill="rgba(63,185,80,0.1)" stroke="#3fb950" strokeWidth="1.5" />
                    <polygon points={polyPoints(SCORES.angular, 160, 160, 110)} fill="rgba(248,81,73,0.08)" stroke="#f85149" strokeWidth="1.5" />
                    {/* Data points */}
                    {["react", "vue", "angular"].map(function (fwId) {
                      return SCORES[fwId].map(function (val, i) {
                        var pt = radarPt(i, val, 12, 160, 160, 110);
                        return <circle key={fwId + i} cx={pt.x} cy={pt.y} r="2.5" fill={COLORS[fwId].pri} opacity="0.8" />;
                      });
                    })}
                    {/* Category labels */}
                    {SHORT_CATS.map(function (label, i) {
                      var angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
                      var lx = 160 + 128 * Math.cos(angle);
                      var ly = 160 + 128 * Math.sin(angle);
                      var anchor = Math.abs(Math.cos(angle)) < 0.1 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
                      return <text key={i} x={lx} y={ly + 3} textAnchor={anchor} fill="#8b949e" fontSize="8" fontFamily="inherit">{label}</text>;
                    })}
                  </svg>
                </div>
              )}

              {/* BAR CHART */}
              {chartType === "bar" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {CATEGORIES.map(function (cat, i) {
                    var r = SCORES.react[i]; var v = SCORES.vue[i]; var a = SCORES.angular[i];
                    var maxVal = 10;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "70px", fontSize: "10px", color: "#8b949e", textAlign: "right", flexShrink: 0 }}>{SHORT_CATS[i]}</div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
                          {[
                            { val: r, color: COLORS.react.pri, name: "React" },
                            { val: v, color: COLORS.vue.pri, name: "Vue" },
                            { val: a, color: COLORS.angular.pri, name: "Angular" }
                          ].map(function (bar) {
                            return (
                              <div key={bar.name} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <div style={{ height: "6px", borderRadius: "3px", background: bar.color, width: (bar.val / maxVal * 100) + "%", transition: "width 0.4s ease", opacity: 0.8 }} />
                                <span style={{ fontSize: "9px", color: bar.color, fontWeight: "600", fontVariantNumeric: "tabular-nums", minWidth: "20px" }}>{bar.val}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {/* Legend */}
                  <div style={{ display: "flex", justifyContent: "center", gap: "16px", paddingTop: "8px", borderTop: "1px solid #21262d" }}>
                    {FW.map(function (fw) {
                      return (
                        <div key={fw.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: COLORS[fw.id].pri }} />
                          <span style={{ fontSize: "10px", color: "#8b949e" }}>{fw.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ECOSYSTEM VIEW */}
              {chartType === "ecosystem" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* NPM Downloads donut */}
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <svg viewBox="0 0 200 200" style={{ width: "140px", height: "140px", flexShrink: 0 }}>
                      {(function () {
                        var total = 85 + 8.7 + 0.6;
                        var slices = [
                          { val: 85, color: COLORS.react.pri, name: "React" },
                          { val: 8.7, color: COLORS.vue.pri, name: "Vue" },
                          { val: 0.6, color: COLORS.angular.pri, name: "Angular" }
                        ];
                        var startAngle = -Math.PI / 2;
                        return slices.map(function (sl, idx) {
                          var sweep = (sl.val / total) * Math.PI * 2;
                          var endAngle = startAngle + sweep;
                          var outerR = 80; var innerR = 50;
                          var x1o = 100 + outerR * Math.cos(startAngle);
                          var y1o = 100 + outerR * Math.sin(startAngle);
                          var x2o = 100 + outerR * Math.cos(endAngle - 0.01);
                          var y2o = 100 + outerR * Math.sin(endAngle - 0.01);
                          var x1i = 100 + innerR * Math.cos(endAngle - 0.01);
                          var y1i = 100 + innerR * Math.sin(endAngle - 0.01);
                          var x2i = 100 + innerR * Math.cos(startAngle);
                          var y2i = 100 + innerR * Math.sin(startAngle);
                          var large = sweep > Math.PI ? 1 : 0;
                          var d = "M " + x1o + " " + y1o + " A " + outerR + " " + outerR + " 0 " + large + " 1 " + x2o + " " + y2o + " L " + x1i + " " + y1i + " A " + innerR + " " + innerR + " 0 " + large + " 0 " + x2i + " " + y2i + " Z";
                          startAngle = endAngle;
                          return <path key={idx} d={d} fill={sl.color} opacity="0.8" />;
                        });
                      })()}
                      <text x="100" y="96" textAnchor="middle" fill="#e6edf3" fontSize="14" fontWeight="800" fontFamily="inherit">94.3M</text>
                      <text x="100" y="112" textAnchor="middle" fill="#484f58" fontSize="8" fontFamily="inherit">downloads/wk</text>
                    </svg>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "#e6edf3" }}>NPM Downloads</div>
                      {[
                        { name: "React", val: "85M", pct: 90.1, id: "react" },
                        { name: "Vue", val: "8.7M", pct: 9.2, id: "vue" },
                        { name: "Angular", val: "605K", pct: 0.6, id: "angular" }
                      ].map(function (item) {
                        return (
                          <div key={item.id}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginBottom: "2px" }}>
                              <span style={{ color: COLORS[item.id].pri, fontWeight: "600" }}>{item.name}</span>
                              <span style={{ color: "#8b949e" }}>{item.val} ({item.pct}%)</span>
                            </div>
                            <div style={{ height: "6px", borderRadius: "3px", background: "rgba(33,38,45,0.8)", overflow: "hidden" }}>
                              <div style={s.progressBar(Math.max(item.pct, 2), COLORS[item.id].pri)} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Ecosystem stats grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                    {[
                      { label: "GitHub Stars", data: ECO.stars },
                      { label: "Job Openings", data: ECO.jobs },
                      { label: "SO Questions", data: ECO.questions }
                    ].map(function (metric, mi) {
                      return (
                        <div key={mi} style={{ background: "rgba(22,27,34,0.6)", borderRadius: "8px", border: "1px solid #21262d", padding: "10px" }}>
                          <div style={{ fontSize: "9px", fontWeight: "600", color: "#484f58", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>{metric.label}</div>
                          {FW.map(function (fw) {
                            var val = metric.data[fw.id];
                            var maxV = Math.max(metric.data.react, metric.data.vue, metric.data.angular);
                            return (
                              <div key={fw.id} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
                                <div style={{ width: "3px", height: "12px", borderRadius: "2px", background: COLORS[fw.id].pri, flexShrink: 0 }} />
                                <div style={{ flex: 1, height: "4px", borderRadius: "2px", background: "rgba(33,38,45,0.8)", overflow: "hidden" }}>
                                  <div style={{ height: "100%", borderRadius: "2px", background: COLORS[fw.id].pri, width: (val / maxV * 100) + "%", opacity: 0.7 }} />
                                </div>
                                <span style={{ fontSize: "9px", color: COLORS[fw.id].pri, fontWeight: "600", fontVariantNumeric: "tabular-nums", minWidth: "28px", textAlign: "right" }}>{val}K</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Radar chart legend (shared) */}
              {chartType === "radar" && (
                <div style={{ display: "flex", justifyContent: "center", gap: "16px" }}>
                  {FW.map(function (fw) {
                    return (
                      <div key={fw.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <div style={{ width: "12px", height: "3px", borderRadius: "2px", background: COLORS[fw.id].pri }} />
                        <span style={{ fontSize: "10px", color: "#8b949e" }}>{fw.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── DEEP DIVE TAB ─── */}
          {activeTab === "deepdive" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {FW.map(function (fw) {
                var Icon = LucideReact[fw.icon];
                var c = COLORS[fw.id];
                var isOpen = expandedFw === fw.id;
                var pros = PROS_CONS[fw.id].pros;
                var cons = PROS_CONS[fw.id].cons;
                var bestCases = USE_CASES.filter(function (uc) { return uc[fw.id] >= 9; });

                return (
                  <div key={fw.id} style={{ borderRadius: "10px", border: "1px solid " + c.border, overflow: "hidden", transition: "all 0.2s" }}>
                    {/* Header */}
                    <div onClick={function () { setExpandedFw(isOpen ? null : fw.id); }} style={{
                      display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px",
                      background: c.bg, cursor: "pointer", userSelect: "none",
                    }}>
                      <LucideReact.ChevronRight style={{ width: "14px", height: "14px", color: "#8b949e", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease", flexShrink: 0 }} />
                      <div style={{ width: "24px", height: "24px", borderRadius: "6px", background: c.fill, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon style={{ width: "13px", height: "13px", color: c.pri }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: "13px", fontWeight: "700", color: c.pri }}>{fw.name}</span>
                        <span style={{ fontSize: "11px", color: "#8b949e", marginLeft: "8px" }}>{fw.tagline}</span>
                      </div>
                      <span style={{ ...s.badge(fw.id), fontSize: "11px", fontWeight: "800" }}>{OVERALL[fw.id]}/10</span>
                    </div>
                    {/* Quick stats */}
                    <div style={{ display: "flex", gap: "0", borderTop: "1px solid " + c.border, borderBottom: isOpen ? "1px solid " + c.border : "none" }}>
                      {[
                        { label: "Downloads", value: ECO.downloads[fw.id] + "M/wk" },
                        { label: "Jobs", value: ECO.jobs[fw.id] + "K" },
                        { label: "Stars", value: ECO.stars[fw.id] + "K" }
                      ].map(function (st, si) {
                        return (
                          <div key={si} style={{ flex: 1, padding: "6px 10px", textAlign: "center", borderRight: si < 2 ? "1px solid rgba(33,38,45,0.5)" : "none", background: "rgba(22,27,34,0.3)" }}>
                            <div style={{ fontSize: "8px", color: "#484f58", textTransform: "uppercase", letterSpacing: "0.05em" }}>{st.label}</div>
                            <div style={{ fontSize: "12px", fontWeight: "700", color: "#c9d1d9", fontVariantNumeric: "tabular-nums" }}>{st.value}</div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Expanded content */}
                    {isOpen && (
                      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px", background: "rgba(22,27,34,0.2)" }}>
                        {/* Strengths */}
                        <div style={{ borderRadius: "8px", background: "rgba(63,185,80,0.06)", border: "1px solid rgba(63,185,80,0.15)", padding: "10px" }}>
                          <div style={{ fontSize: "10px", fontWeight: "700", color: "#3fb950", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                            <LucideReact.CheckCircle2 style={{ width: "11px", height: "11px" }} />
                            Strengths
                          </div>
                          {pros.map(function (p, pi) {
                            return (
                              <div key={pi} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "4px" }}>
                                <span style={{ color: "#3fb950", fontSize: "10px", marginTop: "2px", flexShrink: 0 }}>•</span>
                                <span style={{ fontSize: "11px", color: "#c9d1d9", lineHeight: "1.4" }}>{p}</span>
                              </div>
                            );
                          })}
                        </div>
                        {/* Weaknesses */}
                        <div style={{ borderRadius: "8px", background: "rgba(248,81,73,0.06)", border: "1px solid rgba(248,81,73,0.15)", padding: "10px" }}>
                          <div style={{ fontSize: "10px", fontWeight: "700", color: "#f85149", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                            <LucideReact.AlertTriangle style={{ width: "11px", height: "11px" }} />
                            Weaknesses
                          </div>
                          {cons.map(function (c2, ci) {
                            return (
                              <div key={ci} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "4px" }}>
                                <span style={{ color: "#f85149", fontSize: "10px", marginTop: "2px", flexShrink: 0 }}>•</span>
                                <span style={{ fontSize: "11px", color: "#c9d1d9", lineHeight: "1.4" }}>{c2}</span>
                              </div>
                            );
                          })}
                        </div>
                        {/* Best for */}
                        {bestCases.length > 0 && (
                          <div>
                            <div style={{ fontSize: "10px", fontWeight: "700", color: "#d29922", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <LucideReact.Target style={{ width: "11px", height: "11px" }} />
                              Best For (scored 9+)
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                              {bestCases.map(function (uc, ui) {
                                return (
                                  <span key={ui} style={{ display: "inline-flex", padding: "3px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "600", background: "rgba(210,153,34,0.1)", border: "1px solid rgba(210,153,34,0.25)", color: "#d29922" }}>
                                    {uc.scenario}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Use case matrix */}
              <div style={{ marginTop: "8px", borderRadius: "10px", border: "1px solid #21262d", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "rgba(22,27,34,0.5)", borderBottom: "1px solid #21262d", display: "flex", alignItems: "center", gap: "6px" }}>
                  <LucideReact.LayoutGrid style={{ width: "13px", height: "13px", color: "#8b949e" }} />
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "#e6edf3" }}>Use Case Matrix</span>
                </div>
                <div style={{ maxHeight: "220px", overflow: "auto" }}>
                  {USE_CASES.map(function (uc, i) {
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 14px", borderBottom: "1px solid rgba(33,38,45,0.4)", background: i % 2 === 0 ? "transparent" : "rgba(22,27,34,0.3)" }}>
                        <div style={{ flex: 2, fontSize: "11px", color: "#c9d1d9" }}>{uc.scenario}</div>
                        {["react", "vue", "angular"].map(function (fwId) {
                          var val = uc[fwId];
                          var isBest = val >= 9;
                          return (
                            <div key={fwId} style={{ flex: 1, textAlign: "center", fontSize: "12px", fontWeight: isBest ? "700" : "400", color: isBest ? COLORS[fwId].pri : "#6e7681", fontVariantNumeric: "tabular-nums" }}>
                              {val}{isBest && " ★"}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ─── ADVISOR TAB ─── */}
          {activeTab === "advisor" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Title */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <LucideReact.Sparkles style={{ width: "16px", height: "16px", color: "#bc8cff" }} />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#e6edf3" }}>Which framework should YOU use?</div>
                  <div style={{ fontSize: "10px", color: "#8b949e" }}>Toggle your project constraints for a personalized recommendation</div>
                </div>
              </div>

              {/* Toggle switches */}
              <div style={{ borderRadius: "10px", border: "1px solid #21262d", overflow: "hidden" }}>
                {[
                  { key: "teamSize", label: "Team Size", a: "small", b: "large", labelA: "Small (<5)", labelB: "Large (10+)" },
                  { key: "priority", label: "Priority", a: "speed", b: "scale", labelA: "Ship Fast", labelB: "Scale Safe" },
                  { key: "typescript", label: "TypeScript", a: "optional", b: "required", labelA: "Optional", labelB: "Required" },
                  { key: "mobile", label: "Mobile Needs", a: "webOnly", b: "crossPlatform", labelA: "Web Only", labelB: "Cross-Platform" },
                  { key: "industry", label: "Industry", a: "startup", b: "enterprise", labelA: "Startup", labelB: "Enterprise" },
                  { key: "hiring", label: "Hiring Priority", a: "easy", b: "niche", labelA: "Easy Hiring", labelB: "Niche OK" }
                ].map(function (toggle, ti) {
                  var isB = scenarios[toggle.key] === toggle.b;
                  return (
                    <div key={toggle.key} style={{
                      display: "flex", alignItems: "center", padding: "10px 14px",
                      borderBottom: ti < 5 ? "1px solid rgba(33,38,45,0.5)" : "none",
                      background: "rgba(22,27,34,0.3)",
                    }}>
                      <div style={{ flex: 1, fontSize: "11px", fontWeight: "600", color: "#c9d1d9" }}>{toggle.label}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "10px", fontWeight: isB ? "400" : "600", color: isB ? "#484f58" : "#58a6ff", minWidth: "55px", textAlign: "right" }}>{toggle.labelA}</span>
                        {/* Custom toggle switch */}
                        <div onClick={function () { toggleScenario(toggle.key, toggle.a, toggle.b); }} style={{
                          width: "36px", height: "20px", borderRadius: "10px",
                          background: isB ? "rgba(188,140,255,0.3)" : "rgba(88,166,255,0.3)",
                          border: "1px solid " + (isB ? "rgba(188,140,255,0.4)" : "rgba(88,166,255,0.4)"),
                          cursor: "pointer", position: "relative", transition: "background 0.2s, border-color 0.2s",
                          flexShrink: 0,
                        }}>
                          <div style={{
                            width: "14px", height: "14px", borderRadius: "50%",
                            background: isB ? "#bc8cff" : "#58a6ff",
                            position: "absolute", top: "2px",
                            left: isB ? "19px" : "2px",
                            transition: "left 0.2s ease, background 0.2s",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                          }} />
                        </div>
                        <span style={{ fontSize: "10px", fontWeight: isB ? "600" : "400", color: isB ? "#bc8cff" : "#484f58", minWidth: "70px" }}>{toggle.labelB}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Results */}
              <div style={{ borderRadius: "10px", background: "linear-gradient(145deg, rgba(188,140,255,0.06) 0%, rgba(88,166,255,0.04) 100%)", border: "1px solid rgba(188,140,255,0.2)", padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <LucideReact.Trophy style={{ width: "14px", height: "14px", color: "#d29922" }} />
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "#e6edf3" }}>Your Best Match</span>
                </div>

                {ranked.map(function (r, ri) {
                  var c = COLORS[r.id];
                  var medal = ri === 0 ? "🏆" : ri === 1 ? "🥈" : "🥉";
                  var isTop = ri === 0;
                  return (
                    <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "14px" }}>{medal}</span>
                        <span style={{ fontSize: isTop ? "14px" : "12px", fontWeight: "700", color: c.pri }}>{r.name}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: isTop ? "16px" : "13px", fontWeight: "800", color: isTop ? "#f0f6fc" : "#8b949e", fontVariantNumeric: "tabular-nums" }}>{r.score}%</span>
                      </div>
                      <div style={{ height: isTop ? "10px" : "6px", borderRadius: "5px", background: "rgba(33,38,45,0.8)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: "5px",
                          background: isTop ? "linear-gradient(90deg, " + c.pri + " 0%, " + c.pri + "cc 100%)" : c.pri,
                          width: r.score + "%",
                          transition: "width 0.5s ease",
                          opacity: isTop ? 1 : 0.5,
                          boxShadow: isTop ? "0 0 8px " + c.pri + "40" : "none",
                        }} />
                      </div>
                    </div>
                  );
                })}

                {/* Reasoning */}
                <div style={{ paddingTop: "8px", borderTop: "1px solid rgba(188,140,255,0.15)" }}>
                  <div style={{ fontSize: "10px", fontWeight: "600", color: "#bc8cff", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <LucideReact.Lightbulb style={{ width: "11px", height: "11px" }} />
                    Key Factors
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {Object.keys(scenarios).map(function (key) {
                      var val = scenarios[key];
                      var labels = {
                        teamSize: { small: "Small team", large: "Large team" },
                        priority: { speed: "Ship fast", scale: "Scale safely" },
                        typescript: { optional: "TS optional", required: "TS required" },
                        mobile: { webOnly: "Web only", crossPlatform: "Cross-platform" },
                        industry: { startup: "Startup", enterprise: "Enterprise" },
                        hiring: { easy: "Easy hiring", niche: "Niche OK" }
                      };
                      var weights = SCENARIO_WEIGHTS[key][val];
                      var topFw = weights.react >= weights.vue && weights.react >= weights.angular ? "react" : weights.vue >= weights.angular ? "vue" : "angular";
                      return (
                        <span key={key} style={{
                          display: "inline-flex", alignItems: "center", gap: "3px",
                          padding: "2px 7px", borderRadius: "6px", fontSize: "9px", fontWeight: "600",
                          background: COLORS[topFw].bg, border: "1px solid " + COLORS[topFw].border,
                          color: COLORS[topFw].pri,
                        }}>
                          {labels[key][val]} → +{FW.find(function (f) { return f.id === topFw; }).name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ FOOTER ═══ */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px" }}>
        <span style={{ fontSize: "9px", color: "#484f58" }}>Framework Comparison Dashboard · March 2026</span>
        <span style={{ fontSize: "9px", color: "#484f58" }}>12 categories · 12 use cases · 6 decision factors</span>
      </div>
    </div>
  );
}
