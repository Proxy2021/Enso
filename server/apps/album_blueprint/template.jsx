export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var fmtCurrency = function(amount, currency) {
    if (!amount && amount !== 0) return "—";
    return (currency === "USD" ? "$" : "€") + amount.toFixed(2);
  };

  // ── State ──
  var activeTabState = useState("overview");
  var activeTab = activeTabState[0];
  var setActiveTab = activeTabState[1];

  var expandedPassState = useState(null);
  var expandedPass = expandedPassState[0];
  var setExpandedPass = expandedPassState[1];

  var expandedLayoutState = useState(null);
  var expandedLayout = expandedLayoutState[0];
  var setExpandedLayout = expandedLayoutState[1];

  var expandedPhaseState = useState(null);
  var expandedPhase = expandedPhaseState[0];
  var setExpandedPhase = expandedPhaseState[1];

  // ── Tool routing ──
  var tool = data && data.tool ? data.tool : "";
  var isThemes = tool === "enso_album_blueprint_choose_theme";
  var isCuration = tool === "enso_album_blueprint_curation_guide";
  var isLayouts = tool === "enso_album_blueprint_layout_templates";
  var isPrinter = tool === "enso_album_blueprint_printer_comparison";
  var isPlan = tool === "enso_album_blueprint_thirty_day_plan";

  // ── Error view ──
  if (data && data.error) {
    return (
      <UICard header="Album Blueprint">
        <div className="text-center py-8">
          <Badge variant="destructive">{data.error}</Badge>
          <div className="mt-4">
            <Button onClick={function() { onAction("choose_theme", {}); }}>Start Over</Button>
          </div>
        </div>
      </UICard>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // THEME SELECTION VIEW
  // ════════════════════════════════════════════════════════════════════
  if (isThemes) {
    var themes = (data && data.themes) ? data.themes : [];
    var selected = data && data.selectedTheme;
    var recommendation = data && data.recommendation;

    var difficultyColor = function(d) {
      if (d === "easy") return "emerald";
      if (d === "medium") return "amber";
      return "rose";
    };

    var iconForTheme = function(id) {
      if (id === "city_at_dawn") return LucideReact.Sunrise;
      if (id === "faces_of_journey") return LucideReact.Users;
      if (id === "quiet_landscape") return LucideReact.Mountain;
      if (id === "one_trip_one_story") return LucideReact.Map;
      if (id === "year_in_light") return LucideReact.Sun;
      return LucideReact.Camera;
    };

    // ── Detail view for selected theme ──
    if (selected) {
      var Icon = iconForTheme(selected.id);
      var arcLabels = selected.emotionalArc ? selected.emotionalArc.split(" → ") : [];
      return (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                <Icon size={20} className="text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{selected.title}</h2>
                <p className="text-sm text-gray-400">{selected.subtitle}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={function() { onAction("choose_theme", {}); }}>
              ← All Themes
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Photos" value={selected.photoCount.min + "–" + selected.photoCount.max} accent="blue" />
            <Stat label="Spreads" value={selected.spreads.min + "–" + selected.spreads.max} accent="purple" />
            <Stat label="Timeline" value={selected.timeline} accent="emerald" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Cost" value={selected.estimatedCost.min + "–" + selected.estimatedCost.max + " " + selected.estimatedCost.currency} accent="amber" />
            <Stat label="Difficulty" value={selected.difficulty.charAt(0).toUpperCase() + selected.difficulty.slice(1)} accent={difficultyColor(selected.difficulty)} />
          </div>

          <UICard header="Chapter Structure">
            <div className="space-y-2">
              {selected.chapters.map(function(ch, i) {
                return (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-800 last:border-0">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-indigo-400">{i + 1}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{ch.name}</p>
                      <p className="text-xs text-gray-400">{ch.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{ch.spreads} spreads</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </UICard>

          <UICard header="Emotional Arc">
            <div className="flex items-end justify-between gap-1 h-24 px-2">
              {selected.arcValues.map(function(val, i) {
                return (
                  <div key={i} className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className="w-full rounded-t bg-indigo-500/60"
                      style={{ height: (val * 0.8) + "px" }}
                    />
                    <span className="text-[10px] text-gray-500 text-center leading-tight">
                      {arcLabels[i] || ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </UICard>

          <UICard header="Printing Details">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Printer</span>
                <span className="text-white font-medium">{selected.printer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Format</span>
                <span className="text-white font-medium">{selected.format}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Paper</span>
                <span className="text-white font-medium">{selected.paperRec}</span>
              </div>
            </div>
          </UICard>

          <UICard header="Expert Notes">
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Key Technique</p>
                <p className="text-gray-200">{selected.keyTechnique}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Inspiration</p>
                <p className="text-gray-200 italic">{selected.inspirationRef}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Best For</p>
                <p className="text-gray-200">{selected.bestFor}</p>
              </div>
            </div>
          </UICard>

          <div className="flex gap-2">
            <Button accent="indigo" className="flex-1" onClick={function() { onAction("thirty_day_plan", { theme: selected.id }); }}>
              Start 30-Day Plan →
            </Button>
            <Button variant="outline" onClick={function() { onAction("curation_guide", { startingCount: 500 }); }}>
              Curation Guide
            </Button>
          </div>
        </div>
      );
    }

    // ── Theme gallery overview ──
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        <div className="text-center mb-2">
          <h1 className="text-xl font-bold text-white">First Album Blueprint</h1>
          <p className="text-sm text-gray-400 mt-1">Choose a theme to start your journey from 124K photos to one gift-quality book</p>
        </div>

        {recommendation && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <LucideReact.Star size={14} className="text-indigo-400" />
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Recommended for First Album</span>
            </div>
            <p className="text-sm text-gray-300">{recommendation.reason}</p>
          </div>
        )}

        <div className="space-y-3">
          {themes.map(function(t) {
            var ThemeIcon = iconForTheme(t.id);
            var isRecommended = recommendation && recommendation.themeId === t.id;
            return (
              <div
                key={t.id}
                className={"rounded-xl border p-3 cursor-pointer transition-all hover:border-indigo-500/50 " + (isRecommended ? "border-indigo-500/40 bg-indigo-500/5" : "border-gray-700 bg-gray-800/50")}
                onClick={function() { onAction("choose_theme", { theme: t.id }); }}
              >
                <div className="flex items-start gap-3">
                  <div className={"w-10 h-10 rounded-xl flex items-center justify-center shrink-0 " + (isRecommended ? "bg-indigo-500/20" : "bg-gray-700/50")}>
                    <ThemeIcon size={20} className={isRecommended ? "text-indigo-400" : "text-gray-400"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{t.title}</h3>
                      {isRecommended && <Badge accent="indigo" size="sm">Best Start</Badge>}
                      <Badge accent={difficultyColor(t.difficulty)} size="sm">{t.difficulty}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{t.subtitle}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>{t.photoCount.min}–{t.photoCount.max} photos</span>
                      <span>•</span>
                      <span>{t.timeline}</span>
                      <span>•</span>
                      <span>{t.estimatedCost.min}–{t.estimatedCost.max} {t.estimatedCost.currency}</span>
                    </div>
                  </div>
                  <LucideReact.ChevronRight size={16} className="text-gray-600 mt-1 shrink-0" />
                </div>
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={function() { onAction("curation_guide", {}); }}>
            Curation Guide
          </Button>
          <Button variant="outline" size="sm" onClick={function() { onAction("layout_templates", {}); }}>
            Layout Templates
          </Button>
          <Button variant="outline" size="sm" onClick={function() { onAction("printer_comparison", { pageCount: 40 }); }}>
            Printer Comparison
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // CURATION GUIDE VIEW
  // ════════════════════════════════════════════════════════════════════
  if (isCuration) {
    var passes = (data && data.passes) ? data.passes : [];
    var selectedPass = data && data.selectedPass;
    var funnel = (data && data.funnel) ? data.funnel : [];
    var summary = data && data.summary;
    var startCount = (data && data.startingCount) || 500;

    var passIcons = {
      1: LucideReact.XCircle,
      2: LucideReact.Maximize,
      3: LucideReact.Layers,
      4: LucideReact.TrendingUp,
      5: LucideReact.Scissors
    };

    var passColors = ["red", "amber", "blue", "purple", "emerald"];

    // ── Detail view for a specific pass ──
    if (selectedPass) {
      var PassIcon = passIcons[selectedPass.number] || LucideReact.Circle;
      var pColor = passColors[selectedPass.number - 1] || "blue";
      return (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={"w-10 h-10 rounded-xl bg-" + pColor + "-500/20 flex items-center justify-center"}>
                <PassIcon size={20} className={"text-" + pColor + "-400"} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Pass {selectedPass.number}: {selectedPass.name}</h2>
                <p className="text-sm text-gray-400">{selectedPass.inputCount} → {selectedPass.outputCount} photos ({selectedPass.cullRate * 100}% cull)</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={function() { onAction("curation_guide", { startingCount: startCount }); }}>
              ← All Passes
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Time per photo" value={selectedPass.timePerPhoto} accent="blue" />
            <Stat label="Total time" value={selectedPass.totalTime} accent="purple" />
            <Stat label="Cull rate" value={(selectedPass.cullRate * 100) + "%"} accent="red" />
          </div>

          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Mindset</p>
            <p className="text-sm text-gray-200 italic">{selectedPass.mindset}</p>
          </div>

          <UICard header="Checklist">
            <div className="space-y-2">
              {selectedPass.checklist.map(function(item) {
                return (
                  <div key={item.id} className="flex items-start gap-2 py-1.5 border-b border-gray-800/50 last:border-0">
                    <div className={"w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 " + (item.critical ? "bg-red-500/20" : "bg-gray-700/50")}>
                      {item.critical ? (
                        <LucideReact.AlertTriangle size={12} className="text-red-400" />
                      ) : (
                        <LucideReact.Check size={12} className="text-gray-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-200">{item.label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge size="sm" accent="gray">{item.category}</Badge>
                        {item.critical && <Badge size="sm" accent="red">Critical</Badge>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </UICard>

          {selectedPass.groupingTemplate && (
            <UICard header="Grouping Template">
              <div className="space-y-2">
                {selectedPass.groupingTemplate.map(function(g, i) {
                  return (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-800/50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-white capitalize">{g.tag}</p>
                        <p className="text-xs text-gray-400">{g.description}</p>
                      </div>
                      <Badge accent="blue" size="sm">{g.targetCount}</Badge>
                    </div>
                  );
                })}
              </div>
            </UICard>
          )}

          {selectedPass.arcGuide && (
            <UICard header="Arc Structure">
              <div className="space-y-2">
                {["opening", "risingAction", "climax", "fallingAction", "denouement"].map(function(key) {
                  var section = selectedPass.arcGuide[key];
                  if (!section) return null;
                  return (
                    <div key={key} className="py-2 border-b border-gray-800/50 last:border-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                        <Badge size="sm" accent="purple">{section.position}</Badge>
                      </div>
                      <p className="text-xs text-gray-400">{section.description}</p>
                      <Progress value={section.intensity} max={100} accent="indigo" className="mt-1.5" />
                    </div>
                  );
                })}
              </div>
            </UICard>
          )}

          {selectedPass.killDarlingsFramework && (
            <UICard header="Kill Your Darlings Framework">
              <div className="space-y-2">
                {selectedPass.killDarlingsFramework.map(function(kd, i) {
                  return (
                    <div key={i} className="py-1.5 border-b border-gray-800/50 last:border-0">
                      <p className="text-sm font-semibold text-white">{kd.rule}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{kd.description}</p>
                    </div>
                  );
                })}
              </div>
            </UICard>
          )}

          <UICard header="Tips">
            <div className="space-y-1.5">
              {selectedPass.tips.map(function(tip, i) {
                return (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                    <p className="text-sm text-gray-300">{tip}</p>
                  </div>
                );
              })}
            </div>
          </UICard>

          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <LucideReact.Lightbulb size={14} className="text-indigo-400" />
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Pro Tip</span>
            </div>
            <p className="text-sm text-gray-300">{selectedPass.proTip}</p>
          </div>

          <div className="flex gap-2">
            {selectedPass.number > 1 && (
              <Button variant="outline" size="sm" onClick={function() { onAction("curation_guide", { pass: selectedPass.number - 1, startingCount: startCount }); }}>
                ← Pass {selectedPass.number - 1}
              </Button>
            )}
            {selectedPass.number < 5 && (
              <Button accent="indigo" size="sm" onClick={function() { onAction("curation_guide", { pass: selectedPass.number + 1, startingCount: startCount }); }}>
                Pass {selectedPass.number + 1} →
              </Button>
            )}
          </div>
        </div>
      );
    }

    // ── Curation overview (all 5 passes) ──
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">5-Pass Curation Guide</h1>
            <p className="text-sm text-gray-400">From {startCount} candidates to {summary ? summary.finalCount : "~35"} album-ready photos</p>
          </div>
          <Button variant="ghost" size="sm" onClick={function() { onAction("choose_theme", {}); }}>
            ← Themes
          </Button>
        </div>

        {summary && (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Start" value={startCount + ""} accent="blue" />
            <Stat label="Final" value={summary.finalCount + ""} accent="emerald" />
            <Stat label="Total Time" value={summary.estimatedTotalTime} accent="purple" />
          </div>
        )}

        <UICard header="Curation Funnel">
          <div className="space-y-1">
            {passes.map(function(p, i) {
              var PassIcon = passIcons[p.number] || LucideReact.Circle;
              var pct = funnel[0] > 0 ? Math.round((funnel[i + 1] / funnel[0]) * 100) : 0;
              return (
                <div key={p.number} className="py-2 border-b border-gray-800/50 last:border-0">
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={function() { onAction("curation_guide", { pass: p.number, startingCount: startCount }); }}
                  >
                    <div className={"w-8 h-8 rounded-lg bg-" + passColors[i] + "-500/20 flex items-center justify-center shrink-0"}>
                      <PassIcon size={16} className={"text-" + passColors[i] + "-400"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white">Pass {p.number}: {p.name}</span>
                        <span className="text-xs text-gray-400">{p.inputCount} → {p.outputCount}</span>
                      </div>
                      <Progress value={100 - pct} max={100} accent={passColors[i]} className="mt-1" />
                    </div>
                    <LucideReact.ChevronRight size={16} className="text-gray-600 shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        </UICard>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={function() { onAction("layout_templates", {}); }}>
            Layout Templates
          </Button>
          <Button variant="outline" size="sm" onClick={function() { onAction("printer_comparison", { pageCount: 40 }); }}>
            Printers
          </Button>
          <Button variant="outline" size="sm" onClick={function() { onAction("thirty_day_plan", {}); }}>
            30-Day Plan
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // LAYOUT TEMPLATES VIEW
  // ════════════════════════════════════════════════════════════════════
  if (isLayouts) {
    var layouts = (data && data.layouts) ? data.layouts : [];
    var selLayout = data && data.selectedLayout;
    var seqTips = data && data.sequencingTips;
    var recSequence = (data && data.recommendedSequence) ? data.recommendedSequence : [];

    var layoutIcons = {
      full_bleed: LucideReact.Maximize,
      diptych: LucideReact.Columns,
      triptych: LucideReact.Layout,
      scale_contrast: LucideReact.Move,
      white_space: LucideReact.Square,
      grid: LucideReact.Grid,
      text_image: LucideReact.Type,
      panoramic: LucideReact.ArrowRight
    };

    var layoutColors = ["indigo", "blue", "cyan", "teal", "emerald", "amber", "purple", "rose"];

    // ── Detail view for a selected layout ──
    if (selLayout) {
      var LayoutIcon = layoutIcons[selLayout.id] || LucideReact.Square;
      return (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                <LayoutIcon size={20} className="text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{selLayout.name}</h2>
                <p className="text-sm text-gray-400">{selLayout.useFor}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={function() { onAction("layout_templates", {}); }}>
              ← All Layouts
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Photos" value={selLayout.photoCount + ""} accent="blue" />
            <Stat label="Position" value={selLayout.narrativePosition} accent="purple" />
            <Stat label="Frequency" value={selLayout.frequency} accent="emerald" />
          </div>

          <UICard header="Layout Diagram">
            <pre className="text-xs text-indigo-300 font-mono leading-relaxed bg-gray-800/50 rounded-lg p-3 overflow-x-auto">
              {selLayout.diagram.join("\n")}
            </pre>
          </UICard>

          <UICard header="Design Tips">
            <div className="space-y-1.5">
              {selLayout.tips.map(function(tip, i) {
                return (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                    <p className="text-sm text-gray-300">{tip}</p>
                  </div>
                );
              })}
            </div>
          </UICard>

          <UICard header="Example Subjects">
            <div className="flex flex-wrap gap-1.5">
              {selLayout.exampleSubjects.map(function(ex, i) {
                return <Badge key={i} accent="blue" size="sm">{ex}</Badge>;
              })}
            </div>
          </UICard>

          <div className="grid grid-cols-2 gap-3">
            <UICard header="Pairs Well With">
              <div className="flex flex-wrap gap-1">
                {selLayout.pairsWith.map(function(p, i) {
                  return <Badge key={i} accent="emerald" size="sm">{p.replace(/_/g, " ")}</Badge>;
                })}
              </div>
            </UICard>
            <UICard header="Avoid After">
              <div className="flex flex-wrap gap-1">
                {selLayout.avoidAfter.map(function(a, i) {
                  return <Badge key={i} accent="rose" size="sm">{a.replace(/_/g, " ")}</Badge>;
                })}
              </div>
            </UICard>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <LucideReact.Printer size={14} className="text-amber-400" />
              <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Print Note</span>
            </div>
            <p className="text-sm text-gray-300">{selLayout.printNote}</p>
          </div>
        </div>
      );
    }

    // ── Layout gallery overview ──
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Layout Templates</h1>
            <p className="text-sm text-gray-400">8 proven spread patterns for your photo book</p>
          </div>
          <Button variant="ghost" size="sm" onClick={function() { onAction("choose_theme", {}); }}>
            ← Themes
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {layouts.map(function(l, i) {
            var LIcon = layoutIcons[l.id] || LucideReact.Square;
            var lColor = layoutColors[i] || "blue";
            return (
              <div
                key={l.id}
                className="rounded-xl border border-gray-700 bg-gray-800/50 p-3 cursor-pointer hover:border-indigo-500/50 transition-all"
                onClick={function() { onAction("layout_templates", { layout: l.id }); }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={"w-8 h-8 rounded-lg bg-" + lColor + "-500/20 flex items-center justify-center"}>
                    <LIcon size={16} className={"text-" + lColor + "-400"} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{l.name}</p>
                    <p className="text-[10px] text-gray-500">{l.photoCount} photo{l.photoCount !== 1 ? "s" : ""} • {l.narrativePosition}</p>
                  </div>
                </div>
                <pre className="text-[8px] text-gray-500 font-mono leading-tight overflow-hidden" style={{ maxHeight: "48px" }}>
                  {l.diagram.slice(0, 5).join("\n")}
                </pre>
              </div>
            );
          })}
        </div>

        {seqTips && (
          <UICard header="Sequencing Rules">
            <div className="space-y-1.5">
              {Object.keys(seqTips).map(function(key, i) {
                return (
                  <div key={key} className="flex items-start gap-2">
                    <span className="text-amber-400 shrink-0 mt-0.5 text-xs font-bold">{i + 1}.</span>
                    <p className="text-sm text-gray-300">{seqTips[key]}</p>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}

        {recSequence.length > 0 && (
          <UICard header="Recommended Spread Sequence">
            <div className="flex flex-wrap gap-1.5">
              {recSequence.map(function(s, i) {
                return (
                  <div key={i} className="flex items-center gap-1">
                    <Badge accent="gray" size="sm">{i + 1}</Badge>
                    <Badge accent="blue" size="sm">{s}</Badge>
                    {i < recSequence.length - 1 && <span className="text-gray-600 text-xs">→</span>}
                  </div>
                );
              })}
            </div>
          </UICard>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // PRINTER COMPARISON VIEW
  // ════════════════════════════════════════════════════════════════════
  if (isPrinter) {
    var printers = (data && data.printers) ? data.printers : [];
    var pgCount = (data && data.pageCount) || 40;
    var selPrinter = data && data.selectedPrinter;
    var rec = data && data.recommendation;
    var paperAdvice = data && data.paperAdvice;

    var printerColors = { printique: "blue", saal_digital: "emerald", whitewall: "purple" };

    // ── Printer detail view ──
    if (selPrinter) {
      var pColor = printerColors[selPrinter.id] || "blue";
      return (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{selPrinter.name}</h2>
              <p className="text-sm text-gray-400">{selPrinter.region} — {selPrinter.tier}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={function() { onAction("printer_comparison", { pageCount: pgCount }); }}>
              ← All Printers
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Rating" value={selPrinter.rating + "/5"} accent={pColor} />
            <Stat label="Production" value={selPrinter.turnaround.production} accent="blue" />
          </div>

          <UICard header={"Formats & Pricing (" + pgCount + " pages)"}>
            <div className="space-y-3">
              {selPrinter.estimates.map(function(est, i) {
                return (
                  <div key={i} className="py-2 border-b border-gray-800/50 last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">{est.format}</span>
                      <span className="text-sm font-bold text-emerald-400">{fmtCurrency(est.withLayflat, est.currency)}</span>
                    </div>
                    {est.extraPages > 0 && (
                      <p className="text-xs text-gray-500">Base + {est.extraPages} extra pages</p>
                    )}
                  </div>
                );
              })}
            </div>
          </UICard>

          <UICard header="Paper Options">
            <div className="space-y-2">
              {selPrinter.paperOptions.map(function(paper, i) {
                return (
                  <div key={i} className={"py-2 border-b border-gray-800/50 last:border-0 " + (paper.recommended ? "bg-emerald-500/5 rounded-lg px-2 -mx-2" : "")}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{paper.name}</span>
                      {paper.recommended && <Badge accent="emerald" size="sm">Recommended</Badge>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{paper.description}</p>
                  </div>
                );
              })}
            </div>
          </UICard>

          <UICard header="Binding Options">
            <div className="space-y-2">
              {selPrinter.bindingOptions.map(function(bind, i) {
                return (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{bind.name}</span>
                        {bind.recommended && <Badge accent="emerald" size="sm">Recommended</Badge>}
                      </div>
                      <p className="text-xs text-gray-400">{bind.description}</p>
                    </div>
                    {bind.priceAdd && <span className="text-xs text-gray-400">+{fmtCurrency(bind.priceAdd, "USD")}</span>}
                  </div>
                );
              })}
            </div>
          </UICard>

          <UICard header="Cover Options">
            <div className="space-y-2">
              {selPrinter.coverOptions.map(function(cover, i) {
                return (
                  <div key={i} className={"py-1.5 " + (cover.recommended ? "bg-emerald-500/5 rounded-lg px-2 -mx-2" : "")}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{cover.name}</span>
                      {cover.recommended && <Badge accent="emerald" size="sm">Recommended</Badge>}
                    </div>
                    <p className="text-xs text-gray-400">{cover.description}</p>
                  </div>
                );
              })}
            </div>
          </UICard>

          <div className="grid grid-cols-2 gap-3">
            <UICard header="Pros">
              <div className="space-y-1">
                {selPrinter.pros.map(function(pro, i) {
                  return (
                    <div key={i} className="flex items-start gap-1.5">
                      <LucideReact.Check size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-xs text-gray-300">{pro}</span>
                    </div>
                  );
                })}
              </div>
            </UICard>
            <UICard header="Cons">
              <div className="space-y-1">
                {selPrinter.cons.map(function(con, i) {
                  return (
                    <div key={i} className="flex items-start gap-1.5">
                      <LucideReact.X size={12} className="text-rose-400 mt-0.5 shrink-0" />
                      <span className="text-xs text-gray-300">{con}</span>
                    </div>
                  );
                })}
              </div>
            </UICard>
          </div>

          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3">
            <p className="text-xs text-indigo-300 uppercase tracking-wider mb-1 font-semibold">Best For</p>
            <p className="text-sm text-gray-300">{selPrinter.bestFor}</p>
          </div>
        </div>
      );
    }

    // ── Printer comparison overview ──
    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Printer Comparison</h1>
            <p className="text-sm text-gray-400">Pricing for {pgCount}-page photo book</p>
          </div>
          <Button variant="ghost" size="sm" onClick={function() { onAction("choose_theme", {}); }}>
            ← Themes
          </Button>
        </div>

        <div className="space-y-3">
          {printers.map(function(pr) {
            var pCol = printerColors[pr.id] || "blue";
            var bestEst = pr.estimates && pr.estimates[0];
            return (
              <div
                key={pr.id}
                className="rounded-xl border border-gray-700 bg-gray-800/50 p-3 cursor-pointer hover:border-indigo-500/50 transition-all"
                onClick={function() { onAction("printer_comparison", { printer: pr.id, pageCount: pgCount }); }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{pr.name}</h3>
                    <Badge accent={pCol} size="sm">{pr.tier}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <LucideReact.Star size={12} className="text-amber-400" />
                    <span className="text-sm text-gray-300">{pr.rating}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-2">{pr.region}</p>
                {pr.estimates && (
                  <div className="space-y-1">
                    {pr.estimates.slice(0, 2).map(function(est, i) {
                      return (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">{est.format}</span>
                          <span className="text-emerald-400 font-medium">{fmtCurrency(est.withLayflat, est.currency)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700/50">
                  <span className="text-xs text-gray-500">Production: {pr.turnaround.production}</span>
                  <LucideReact.ChevronRight size={14} className="text-gray-600" />
                </div>
              </div>
            );
          })}
        </div>

        {rec && (
          <UICard header="Recommendations">
            <div className="space-y-2">
              <div className="py-2 border-b border-gray-800/50">
                <div className="flex items-center gap-2 mb-1">
                  <Badge accent="emerald" size="sm">First Album</Badge>
                  <span className="text-sm font-medium text-white">{rec.firstAlbum.printerId.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-gray-400">{rec.firstAlbum.reason}</p>
              </div>
              <div className="py-2 border-b border-gray-800/50">
                <div className="flex items-center gap-2 mb-1">
                  <Badge accent="purple" size="sm">Gift Album</Badge>
                  <span className="text-sm font-medium text-white">{rec.giftAlbum.printerId.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-gray-400">{rec.giftAlbum.reason}</p>
              </div>
              <div className="py-2">
                <div className="flex items-center gap-2 mb-1">
                  <Badge accent="amber" size="sm">Budget</Badge>
                  <span className="text-sm font-medium text-white">{rec.budget.printerId.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-gray-400">{rec.budget.reason}</p>
              </div>
            </div>
          </UICard>
        )}

        {paperAdvice && (
          <UICard header="Paper Stock Guide">
            <div className="space-y-2">
              {Object.keys(paperAdvice).map(function(key) {
                return (
                  <div key={key} className="py-1.5 border-b border-gray-800/50 last:border-0">
                    <span className="text-sm font-medium text-white capitalize">{key === "fineArt" ? "Fine Art" : key}</span>
                    <p className="text-xs text-gray-400 mt-0.5">{paperAdvice[key]}</p>
                  </div>
                );
              })}
            </div>
          </UICard>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // 30-DAY PLAN VIEW
  // ════════════════════════════════════════════════════════════════════
  if (isPlan) {
    var phases = (data && data.phases) ? data.phases : [];
    var progress = (data && data.progress) || { completed: 0, total: 30, currentPhase: 1 };
    var theme = data && data.theme;
    var startDate = data && data.startDate;
    var endDate = data && data.endDate;
    var quotes = (data && data.motivationalQuotes) ? data.motivationalQuotes : [];

    var phaseColors = ["blue", "red", "amber", "purple", "emerald", "rose"];
    var phaseIcons = {
      search: LucideReact.Search,
      "x-circle": LucideReact.XCircle,
      layers: LucideReact.Layers,
      "trending-up": LucideReact.TrendingUp,
      scissors: LucideReact.Scissors,
      "check-circle": LucideReact.CheckCircle
    };

    var currentQuote = quotes.length > 0 ? quotes[Math.min(progress.currentPhase - 1, quotes.length - 1)] : null;

    return (
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">30-Day Album Plan</h1>
            <p className="text-sm text-gray-400">
              {theme ? theme.replace(/_/g, " ") : "Custom"} • {startDate} → {endDate}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={function() { onAction("choose_theme", {}); }}>
            ← Themes
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Completed" value={progress.completed + "/" + progress.total} accent="emerald" />
          <Stat label="Phase" value={progress.currentPhase + "/6"} accent="blue" />
          <Stat label="Progress" value={Math.round((progress.completed / progress.total) * 100) + "%"} accent="purple" />
        </div>

        <Progress value={progress.completed} max={progress.total} accent="indigo" />

        {currentQuote && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3">
            <p className="text-sm text-gray-300 italic">"{currentQuote.quote}"</p>
            <p className="text-xs text-indigo-400 mt-1">— {currentQuote.author}</p>
          </div>
        )}

        <div className="space-y-3">
          {phases.map(function(phase, pi) {
            var PIcon = phaseIcons[phase.icon] || LucideReact.Circle;
            var pCol = phaseColors[pi] || "blue";
            var phaseComplete = phase.tasks.every(function(t) { return t.done; });
            var phaseCurrent = pi + 1 === progress.currentPhase;

            return (
              <div key={pi} className={"rounded-xl border p-3 " + (phaseCurrent ? "border-indigo-500/40 bg-indigo-500/5" : phaseComplete ? "border-emerald-500/30 bg-emerald-500/5" : "border-gray-700 bg-gray-800/30")}>
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={function() { setExpandedPhase(expandedPhase === pi ? null : pi); }}
                >
                  <div className={"w-9 h-9 rounded-lg bg-" + pCol + "-500/20 flex items-center justify-center shrink-0"}>
                    {phaseComplete ? (
                      <LucideReact.CheckCircle size={18} className="text-emerald-400" />
                    ) : (
                      <PIcon size={18} className={"text-" + pCol + "-400"} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{phase.name}</span>
                      <Badge accent={pCol} size="sm">Days {phase.days}</Badge>
                      {phaseCurrent && <Badge accent="indigo" size="sm">Current</Badge>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{phase.milestone}</p>
                  </div>
                  {expandedPhase === pi ? (
                    <LucideReact.ChevronDown size={16} className="text-gray-500 shrink-0" />
                  ) : (
                    <LucideReact.ChevronRight size={16} className="text-gray-500 shrink-0" />
                  )}
                </div>

                {expandedPhase === pi && (
                  <div className="mt-3 space-y-2 pl-12">
                    {phase.tasks.map(function(task, ti) {
                      return (
                        <div key={ti} className={"py-2 border-b border-gray-700/50 last:border-0 " + (task.done ? "opacity-60" : "")}>
                          <div className="flex items-start gap-2">
                            <div className={"w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 " + (task.done ? "bg-emerald-500/20" : "bg-gray-700/50")}>
                              {task.done ? (
                                <LucideReact.Check size={12} className="text-emerald-400" />
                              ) : (
                                <span className="text-[10px] text-gray-500">{task.day}</span>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className={"text-sm " + (task.done ? "text-gray-500 line-through" : "text-gray-200")}>{task.task}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] text-gray-500">{task.date}</span>
                                <span className="text-[10px] text-gray-500">{task.time}</span>
                                <Badge size="sm" accent={task.energy === "high" ? "amber" : task.energy === "medium" ? "blue" : "gray"}>
                                  {task.energy} energy
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-500 mt-1 italic">{task.tip}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={function() { onAction("curation_guide", { startingCount: 500 }); }}>
            Curation Guide
          </Button>
          <Button variant="outline" size="sm" onClick={function() { onAction("layout_templates", {}); }}>
            Layouts
          </Button>
          <Button variant="outline" size="sm" onClick={function() { onAction("printer_comparison", { pageCount: 40 }); }}>
            Printers
          </Button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // DEFAULT / UNKNOWN VIEW
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center mx-auto">
        <LucideReact.BookOpen size={32} className="text-indigo-400" />
      </div>
      <h1 className="text-xl font-bold text-white">First Album Blueprint</h1>
      <p className="text-sm text-gray-400">Your step-by-step guide from 124K photos to one gift-quality book</p>
      <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
        <Button accent="indigo" onClick={function() { onAction("choose_theme", {}); }}>
          Choose Theme
        </Button>
        <Button variant="outline" onClick={function() { onAction("curation_guide", {}); }}>
          Curation Guide
        </Button>
        <Button variant="outline" onClick={function() { onAction("layout_templates", {}); }}>
          Layout Templates
        </Button>
        <Button variant="outline" onClick={function() { onAction("printer_comparison", { pageCount: 40 }); }}>
          Compare Printers
        </Button>
      </div>
      <Button variant="ghost" className="w-full max-w-sm" onClick={function() { onAction("thirty_day_plan", {}); }}>
        View 30-Day Plan →
      </Button>
    </div>
  );
}
