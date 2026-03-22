var filterCol = params.filter_column || "";
var filterOp = params.filter_op || "";
var filterVal = params.filter_value || "";
var sortCol = params.sort_column || "";
var sortDir = params.sort_dir || "asc";

var rows = await ctx.store.get("last_data");
if (!rows || !Array.isArray(rows) || rows.length === 0) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        tool: "enso_data_analyzer_query",
        error: "No data loaded. Run analyze first.",
        rowCount: 0,
        rows: []
      })
    }]
  };
}

var result = rows.slice();
var applied = {};

if (filterCol && filterOp) {
  result = result.filter(function(row) {
    var val = row[filterCol];
    var cmp = filterVal;
    var numVal = Number(val);
    var numCmp = Number(cmp);
    var bothNum = !isNaN(numVal) && !isNaN(numCmp) && val !== null && val !== "";

    switch (filterOp) {
      case "eq": return String(val) === String(cmp);
      case "neq": return String(val) !== String(cmp);
      case "gt": return bothNum ? numVal > numCmp : String(val) > String(cmp);
      case "lt": return bothNum ? numVal < numCmp : String(val) < String(cmp);
      case "gte": return bothNum ? numVal >= numCmp : String(val) >= String(cmp);
      case "lte": return bothNum ? numVal <= numCmp : String(val) <= String(cmp);
      case "contains": return String(val || "").toLowerCase().indexOf(String(cmp).toLowerCase()) >= 0;
      default: return true;
    }
  });
  applied.filter = filterCol + " " + filterOp + " " + filterVal;
}

if (sortCol) {
  result.sort(function(a, b) {
    var va = a[sortCol];
    var vb = b[sortCol];
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    var na = Number(va);
    var nb = Number(vb);
    var cmp;
    if (!isNaN(na) && !isNaN(nb)) {
      cmp = na - nb;
    } else {
      cmp = String(va).localeCompare(String(vb));
    }
    return sortDir === "desc" ? -cmp : cmp;
  });
  applied.sort = sortCol + " " + sortDir;
}

await ctx.store.set("last_data", result);

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_data_analyzer_query",
      rowCount: result.length,
      applied: applied,
      rows: result.slice(0, 50)
    })
  }]
};
