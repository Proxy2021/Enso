// Cortex Ingest — wraps enso_wiki_ingest tool
var text = params.text ? String(params.text) : undefined;
var url = params.url ? String(params.url) : undefined;
var topic = params.topic ? String(params.topic) : undefined;

if (!text && !url && !topic) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_cortex_ingest", error: "Provide at least one of: text, url, or topic" }) }] };
}

var toolParams = {};
if (text) toolParams.text = text;
if (url) toolParams.url = url;
if (topic) toolParams.topic = topic;

try {
  var result = await ctx.callTool("enso_wiki_ingest", toolParams);
  if (result.success && result.data) {
    var data = result.data;
    data.tool = "enso_cortex_ingest";
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  } else {
    return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_cortex_ingest", error: result.error || "Ingest failed", pagesCreated: [], pagesUpdated: [], summary: "" }) }] };
  }
} catch(e) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_cortex_ingest", error: e.message || String(e), pagesCreated: [], pagesUpdated: [], summary: "" }) }] };
}
