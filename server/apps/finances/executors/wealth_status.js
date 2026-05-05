var fs = require("fs");
var path = require("path");
var home = require("os").homedir();

var FINANCES_DIR = path.join(home, ".enso", "data", "finances");
var INDEX_PATH = path.join(FINANCES_DIR, "accounts.json");
var HISTORY_PATH = path.join(FINANCES_DIR, "net_worth_history.jsonl");
var REFRESH_LOG_PATH = path.join(FINANCES_DIR, "refresh-log.jsonl");
var TL_CONFIG_PATH = path.join(home, ".enso", "data", "team-leader-config.json");

var now = Date.now();

// Load accounts
var accounts = [];
try {
  if (fs.existsSync(INDEX_PATH)) {
    var idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
    accounts = Array.isArray(idx.accounts) ? idx.accounts : [];
  }
} catch (e) { /* empty */ }

// Load net worth history
var history = [];
try {
  if (fs.existsSync(HISTORY_PATH)) {
    var lines = fs.readFileSync(HISTORY_PATH, "utf-8").trim().split(/\r?\n/).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      try { history.push(JSON.parse(lines[i])); } catch (e) { /* skip */ }
    }
  }
} catch (e) { /* empty */ }

// Load refresh log (last 30 entries)
var refreshLog = [];
try {
  if (fs.existsSync(REFRESH_LOG_PATH)) {
    var rlines = fs.readFileSync(REFRESH_LOG_PATH, "utf-8").trim().split(/\r?\n/).filter(Boolean);
    for (var j = 0; j < rlines.length; j++) {
      try { refreshLog.push(JSON.parse(rlines[j])); } catch (e) { /* skip */ }
    }
  }
} catch (e) { /* empty */ }
var recentRefreshes = refreshLog.slice(-10);

// Load config
var config = {
  refreshSchedule: { kkLive: { enabled: true, cron: "0 8 * * 1-5" }, rmEmails: { enabled: true, cron: "0 9 * * 1" } },
  staleness: { warnDays: 7, alertDays: 14, criticalDays: 30 },
  thresholds: { dailyChangePct: 3.0, milestones: [1000000, 5000000, 10000000], concentrationPct: 25 },
  suppressNoChange: true,
  channels: { email: true, wechat: true, inApp: true }
};
try {
  if (fs.existsSync(TL_CONFIG_PATH)) {
    var tlCfg = JSON.parse(fs.readFileSync(TL_CONFIG_PATH, "utf-8"));
    if (tlCfg.wealthMonitor) {
      config = Object.assign({}, config, tlCfg.wealthMonitor);
    }
  }
} catch (e) { /* defaults */ }

// Compute per-account staleness
var accountStatus = accounts.map(function(a) {
  var updated = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
  var daysSince = updated ? (now - updated) / (24 * 60 * 60 * 1000) : Infinity;
  var severity = "ok";
  if (daysSince >= config.staleness.criticalDays) severity = "critical";
  else if (daysSince >= config.staleness.alertDays) severity = "alert";
  else if (daysSince >= config.staleness.warnDays) severity = "warn";
  return {
    accountId: a.accountId,
    displayName: a.displayName,
    institution: a.institution || "",
    accountType: a.accountType || "",
    baseCurrency: a.baseCurrency || "USD",
    currentValue: a.currentValue || 0,
    cash: a.cash || 0,
    holdingsCount: a.holdingsCount || 0,
    lastUpdated: a.lastUpdated || null,
    daysSinceUpdate: Math.round(daysSince * 10) / 10,
    severity: severity
  };
});

// Net worth computation
var byCurrency = {};
for (var k = 0; k < accounts.length; k++) {
  var c = accounts[k].baseCurrency || "USD";
  byCurrency[c] = (byCurrency[c] || 0) + (accounts[k].currentValue || 0);
}
var primaryCurrency = "USD";
var primaryTotal = 0;
var currencies = Object.keys(byCurrency);
for (var m = 0; m < currencies.length; m++) {
  if (byCurrency[currencies[m]] > primaryTotal) {
    primaryTotal = byCurrency[currencies[m]];
    primaryCurrency = currencies[m];
  }
}

