// Edit a field in an existing form
var formId = params.formId;
var fieldId = params.fieldId;

if (!formId || !fieldId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_edit", error: "formId and fieldId are required" }) }] };
}

var forms = (await ctx.store.get("forms")) || [];
var formIdx = -1;
for (var i = 0; i < forms.length; i++) {
  if (forms[i].id === formId) { formIdx = i; break; }
}

if (formIdx < 0) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_edit", error: "Form not found: " + formId }) }] };
}

var form = forms[formIdx];
var fields = form.fields || [];
var fieldIdx = -1;
for (var j = 0; j < fields.length; j++) {
  if (fields[j].id === fieldId) { fieldIdx = j; break; }
}

if (fieldIdx < 0) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_edit", error: "Field not found: " + fieldId }) }] };
}

var field = fields[fieldIdx];
if (params.label !== undefined) field.label = params.label;
if (params.required !== undefined) field.required = params.required;
if (params.phi !== undefined) field.phi = params.phi;
if (params.validation !== undefined) field.validation = params.validation;

fields[fieldIdx] = field;
form.fields = fields;
form.updatedAt = new Date().toISOString();
forms[formIdx] = form;
await ctx.store.set("forms", forms);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_intake_form_builder_edit",
      formId: formId,
      fieldId: fieldId,
      field: field,
      message: "Field '" + field.label + "' updated successfully"
    })
  }]
};
