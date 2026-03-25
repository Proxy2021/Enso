// Preview a patient intake form
var formId = params.formId;

if (!formId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_preview", error: "formId is required" }) }] };
}

var forms = (await ctx.store.get("forms")) || [];
var form = null;
for (var i = 0; i < forms.length; i++) {
  if (forms[i].id === formId) { form = forms[i]; break; }
}

if (!form) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_preview", error: "Form not found: " + formId }) }] };
}

var fields = form.fields || [];

// Group fields into sections by type
var sections = [];
var demoFields = [];
var medFields = [];
var consentFields = [];
var otherFields = [];

for (var j = 0; j < fields.length; j++) {
  var f = fields[j];
  if (f.type === "consent") {
    consentFields.push(f.id);
  } else if (f.label.indexOf("Complaint") >= 0 || f.label.indexOf("Medication") >= 0 || f.label.indexOf("Allerg") >= 0 || f.label.indexOf("History") >= 0 || f.label.indexOf("Surg") >= 0) {
    medFields.push(f.id);
  } else if (f.label.indexOf("Name") >= 0 || f.label.indexOf("Birth") >= 0 || f.label.indexOf("Gender") >= 0 || f.label.indexOf("Phone") >= 0 || f.label.indexOf("Email") >= 0 || f.label.indexOf("Address") >= 0) {
    demoFields.push(f.id);
  } else {
    otherFields.push(f.id);
  }
}

if (demoFields.length > 0) sections.push({ title: "Demographics", fieldIds: demoFields });
if (medFields.length > 0) sections.push({ title: "Medical", fieldIds: medFields });
if (otherFields.length > 0) sections.push({ title: "Additional Information", fieldIds: otherFields });
if (consentFields.length > 0) sections.push({ title: "Consent & Authorization", fieldIds: consentFields });

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_intake_form_builder_preview",
      formId: formId,
      title: form.title,
      fields: fields,
      sections: sections,
      previewMode: true
    })
  }]
};
