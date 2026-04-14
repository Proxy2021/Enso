var projectId = (params.projectId || "").trim();
var toggleItem = (params.toggleItem || "").trim();
var spineText = params.spineText != null ? params.spineText : null;
var coverImageDesc = params.coverImageDesc != null ? params.coverImageDesc : null;
var notes = params.notes != null ? params.notes : null;

if (!projectId) {
  projectId = await ctx.store.get("active_project") || "";
}
if (!projectId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_print_checklist", error: "No project ID" }) }] };
}

var allProjects = await ctx.store.get("album_projects") || {};
var project = allProjects[projectId];
if (!project) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_album_designer_print_checklist", error: "Project not found" }) }] };
}

var checkData = await ctx.store.get("checklist_" + projectId) || {
  dpi_300: false, srgb_profile: false, images_exported: false,
  proof_ordered: false, final_review: false,
  spine_text: false, cover_selected: false,
  spineText: "", coverImageDesc: "", notes: ""
};

// Toggle a checklist item
if (toggleItem && checkData[toggleItem] !== undefined) {
  checkData[toggleItem] = !checkData[toggleItem];
}

// Update text fields
if (spineText !== null) {
  checkData.spineText = spineText;
  if (spineText.trim()) checkData.spine_text = true;
}
if (coverImageDesc !== null) {
  checkData.coverImageDesc = coverImageDesc;
  if (coverImageDesc.trim()) checkData.cover_selected = true;
}
if (notes !== null) {
  checkData.notes = notes;
}

await ctx.store.set("checklist_" + projectId, checkData);

// Build checklist array
var CHECKLIST_ITEMS = [
  { key: "dpi_300", label: "All images exported at 300 DPI", category: "Export" },
  { key: "srgb_profile", label: "Color profile set to sRGB", category: "Export" },
  { key: "images_exported", label: "Final images exported to print folder", category: "Export" },
  { key: "proof_ordered", label: "Proof copy ordered", category: "Review" },
  { key: "final_review", label: "Final spread-by-spread review complete", category: "Review" },
  { key: "spine_text", label: "Spine text decided", category: "Design" },
  { key: "cover_selected", label: "Cover image selected", category: "Design" }
];

var checklist = [];
var completedCount = 0;
for (var i = 0; i < CHECKLIST_ITEMS.length; i++) {
  var item = CHECKLIST_ITEMS[i];
  var checked = checkData[item.key] === true;
  if (checked) completedCount++;
  checklist.push({
    key: item.key,
    label: item.label,
    checked: checked,
    category: item.category
  });
}

// Budget calculation based on spread count
var spreads = await ctx.store.get("spreads_" + projectId) || [];
var spreadCount = spreads.length || project.targetSpreads || 35;
var basePrice = 89.99;
var includedSpreads = 20;
var perExtraSpread = 1.99;
var extraSpreads = Math.max(0, spreadCount - includedSpreads);
var estimatedTotal = basePrice + (extraSpreads * perExtraSpread);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_designer_print_checklist",
      projectId: projectId,
      title: project.title || "Untitled Album",
      checklist: checklist,
      completedCount: completedCount,
      totalCount: CHECKLIST_ITEMS.length,
      spineText: checkData.spineText || "",
      coverImageDesc: checkData.coverImageDesc || "",
      notes: checkData.notes || "",
      specs: {
        printer: "Printique",
        size: "10\u00d710 inches",
        binding: "Lay-flat hardcover",
        finish: "Lustre",
        paper: "200+ gsm premium",
        colorProfile: "sRGB",
        orderUrl: "https://www.printique.com/photo-books"
      },
      budget: {
        basePrice: basePrice,
        includedSpreads: includedSpreads,
        perExtraSpread: perExtraSpread,
        actualSpreads: spreadCount,
        extraSpreads: extraSpreads,
        estimatedTotal: Math.round(estimatedTotal * 100) / 100,
        currency: "USD",
        note: "Estimate based on 10\u00d710 lay-flat hardcover with lustre finish. " + includedSpreads + " spreads included in base price."
      }
    })
  }]
};
