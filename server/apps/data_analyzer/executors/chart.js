var chartType = params.chart_type || "bar";
var xColumn = params.x_column || "";
var yColumn = params.y_column || "";

var rows = await ctx.store.get("last_data");
if (!rows || !Array.isArray(rows) || rows.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_data_analyzer_chart",
        error: "No data loaded. Run analyze first.",
        chartType: chartType,
        chartData: []
      })
    }]
  };
}

if (!xColumn || !yColumn) {
  var columnNames = await ctx.store.get("last_columns") || [];
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_data_analyzer_chart",
        error: "Please specify x_column and y_column",
        availableColumns: columnNames,
        chartType: chartType,
        chartData: []
      })
    }]
  };
}

var chartData = [];
if (chartType === "pie") {
  var groups = {};
  for (var i = 0; i < rows.length; i++) {
    var label = String(rows[i][xColumn] || "Unknown");
    var val = Number(rows[i][yColumn]) || 0;
    groups[label] = (groups[label] || 0) + val;
  }
  var groupKeys = Object.keys(groups);
  for (var gi = 0; gi < groupKeys.length; gi++) {
    chartData.push({ label: groupKeys[gi], value: groups[groupKeys[gi]] });
  }
} else {
  for (var ri = 0; ri < Math.min(rows.length, 100); ri++) {
    chartData.push({
      label: String(rows[ri][xColumn] ?? ""),
      value: Number(rows[ri][yColumn]) || 0
    });
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_data_analyzer_chart",
      chartType: chartType,
      xColumn: xColumn,
      yColumn: yColumn,
      chartData: chartData,
      dataPoints: chartData.length
    })
  }]
};
