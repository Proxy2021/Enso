export default function GeneratedUI({ data, onAction }) {
  // ── Hooks (all top-level) ──
  var selectedFormState = useState(null);
  var selectedForm = selectedFormState[0];
  var setSelectedForm = selectedFormState[1];

  var selectedFieldIdState = useState(null);
  var selectedFieldId = selectedFieldIdState[0];
  var setSelectedFieldId = selectedFieldIdState[1];

  var tabState = useState("fields");
  var activeTab = tabState[0];
  var setActiveTab = tabState[1];

  var expandedCatState = useState(["Privacy Notice", "Authorization"]);
  var expandedCats = expandedCatState[0];
  var setExpandedCats = expandedCatState[1];

  // ── Helpers ──
  var getIcon = function(name, size, color) {
    var I = LucideReact[name];
    if (!I) return null;
    return React.createElement(I, { size: size || 16, color: color || "currentColor" });
  };

  var scoreColor = function(s) {
    return s < 60 ? "#EF4444" : s < 80 ? "#F59E0B" : "#10B981";
  };

  var scoreBadge = function(s) {
    var c = scoreColor(s);
    return React.createElement("span", {
      style: { padding: "2px 8px", background: c + "18", color: c, borderRadius: 6, fontSize: 11, fontWeight: 700 }
    }, s + "%");
  };

  // ═══════════════════════════════════════════════════════
  // VIEW: BROWSE (form list)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_intake_form_builder_browse" || Array.isArray(data.forms)) {
    var forms = data.forms || [];
    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {getIcon("ClipboardList", 22, "#2563EB")}
            <span style={{ fontSize: 18, fontWeight: 700, color: "#1E293B" }}>Intake Forms</span>
            <Badge variant="info">{forms.length} forms</Badge>
          </div>
          <Button variant="primary" icon={React.createElement(LucideReact.Plus, { size: 14 })} onClick={function() { onAction("create", { template: "standard" }); }}>
            New Form
          </Button>
        </div>

        {forms.length === 0 ? (
          <EmptyState icon={React.createElement(LucideReact.FileText, { size: 40 })} title="No forms yet" description="Create your first patient intake form" action={React.createElement(Button, { variant: "primary", onClick: function() { onAction("create", {}); } }, "Create Form")} />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {forms.map(function(form) {
              return (
                <UICard key={form.id} accent="blue">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        {getIcon("FileText", 16, "#2563EB")}
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#1E293B" }}>{form.title}</span>
                        <Badge variant={form.status === "published" ? "success" : "warning"}>{form.status}</Badge>
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748B" }}>
                        <span>{form.fieldCount} fields</span>
                        <span>{form.phiFieldCount} PHI</span>
                        <span>HIPAA: {scoreBadge(form.complianceScore)}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button variant="ghost" icon={React.createElement(LucideReact.Eye, { size: 14 })} onClick={function() { onAction("preview", { formId: form.id }); }}>Preview</Button>
                      <Button variant="ghost" icon={React.createElement(LucideReact.Shield, { size: 14 })} onClick={function() { onAction("compliance", { formId: form.id }); }}>Check</Button>
                      <Button variant="ghost" icon={React.createElement(LucideReact.Download, { size: 14 })} onClick={function() { onAction("export", { formId: form.id }); }}>Export</Button>
                    </div>
                  </div>
                </UICard>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: CREATE (new form created)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_intake_form_builder_create") {
    var fields = data.fields || [];
    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          {getIcon("CheckCircle", 22, "#10B981")}
          <span style={{ fontSize: 18, fontWeight: 700, color: "#1E293B" }}>Form Created</span>
          <Badge variant="success">{data.template || "standard"} template</Badge>
        </div>

        <UICard accent="emerald" header={data.title || "New Form"}>
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <Stat label="Fields" value={data.fieldCount || fields.length} accent="blue" />
            <Stat label="PHI Fields" value={data.phiFieldCount || 0} accent="rose" />
            <Stat label="Compliance" value={(data.complianceScore || 0) + "%"} accent={data.complianceScore >= 80 ? "emerald" : "amber"} />
          </div>

          <DataTable
            columns={[
              { key: "label", label: "Field", sortable: true },
              { key: "type", label: "Type" },
              { key: "required", label: "Required", render: function(v) { return v ? React.createElement(Badge, { variant: "danger" }, "Yes") : "No"; } },
              { key: "phi", label: "PHI", render: function(v) { return v ? React.createElement(Badge, { variant: "warning" }, "PHI") : "-"; } }
            ]}
            data={fields}
            striped
            pageSize={10}
          />
        </UICard>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="primary" icon={React.createElement(LucideReact.Eye, { size: 14 })} onClick={function() { onAction("preview", { formId: data.formId }); }}>Preview</Button>
          <Button variant="outline" icon={React.createElement(LucideReact.Shield, { size: 14 })} onClick={function() { onAction("compliance", { formId: data.formId }); }}>HIPAA Check</Button>
          <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }}>All Forms</Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: EDIT (field updated)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_intake_form_builder_edit") {
    var fld = data.field || {};
    return (
      <div style={{ padding: 4 }}>
        <UICard accent="blue" header="Field Updated">
          <Badge variant="success">{data.message || "Updated"}</Badge>
          <div style={{ marginTop: 12 }}>
            <Stat label="Field" value={fld.label || data.fieldId} accent="blue" />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {fld.required && <Badge variant="danger">Required</Badge>}
              {fld.phi && <Badge variant="warning">PHI</Badge>}
              {fld.validation && fld.validation !== "none" && <Badge variant="info">{fld.validation}</Badge>}
            </div>
          </div>
        </UICard>
        <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }} style={{ marginTop: 8 }}>Back to Forms</Button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: PREVIEW (form rendering)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_intake_form_builder_preview") {
    var pFields = data.fields || [];
    var pSections = data.sections || [];
    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          {getIcon("Eye", 22, "#2563EB")}
          <span style={{ fontSize: 18, fontWeight: 700, color: "#1E293B" }}>Form Preview</span>
          <Badge variant="info">Patient View</Badge>
        </div>

        <UICard accent="blue">
          <div style={{ textAlign: "center", marginBottom: 20, paddingBottom: 16, borderBottom: "2px solid #EEF2FF" }}>
            {getIcon("ClipboardList", 32, "#2563EB")}
            <h3 style={{ margin: "8px 0 4px", fontSize: 18, color: "#1E293B" }}>{data.title || "Patient Intake Form"}</h3>
            <p style={{ margin: 0, fontSize: 12, color: "#64748B" }}>Please fill out all required fields marked with *</p>
          </div>

          {pSections.length > 0 ? pSections.map(function(sec) {
            var secFields = pFields.filter(function(f) { return sec.fieldIds.indexOf(f.id) >= 0; });
            return (
              <div key={sec.title} style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: "#475569", borderBottom: "1px solid #E2E8F0", paddingBottom: 6, marginBottom: 12 }}>{sec.title}</h4>
                {secFields.map(function(f) {
                  return (
                    <div key={f.id} style={{ marginBottom: 14 }}>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 4 }}>
                        {f.label}{f.required && <span style={{ color: "#EF4444" }}> *</span>}
                        {f.phi && <span style={{ marginLeft: 6, padding: "1px 5px", background: "#FEF2F2", color: "#DC2626", fontSize: 9, borderRadius: 3, fontWeight: 700 }}>PHI</span>}
                      </label>
                      {f.type === "consent" ? (
                        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#F0F9FF", borderRadius: 6, border: "1px solid #BFDBFE", fontSize: 12 }}>
                          <input type="checkbox" style={{ accentColor: "#2563EB" }} />
                          I acknowledge and consent
                        </label>
                      ) : f.type === "textarea" ? (
                        <div style={{ width: "100%", padding: "10px 12px", border: "1px solid #E2E8F0", borderRadius: 6, background: "#F8FAFC", fontSize: 13, color: "#94A3B8", minHeight: 60 }}>{f.placeholder || ""}</div>
                      ) : (
                        <div style={{ width: "100%", padding: "10px 12px", border: "1px solid #E2E8F0", borderRadius: 6, background: "#F8FAFC", fontSize: 13, color: "#94A3B8", boxSizing: "border-box" }}>{f.placeholder || ""}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }) : pFields.map(function(f) {
            return (
              <div key={f.id} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 4 }}>
                  {f.label}{f.required && <span style={{ color: "#EF4444" }}> *</span>}
                </label>
                <div style={{ padding: "10px 12px", border: "1px solid #E2E8F0", borderRadius: 6, background: "#F8FAFC", fontSize: 13, color: "#94A3B8" }}>{f.placeholder || "..."}</div>
              </div>
            );
          })}
        </UICard>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="primary" icon={React.createElement(LucideReact.Shield, { size: 14 })} onClick={function() { onAction("compliance", { formId: data.formId }); }}>HIPAA Check</Button>
          <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }}>All Forms</Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: COMPLIANCE (HIPAA checklist)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_intake_form_builder_compliance") {
    var cats = data.categories || [];
    var sc = data.overallScore || 0;
    var scClr = scoreColor(sc);
    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          {getIcon("Shield", 22, scClr)}
          <span style={{ fontSize: 18, fontWeight: 700, color: "#1E293B" }}>HIPAA Compliance</span>
          <Badge variant={sc >= 80 ? "success" : sc >= 60 ? "warning" : "danger"}>{sc}%</Badge>
        </div>

        <UICard accent={sc >= 80 ? "emerald" : sc >= 60 ? "amber" : "rose"} header={data.title || "Compliance Report"}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: scClr }}>{sc}%</div>
            <Progress value={sc} max={100} variant={sc >= 80 ? "success" : sc >= 60 ? "warning" : "danger"} showLabel />
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>
              {data.checkedItems || 0} of {data.totalItems || 0} requirements met
            </div>
          </div>
        </UICard>

        <Accordion
          type="multiple"
          defaultOpen={["Privacy Notice", "Authorization"]}
          items={cats.map(function(cat) {
            var passed = cat.items.filter(function(i) { return i.checked; }).length;
            return {
              value: cat.name,
              title: React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                React.createElement("span", null, cat.name),
                React.createElement(Badge, { variant: passed === cat.items.length ? "success" : "warning" }, passed + "/" + cat.items.length)
              ),
              content: React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
                cat.items.map(function(item, idx) {
                  return React.createElement("div", { key: idx, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: item.checked ? "#F0FDF4" : "#FFFBEB", borderRadius: 6, border: "1px solid " + (item.checked ? "#BBF7D0" : "#FDE68A") } },
                    React.createElement("div", { style: { width: 18, height: 18, borderRadius: 4, background: item.checked ? "#10B981" : "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center" } },
                      item.checked && getIcon("Check", 12, "#fff")
                    ),
                    React.createElement("span", { style: { flex: 1, fontSize: 12, color: item.checked ? "#166534" : "#92400E" } }, item.label),
                    item.auto && React.createElement(Badge, { variant: "info" }, "AUTO"),
                    item.required && React.createElement(Badge, { variant: "danger" }, "REQ")
                  );
                })
              )
            };
          })}
        />

        {data.recommendations && data.recommendations.length > 0 && (
          <UICard accent="amber" header="Recommendations" style={{ marginTop: 12 }}>
            {data.recommendations.map(function(rec, idx) {
              return (
                <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, fontSize: 13 }}>
                  {getIcon("AlertTriangle", 14, "#F59E0B")}
                  <span style={{ color: "#92400E" }}>{rec}</span>
                </div>
              );
            })}
          </UICard>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="primary" icon={React.createElement(LucideReact.Download, { size: 14 })} onClick={function() { onAction("export", { formId: data.formId }); }}>Export</Button>
          <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }}>All Forms</Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: EXPORT (JSON schema)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_intake_form_builder_export") {
    var schema = data.schema || {};
    return (
      <div style={{ padding: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          {getIcon("Download", 22, "#059669")}
          <span style={{ fontSize: 18, fontWeight: 700, color: "#1E293B" }}>Export Complete</span>
          <Badge variant="success">{data.format || "json_schema"}</Badge>
        </div>

        <UICard accent="emerald" header={data.title || "Exported Form"}>
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <Stat label="Total Fields" value={schema.metadata ? schema.metadata.totalFields : "-"} accent="blue" />
            <Stat label="PHI Fields" value={schema.metadata ? schema.metadata.phiFields : "-"} accent="rose" />
            <Stat label="Compliance" value={schema.metadata ? schema.metadata.complianceScore + "%" : "-"} accent="emerald" />
          </div>

          <pre style={{
            margin: 0, padding: 14, background: "#1E293B", color: "#E2E8F0",
            borderRadius: 8, fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap",
            wordBreak: "break-word", maxHeight: 300, overflow: "auto"
          }}>
            {JSON.stringify(schema, null, 2)}
          </pre>
        </UICard>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }}>All Forms</Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: MANAGE (action result)
  // ═══════════════════════════════════════════════════════
  if (data.tool === "enso_intake_form_builder_manage") {
    return (
      <div style={{ padding: 4 }}>
        <UICard accent="blue" header={"Action: " + (data.action || "manage")}>
          <Badge variant="success">{data.message || "Done"}</Badge>
          {data.fields && (
            <DataTable
              columns={[
                { key: "label", label: "Field", sortable: true },
                { key: "type", label: "Type" },
                { key: "required", label: "Required", render: function(v) { return v ? "Yes" : "No"; } },
                { key: "phi", label: "PHI", render: function(v) { return v ? React.createElement(Badge, { variant: "warning" }, "PHI") : "-"; } }
              ]}
              data={data.fields}
              striped
            />
          )}
        </UICard>
        <Button variant="ghost" icon={React.createElement(LucideReact.ArrowLeft, { size: 14 })} onClick={function() { onAction("browse", {}); }} style={{ marginTop: 8 }}>All Forms</Button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // FALLBACK
  // ═══════════════════════════════════════════════════════
  return (
    <div style={{ padding: 16 }}>
      <UICard accent="blue" header="Intake Form Builder">
        <p style={{ color: "#64748B" }}>Use the tools above to create, preview, and manage patient intake forms with HIPAA compliance checking.</p>
        <Button variant="primary" onClick={function() { onAction("browse", {}); }}>Browse Forms</Button>
      </UICard>
    </div>
  );
}
