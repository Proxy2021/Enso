var topic = params.topic || "";

if (!topic) {
  result = { tool: "enso_cortex_cross_reference", error: "Please provide a topic to cross-reference." };
} else {
  var xrefResult = await ctx.callTool("enso_cross_reference", { topic: topic, synthesize: true });

  // Parse the result
  var data = {};
  try {
    if (typeof xrefResult === "string") data = JSON.parse(xrefResult);
    else if (xrefResult && xrefResult.content) data = JSON.parse(xrefResult.content[0].text);
    else data = xrefResult || {};
  } catch(e) {
    data = xrefResult || {};
  }

  result = Object.assign({ tool: "enso_cortex_cross_reference" }, data);
}
