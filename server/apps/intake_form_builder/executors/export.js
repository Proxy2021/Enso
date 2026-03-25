// Export a form as JSON schema
var formId = params.formId;
var format = (params.format || "json_schema").toLowerCase();

if (!formId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_export", error: "formId is required" }) }] };
}

var forms = (await ctx.store.get("forms")) || [];
var form = null;
for (var i = 0; i < forms.length; i++) {
  if (forms[i].id === formId) { form = forms[i]; break; }
}

if (!form) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_export", error: "Form not found: " + formId }) }] };
}

var fields = form.fields || [];

var schemaFields = fields.map(function(f) {
  var sf = {
    id: f.id,
    type: f.type === "consent" ? "checkbox" : f.type,
    label: f.label,
    required: f.required || false,
    phi: f.phi || false
  };
  if (f.placeholder) sf.placeholder = f.placeholder;
  if (f.validation && f.validation !== "none") sf.validation = f.validation;
  if (f.type === "consent") sf.consentField = true;
  return sf;
});

var phiCount = fields.filter(function(f) { return f.phi; }).length;
var requiredCount = fields.filter(function(f) { return f.required; }).length;
var consentCount = fields.filter(function(f) { return f.type === "consent"; }).length;

var schema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  title: form.title,
  version: "1.0.0",
  generatedAt: new Date().toISOString(),
  fields: schemaFields,
  metadata: {
    totalFields: fields.length,
    phiFields: phiCount,
    requiredFields: requiredCount,
    consentFields: consentCount,
    complianceScore: form.complianceScore || 0
  }
};

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_intake_form_builder_export",
      formId: formId,
      format: format,
      title: form.title,
      schema: schema,
      exportedAt: new Date().toISOString()
    })
  }]
};
