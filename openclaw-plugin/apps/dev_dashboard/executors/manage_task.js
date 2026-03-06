var action = (params.action || "").trim();
var tasks = (await ctx.store.get("tasks")) || [];

if (action === "create") {
  var title = (params.title || "").trim();
  var project = (params.project || "").trim();
  var status = (params.status || "").trim() || "todo";
  var priority = (params.priority || "").trim() || "medium";
  var notes = (params.notes || "").trim();

  if (!title) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_dev_manage_task", action: "create", success: false, error: "Title is required" })
      }]
    };
  }

  var newTask = {
    id: "t" + Date.now(),
    title: title,
    project: project,
    status: status,
    priority: priority,
    notes: notes,
    createdAt: new Date().toISOString().split("T")[0]
  };

  tasks.push(newTask);
  await ctx.store.set("tasks", tasks);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_dev_manage_task", action: "create", success: true, task: newTask })
    }]
  };
}

if (action === "update") {
  var taskId = (params.taskId || "").trim();
  var found = false;
  var updatedTask = null;

  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === taskId) {
      found = true;
      if (params.status !== undefined && params.status !== null) {
        tasks[i].status = params.status;
        if (params.status === "done") {
          tasks[i].completedAt = new Date().toISOString().split("T")[0];
        }
      }
      if (params.priority !== undefined && params.priority !== null) tasks[i].priority = params.priority;
      if (params.title !== undefined && params.title !== null) tasks[i].title = params.title;
      if (params.notes !== undefined && params.notes !== null) tasks[i].notes = params.notes;
      updatedTask = tasks[i];
      break;
    }
  }

  if (!found) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_dev_manage_task", action: "update", success: false, error: "Task not found" })
      }]
    };
  }

  await ctx.store.set("tasks", tasks);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_dev_manage_task", action: "update", success: true, task: updatedTask })
    }]
  };
}

if (action === "delete") {
  var deleteId = (params.taskId || "").trim();
  var newTasks = tasks.filter(function(t) { return t.id !== deleteId; });

  if (newTasks.length === tasks.length) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_dev_manage_task", action: "delete", success: false, error: "Task not found" })
      }]
    };
  }

  await ctx.store.set("tasks", newTasks);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_dev_manage_task", action: "delete", success: true, deletedId: deleteId })
    }]
  };
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({ tool: "enso_dev_manage_task", action: action, success: false, error: "Invalid action. Use: create, update, or delete" })
  }]
};
