---
name: intake_form_builder
description: "Patient intake form builder with drag-and-drop fields, HIPAA compliance checklist, form preview, and JSON schema export for healthcare practices"
---

Patient intake form builder with drag-and-drop fields, HIPAA compliance checklist, form preview, and JSON schema export for healthcare practices

## Tool Reference

### enso_intake_form_builder_browse (primary)

List all saved patient intake form templates with summary statistics (field count, PHI fields, compliance score). Use when the user says: 'show my forms', 'list intake forms', 'browse form templates', 'open form builder'.

Parameters:
- `filter` (string): Filter forms by status: all, draft, published (default: all)

### enso_intake_form_builder_create

Create a new patient intake form from scratch or from a template. Specify a template type to pre-populate with standard fields. Use when the user says: 'create a new form', 'start new intake form', 'make a patient form'.

Parameters:
- `title` (string): Form title (default: 'New Patient Intake Form')
- `template` (string): Template type: blank, standard, pediatric, specialist (default: standard)

### enso_intake_form_builder_edit

Edit a field in an existing form — update label, placeholder, validation, required status, or PHI flag. Use when the user says: 'edit field', 'change field label', 'make field required', 'mark as PHI'.

Parameters:
- `formId` (string): Form ID to edit
- `fieldId` (string): Field ID to edit
- `label` (string): New label text
- `required` (boolean): Set required status
- `phi` (boolean): Set PHI flag
- `validation` (string): Validation type: none, email, phone, date, ssn

### enso_intake_form_builder_preview

Generate a full preview of a patient intake form showing how it will appear to patients. Use when the user says: 'preview the form', 'show form preview', 'how will it look'.

Parameters:
- `formId` (string): Form ID to preview

### enso_intake_form_builder_compliance

Run HIPAA compliance check on a form, scoring privacy notice, data minimization, authorization, patient rights, and security categories. Use when the user says: 'check compliance', 'HIPAA check', 'is my form compliant', 'compliance score'.

Parameters:
- `formId` (string): Form ID to check

### enso_intake_form_builder_export

Export a form as a JSON schema document with full field definitions, PHI metadata, compliance score, and section layout. Use when the user says: 'export form', 'download JSON', 'get form schema', 'export intake form'.

Parameters:
- `formId` (string): Form ID to export
- `format` (string): Export format: json_schema, fhir, csv_template (default: json_schema)

### enso_intake_form_builder_manage

Manage forms: add/remove/reorder fields, duplicate form, delete form, change status. Use when the user says: 'add a field', 'remove field', 'delete form', 'reorder fields', 'publish form', 'duplicate form'.

Parameters:
- `action` (string): Action: add_field, remove_field, reorder, duplicate, delete, set_status
- `formId` (string): Form ID to manage
- `fieldType` (string): Field type for add_field: text, date, select, textarea, email, consent
- `fieldLabel` (string): Label for new field
- `fieldId` (string): Field ID for remove/reorder
- `position` (number): New position index for reorder
- `status` (string): New status for set_status: draft, published
