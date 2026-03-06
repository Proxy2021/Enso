var projects = (await ctx.store.get("projects")) || [];
var tasks = (await ctx.store.get("tasks")) || [];
var notes = (await ctx.store.get("notes")) || [];

// Enrich projects with git info if we have paths
var enrichedProjects = [];
for (var i = 0; i < projects.length; i++) {
  var proj = Object.assign({}, projects[i]);
  try {
    var gitResult = await ctx.readFile(proj.path + "/.git/HEAD");
    if (gitResult.success) {
      var headContent = (typeof gitResult.data === "string" ? gitResult.data : "").trim();
      if (headContent.indexOf("ref: refs/heads/") === 0) {
        proj.branch = headContent.replace("ref: refs/heads/", "");
      }
    }
  } catch(e) {}
  enrichedProjects.push(proj);
}

// Compute stats
var activeTasks = tasks.filter(function(t) { return t.status !== "done"; }).length;
var today = new Date().toISOString().split("T")[0];
var completedToday = tasks.filter(function(t) { return t.status === "done" && t.completedAt === today; }).length;

// Sort tasks: in-progress first, then by priority
var priorityOrder = { high: 0, medium: 1, low: 2 };
var statusOrder = { "in-progress": 0, "todo": 1, "idea": 2, "done": 3 };
tasks.sort(function(a, b) {
  var sA = statusOrder[a.status] || 9;
  var sB = statusOrder[b.status] || 9;
  if (sA !== sB) return sA - sB;
  var pA = priorityOrder[a.priority] || 9;
  var pB = priorityOrder[b.priority] || 9;
  return pA - pB;
});

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_dev_overview",
      projects: enrichedProjects,
      tasks: tasks.filter(function(t) { return t.status !== "done"; }).slice(0, 20),
      completedTasks: tasks.filter(function(t) { return t.status === "done"; }).slice(-10).reverse(),
      stats: {
        totalProjects: projects.length,
        activeTasks: activeTasks,
        completedToday: completedToday,
        totalNotes: notes.length,
        totalTasks: tasks.length
      }
    })
  }]
};
