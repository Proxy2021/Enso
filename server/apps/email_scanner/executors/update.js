// Email Update — scan recent inbox, detect new emails, ingest to Cortex
var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheFile = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "email.json");

// 1. Read existing cache to get known email subjects/dates
var existing = { emails: [], topContacts: [], totalEmails: 0 };
try { existing = JSON.parse(fs.readFileSync(cacheFile, "utf-8")); } catch (e) {}
var existingSubjects = new Set();
if (existing.emails) {
  existing.emails.forEach(function(e) { existingSubjects.add(e.subject + "|" + e.date); });
}
var beforeCount = existing.emails ? existing.emails.length : (existing.totalEmails || 0);

// 2. Scan recent inbox (limit 20 for incremental)
var scanResult = await ctx.callTool("enso_context_scan_email", {
  folder: "INBOX",
  limit: 20,
});

// 3. Read updated cache
var updated = { emails: [], topContacts: [], totalEmails: 0 };
try { updated = JSON.parse(fs.readFileSync(cacheFile, "utf-8")); } catch (e) {}

// 4. Find new emails
var newEmails = [];
if (updated.emails) {
  newEmails = updated.emails.filter(function(e) {
    return !existingSubjects.has(e.subject + "|" + e.date);
  });
}
var afterCount = updated.emails ? updated.emails.length : (updated.totalEmails || 0);

// 5. Ingest new contacts/patterns to Cortex
var cortexIngested = false;
if (newEmails.length > 0) {
  try {
    var contacts = {};
    newEmails.forEach(function(e) {
      var from = e.from || e.sender || "unknown";
      contacts[from] = (contacts[from] || 0) + 1;
    });
    var topContacts = Object.entries(contacts).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);
    var summary = "Recent email activity (" + newEmails.length + " new emails):\n" +
      "Top senders: " + topContacts.map(function(c) { return c[0] + " (" + c[1] + ")"; }).join(", ") + "\n" +
      "Subjects: " + newEmails.slice(0, 10).map(function(e) { return e.subject; }).join("; ");
    await ctx.callTool("enso_wiki_ingest", { text: summary, topic: "Email Activity Update" });
    cortexIngested = true;
  } catch (e) {}
}

result = {
  tool: "enso_email_scanner_update",
  beforeCount: beforeCount,
  afterCount: afterCount,
  newEmails: newEmails.length,
  newSubjects: newEmails.slice(0, 10).map(function(e) { return e.subject; }),
  cortexIngested: cortexIngested,
};
