// Browse saved intake form templates
var filter = (params.filter || "all").toLowerCase();

var formsRaw = await ctx.store.get("forms");
var forms = formsRaw || [];

if (filter !== "all") {
  forms = forms.filter(function(f) { return f.status === filter; });
}

var result = forms.map(function(f) {
  var fields = f.fields || [];
  var phiCount = fields.filter(function(fd) { return fd.phi; }).length;
  return {
    id: f.id,
    title: f.title,
    status: f.status || "draft",
    fieldCount: fields.length,
    phiFieldCount: phiCount,
    complianceScore: f.complianceScore || 0,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt
  };
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_intake_form_builder_browse",
      total: result.length,
      forms: result
    })
  }]
};
