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
  dpi_300: false, srgb_profile: false, jpeg_quality: false, images_exported: false,
  color_calibrated: false, bleed_checked: false,
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

// Build checklist array with expanded items
var CHECKLIST_ITEMS = [
  { key: "dpi_300", label: "All images exported at 300 DPI", category: "Export" },
  { key: "srgb_profile", label: "Color profile set to sRGB", category: "Export" },
  { key: "jpeg_quality", label: "JPEG quality 95%+ or TIFF export", category: "Export" },
  { key: "images_exported", label: "Final images exported to print folder", category: "Export" },
  { key: "color_calibrated", label: "Monitor color calibration verified", category: "Quality" },
  { key: "bleed_checked", label: "Bleed areas accounted for (3mm)", category: "Quality" },
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

// Multi-printer specs and budget
var printerKey = project.printer || "saal_digital";
var spreads = await ctx.store.get("spreads_" + projectId) || [];
var spreadCount = spreads.length || project.targetSpreads || 35;
var pageCount = spreadCount * 2;

var PRINTER_SPECS = {
  saal_digital: {
    printer: "Saal Digital",
    line: "Professional Line",
    size: "28\u00d728 cm",
    binding: "Lay-flat hardcover",
    paper: "Fine Art print",
    colorProfile: "sRGB",
    orderUrl: "https://www.saal-digital.com/photo-book/professional-line/"
  },
  printique: {
    printer: "Printique",
    line: "",
    size: "10\u00d710 inches",
    binding: "Lay-flat hardcover",
    paper: "200+ gsm premium",
    colorProfile: "sRGB",
    orderUrl: "https://www.printique.com/photo-books"
  },
  whitewall: {
    printer: "WhiteWall",
    line: "Coffee Table Book",
    size: "30\u00d730 cm",
    binding: "Hardcover",
    paper: "Premium photo paper",
    colorProfile: "sRGB",
    orderUrl: "https://www.whitewall.com/coffee-table-book"
  }
};

var specs = PRINTER_SPECS[printerKey] || PRINTER_SPECS.saal_digital;

// Budget calculation per printer
var budget = {};
if (printerKey === "printique") {
  var basePrice = 89.99;
  var includedSpreads = 20;
  var perExtraSpread = 1.99;
  var extraSpreads = Math.max(0, spreadCount - includedSpreads);
  var estimatedTotal = basePrice + (extraSpreads * perExtraSpread);
  budget = {
    basePrice: basePrice,
    includedSpreads: includedSpreads,
    perExtraSpread: perExtraSpread,
    actualSpreads: spreadCount,
    extraSpreads: extraSpreads,
    estimatedTotal: Math.round(estimatedTotal * 100) / 100,
    currency: "USD",
    note: "Printique 10\u00d710 lay-flat hardcover with lustre finish. " + includedSpreads + " spreads included."
  };
} else if (printerKey === "whitewall") {
  var wBase = 69.90;
  var wPerPage = 1.50;
  var wTotal = wBase + (pageCount * wPerPage);
  budget = {
    basePrice: wBase,
    perPage: wPerPage,
    actualPages: pageCount,
    estimatedTotal: Math.round(wTotal * 100) / 100,
    currency: "EUR",
    note: "WhiteWall Coffee Table Book 30\u00d730cm, " + pageCount + " pages."
  };
} else {
  // Saal Digital default
  var sBase = 59.95;
  var sPerPage = 1.25;
  var sTotal = sBase + (pageCount * sPerPage);
  budget = {
    basePrice: sBase,
    perPage: sPerPage,
    actualPages: pageCount,
    estimatedTotal: Math.round(sTotal * 100) / 100,
    currency: "EUR",
    note: "Saal Digital Professional Line 28\u00d728cm, lay-flat, fine art paper. ~\u20ac1\u20131.50/page."
  };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_album_designer_print_checklist",
      projectId: projectId,
      title: project.title || "Untitled Album",
      printer: printerKey,
      checklist: checklist,
      completedCount: completedCount,
      totalCount: CHECKLIST_ITEMS.length,
      spineText: checkData.spineText || "",
      coverImageDesc: checkData.coverImageDesc || "",
      notes: checkData.notes || "",
      specs: specs,
      budget: budget
    })
  }]
};
