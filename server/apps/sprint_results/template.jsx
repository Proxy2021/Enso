export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var fmtDate = function(d) {
    if (!d) return "—";
    try {
      var dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d).substring(0, 10);
      return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch(e) { return String(d).substring(0, 10); }
  };

  var entityTypeColors = {
    app: { bg: "#1e3a5f", border: "#3b82f6", text: "#60a5fa", label: "App" },
    article: { bg: "#14532d", border: "#22c55e", text: "#4ade80", label: "Article" },
    idea: { bg: "#3b1f6e", border: "#a855f7", text: "#c084fc", label: "Idea" },
    synthesis: { bg: "#7c2d12", border: "#f97316", text: "#fb923c", label: "Synthesis" }
  };

  var actionLabels = {
    run: "Launch App",
    read: "Read",
    explore: "Explore",
    review: "Review"
  };

  var actionIcons = {
    run: "\u25B6",
    read: "\u{1F4D6}",
    explore: "\u{1F50D}",
    review: "\u2714"
  };

  var statusColors = {
    "new": { bg: "#1e3a5f", text: "#60a5fa", label: "New" },
    viewed: { bg: "#3b1f6e", text: "#c084fc", label: "Viewed" },
    acted_on: { bg: "#14532d", text: "#4ade80", label: "Done" }
  };

  // ── Hooks ──
  var selectedFocusState = useState(null);
  var selectedFocus = selectedFocusState[0];
  var setSelectedFocus = selectedFocusState[1];

  var copiedState = useState(false);
  var copied = copiedState[0];
  var setCopied = copiedState[1];

  var expandedState = useState(null);
  var expandedId = expandedState[0];
  var setExpandedId = expandedState[1];

  var expandedActionState = useState(null);
  var expandedActionId = expandedActionState[0];
  var setExpandedActionId = expandedActionState[1];

  var copiedActionState = useState(null);
  var copiedActionId = copiedActionState[0];
  var setCopiedActionId = copiedActionState[1];

  // ── Detect tool view ──
  var tool = data && data.tool ? data.tool : "";
  var isLoad = tool === "enso_sprint_results_load" || (!tool && data && data.deliverables !== undefined);
  var isLaunch = tool === "enso_sprint_results_launch";
  var isNextCycle = tool === "enso_sprint_results_next_cycle";
  var isShare = tool === "enso_sprint_results_share";
  var isMarkStatus = tool === "enso_sprint_results_mark_status";

  // ── LAUNCH RESULT VIEW ──
  if (isLaunch) {
    var typeInfo = entityTypeColors[data.entityType] || entityTypeColors.synthesis;
    return (
      <div style={{ padding: "16px" }}>
        <UICard accent={data.entityType === "app" ? "blue" : data.entityType === "article" ? "emerald" : data.entityType === "idea" ? "purple" : "orange"}>
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>
              {data.success ? (data.entityType === "app" ? "\u25B6" : "\u2714") : "\u2718"}
            </div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#e5e7eb", marginBottom: "4px" }}>
              {data.message || "Deliverable opened"}
            </div>
            <Badge variant={data.entityType === "app" ? "info" : data.entityType === "article" ? "success" : "default"}>
              {typeInfo.label}
            </Badge>
          </div>
          {data.content && (
            <div style={{
              marginTop: "12px", padding: "12px", background: "#0f172a",
              borderRadius: "8px", fontSize: "13px", color: "#d1d5db",
              lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: "300px", overflow: "auto"
            }}>
              {data.content}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "16px" }}>
            <Button variant="primary" onClick={() => onAction("load", { focusId: data.focusId || "" })}>
              Back to Dashboard
            </Button>
          </div>
        </UICard>
      </div>
    );
  }

  // ── NEXT CYCLE VIEW ──
  if (isNextCycle) {
    return (
      <div style={{ padding: "16px" }}>
        <UICard accent={data.success ? "emerald" : "red"}>
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: "36px", marginBottom: "8px" }}>
              {data.success ? "\u{1F504}" : "\u2718"}
            </div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#e5e7eb", marginBottom: "8px" }}>
              {data.success ? "Next Cycle Initiated" : "Could Not Start Cycle"}
            </div>
            <div style={{ fontSize: "14px", color: "#9ca3af", marginBottom: "8px" }}>
              {data.focusTitle || ""}
            </div>
            <div style={{ fontSize: "13px", color: "#d1d5db", lineHeight: 1.6, maxWidth: "480px", margin: "0 auto" }}>
              {data.message || ""}
            </div>
            {data.note && (
              <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "12px", fontStyle: "italic" }}>
                {data.note}
              </div>
            )}
            {data.newCycleCount && (
              <Badge variant="info" style={{ marginTop: "8px" }}>
                {"Cycle #" + data.newCycleCount}
              </Badge>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "12px" }}>
            <Button variant="primary" onClick={() => onAction("load", { focusId: data.focusId || "" })}>
              Back to Dashboard
            </Button>
          </div>
        </UICard>
      </div>
    );
  }

  // ── SHARE VIEW ──
  if (isShare) {
    return (
      <div style={{ padding: "16px" }}>
        <UICard accent="blue">
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#e5e7eb", marginBottom: "4px" }}>
              Shareable Summary
            </div>
            <div style={{ fontSize: "13px", color: "#9ca3af" }}>
              {data.focusTitle || ""} — {data.format || "markdown"} format
            </div>
          </div>
          <div style={{
            padding: "16px", background: "#0f172a", borderRadius: "8px",
            fontSize: "13px", color: "#d1d5db", lineHeight: 1.6,
            whiteSpace: "pre-wrap", maxHeight: "400px", overflow: "auto",
            fontFamily: "monospace", border: "1px solid #1e293b"
          }}>
            {data.shareText || "No content available"}
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "16px" }}>
            <Button variant="primary" onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard.writeText(data.shareText || "");
                setCopied(true);
                setTimeout(function() { setCopied(false); }, 2000);
              }
            }}>
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
            <Button variant="outline" onClick={() => onAction("load", { focusId: data.focusId || "" })}>
              Back to Dashboard
            </Button>
          </div>
        </UICard>
      </div>
    );
  }

  // ── STATUS UPDATE VIEW ──
  if (isMarkStatus) {
    return (
      <div style={{ padding: "16px" }}>
        <UICard accent="emerald">
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#e5e7eb" }}>
              {data.message || "Status updated"}
            </div>
            {data.progress && (
              <div style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px" }}>
                {"Progress: " + data.progress.actedOn + " completed, " + data.progress.viewed + " viewed"}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "8px" }}>
            <Button variant="primary" onClick={() => onAction("load", {})}>
              Back to Dashboard
            </Button>
          </div>
        </UICard>
      </div>
    );
  }

  // ── ERROR / NO DATA STATE ──
  if (data && data.error) {
    return (
      <div style={{ padding: "16px" }}>
        <EmptyState
          icon="alert-circle"
          title="No Sprint Results"
          description={data.message || "No focus areas found. Start by creating focus areas in Enso."}
        />
      </div>
    );
  }

  // ── MAIN DASHBOARD VIEW ──
  var deliverables = data && data.deliverables ? data.deliverables : [];
  var nextSteps = data && data.nextSteps ? data.nextSteps : [];
  var recommended = data && data.recommendedFirstAction ? data.recommendedFirstAction : null;
  var allAreas = data && data.allFocusAreas ? data.allFocusAreas : [];
  var focusTitle = data && data.focusTitle ? data.focusTitle : "Sprint Results";
  var sprintDate = data && data.sprintDate ? data.sprintDate : null;
  var cycleCount = data && data.cycleCount ? data.cycleCount : 0;
  var entityCount = data && data.entityCount ? data.entityCount : 0;
  var sprintSummary = data && data.sprintSummary ? data.sprintSummary : "";
  var hasStructured = data && data.hasStructuredResults;
  var focusId = data && data.focusId ? data.focusId : "";
  var contextualActions = data && data.contextualActions ? data.contextualActions : [];

  // Compute progress
  var totalDel = deliverables.length;
  var viewedCount = 0;
  var actedCount = 0;
  for (var pi = 0; pi < deliverables.length; pi++) {
    if (deliverables[pi].status === "viewed") viewedCount++;
    if (deliverables[pi].status === "acted_on") actedCount++;
  }
  var progressPct = totalDel > 0 ? Math.round(((viewedCount + actedCount) / totalDel) * 100) : 0;

  // Focus area selector options
  var focusOptions = [];
  for (var fo = 0; fo < allAreas.length; fo++) {
    focusOptions.push({
      value: allAreas[fo].id,
      label: allAreas[fo].title + (allAreas[fo].hasSprint ? "" : " (no sprint)")
    });
  }

  // Recommended deliverable
  var recDel = null;
  if (recommended && recommended.deliverableIndex !== undefined && deliverables[recommended.deliverableIndex]) {
    recDel = deliverables[recommended.deliverableIndex];
  }

  return (
    <div style={{ padding: "4px 0", display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ── Focus Area Selector ── */}
      {allAreas.length > 1 && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Select
            options={focusOptions}
            value={focusId}
            onChange={function(val) { setSelectedFocus(val); onAction("load", { focusId: val }); }}
          />
        </div>
      )}

      {/* ── Sprint Header ── */}
      <UICard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "#e5e7eb", marginBottom: "4px" }}>
              {focusTitle}
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
              {sprintDate && (
                <Badge variant="outline">{fmtDate(sprintDate)}</Badge>
              )}
              {cycleCount > 0 && (
                <Badge variant="info">{"Cycle #" + cycleCount}</Badge>
              )}
              {entityCount > 0 && (
                <Badge variant="default">{entityCount + " entities"}</Badge>
              )}
            </div>
            {sprintSummary && (
              <div style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.6 }}>
                {sprintSummary}
              </div>
            )}
          </div>

          {/* Progress ring */}
          {totalDel > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ position: "relative", width: "80px", height: "80px" }}>
                <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#1f2937" strokeWidth="6" />
                  <circle cx="40" cy="40" r="34" fill="none"
                    stroke={progressPct >= 75 ? "#10b981" : progressPct >= 50 ? "#f59e0b" : "#3b82f6"}
                    strokeWidth="6"
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={2 * Math.PI * 34 * (1 - progressPct / 100)}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.6s ease" }}
                  />
                </svg>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "#e5e7eb", lineHeight: 1 }}>{progressPct}%</div>
                  <div style={{ fontSize: "9px", color: "#6b7280" }}>progress</div>
                </div>
              </div>
              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px" }}>
                {actedCount + "/" + totalDel + " completed"}
              </div>
            </div>
          )}
        </div>
      </UICard>

      {/* ── Recommended First Action ── */}
      {recDel && (
        <UICard accent="blue">
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "18px", flexShrink: 0
            }}>
              {"\u2B50"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>
                Recommended First Action
              </div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "#e5e7eb", marginBottom: "4px" }}>
                {recDel.taskTitle}
              </div>
              <div style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.5, marginBottom: "8px" }}>
                {recommended.reason || ""}
              </div>
              <Button variant="primary" onClick={function() {
                onAction("mark_status", { focusId: focusId, entityId: recDel.entityId, status: "viewed" });
                onAction("launch", { entityId: recDel.entityId, entityType: recDel.entityType, focusId: focusId });
              }}>
                {actionLabels[recDel.actionType] || "Open"}
              </Button>
            </div>
          </div>
        </UICard>
      )}

      {/* ── Deliverable Cards Grid ── */}
      {deliverables.length > 0 && (
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#e5e7eb", marginBottom: "8px" }}>
            {"Deliverables (" + deliverables.length + ")"}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "12px"
          }}>
            {deliverables.map(function(del, idx) {
              var typeInfo = entityTypeColors[del.entityType] || entityTypeColors.synthesis;
              var statInfo = statusColors[del.status] || statusColors["new"];
              var isExpanded = expandedId === del.entityId;
              var isRecommended = recommended && recommended.deliverableIndex === idx;

              return (
                <div key={del.entityId || idx} style={{
                  background: "#111827",
                  borderRadius: "12px",
                  border: "1px solid " + (isRecommended ? "#3b82f640" : "#1f2937"),
                  overflow: "hidden",
                  transition: "border-color 0.2s, transform 0.15s",
                  cursor: "pointer"
                }}
                onClick={function() { setExpandedId(isExpanded ? null : del.entityId); }}
                >
                  {/* Card header with type badge */}
                  <div style={{
                    padding: "12px 14px 8px",
                    borderBottom: "1px solid #1f2937",
                    display: "flex", justifyContent: "space-between", alignItems: "center"
                  }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                        background: typeInfo.bg, color: typeInfo.text, border: "1px solid " + typeInfo.border + "40"
                      }}>
                        {typeInfo.label}
                      </span>
                      {isRecommended && (
                        <span style={{ fontSize: "12px" }}>{"\u2B50"}</span>
                      )}
                    </div>
                    <span style={{
                      padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 600,
                      background: statInfo.bg, color: statInfo.text
                    }}>
                      {statInfo.label}
                    </span>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#e5e7eb", marginBottom: "6px", lineHeight: 1.4 }}>
                      {del.taskTitle}
                    </div>

                    {/* Pain point */}
                    <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "6px", lineHeight: 1.5 }}>
                      <span style={{ color: "#6b7280" }}>Problem: </span>
                      {del.painPoint}
                    </div>

                    {/* How it helps */}
                    <div style={{ fontSize: "12px", color: "#d1d5db", marginBottom: "8px", lineHeight: 1.5 }}>
                      {del.howItHelps}
                    </div>

                    {/* Expanded: quick start */}
                    {isExpanded && del.quickStart && (
                      <div style={{
                        padding: "8px 10px", background: "#0f172a", borderRadius: "6px",
                        fontSize: "12px", color: "#94a3b8", lineHeight: 1.5, marginBottom: "8px",
                        borderLeft: "2px solid " + typeInfo.border
                      }}>
                        <span style={{ fontWeight: 600, color: "#cbd5e1" }}>Quick start: </span>
                        {del.quickStart}
                      </div>
                    )}

                    {/* Action button */}
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <Button
                        variant={del.entityType === "app" ? "primary" : "outline"}
                        onClick={function(e) {
                          e.stopPropagation();
                          onAction("mark_status", { focusId: focusId, entityId: del.entityId, status: "viewed" });
                          onAction("launch", { entityId: del.entityId, entityType: del.entityType, focusId: focusId });
                        }}
                      >
                        {(actionIcons[del.actionType] || "") + " " + (actionLabels[del.actionType] || "Open")}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state for no deliverables */}
      {deliverables.length === 0 && !sprintSummary && (
        <EmptyState
          icon="package"
          title="No Sprint Deliverables Yet"
          description="This focus area hasn't completed a sprint yet. Start an evolution cycle to generate deliverables."
          action={
            <Button variant="primary" onClick={function() { onAction("next_cycle", { focusId: focusId }); }}>
              Start First Cycle
            </Button>
          }
        />
      )}

      {/* Raw results fallback */}
      {deliverables.length === 0 && sprintSummary && !hasStructured && (
        <UICard header="Sprint Output (Raw)">
          <div style={{
            fontSize: "13px", color: "#d1d5db", lineHeight: 1.6,
            whiteSpace: "pre-wrap", maxHeight: "300px", overflow: "auto"
          }}>
            {sprintSummary}
          </div>
        </UICard>
      )}

      {/* ── Next Steps Panel ── */}
      {nextSteps.length > 0 && (
        <UICard header="Next Steps">
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {nextSteps.map(function(step, si) {
              return (
                <div key={si} style={{
                  display: "flex", gap: "10px", alignItems: "flex-start",
                  padding: "8px 10px", background: "#0f172a", borderRadius: "8px"
                }}>
                  <div style={{
                    width: "22px", height: "22px", borderRadius: "6px",
                    background: "#1e3a5f", color: "#60a5fa",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "12px", fontWeight: 700, flexShrink: 0
                  }}>
                    {si + 1}
                  </div>
                  <div style={{ fontSize: "13px", color: "#d1d5db", lineHeight: 1.5 }}>
                    {step}
                  </div>
                </div>
              );
            })}
          </div>
        </UICard>
      )}

      {/* ── Contextual Next Actions ── */}
      {contextualActions.length > 0 && (
        <UICard header="Contextual Next Actions">
          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px", lineHeight: 1.5 }}>
            Derived from sprint deliverable analysis — each action directly advances{" "}
            <span style={{ color: "#9ca3af" }}>{focusTitle}</span>.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {contextualActions.map(function(action, ai) {
              var typeMap = {
                research:   { bg: "#1e3a5f", border: "#3b82f6", text: "#60a5fa", icon: "\uD83D\uDD0D", label: "Research" },
                implement:  { bg: "#14532d", border: "#22c55e", text: "#4ade80", icon: "\u2699\uFE0F",  label: "Implement" },
                experiment: { bg: "#3b1f6e", border: "#a855f7", text: "#c084fc", icon: "\uD83E\uDDEA",  label: "Experiment" },
                design:     { bg: "#7c2d12", border: "#f97316", text: "#fb923c", icon: "\uD83C\uDFA8",  label: "Design" },
                apply:      { bg: "#1a2e05", border: "#84cc16", text: "#a3e635", icon: "\u2705",        label: "Apply" },
                extract:    { bg: "#1c1917", border: "#78716c", text: "#a8a29e", icon: "\uD83D\uDCCB",  label: "Extract" }
              };
              var ts = typeMap[action.type] || typeMap.research;
              var isExpanded = expandedActionId === ai;
              var isCopied = copiedActionId === ai;

              return (
                <div key={ai} style={{
                  padding: "10px 12px",
                  background: "#0f172a",
                  borderRadius: "8px",
                  border: "1px solid " + (isExpanded ? ts.border + "60" : "#1e293b"),
                  cursor: "pointer",
                  transition: "border-color 0.2s"
                }}
                onClick={function() { setExpandedActionId(isExpanded ? null : ai); }}
                >
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{
                      padding: "2px 7px", borderRadius: "5px", fontSize: "10px", fontWeight: 700,
                      background: ts.bg, color: ts.text, border: "1px solid " + ts.border + "40",
                      textTransform: "uppercase", letterSpacing: "0.6px", flexShrink: 0
                    }}>
                      {ts.label}
                    </span>
                    <span style={{ fontSize: "13px", color: "#e5e7eb", fontWeight: 500, flex: 1, lineHeight: 1.4 }}>
                      {action.label}
                    </span>
                    <button
                      style={{
                        padding: "2px 9px", fontSize: "11px", borderRadius: "5px", flexShrink: 0,
                        background: isCopied ? "#14532d" : "#1e293b",
                        color: isCopied ? "#4ade80" : "#9ca3af",
                        border: "1px solid " + (isCopied ? "#22c55e40" : "#334155"),
                        cursor: "pointer", transition: "all 0.2s"
                      }}
                      onClick={function(e) {
                        e.stopPropagation();
                        if (typeof navigator !== "undefined" && navigator.clipboard) {
                          navigator.clipboard.writeText(action.label);
                          setCopiedActionId(ai);
                          setTimeout(function() { setCopiedActionId(null); }, 1800);
                        }
                      }}
                    >
                      {isCopied ? "\u2713 Copied" : "Copy"}
                    </button>
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: "8px", paddingLeft: "2px" }}>
                      <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: 1.6 }}>
                        {action.reason}
                      </div>
                      {action.deliverableTitle && (
                        <div style={{ fontSize: "11px", color: "#4b5563", marginTop: "4px" }}>
                          Source deliverable: <span style={{ color: "#6b7280" }}>{action.deliverableTitle}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </UICard>
      )}

      {/* ── Focus Area Progress Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px" }}>
        <Stat label="Cycle" value={"#" + cycleCount} accent="blue" />
        <Stat label="Deliverables" value={totalDel} accent="purple" />
        <Stat label="Completed" value={actedCount} accent="emerald" />
        <Stat label="Entities" value={entityCount} accent="amber" />
      </div>

      {/* ── Action Bar ── */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <Button variant="primary" onClick={function() { onAction("next_cycle", { focusId: focusId }); }}>
          Start Next Cycle
        </Button>
        <Button variant="outline" onClick={function() { onAction("share", { focusId: focusId, format: "markdown" }); }}>
          Share Results
        </Button>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={function() { onAction("load", { focusId: focusId }); }}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
