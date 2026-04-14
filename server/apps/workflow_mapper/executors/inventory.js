// Manage tool inventory: add, remove, update, list
var action = (params.action || "list").toLowerCase();
var tools = (await ctx.store.get("tools")) || [];

if (action === "add") {
  var name = (params.name || "").trim();
  if (!name) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_inventory", action: "add", error: "Tool name is required" }) }] };
  }
  var category = (params.category || "Other").trim();
  var frequency = (params.frequency || "daily").toLowerCase();
  var useCase = (params.useCase || "").trim();
  var painPoints = (params.painPoints || "").trim();

  // Check for duplicates
  var exists = tools.some(function(t) { return t.name.toLowerCase() === name.toLowerCase(); });
  if (exists) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_inventory", action: "add", error: "Tool '" + name + "' already exists in your inventory" }) }] };
  }

  var newTool = {
    id: "t_" + Date.now(),
    name: name,
    category: category,
    frequency: frequency,
    useCase: useCase,
    painPoints: painPoints,
    addedAt: new Date().toISOString()
  };
  tools.push(newTool);
  await ctx.store.set("tools", tools);

  // Count by category
  var byCategory = {};
  for (var i = 0; i < tools.length; i++) {
    var cat = tools[i].category || "Other";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_workflow_mapper_inventory",
    action: "add",
    message: "Added " + name + " to your tool inventory",
    addedTool: newTool,
    tools: tools,
    totalTools: tools.length,
    byCategory: byCategory
  }) }] };
}

if (action === "remove") {
  var toolId = (params.toolId || "").trim();
  var removeName = (params.name || "").trim();
  var idx = -1;
  for (var r = 0; r < tools.length; r++) {
    if ((toolId && tools[r].id === toolId) || (removeName && tools[r].name.toLowerCase() === removeName.toLowerCase())) {
      idx = r;
      break;
    }
  }
  if (idx < 0) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_inventory", action: "remove", error: "Tool not found" }) }] };
  }
  var removed = tools.splice(idx, 1)[0];
  await ctx.store.set("tools", tools);
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_workflow_mapper_inventory",
    action: "remove",
    message: "Removed " + removed.name + " from your tool inventory",
    tools: tools,
    totalTools: tools.length
  }) }] };
}

if (action === "update") {
  var uId = (params.toolId || "").trim();
  var uName = (params.name || "").trim();
  var found = null;
  for (var u = 0; u < tools.length; u++) {
    if ((uId && tools[u].id === uId) || (uName && tools[u].name.toLowerCase() === uName.toLowerCase())) {
      found = tools[u];
      break;
    }
  }
  if (!found) {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workflow_mapper_inventory", action: "update", error: "Tool not found" }) }] };
  }
  if (params.category) found.category = params.category.trim();
  if (params.frequency) found.frequency = params.frequency.toLowerCase();
  if (params.useCase) found.useCase = params.useCase.trim();
  if (params.painPoints !== undefined) found.painPoints = (params.painPoints || "").trim();
  await ctx.store.set("tools", tools);
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_workflow_mapper_inventory",
    action: "update",
    message: "Updated " + found.name,
    updatedTool: found,
    tools: tools,
    totalTools: tools.length
  }) }] };
}

// Default: list
var byCat = {};
for (var l = 0; l < tools.length; l++) {
  var c = tools[l].category || "Other";
  byCat[c] = (byCat[c] || 0) + 1;
}
return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_workflow_mapper_inventory",
  action: "list",
  tools: tools,
  totalTools: tools.length,
  byCategory: byCat
}) }] };
