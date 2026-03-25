// Manage forms: add/remove/reorder fields, duplicate, delete, set status
var action = (params.action || "").toLowerCase();
var formId = params.formId;

if (!action || !formId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_manage", error: "action and formId are required" }) }] };
}

var forms = (await ctx.store.get("forms")) || [];
var formIdx = -1;
for (var i = 0; i < forms.length; i++) {
  if (forms[i].id === formId) { formIdx = i; break; }
}

if (formIdx < 0 && action !== "duplicate") {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_manage", error: "Form not found: " + formId }) }] };
}

var form = forms[formIdx];
var message = "";
var resultFields = null;

if (action === "add_field") {
  var fieldType = params.fieldType || "text";
  var fieldLabel = params.fieldLabel || "New Field";
  var newId = "f_" + Date.now();
  var newField = {
    id: newId,
    type: fieldType,
    label: fieldLabel,
    phi: fieldType !== "consent",
    required: false,
    validation: "none",
    placeholder: ""
  };
  form.fields = (form.fields || []).concat([newField]);
  form.updatedAt = new Date().toISOString();
  message = "Field '" + fieldLabel + "' added to form";
  resultFields = form.fields;

} else if (action === "remove_field") {
  var removeId = params.fieldId;
  if (!removeId) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_manage", error: "fieldId required for remove_field" }) }] };
  }
  form.fields = (form.fields || []).filter(function(f) { return f.id !== removeId; });
  form.updatedAt = new Date().toISOString();
  message = "Field removed from form";
  resultFields = form.fields;

} else if (action === "reorder") {
  var reorderId = params.fieldId;
  var newPos = params.position;
  if (!reorderId || newPos === undefined) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_manage", error: "fieldId and position required for reorder" }) }] };
  }
  var flds = form.fields || [];
  var fromIdx = -1;
  for (var ri = 0; ri < flds.length; ri++) {
    if (flds[ri].id === reorderId) { fromIdx = ri; break; }
  }
  if (fromIdx >= 0) {
    var moved = flds.splice(fromIdx, 1)[0];
    flds.splice(newPos, 0, moved);
    form.fields = flds;
    form.updatedAt = new Date().toISOString();
    message = "Field reordered to position " + newPos;
  }
  resultFields = form.fields;

} else if (action === "duplicate") {
  var newFormId = "form_" + Date.now();
  var dup = JSON.parse(JSON.stringify(form));
  dup.id = newFormId;
  dup.title = form.title + " (Copy)";
  dup.status = "draft";
  dup.createdAt = new Date().toISOString();
  dup.updatedAt = new Date().toISOString();
  forms.push(dup);
  message = "Form duplicated as '" + dup.title + "'";

} else if (action === "delete") {
  forms.splice(formIdx, 1);
  message = "Form deleted";

} else if (action === "set_status") {
  var newStatus = params.status || "draft";
  form.status = newStatus;
  form.updatedAt = new Date().toISOString();
  message = "Form status set to " + newStatus;

} else {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_intake_form_builder_manage", error: "Unknown action: " + action }) }] };
}

if (formIdx >= 0 && action !== "delete") forms[formIdx] = form;
await ctx.store.set("forms", forms);

var result = {
  tool: "enso_intake_form_builder_manage",
  action: action,
  formId: formId,
  message: message,
  fieldCount: form ? (form.fields || []).length : 0
};
if (resultFields) result.fields = resultFields;

return {
  content: [{
    type: "text",
    text: JSON.stringify(result)
  }]
};
