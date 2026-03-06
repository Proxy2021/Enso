var action = (params.action || "").trim() || "view";
var readingList = (await ctx.store.get("reading_list")) || [];

if (action === "save") {
  var title = (params.title || "").trim();
  var url = (params.url || "").trim();
  var summary = (params.summary || "").trim();

  if (!title) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_ai_pulse_reading_list", action: "save", success: false, error: "Title is required" })
      }]
    };
  }

  var newItem = {
    id: "rl" + Date.now(),
    title: title,
    url: url,
    summary: summary,
    savedAt: new Date().toISOString().split("T")[0],
    read: false
  };

  readingList.push(newItem);
  await ctx.store.set("reading_list", readingList);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_ai_pulse_reading_list",
        action: "save",
        success: true,
        item: newItem,
        totalItems: readingList.length
      })
    }]
  };
}

if (action === "remove") {
  var itemId = (params.itemId || "").trim();
  var newList = readingList.filter(function(item) { return item.id !== itemId; });

  if (newList.length === readingList.length) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ tool: "enso_ai_pulse_reading_list", action: "remove", success: false, error: "Item not found" })
      }]
    };
  }

  await ctx.store.set("reading_list", newList);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ tool: "enso_ai_pulse_reading_list", action: "remove", success: true, removedId: itemId, totalItems: newList.length })
    }]
  };
}

if (action === "toggle_read") {
  var toggleId = (params.itemId || "").trim();
  for (var i = 0; i < readingList.length; i++) {
    if (readingList[i].id === toggleId) {
      readingList[i].read = !readingList[i].read;
      break;
    }
  }
  await ctx.store.set("reading_list", readingList);
}

// Default: view
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_ai_pulse_reading_list",
      action: "view",
      items: readingList,
      totalItems: readingList.length,
      unreadCount: readingList.filter(function(item) { return !item.read; }).length
    })
  }]
};
