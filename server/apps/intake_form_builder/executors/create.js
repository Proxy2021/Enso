// Create a new patient intake form from a template
var title = (params.title || "").trim() || "New Patient Intake Form";
var template = (params.template || "standard").toLowerCase();

var TEMPLATES = {
  blank: [],
  standard: [
    { id: "f1", type: "text", label: "First Name", phi: true, required: true, validation: "none", placeholder: "Enter first name" },
    { id: "f2", type: "text", label: "Last Name", phi: true, required: true, validation: "none", placeholder: "Enter last name" },
    { id: "f3", type: "date", label: "Date of Birth", phi: true, required: true, validation: "date", placeholder: "MM/DD/YYYY" },
    { id: "f4", type: "select", label: "Gender", phi: true, required: false, validation: "none", placeholder: "Select gender" },
    { id: "f5", type: "text", label: "Phone Number", phi: true, required: true, validation: "phone", placeholder: "(555) 123-4567" },
    { id: "f6", type: "email", label: "Email Address", phi: false, required: false, validation: "email", placeholder: "email@example.com" },
    { id: "f7", type: "textarea", label: "Chief Complaint", phi: true, required: true, validation: "none", placeholder: "Describe primary reason for visit" },
    { id: "f8", type: "textarea", label: "Current Medications", phi: true, required: false, validation: "none", placeholder: "List current medications" },
    { id: "f9", type: "textarea", label: "Allergies", phi: true, required: true, validation: "none", placeholder: "List known allergies" },
    { id: "f10", type: "consent", label: "HIPAA Notice Acknowledgment", phi: false, required: true, validation: "none", placeholder: "" },
    { id: "f11", type: "consent", label: "Treatment Consent", phi: false, required: true, validation: "none", placeholder: "" }
  ],
  pediatric: [
    { id: "f1", type: "text", label: "Child First Name", phi: true, required: true, validation: "none", placeholder: "Child's first name" },
    { id: "f2", type: "text", label: "Child Last Name", phi: true, required: true, validation: "none", placeholder: "Child's last name" },
    { id: "f3", type: "date", label: "Date of Birth", phi: true, required: true, validation: "date", placeholder: "MM/DD/YYYY" },
    { id: "f4", type: "select", label: "Gender", phi: true, required: false, validation: "none", placeholder: "Select gender" },
    { id: "f5", type: "text", label: "Parent/Guardian Name", phi: false, required: true, validation: "none", placeholder: "Full name" },
    { id: "f6", type: "text", label: "Parent Phone", phi: true, required: true, validation: "phone", placeholder: "(555) 123-4567" },
    { id: "f7", type: "textarea", label: "Reason for Visit", phi: true, required: true, validation: "none", placeholder: "Describe reason for visit" },
    { id: "f8", type: "textarea", label: "Immunization History", phi: true, required: false, validation: "none", placeholder: "List immunizations" },
    { id: "f9", type: "textarea", label: "Allergies", phi: true, required: true, validation: "none", placeholder: "List known allergies" },
    { id: "f10", type: "consent", label: "HIPAA Notice Acknowledgment", phi: false, required: true, validation: "none", placeholder: "" },
    { id: "f11", type: "consent", label: "Parental Consent for Treatment", phi: false, required: true, validation: "none", placeholder: "" }
  ],
  specialist: [
    { id: "f1", type: "text", label: "Patient Name", phi: true, required: true, validation: "none", placeholder: "Full name" },
    { id: "f2", type: "date", label: "Date of Birth", phi: true, required: true, validation: "date", placeholder: "MM/DD/YYYY" },
    { id: "f3", type: "text", label: "Referring Physician", phi: false, required: true, validation: "none", placeholder: "Doctor's name" },
    { id: "f4", type: "textarea", label: "Reason for Referral", phi: true, required: true, validation: "none", placeholder: "Describe referral reason" },
    { id: "f5", type: "textarea", label: "Current Medications", phi: true, required: true, validation: "none", placeholder: "List medications" },
    { id: "f6", type: "textarea", label: "Relevant Medical History", phi: true, required: true, validation: "none", placeholder: "Relevant history" },
    { id: "f7", type: "consent", label: "HIPAA Notice Acknowledgment", phi: false, required: true, validation: "none", placeholder: "" },
    { id: "f8", type: "consent", label: "Treatment Consent", phi: false, required: true, validation: "none", placeholder: "" }
  ]
};

var fields = TEMPLATES[template] || TEMPLATES.standard;
var formId = "form_" + Date.now();
var now = new Date().toISOString();
var phiCount = fields.filter(function(f) { return f.phi; }).length;

// Compute basic compliance
var hasNotice = fields.some(function(f) { return f.label.indexOf("HIPAA") >= 0; });
var hasConsent = fields.some(function(f) { return f.label.indexOf("Treatment Consent") >= 0 || f.label.indexOf("Parental Consent") >= 0; });
var score = 0;
var checks = 10;
if (hasNotice) score += 2;
if (hasConsent) score += 2;
score += 4; // base items
var complianceScore = Math.round((score / checks) * 100);

var form = {
  id: formId,
  title: title,
  template: template,
  status: "draft",
  fields: fields,
  complianceScore: complianceScore,
  createdAt: now,
  updatedAt: now
};

// Save to store
var existingForms = (await ctx.store.get("forms")) || [];
existingForms.push(form);
await ctx.store.set("forms", existingForms);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_intake_form_builder_create",
      formId: formId,
      title: title,
      template: template,
      fields: fields,
      complianceScore: complianceScore,
      fieldCount: fields.length,
      phiFieldCount: phiCount
    })
  }]
};
