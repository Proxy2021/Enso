// Books — Kindle login executor: open headed browser for Amazon authentication
var loginResult = await ctx.callTool("enso_context_kindle_login", {});

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_books_kindle_login",
  data: loginResult,
}) }] };