// Delta vs previous day
var delta = null;
var deltaPct = null;
var deltaPeriod = null;
var todayKey = new Date().toISOString().slice(0, 10);
for (var n = history.length - 1; n >= 0; n--) {
  if (history[n].date !== todayKey) {
    var prevVal = history[n].byCurrency ? history[n].byCurrency[primaryCurrency] : null;
    if (typeof prevVal === "number" && prevVal > 0) {
      delta = primaryTotal - prevVal;
      deltaPct = Math.round((delta / prevVal) * 10000) / 100;
      deltaPeriod = history[n].date;
    }
    break;
  }
}

// Build alerts
var alerts = [];

// Staleness alerts
for (var s = 0; s < accountStatus.length; s++) {
  if (accountStatus[s].severity === "alert" || accountStatus[s].severity === "critical") {
    alerts.push({
      type: "staleness",
      severity: accountStatus[s].severity === "critical" ? "critical" : "warn",
      title: accountStatus[s].displayName + " data is " + Math.round(accountStatus[s].daysSinceUpdate) + " days old",
      accountId: accountStatus[s].accountId
    });
  }
}

// Daily swing
if (deltaPct !== null && Math.abs(deltaPct) >= config.thresholds.dailyChangePct) {
  var dir = deltaPct >= 0 ? "up" : "down";
  alerts.push({
    type: "daily-swing",
    severity: "warn",
    title: "Portfolio " + dir + " " + Math.abs(deltaPct).toFixed(1) + "% since " + deltaPeriod
  });
}

// Recent refresh failures
var lastRefresh = refreshLog.length > 0 ? refreshLog[refreshLog.length - 1] : null;
if (lastRefresh && !lastRefresh.success) {
  var failHoursAgo = (now - new Date(lastRefresh.ts).getTime()) / (60 * 60 * 1000);
  if (failHoursAgo < 48) {
    alerts.push({
      type: "refresh-failure",
      severity: "critical",
      title: "Last " + lastRefresh.source + " refresh failed: " + (lastRefresh.error || "unknown").slice(0, 80)
    });
  }
}

// Refresh status
var kkEntries = refreshLog.filter(function(e) { return e.source === "kk-live"; });
var rmEntries = refreshLog.filter(function(e) { return e.source === "rm-emails"; });
var lastKk = kkEntries.length > 0 ? kkEntries[kkEntries.length - 1] : null;
var lastRm = rmEntries.length > 0 ? rmEntries[rmEntries.length - 1] : null;

var refreshStatus = {
  kkLive: {
    enabled: config.refreshSchedule.kkLive.enabled,
    cron: config.refreshSchedule.kkLive.cron,
    lastRefresh: lastKk ? lastKk.ts : null,
    lastSuccess: lastKk ? lastKk.success : null
  },
  rmEmails: {
    enabled: config.refreshSchedule.rmEmails.enabled,
    cron: config.refreshSchedule.rmEmails.cron,
    lastRefresh: lastRm ? lastRm.ts : null,
    lastSuccess: lastRm ? lastRm.success : null
  }
};

// Sparkline from history (last 14 entries)
var sparkline = history.slice(-14).map(function(h) {
  return { date: h.date, value: h.byCurrency ? (h.byCurrency[primaryCurrency] || h.primaryTotal || 0) : (h.primaryTotal || 0) };
}).filter(function(p) { return p.value > 0; });

return {
  content: [{
    type: "text",
    text: JSON.stringify({
      tool: "enso_finances_wealth_status",
      totalAccounts: accounts.length,
      primaryCurrency: primaryCurrency,
      primaryTotal: primaryTotal,
      byCurrency: byCurrency,
      delta: delta,
      deltaPct: deltaPct,
      deltaPeriod: deltaPeriod,
      accounts: accountStatus,
      alerts: alerts,
      refreshStatus: refreshStatus,
      recentRefreshes: recentRefreshes,
      sparkline: sparkline,
      config: {
        staleness: config.staleness,
        thresholds: config.thresholds,
        channels: config.channels
      }
    })
  }]
};
