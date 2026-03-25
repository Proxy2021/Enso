// Run HIPAA compliance check on a form
var formId = params.formId;

if (!formId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_compliance", error: "formId is required" }) }] };
}

var forms = (await ctx.store.get("forms")) || [];
var form = null;
for (var i = 0; i < forms.length; i++) {
  if (forms[i].id === formId) { form = forms[i]; break; }
}

if (!form) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_compliance", error: "Form not found: " + formId }) }] };
}

var fields = form.fields || [];
var hasHIPAANotice = fields.some(function(f) { return f.label && f.label.indexOf("HIPAA") >= 0; });
var hasTreatmentConsent = fields.some(function(f) { return f.label && (f.label.indexOf("Treatment Consent") >= 0 || f.label.indexOf("Parental Consent") >= 0); });
var hasROI = fields.some(function(f) { return f.label && f.label.indexOf("Release of Information") >= 0; });
var hasSSN = fields.some(function(f) { return f.label && f.label.indexOf("SSN") >= 0; });

var categories = [
  {
    name: "Privacy Notice",
    items: [
      { label: "HIPAA Notice of Privacy Practices included", checked: hasHIPAANotice, auto: true, required: true },
      { label: "Patient acknowledgment signature field", checked: hasHIPAANotice, auto: true, required: true }
    ]
  },
  {
    name: "Data Minimization",
    items: [
      { label: "Only necessary PHI fields included", checked: true, auto: false, required: true },
      { label: "SSN collection justified", checked: !hasSSN, auto: true, required: true }
    ]
  },
  {
    name: "Authorization",
    items: [
      { label: "Treatment consent field present", checked: hasTreatmentConsent, auto: true, required: true },
      { label: "ROI authorization if sharing data", checked: hasROI, auto: true, required: false }
    ]
  },
  {
    name: "Patient Rights",
    items: [
      { label: "Right to access notice", checked: false, auto: false, required: true },
      { label: "Right to amend notice", checked: false, auto: false, required: true }
    ]
  },
  {
    name: "Security",
    items: [
      { label: "Form transmission encryption noted", checked: false, auto: false, required: true },
      { label: "Access control acknowledgment", checked: false, auto: false, required: false }
    ]
  }
];

var totalItems = 0;
var checkedItems = 0;
var recommendations = [];

for (var c = 0; c < categories.length; c++) {
  for (var ci = 0; ci < categories[c].items.length; ci++) {
    totalItems++;
    if (categories[c].items[ci].checked) checkedItems++;
  }
}

var overallScore = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

if (!hasROI) recommendations.push("Add a 'Release of Information' consent field for data sharing compliance");
if (!hasHIPAANotice) recommendations.push("Add a HIPAA Notice of Privacy Practices acknowledgment field");
if (!hasTreatmentConsent) recommendations.push("Add a treatment consent field");
recommendations.push("Include notice about patient's right to access their records");
recommendations.push("Include notice about patient's right to amend their records");

// Update stored compliance score
for (var fi = 0; fi < forms.length; fi++) {
  if (forms[fi].id === formId) {
    forms[fi].complianceScore = overallScore;
    break;
  }
}
await ctx.store.set("forms", forms);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_intake_form_builder_compliance",
      formId: formId,
      title: form.title,
      overallScore: overallScore,
      checkedItems: checkedItems,
      totalItems: totalItems,
      categories: categories,
      recommendations: recommendations
    })
  }]
};
