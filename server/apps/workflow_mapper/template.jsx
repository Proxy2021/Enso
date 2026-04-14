export default function GeneratedUI({ data, onAction }) {
  // ── Helpers ──
  var getIcon = function(name, size, color) {
    var I = LucideReact[name];
    if (!I) return null;
    return React.createElement(I, { size: size || 16, color: color || "currentColor" });
  };

  var categoryIcons = {
    "Communication": "MessageCircle",
    "Productivity": "Target",
    "Development": "Code",
    "Media": "Image",
    "Finance": "DollarSign",
    "Other": "Box"
  };

  var categoryColors = {
    "Communication": "#3B82F6",
    "Productivity": "#10B981",
    "Development": "#8B5CF6",
    "Media": "#F59E0B",
    "Finance": "#EF4444",
    "Other": "#64748B"
  };

  var impactColors = { high: "#EF4444", medium: "#F59E0B", low: "#10B981" };
  var impactBg = { high: "#FEF2F2", medium: "#FFFBEB", low: "#F0FDF4" };
  var priorityColors = { high: "#EF4444", medium: "#F59E0B", low: "#10B981" };

  var scoreColor = function(s) {
    return s < 40 ? "#EF4444" : s < 70 ? "#F59E0B" : "#10B981";
  };

  // ═══════════════════════════════════════════════════════
  // VIEW: BROWSE (Dashboard)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_workflow_mapper_browse") {
    var tools = data.tools || [];
    var workflows = data.workflows || [];
    var automations = data.automations || [];
    var sc = data.integrationScore || 0;
    var scClr = scoreColor(sc);

    var isEmpty = tools.length === 0 && workflows.length === 0 && automations.length === 0;

    if (isEmpty) {
      return (
        <div style={{ padding: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            {getIcon("Map", 24, "#3B82F6")}
            <span style={{ fontSize: 20, fontWeight: 800, color: "#1E293B" }}>Workflow Integration Mapper</span>
          </div>
          <EmptyState
            icon={React.createElement(LucideReact.Compass, { size: 48 })}
            title="Map your workflow"
            description="Start by adding the tools you use daily, then map your workflows to discover where Enso can save you time."
            action={React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" } },
              React.createElement(Button, { variant: "primary", icon: React.createElement(LucideReact.Plus, { size: 14 }), onClick: function() { onAction("inventory", { action: "list" }); } }, "Add Tools"),
              React.createElement(Button, { variant: "outline", icon: React.createElement(LucideReact.GitBranch, { size: 14 }), onClick: function() { onAction("map_workflow", { action: "create", template: "morning_routine" }); } }, "Map a Workflow")
            )}
          />
        </div>
      );
    }

    var dashTabs = [{ value: "overview", label: "Overview" }];
    if (tools.length > 0) dashTabs.push({ value: "tools", label: "Tools (" + tools.length + ")" });
    if (workflows.length > 0) dashTabs.push({ value: "workflows", label: "Workflows (" + workflows.length + ")" });
    if (automations.length > 0) dashTabs.push({ value: "automations", label: "Rules (" + automations.length + ")" });

    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {getIcon("Map", 22, "#3B82F6")}
            <span style={{ fontSize: 18, fontWeight: 800, color: "#1E293B" }}>Workflow Mapper</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="ghost" icon={React.createElement(LucideReact.Plus, { size: 14 })} onClick={function() { onAction("inventory", { action: "list" }); }}>Tools</Button>
            <Button variant="primary" icon={React.createElement(LucideReact.Zap, { size: 14 })} onClick={function() { onAction("analyze", {}); }}>Analyze</Button>
          </div>
        </div>

        <Tabs tabs={dashTabs} defaultValue="overview" variant="pills">
          {function(tab) {
            if (tab === "overview") {
              return (
                <div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                    <Stat label="Tools" value={data.toolCount || 0} accent="blue" />
                    <Stat label="Workflows" value={data.workflowCount || 0} accent="emerald" />
                    <Stat label="Automations" value={data.automationCount || 0} accent="violet" />
                    <Stat label="Integration Score" value={sc + "%"} accent={sc >= 70 ? "emerald" : sc >= 40 ? "amber" : "rose"} />
                  </div>

                  <Progress value={sc} max={100} variant={sc >= 70 ? "success" : sc >= 40 ? "warning" : "danger"} showLabel />

                  <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                    <Button variant="outline" icon={React.createElement(LucideReact.Plus, { size: 14 })} onClick={function() { onAction("inventory", { action: "list" }); }}>Add Tools</Button>
                    <Button variant="outline" icon={React.createElement(LucideReact.GitBranch, { size: 14 })} onClick={function() { onAction("map_workflow", { action: "create", template: "morning_routine" }); }}>New Workflow</Button>
                    <Button variant="outline" icon={React.createElement(LucideReact.Zap, { size: 14 })} onClick={function() { onAction("automation", { action: "list" }); }}>Automations</Button>
                    <Button variant="ghost" icon={React.createElement(LucideReact.Download, { size: 14 })} onClick={function() { onAction("export", { format: "summary" }); }}>Export</Button>
                  </div>
                </div>
              );
            }

            if (tab === "tools") {
              return (
                <div style={{ display: "grid", gap: 8 }}>
                  {tools.map(function(t) {
                    var catIcon = categoryIcons[t.category] || "Box";
                    var catColor = categoryColors[t.category] || "#64748B";
                    return (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0" }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: catColor + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {getIcon(catIcon, 16, catColor)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#1E293B" }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: "#64748B" }}>{t.useCase}{t.painPoints ? " · " + t.painPoints : ""}</div>
                        </div>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <Badge variant={t.frequency === "daily" ? "info" : t.frequency === "weekly" ? "default" : "outline"}>{t.frequency}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            if (tab === "workflows") {
              return (
                <div style={{ display: "grid", gap: 8 }}>
                  {workflows.map(function(wf) {
                    return (
                      <UICard key={wf.id} accent="emerald">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {getIcon("GitBranch", 16, "#10B981")}
                              <span style={{ fontWeight: 700, fontSize: 14, color: "#1E293B" }}>{wf.name}</span>
                            </div>
                            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                              {wf.stepCount} steps · {wf.totalMinutes} min · {wf.frictionPoints} friction point{wf.frictionPoints !== 1 ? "s" : ""}
                            </div>
                          </div>
                          <Button variant="ghost" icon={React.createElement(LucideReact.Eye, { size: 14 })} onClick={function() { onAction("map_workflow", { action: "view", workflowId: wf.id }); }}>View</Button>
                        </div>
                      </UICard>
                    );
                  })}
                </div>
              );
            }

            if (tab === "automations") {
              return (
                <div style={{ display: "grid", gap: 8 }}>
                  {automations.map(function(au) {
                    var pClr = priorityColors[au.priority] || "#64748B";
                    return (
                      <div key={au.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0" }}>
                        {getIcon("Zap", 16, pClr)}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1E293B" }}>When: {au.trigger}</div>
                          <div style={{ fontSize: 12, color: "#64748B" }}>Then: {au.action}</div>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <Badge variant={au.status === "available" ? "success" : "warning"}>{au.status}</Badge>
                          <Badge variant={au.priority === "high" ? "danger" : au.priority === "medium" ? "warning" : "default"}>{au.priority}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            return null;
          }}
        </Tabs>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: INVENTORY (tool management)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_workflow_mapper_inventory") {
    var invTools = data.tools || [];
    var invAction = data.action || "list";
    var byCat = data.byCategory || {};

    // Suggested tools by category for quick-add
    var suggestions = {
      "Communication": ["Gmail", "Slack", "WeChat", "Teams", "Discord", "WhatsApp"],
      "Productivity": ["Calendar", "Todoist", "Notion", "Obsidian", "Trello", "Asana"],
      "Development": ["GitHub", "VS Code", "Terminal", "Jira", "Linear", "Figma"],
      "Media": ["Photos", "Spotify", "Kindle", "YouTube", "Pocket"],
      "Finance": ["Banking App", "Budget Tracker", "Expense Manager"]
    };

    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {getIcon("Package", 22, "#3B82F6")}
            <span style={{ fontSize: 18, fontWeight: 800, color: "#1E293B" }}>Tool Inventory</span>
            <Badge variant="info">{invTools.length} tools</Badge>
          </div>
          <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }}>Dashboard</Button>
        </div>

        {data.message && (
          <div style={{ padding: "8px 12px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0", marginBottom: 12 }}>
            <Badge variant="success">{data.message}</Badge>
          </div>
        )}

        {data.error && (
          <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA", marginBottom: 12 }}>
            <Badge variant="danger">{data.error}</Badge>
          </div>
        )}

        {/* Category stats */}
        {Object.keys(byCat).length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {Object.keys(byCat).map(function(cat) {
              var clr = categoryColors[cat] || "#64748B";
              return (
                <div key={cat} style={{ padding: "4px 10px", background: clr + "12", borderRadius: 6, fontSize: 12, fontWeight: 600, color: clr }}>
                  {cat}: {byCat[cat]}
                </div>
              );
            })}
          </div>
        )}

        {/* Current tools */}
        {invTools.length > 0 && (
          <div style={{ display: "grid", gap: 6, marginBottom: 16 }}>
            {invTools.map(function(t) {
              var catIcon = categoryIcons[t.category] || "Box";
              var catColor = categoryColors[t.category] || "#64748B";
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#FAFAFA", borderRadius: 8, border: "1px solid #E2E8F0" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: catColor + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {getIcon(catIcon, 14, catColor)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1E293B" }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.category} · {t.frequency}{t.useCase ? " · " + t.useCase : ""}
                    </div>
                  </div>
                  {t.painPoints && (
                    <EnsoUI.Tooltip content={t.painPoints}>
                      <div style={{ cursor: "help" }}>{getIcon("AlertTriangle", 14, "#F59E0B")}</div>
                    </EnsoUI.Tooltip>
                  )}
                  <Button variant="ghost" icon={React.createElement(LucideReact.X, { size: 12 })} onClick={function() { onAction("inventory", { action: "remove", toolId: t.id }); }} />
                </div>
              );
            })}
          </div>
        )}

        {/* Quick-add suggestions */}
        <UICard accent="blue" header="Quick Add Tools">
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10 }}>Click a tool to add it to your inventory</div>
          {Object.keys(suggestions).map(function(cat) {
            var catColor = categoryColors[cat] || "#64748B";
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: catColor, textTransform: "uppercase", marginBottom: 4 }}>{cat}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {suggestions[cat].map(function(name) {
                    var alreadyAdded = invTools.some(function(t) { return t.name.toLowerCase() === name.toLowerCase(); });
                    return (
                      <button
                        key={name}
                        onClick={function() { if (!alreadyAdded) onAction("inventory", { action: "add", name: name, category: cat, frequency: "daily" }); }}
                        disabled={alreadyAdded}
                        style={{
                          padding: "3px 8px", fontSize: 11, fontWeight: 600,
                          background: alreadyAdded ? "#E2E8F0" : catColor + "12",
                          color: alreadyAdded ? "#94A3B8" : catColor,
                          border: "1px solid " + (alreadyAdded ? "#CBD5E1" : catColor + "30"),
                          borderRadius: 4, cursor: alreadyAdded ? "default" : "pointer",
                          opacity: alreadyAdded ? 0.6 : 1
                        }}
                      >
                        {alreadyAdded ? "+" : "+"} {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </UICard>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="primary" icon={React.createElement(LucideReact.GitBranch, { size: 14 })} onClick={function() { onAction("map_workflow", { action: "create", template: "morning_routine" }); }}>Map a Workflow</Button>
          <Button variant="outline" icon={React.createElement(LucideReact.Zap, { size: 14 })} onClick={function() { onAction("analyze", {}); }}>Analyze Integrations</Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: MAP_WORKFLOW (workflow steps)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_workflow_mapper_map_workflow") {
    var wfAction = data.action || "view";
    var wfSteps = data.steps || [];
    var wfName = data.name || "Workflow";
    var totalMin = data.totalMinutes || 0;
    var frictionPts = data.frictionPoints || 0;

    // List view
    if (wfAction === "list") {
      var wfList = data.workflows || [];
      return (
        <div style={{ padding: 4 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {getIcon("GitBranch", 22, "#10B981")}
              <span style={{ fontSize: 18, fontWeight: 800, color: "#1E293B" }}>Workflows</span>
              <Badge variant="info">{wfList.length}</Badge>
            </div>
            <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }}>Dashboard</Button>
          </div>

          {wfList.length === 0 ? (
            <EmptyState
              icon={React.createElement(LucideReact.GitBranch, { size: 40 })}
              title="No workflows mapped"
              description="Create your first workflow to start mapping your daily process"
              action={React.createElement(Button, { variant: "primary", onClick: function() { onAction("map_workflow", { action: "create", template: "morning_routine" }); } }, "Create Workflow")}
            />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {wfList.map(function(wf) {
                return (
                  <UICard key={wf.id} accent="emerald">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{wf.name}</span>
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                          {wf.stepCount} steps · {wf.totalMinutes} min
                        </div>
                      </div>
                      <Button variant="ghost" onClick={function() { onAction("map_workflow", { action: "view", workflowId: wf.id }); }}>View</Button>
                    </div>
                  </UICard>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Delete confirmation
    if (wfAction === "delete") {
      return (
        <div style={{ padding: 4 }}>
          <UICard accent="rose" header="Workflow Deleted">
            <Badge variant="success">{data.message || "Deleted"}</Badge>
            <div style={{ marginTop: 8, fontSize: 13, color: "#64748B" }}>{data.workflowCount || 0} workflows remaining</div>
          </UICard>
          <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }} style={{ marginTop: 8 }}>Dashboard</Button>
        </div>
      );
    }

    // Create / View / Edit — show timeline
    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {getIcon("GitBranch", 22, "#10B981")}
            <span style={{ fontSize: 18, fontWeight: 800, color: "#1E293B" }}>{wfName}</span>
            {wfAction === "create" && <Badge variant="success">Created</Badge>}
          </div>
          <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }}>Dashboard</Button>
        </div>

        {data.message && (
          <div style={{ padding: "6px 12px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0", marginBottom: 12, fontSize: 13 }}>
            {getIcon("CheckCircle", 14, "#10B981")} <span style={{ marginLeft: 4 }}>{data.message}</span>
          </div>
        )}

        {/* Stats bar */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <Stat label="Steps" value={wfSteps.length} accent="blue" />
          <Stat label="Total Time" value={totalMin + " min"} accent="emerald" />
          <Stat label="Friction Points" value={frictionPts} accent={frictionPts > 0 ? "rose" : "emerald"} />
        </div>

        {/* Visual timeline */}
        <div style={{ position: "relative", paddingLeft: 28 }}>
          {/* Timeline line */}
          <div style={{ position: "absolute", left: 11, top: 6, bottom: 6, width: 2, background: "linear-gradient(to bottom, #3B82F6, #10B981)" }} />

          {wfSteps.map(function(step, idx) {
            var hasFriction = !!step.friction;
            var dotColor = hasFriction ? "#F59E0B" : "#10B981";
            return (
              <div key={step.id} style={{ position: "relative", marginBottom: idx < wfSteps.length - 1 ? 12 : 0 }}>
                {/* Dot */}
                <div style={{
                  position: "absolute", left: -22, top: 8,
                  width: 12, height: 12, borderRadius: "50%",
                  background: dotColor, border: "2px solid white",
                  boxShadow: "0 0 0 2px " + dotColor + "40"
                }} />

                <div style={{
                  padding: "10px 14px",
                  background: hasFriction ? "#FFFBEB" : "#F8FAFC",
                  borderRadius: 8,
                  border: "1px solid " + (hasFriction ? "#FDE68A" : "#E2E8F0")
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", minWidth: 16 }}>{step.order}.</span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#1E293B" }}>{step.label}</span>
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <Badge variant="default">{step.minutes} min</Badge>
                      {step.tool && <Badge variant="info">{step.tool}</Badge>}
                    </div>
                  </div>
                  {hasFriction && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                      {getIcon("AlertTriangle", 12, "#F59E0B")}
                      <span style={{ fontSize: 11, color: "#92400E", fontStyle: "italic" }}>{step.friction}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time bar visualization */}
        {wfSteps.length > 0 && totalMin > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 4, textTransform: "uppercase" }}>Time Distribution</div>
            <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 20 }}>
              {wfSteps.map(function(step, idx) {
                var pct = Math.max(5, (step.minutes / totalMin) * 100);
                var colors = ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#06B6D4", "#EC4899"];
                var bg = colors[idx % colors.length];
                return (
                  <EnsoUI.Tooltip key={step.id} content={step.label + ": " + step.minutes + " min"}>
                    <div style={{ width: pct + "%", background: bg, minWidth: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 9, color: "white", fontWeight: 700 }}>{step.minutes}m</span>
                    </div>
                  </EnsoUI.Tooltip>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <Button variant="primary" icon={React.createElement(LucideReact.Zap, { size: 14 })} onClick={function() { onAction("analyze", {}); }}>Find Integrations</Button>
          {data.workflowId && (
            <Button variant="outline" icon={React.createElement(LucideReact.Trash2, { size: 14 })} onClick={function() { onAction("map_workflow", { action: "delete", workflowId: data.workflowId }); }}>Delete</Button>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: ANALYZE (integration opportunities)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_workflow_mapper_analyze") {
    var opps = data.opportunities || [];
    var totalSaveable = data.totalTimeSaveable || 0;
    var iScore = data.integrationScore || 0;
    var iScClr = scoreColor(iScore);
    var cats = data.categories || {};

    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {getIcon("Zap", 22, "#F59E0B")}
            <span style={{ fontSize: 18, fontWeight: 800, color: "#1E293B" }}>Integration Opportunities</span>
          </div>
          <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }}>Dashboard</Button>
        </div>

        {/* Hero stats */}
        <UICard accent={iScore >= 70 ? "emerald" : iScore >= 40 ? "amber" : "rose"}>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: iScClr }}>{iScore}%</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>Integration Score</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: "#3B82F6" }}>{totalSaveable}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>Min/Day Saveable</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: "#10B981" }}>{cats.available_now || 0}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>Available Now</div>
            </div>
          </div>
          <Progress value={iScore} max={100} variant={iScore >= 70 ? "success" : iScore >= 40 ? "warning" : "danger"} showLabel />
        </UICard>

        {/* Opportunity cards */}
        {opps.length === 0 ? (
          <EmptyState
            icon={React.createElement(LucideReact.Search, { size: 40 })}
            title="Add tools first"
            description="Add your daily tools and map workflows to get personalized integration recommendations."
            action={React.createElement(Button, { variant: "primary", onClick: function() { onAction("inventory", { action: "list" }); } }, "Add Tools")}
          />
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {opps.map(function(opp) {
              var impClr = impactColors[opp.impact] || "#64748B";
              var impBg = impactBg[opp.impact] || "#F8FAFC";
              return (
                <div key={opp.id} style={{ padding: "12px 14px", background: impBg, borderRadius: 10, border: "1px solid " + impClr + "30" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {getIcon("Lightbulb", 16, impClr)}
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#1E293B" }}>{opp.title}</span>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <Badge variant={opp.impact === "high" ? "danger" : opp.impact === "medium" ? "warning" : "success"}>{opp.impact}</Badge>
                      <Badge variant={opp.available ? "success" : "outline"}>{opp.available ? "Available" : "Planned"}</Badge>
                    </div>
                  </div>

                  <p style={{ margin: "0 0 6px 0", fontSize: 13, color: "#475569", lineHeight: 1.4 }}>{opp.description}</p>

                  {opp.connects && opp.connects.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                      {opp.connects.map(function(c, ci) {
                        return (
                          <span key={ci} style={{ padding: "1px 6px", background: "#EEF2FF", color: "#3B82F6", fontSize: 10, fontWeight: 600, borderRadius: 4 }}>{c}</span>
                        );
                      })}
                      {opp.timeSaved && (
                        <span style={{ padding: "1px 6px", background: "#F0FDF4", color: "#10B981", fontSize: 10, fontWeight: 700, borderRadius: 4 }}>
                          Save ~{opp.timeSaved} min/day
                        </span>
                      )}
                    </div>
                  )}

                  {opp.example && (
                    <div style={{ padding: "6px 10px", background: "#1E293B", borderRadius: 6, fontSize: 11, color: "#94A3B8", lineHeight: 1.4, fontFamily: "monospace" }}>
                      {opp.example}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <Button variant="primary" icon={React.createElement(LucideReact.Zap, { size: 14 })} onClick={function() { onAction("automation", { action: "list" }); }}>Build Automations</Button>
          <Button variant="outline" icon={React.createElement(LucideReact.Download, { size: 14 })} onClick={function() { onAction("export", { format: "detailed" }); }}>Export Report</Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: AUTOMATION (rules & templates)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_workflow_mapper_automation") {
    var autos = data.automations || [];
    var templates = data.templates || [];
    var aAction = data.action || "list";

    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {getIcon("Zap", 22, "#8B5CF6")}
            <span style={{ fontSize: 18, fontWeight: 800, color: "#1E293B" }}>Automation Builder</span>
            <Badge variant="info">{autos.length} rules</Badge>
          </div>
          <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }}>Dashboard</Button>
        </div>

        {data.message && (
          <div style={{ padding: "6px 12px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0", marginBottom: 12, fontSize: 13 }}>
            {getIcon("CheckCircle", 14, "#10B981")} <span style={{ marginLeft: 4 }}>{data.message}</span>
          </div>
        )}

        <Tabs tabs={[
          { value: "rules", label: "My Rules (" + autos.length + ")" },
          { value: "templates", label: "Templates (" + templates.length + ")" }
        ]} defaultValue={autos.length > 0 ? "rules" : "templates"} variant="pills">
          {function(tab) {
            if (tab === "rules") {
              if (autos.length === 0) {
                return (
                  <EmptyState
                    icon={React.createElement(LucideReact.Zap, { size: 40 })}
                    title="No automation rules yet"
                    description="Use templates or create custom rules to automate your workflows with Enso."
                  />
                );
              }
              return (
                <div style={{ display: "grid", gap: 8 }}>
                  {autos.map(function(au) {
                    var pClr = priorityColors[au.priority] || "#64748B";
                    return (
                      <div key={au.id} style={{
                        padding: "12px 14px", borderRadius: 10,
                        background: au.status === "available" ? "#F0FDF4" : "#F8FAFC",
                        border: "1px solid " + (au.status === "available" ? "#BBF7D0" : "#E2E8F0")
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              {getIcon("Play", 14, pClr)}
                              <span style={{ fontWeight: 700, fontSize: 13, color: "#1E293B" }}>When: {au.trigger}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, paddingLeft: 20 }}>
                              {getIcon("ArrowRight", 12, "#94A3B8")}
                              <span style={{ fontSize: 13, color: "#475569" }}>Enso: {au.action}</span>
                            </div>
                            <div style={{ display: "flex", gap: 4, paddingLeft: 20 }}>
                              <Badge variant={au.status === "available" ? "success" : "warning"}>{au.status}</Badge>
                              <Badge variant={au.priority === "high" ? "danger" : au.priority === "medium" ? "warning" : "default"}>{au.priority}</Badge>
                              {au.triggerTool && <Badge variant="info">{au.triggerTool}</Badge>}
                            </div>
                          </div>
                          <Button variant="ghost" icon={React.createElement(LucideReact.Trash2, { size: 12 })} onClick={function() { onAction("automation", { action: "delete", automationId: au.id }); }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            if (tab === "templates") {
              return (
                <div style={{ display: "grid", gap: 8 }}>
                  {templates.map(function(tmpl) {
                    var tpClr = priorityColors[tmpl.priority] || "#64748B";
                    return (
                      <div key={tmpl.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0" }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: tpClr + "15", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {getIcon("FileText", 14, tpClr)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, color: "#1E293B" }}>When: {tmpl.trigger}</div>
                          <div style={{ fontSize: 11, color: "#64748B" }}>Then: {tmpl.action}</div>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <Badge variant={tmpl.priority === "high" ? "danger" : tmpl.priority === "medium" ? "warning" : "default"}>{tmpl.priority}</Badge>
                          <Button variant="ghost" icon={React.createElement(LucideReact.Plus, { size: 12 })} onClick={function() { onAction("automation", { action: "use_template", templateId: tmpl.id }); }}>Use</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            return null;
          }}
        </Tabs>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="primary" icon={React.createElement(LucideReact.Zap, { size: 14 })} onClick={function() { onAction("analyze", {}); }}>View Opportunities</Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: EXPORT (report)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_workflow_mapper_export") {
    var prof = data.profile || {};
    var topOpps = prof.topOpportunities || [];
    var tByCat = prof.toolsByCategory || {};
    var aPrio = prof.automationsByPriority || {};
    var frictions = prof.frictionPoints || [];

    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {getIcon("Download", 22, "#059669")}
            <span style={{ fontSize: 18, fontWeight: 800, color: "#1E293B" }}>Workflow Report</span>
            <Badge variant="success">{data.format || "summary"}</Badge>
          </div>
          <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }}>Dashboard</Button>
        </div>

        {/* Summary stats */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <Stat label="Tools" value={prof.toolCount || 0} accent="blue" />
          <Stat label="Workflows" value={prof.workflowCount || 0} accent="emerald" />
          <Stat label="Automations" value={prof.automationCount || 0} accent="violet" />
          <Stat label="Score" value={(prof.integrationScore || 0) + "%"} accent={prof.integrationScore >= 70 ? "emerald" : "amber"} />
        </div>

        <UICard accent="blue" header="Time Analysis">
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#3B82F6" }}>{prof.totalDailyMinutes || 0}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>Min/Day Current</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#10B981" }}>-{prof.potentialTimeSaved || 0}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>Min/Day Saveable</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#8B5CF6" }}>{Math.max(0, (prof.totalDailyMinutes || 0) - (prof.potentialTimeSaved || 0))}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>Min/Day With Enso</div>
            </div>
          </div>
        </UICard>

        {/* Tool distribution */}
        {Object.keys(tByCat).length > 0 && (
          <UICard accent="blue" header="Tools by Category" style={{ marginTop: 12 }}>
            {Object.keys(tByCat).map(function(cat) {
              var clr = categoryColors[cat] || "#64748B";
              return (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: clr }} />
                  <span style={{ flex: 1, fontSize: 13, color: "#1E293B" }}>{cat}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: clr }}>{tByCat[cat]}</span>
                </div>
              );
            })}
          </UICard>
        )}

        {/* Top opportunities */}
        {topOpps.length > 0 && (
          <UICard accent="amber" header="Top Opportunities" style={{ marginTop: 12 }}>
            {topOpps.map(function(opp, idx) {
              var oppClr = impactColors[opp.impact] || "#64748B";
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  {getIcon("Lightbulb", 14, oppClr)}
                  <span style={{ flex: 1, fontSize: 13, color: "#1E293B" }}>{opp.title}</span>
                  <Badge variant={opp.impact === "high" ? "danger" : "warning"}>{opp.impact}</Badge>
                  {opp.timeSaved && <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>-{opp.timeSaved}m</span>}
                </div>
              );
            })}
          </UICard>
        )}

        {/* Friction points */}
        {frictions.length > 0 && (
          <UICard accent="rose" header={"Friction Points (" + frictions.length + ")"} style={{ marginTop: 12 }}>
            {frictions.map(function(f, idx) {
              return (
                <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 6, fontSize: 12 }}>
                  {getIcon("AlertTriangle", 12, "#F59E0B")}
                  <div>
                    <span style={{ fontWeight: 600, color: "#1E293B" }}>{f.workflow}</span>
                    <span style={{ color: "#94A3B8" }}> · {f.step}: </span>
                    <span style={{ color: "#92400E", fontStyle: "italic" }}>{f.friction}</span>
                  </div>
                </div>
              );
            })}
          </UICard>
        )}

        {/* Raw JSON for json format */}
        {data.format === "json" && (
          <pre style={{
            marginTop: 12, padding: 14, background: "#1E293B", color: "#E2E8F0",
            borderRadius: 8, fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
            wordBreak: "break-word", maxHeight: 300, overflow: "auto"
          }}>
            {JSON.stringify(prof, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // FALLBACK
  // ═══════════════════════════════════════════════════════
  return (
    <div style={{ padding: 16 }}>
      <UICard accent="blue" header="Workflow Integration Mapper">
        <p style={{ color: "#64748B", fontSize: 13, lineHeight: 1.5 }}>
          Map your daily tools and workflows, then discover where Enso can save you time through smart integration and automation.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Button variant="primary" icon={React.createElement(LucideReact.Map, { size: 14 })} onClick={function() { onAction("browse", {}); }}>Open Dashboard</Button>
          <Button variant="outline" icon={React.createElement(LucideReact.Package, { size: 14 })} onClick={function() { onAction("inventory", { action: "list" }); }}>Add Tools</Button>
        </div>
      </UICard>
    </div>
  );
}
