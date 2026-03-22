var rawData = params.data || "";
var format = params.format || "auto";

if (!rawData.trim()) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_data_analyzer_analyze",
        error: "No data provided. Paste CSV or JSON data to analyze.",
        rowCount: 0,
        columns: [],
        preview: []
      })
    }]
  };
}

var rows = [];
var columnNames = [];

if (format === "auto") {
  format = rawData.trim().startsWith("[") || rawData.trim().startsWith("{") ? "json" : "csv";
}

if (format === "json") {
  try {
    var parsed = JSON.parse(rawData);
    rows = Array.isArray(parsed) ? parsed : [parsed];
    if (rows.length > 0) {
      columnNames = Object.keys(rows[0]);
    }
  } catch (e) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_data_analyzer_analyze",
          error: "Failed to parse JSON: " + e.message,
          rowCount: 0,
          columns: [],
          preview: []
        })
      }]
    };
  }
} else {
  var lines = rawData.trim().split("\n").map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
  if (lines.length < 1) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          tool: "enso_data_analyzer_analyze",
          error: "CSV has no data rows",
          rowCount: 0,
          columns: [],
          preview: []
        })
      }]
    };
  }

  var separator = lines[0].includes("\t") ? "\t" : ",";
  columnNames = lines[0].split(separator).map(function(h) { return h.trim().replace(/^["']|["']$/g, ""); });

  for (var i = 1; i < lines.length; i++) {
    var vals = lines[i].split(separator).map(function(v) { return v.trim().replace(/^["']|["']$/g, ""); });
    var row = {};
    for (var j = 0; j < columnNames.length; j++) {
      var v = vals[j] !== undefined ? vals[j] : "";
      var numVal = Number(v);
      row[columnNames[j]] = v === "" ? null : !isNaN(numVal) && v !== "" ? numVal : v;
    }
    rows.push(row);
  }
}

await ctx.store.set("last_data", rows);
await ctx.store.set("last_columns", columnNames);

var columns = [];
for (var ci = 0; ci < columnNames.length; ci++) {
  var colName = columnNames[ci];
  var values = rows.map(function(r) { return r[colName]; });
  var nonNull = values.filter(function(v) { return v !== null && v !== undefined && v !== ""; });
  var nullCount = values.length - nonNull.length;
  var uniqueVals = [];
  for (var ui = 0; ui < nonNull.length; ui++) {
    if (uniqueVals.indexOf(nonNull[ui]) === -1) uniqueVals.push(nonNull[ui]);
  }

  var isNumeric = nonNull.length > 0 && nonNull.every(function(v) { return typeof v === "number" || !isNaN(Number(v)); });

  var colInfo = {
    name: colName,
    type: isNumeric ? "number" : "string",
    unique: uniqueVals.length,
    nulls: nullCount
  };

  if (isNumeric && nonNull.length > 0) {
    var nums = nonNull.map(Number).sort(function(a, b) { return a - b; });
    colInfo.min = nums[0];
    colInfo.max = nums[nums.length - 1];
    colInfo.mean = Math.round(nums.reduce(function(a, b) { return a + b; }, 0) / nums.length * 100) / 100;
    var mid = Math.floor(nums.length / 2);
    colInfo.median = nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
  } else {
    colInfo.sample = uniqueVals.slice(0, 5);
  }

  columns.push(colInfo);
}

var preview = rows.slice(0, 20);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_data_analyzer_analyze",
      rowCount: rows.length,
      columnCount: columnNames.length,
      columns: columns,
      preview: preview,
      format: format
    })
  }]
};
