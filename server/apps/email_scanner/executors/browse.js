var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheFile = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "email-summary.json");
var topSenders = [];
var recentSubjects = [];

try {
  var raw = fs.readFileSync(cacheFile, "utf-8");
  var data = JSON.parse(raw);
  topSenders = data.topSenders || [];
  recentSubjects = data.recentSubjects || [];
} catch (e) {
  result = { tool: "enso_email_scanner_browse", topSenders: [], recentSubjects: [], error: "No email data cached. Run a scan first." };
  return;
}

// Apply query filter
var filteredSenders = topSenders;
var filteredSubjects = recentSubjects;

if (params.query) {
  var q = params.query.toLowerCase();
  filteredSenders = topSenders.filter(function(s) {
    return (s.from && s.from.toLowerCase().indexOf(q) >= 0) ||
      (s.name && s.name.toLowerCase().indexOf(q) >= 0) ||
      (s.email && s.email.toLowerCase().indexOf(q) >= 0);
  });
  filteredSubjects = recentSubjects.filter(function(s) {
    return (s.subject && s.subject.toLowerCase().indexOf(q) >= 0) ||
      (s.from && s.from.toLowerCase().indexOf(q) >= 0);
  });
}

result = {
  tool: "enso_email_scanner_browse",
  totalSenders: topSenders.length,
  filteredSenders: filteredSenders.length,
  totalSubjects: recentSubjects.length,
  filteredSubjects: filteredSubjects.length,
  query: params.query || null,
  topSenders: filteredSenders,
  recentSubjects: filteredSubjects,
};
