var fs = require("fs");
var path = require("path");
var home = require("os").homedir();

var TL_CONFIG_PATH = path.join(home, ".enso", "data", "team-leader-config.json");
var DATA_DIR = path.join(home, ".enso", "data");

var defaults = {
  refreshSchedule: { kkLive: { enabled: true, cron: "0 8 * * 1-5" }, rmEmails: { enabled: true, cron: "0 9 * * 1" } },
  staleness: { warnDays: 7, alertDays: 14, criticalDays: 30 },
  thresholds: { dailyChangePct: 3.0, milestones: [1000000, 5000000, 10000000], concentrationPct: 25 },
  suppressNoChange: true,
  channels: { email: true, wechat: true, inApp: true }
};

// Load existing TL config
var tlConfig = {};
try {
  if (fs.existsSync(TL_CONFIG_PATH)) {
    tlConfig = JSON.parse(fs.readFileSync(TL_CONFIG_PATH, "utf-8"));
  }
} catch (e) { /* start fresh */ }

var current = Object.assign({}, defaults, tlConfig.wealthMonitor || {});

// If update params provided, apply them
var action = (params && params.action) ? params.action : "view";
var updated = false;

if (action === "update" && params) {
  if (params.kkLiveEnabled !== undefined) {
    current.refreshSchedule.kkLive.enabled = !!params.kkLiveEnabled;
    updated = true;
  }
  if (params.kkLiveCron) {
    current.refreshSchedule.kkLive.cron = params.kkLiveCron;
    updated = true;
  }
  if (params.rmEmailsEnabled !== undefined) {
    current.refreshSchedule.rmEmails.enabled = !!params.rmEmailsEnabled;
    updated = true;
  }
  if (params.rmEmailsCron) {
    current.refreshSchedule.rmEmails.cron = params.rmEmailsCron;
    updated = true;
  }
  if (params.warnDays !== undefined) {
    current.staleness.warnDays = parseInt(params.warnDays) || 7;
    updated = true;
  }
  if (params.alertDays !== undefined) {
    current.staleness.alertDays = parseInt(params.alertDays) || 14;
    updated = true;
  }
  if (params.criticalDays !== undefined) {
    current.staleness.criticalDays = parseInt(params.criticalDays) || 30;
    updated = true;
  }
  if (params.dailyChangePct !== undefined) {
    current.thresholds.dailyChangePct = parseFloat(params.dailyChangePct) || 3.0;
    updated = true;
  }
  if (params.concentrationPct !== undefined) {
    current.thresholds.concentrationPct = parseInt(params.concentrationPct) || 25;
    updated = true;
  }
  if (params.emailEnabled !== undefined) {
    current.channels.email = !!params.emailEnabled;
    updated = true;
  }
  if (params.wechatEnabled !== undefined) {
    current.channels.wechat = !!params.wechatEnabled;
    updated = true;
  }
  if (params.inAppEnabled !== undefined) {
    current.channels.inApp = !!params.inAppEnabled;
    updated = true;
  }

  if (updated) {
    tlConfig.wealthMonitor = current;
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TL_CONFIG_PATH, JSON.stringify(tlConfig, null, 2), "utf-8");
  }
}

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_finances_wealth_config",
      action: action,
      updated: updated,
      config: {
        refreshSchedule: current.refreshSchedule,
        staleness: current.staleness,
        thresholds: current.thresholds,
        channels: current.channels,
        suppressNoChange: current.suppressNoChange
      }
    })
  }]
};
