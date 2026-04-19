// configure_bank — add or update a bank entry in the local config at
// ~/.enso/data/finances/banks.json. The shipped repo has NO seed entries.
// Each bank entry has:
//   id           — short slug (e.g. "gtjas", "citi-pb")
//   displayName  — human label (e.g. "GTJAS", "Citi Private Bank")
//   senderEmail  — substring/exact match for SenderEmailAddress (e.g. "tony.chan@gtjas.com.hk")
//   subjectMatch — substring case-insensitive subject match (e.g. "Investment Performance")
//   accountType  — usually "brokerage" or "private-bank"
//   baseCurrency — default currency (USD/HKD/EUR/etc.)
//
// To remove a bank, pass { id, remove: true }.

var fs = require("fs");
var path = require("path");

var home = process.env.HOME || process.env.USERPROFILE || ".";
var FINANCES_DIR = path.join(home, ".enso", "data", "finances");
var BANKS_PATH = path.join(FINANCES_DIR, "banks.json");

if (!fs.existsSync(FINANCES_DIR)) fs.mkdirSync(FINANCES_DIR, { recursive: true });

var p = params || {};
var id = (p.id || "").toString().trim();
if (!id) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_configure_bank",
    error: true,
    message: "id is required (short slug, e.g. 'gtjas')"
  }) }] };
}

var config = { banks: [] };
if (fs.existsSync(BANKS_PATH)) {
  try { config = JSON.parse(fs.readFileSync(BANKS_PATH, "utf-8")); } catch (e) { /* fresh */ }
}
if (!Array.isArray(config.banks)) config.banks = [];

var existing = config.banks.findIndex(function(b) { return b.id === id; });

if (p.remove) {
  if (existing < 0) {
    return { content: [{ type: "text", text: JSON.stringify({
      tool: "enso_finances_configure_bank",
      error: true,
      message: "Bank '" + id + "' not in config — nothing to remove."
    }) }] };
  }
  var removed = config.banks.splice(existing, 1)[0];
  fs.writeFileSync(BANKS_PATH, JSON.stringify(config, null, 2), "utf-8");
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_configure_bank",
    success: true,
    action: "removed",
    bank: { id: removed.id, displayName: removed.displayName },
    bankCount: config.banks.length
  }) }] };
}

var entry = {
  id: id,
  displayName: (p.displayName || id).toString(),
  senderEmail: (p.senderEmail || "").toString().trim(),
  subjectMatch: (p.subjectMatch || "").toString().trim(),
  accountType: (p.accountType || "brokerage").toString(),
  baseCurrency: (p.baseCurrency || "USD").toString(),
  // Optional: per-bank password for encrypted PDF statements (e.g. Citi PB).
  // Stored locally in ~/.enso/data/finances/banks.json — never committed.
  pdfPassword: p.pdfPassword ? String(p.pdfPassword) : (p.pdfPassword === "" ? "" : undefined),
  updatedAt: new Date().toISOString()
};
// Preserve existing pdfPassword if not explicitly cleared
if (entry.pdfPassword === undefined && existing >= 0 && config.banks[existing].pdfPassword) {
  entry.pdfPassword = config.banks[existing].pdfPassword;
}

if (!entry.senderEmail || !entry.subjectMatch) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_configure_bank",
    error: true,
    message: "Both senderEmail and subjectMatch are required for new entries."
  }) }] };
}

if (existing >= 0) {
  config.banks[existing] = entry;
} else {
  config.banks.push(entry);
}
fs.writeFileSync(BANKS_PATH, JSON.stringify(config, null, 2), "utf-8");

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_finances_configure_bank",
  success: true,
  action: existing >= 0 ? "updated" : "added",
  bank: { id: entry.id, displayName: entry.displayName, senderEmail: entry.senderEmail, subjectMatch: entry.subjectMatch },
  bankCount: config.banks.length,
  configPath: BANKS_PATH
}) }] };
