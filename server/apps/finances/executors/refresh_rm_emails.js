// refresh_rm_emails — for each configured bank in ~/.enso/data/finances/banks.json,
// fetch matching RM performance emails via Outlook COM, LLM-extract structured
// statement data, and persist as financial-account entity + financial-statement
// synthesis pages in the Cortex.
//
// All output stays under ~/.enso/. The repo never sees real bank names, RM emails,
// balances, or holdings.

var fs = require("fs");
var path = require("path");

var home = process.env.HOME || process.env.USERPROFILE || ".";
var WIKI_DIR = path.join(home, ".enso", "wiki");
var ENTITIES_DIR = path.join(WIKI_DIR, "entities");
var SYNTHESIS_DIR = path.join(WIKI_DIR, "synthesis");
var FINANCES_DIR = path.join(home, ".enso", "data", "finances");
var BANKS_PATH = path.join(FINANCES_DIR, "banks.json");
var INDEX_PATH = path.join(FINANCES_DIR, "accounts.json");
var EXTRACT_CACHE_DIR = path.join(FINANCES_DIR, "rm-extracts");
var STATEMENTS_DIR = path.join(FINANCES_DIR, "statements");

[ENTITIES_DIR, SYNTHESIS_DIR, FINANCES_DIR, EXTRACT_CACHE_DIR, STATEMENTS_DIR].forEach(function(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

if (!fs.existsSync(BANKS_PATH)) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_refresh_rm_emails",
    error: true,
    message: "No bank config at " + BANKS_PATH + ". Run configure_bank first to add banks."
  }) }] };
}

var config;
try { config = JSON.parse(fs.readFileSync(BANKS_PATH, "utf-8")); }
catch (e) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_refresh_rm_emails",
    error: true,
    message: "Failed to parse banks config: " + e.message
  }) }] };
}

var banks = (config && Array.isArray(config.banks)) ? config.banks : [];
if (banks.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_finances_refresh_rm_emails",
    error: true,
    message: "No banks configured. Use configure_bank to add an entry."
  }) }] };
}

var requestedBankId = (params && typeof params.bankId === "string") ? params.bankId.trim() : "";
var force = !!(params && params.force);
var emailsPerBank = Math.max(1, Math.min(20, (params && params.limit) || 6));

// Strip HTML tags + collapse whitespace — feed only the visible text to the LLM.
function htmlToText(html) {
  if (!html) return "";
  var s = String(html);
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<\/(p|div|li|tr|br|h1|h2|h3|h4|h5)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

function extractJsonBlock(text) {
  if (!text) return null;
  var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  var raw = fence ? fence[1] : text;
  var start = raw.indexOf("{");
  var end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); }
  catch (e) { return null; }
}

function fmtMoney(v, currency) {
  if (v == null || isNaN(v)) return "—";
  return (currency || "USD") + " " + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

var totalScanned = 0;
var totalMatched = 0;
var totalExtracted = 0;
var totalCached = 0;
var bankResults = [];
var indexEntriesByBank = {};

for (var bi = 0; bi < banks.length; bi++) {
  var bank = banks[bi];
  if (requestedBankId && bank.id !== requestedBankId) continue;
  if (!bank.senderEmail || !bank.subjectMatch) {
    bankResults.push({ bankId: bank.id, error: "Missing senderEmail or subjectMatch in config" });
    continue;
  }

  // Fetch matching emails (with bodies)
  var fetchResult;
  try {
    fetchResult = await ctx.callTool("enso_email_search_full", {
      senderContains: bank.senderEmail,
      subjectContains: bank.subjectMatch,
      folder: "INBOX",
      limit: emailsPerBank,
      maxBodyChars: 60000
    });
  } catch (e) {
    bankResults.push({ bankId: bank.id, error: "Email search threw: " + (e && e.message ? e.message : String(e)) });
    continue;
  }
  if (!fetchResult || !fetchResult.success) {
    bankResults.push({ bankId: bank.id, error: "Email search failed: " + (fetchResult && fetchResult.error ? fetchResult.error : "unknown") });
    continue;
  }
  var pulled = (fetchResult.data && Array.isArray(fetchResult.data.emails)) ? fetchResult.data.emails : [];
  totalScanned += (fetchResult.data && fetchResult.data.scanned) || 0;
  totalMatched += pulled.length;

  if (pulled.length === 0) {
    bankResults.push({ bankId: bank.id, displayName: bank.displayName, scanned: (fetchResult.data && fetchResult.data.scanned) || 0, matched: 0, extracted: 0, message: "No matching emails found." });
    continue;
  }

  // Process each matched email
  var bankExtracts = [];
  var statementEntries = [];
  var latestPeriod = null;
  var latestClosing = null;
  var latestCurrency = bank.baseCurrency || "USD";

  for (var ei = 0; ei < pulled.length; ei++) {
    var msg = pulled[ei];
    var receivedISO = msg.date ? new Date(msg.date).toISOString() : new Date().toISOString();
    var receivedDate = receivedISO.slice(0, 10);
    var msgKey = bank.id + "-" + receivedDate + "-" + slugify(msg.subject || "msg").slice(0, 30);
    var cachePath = path.join(EXTRACT_CACHE_DIR, msgKey + ".json");

    var extracted = null;
    if (fs.existsSync(cachePath) && !force) {
      try { extracted = JSON.parse(fs.readFileSync(cachePath, "utf-8")); totalCached++; }
      catch (e) { extracted = null; }
    }

    if (!extracted) {
      var bodyText = htmlToText(msg.htmlBody || msg.textBody || "");
      if (bodyText.length < 80) {
        bankExtracts.push({ subject: msg.subject, date: receivedISO, error: "Body too short to parse" });
        continue;
      }
      // Cap at ~12k chars to stay within fast-tier model context
      if (bodyText.length > 12000) bodyText = bodyText.slice(0, 12000);

      var prompt = "You are extracting structured investment-performance data from a private-bank/brokerage RM email. " +
        "READ THE BODY CAREFULLY — many RMs phrase numbers in prose (e.g. 'your portfolio is now valued at HKD 8.2M, up 1.3% from last month'). Pull every concrete figure you can find. Use null only when the number is truly absent — never invent figures.\n\n" +
        "Return ONLY a JSON object with these fields:\n" +
        "{\n" +
        "  \"period\": \"YYYY-MM or YYYY-MM-DD or quarter label like 2026-Q1 — use the period the email is reporting on, not the date sent\",\n" +
        "  \"periodStart\": \"YYYY-MM-DD or null\",\n" +
        "  \"periodEnd\": \"YYYY-MM-DD or null\",\n" +
        "  \"currency\": \"3-letter currency code (USD/HKD/EUR/CNY/GBP/...) — pick the dominant one in the email\",\n" +
        "  \"openingValue\": number or null  (portfolio value at start of period, in the currency above),\n" +
        "  \"closingValue\": number or null  (portfolio value at end of period — search hard, this is usually present),\n" +
        "  \"netChange\": number or null  (closing - opening),\n" +
        "  \"netChangePct\": number or null  (e.g. 1.3 means +1.3%),\n" +
        "  \"holdings\": [ { \"ticker\": \"AAPL\" or asset/stock name, \"weight\": number 0-1 or null, \"value\": number or null } ]  (extract all positions/securities mentioned with values),\n" +
        "  \"transactions\": [ { \"date\": \"YYYY-MM-DD\" or null, \"action\": \"buy|sell|dividend|fee|deposit|withdrawal|interest\", \"ticker\": string or null, \"amount\": number or null } ],\n" +
        "  \"fees\": number or null,\n" +
        "  \"dividends\": number or null,\n" +
        "  \"rmCommentary\": \"1-3 sentence summary of what the RM said about performance, market view, or recommendations — quote/paraphrase, don't editorialize\"\n" +
        "}\n\n" +
        "IMPORTANT: numbers must be plain JSON numbers — no currency symbols, no commas, no thousand-separators. 8,234,567.89 → 8234567.89.\n" +
        "If the email contains a table of holdings, extract every row.\n" +
        "If you only find one figure (e.g. just the closing value), still set closingValue and leave others null.\n\n" +
        "Email subject: " + (msg.subject || "(none)") + "\n" +
        "Email received: " + receivedISO + "\n\n" +
        "Email body:\n" + bodyText;

      var llmResp;
      try { llmResp = await ctx.ask(prompt); }
      catch (e) {
        bankExtracts.push({ subject: msg.subject, date: receivedISO, error: "LLM call threw: " + (e && e.message ? e.message : String(e)) });
        continue;
      }
      if (!llmResp || !llmResp.ok) {
        bankExtracts.push({ subject: msg.subject, date: receivedISO, error: "LLM call failed: " + (llmResp && llmResp.text ? llmResp.text.slice(0, 120) : "unknown") });
        continue;
      }
      extracted = extractJsonBlock(llmResp.text);
      if (!extracted) {
        bankExtracts.push({ subject: msg.subject, date: receivedISO, error: "Could not parse JSON from LLM output", rawStart: (llmResp.text || "").slice(0, 200) });
        continue;
      }
      // Persist extract cache (avoid re-LLM on same email)
      try {
        fs.writeFileSync(cachePath, JSON.stringify({
          bankId: bank.id, displayName: bank.displayName, subject: msg.subject, receivedAt: receivedISO,
          extractedAt: new Date().toISOString(), extracted: extracted
        }, null, 2), "utf-8");
      } catch (e) { /* non-fatal */ }
    } else {
      extracted = extracted.extracted || extracted;
    }

    totalExtracted++;

    // Pick a stable period label (LLM should return YYYY-MM; fallback to received date)
    var period = (extracted && extracted.period) ? String(extracted.period).trim() : receivedDate.slice(0, 7);
    var statementSlug = bank.id + "-" + period;
    var statementId = "finances:financial-statement:" + statementSlug;
    var statementPath = path.join(SYNTHESIS_DIR, "statement-" + statementSlug + ".md");

    // Track latest closing for the account-level summary
    if (extracted.closingValue != null) {
      if (latestPeriod == null || period > latestPeriod) {
        latestPeriod = period;
        latestClosing = extracted.closingValue;
        if (extracted.currency) latestCurrency = extracted.currency;
      }
    }

    // Build statement page markdown
    var sLines = [];
    sLines.push("# " + bank.displayName + " — " + period);
    sLines.push("");
    sLines.push("Periodic statement extracted from RM email **" + (msg.subject || "(no subject)") + "** received " + receivedISO.slice(0, 10) + ".");
    sLines.push("");
    sLines.push("## Snapshot");
    sLines.push("- **Period**: " + period + (extracted.periodStart && extracted.periodEnd ? " (" + extracted.periodStart + " → " + extracted.periodEnd + ")" : ""));
    sLines.push("- **Opening value**: " + fmtMoney(extracted.openingValue, extracted.currency || latestCurrency));
    sLines.push("- **Closing value**: " + fmtMoney(extracted.closingValue, extracted.currency || latestCurrency));
    if (extracted.netChange != null) sLines.push("- **Net change**: " + fmtMoney(extracted.netChange, extracted.currency || latestCurrency) + (extracted.netChangePct != null ? " (" + (extracted.netChangePct >= 0 ? "+" : "") + extracted.netChangePct + "%)" : ""));
    if (extracted.fees != null) sLines.push("- **Fees**: " + fmtMoney(extracted.fees, extracted.currency || latestCurrency));
    if (extracted.dividends != null) sLines.push("- **Dividends**: " + fmtMoney(extracted.dividends, extracted.currency || latestCurrency));
    sLines.push("");

    if (Array.isArray(extracted.holdings) && extracted.holdings.length > 0) {
      sLines.push("## Holdings");
      for (var hi = 0; hi < extracted.holdings.length; hi++) {
        var h = extracted.holdings[hi];
        var w = (h.weight != null) ? " · " + Math.round(h.weight * 1000) / 10 + "%" : "";
        var v = (h.value != null) ? " · " + fmtMoney(h.value, extracted.currency || latestCurrency) : "";
        var label = (h.ticker || "").toString();
        sLines.push("- [[" + slugify(label) + "|" + label + "]]" + w + v);
      }
      sLines.push("");
    }

    if (Array.isArray(extracted.transactions) && extracted.transactions.length > 0) {
      sLines.push("## Transactions");
      for (var ti = 0; ti < extracted.transactions.length; ti++) {
        var tr = extracted.transactions[ti];
        sLines.push("- " + (tr.date || "?") + " · **" + (tr.action || "?") + "** " + (tr.ticker || "") + (tr.amount != null ? " · " + fmtMoney(tr.amount, extracted.currency || latestCurrency) : ""));
      }
      sLines.push("");
    }

    if (extracted.rmCommentary) {
      sLines.push("## RM Commentary");
      sLines.push("> " + extracted.rmCommentary.replace(/\n/g, "\n> "));
      sLines.push("");
    }

    sLines.push("---");
    sLines.push("EntityId: " + statementId);
    sLines.push("Type: financial-statement");
    sLines.push("Source: finances");
    sLines.push("AccountId: finances:financial-account:" + bank.id);
    sLines.push("Period: " + period);
    sLines.push("ReceivedAt: " + receivedISO);
    sLines.push("Updated: " + new Date().toISOString());
    sLines.push("");

    fs.writeFileSync(statementPath, sLines.join("\n"), "utf-8");

    // Write structured sidecar so statement_detail can render without re-parsing markdown.
    var sidecarPath = path.join(STATEMENTS_DIR, bank.id + "-" + period + ".json");
    try {
      fs.writeFileSync(sidecarPath, JSON.stringify({
        statementId: statementId,
        accountId: "finances:financial-account:" + bank.id,
        accountSlug: bank.id,
        accountName: bank.displayName,
        institution: bank.displayName,
        baseCurrency: extracted.currency || latestCurrency,
        period: period,
        receivedAt: receivedISO,
        subject: msg.subject,
        sourceKind: "rm-emails",
        extracted: extracted
      }, null, 2), "utf-8");
    } catch (e) { /* non-fatal */ }

    statementEntries.push({
      statementId: statementId,
      period: period,
      closingValue: extracted.closingValue,
      currency: extracted.currency || latestCurrency,
      receivedAt: receivedISO,
      subject: msg.subject
    });
    bankExtracts.push({
      subject: msg.subject,
      date: receivedISO,
      period: period,
      closingValue: extracted.closingValue,
      holdingsCount: Array.isArray(extracted.holdings) ? extracted.holdings.length : 0
    });
  }

  // ── Account entity page (one per bank) ──
  var accountSlug = bank.id;
  var accountId = "finances:financial-account:" + accountSlug;
  var accountPath = path.join(ENTITIES_DIR, "account-" + accountSlug + ".md");

  var aLines = [];
  aLines.push("# " + bank.displayName);
  aLines.push("");
  aLines.push("**" + bank.accountType + "** account at **" + bank.displayName + "** (" + (bank.baseCurrency || "USD") + ").");
  aLines.push("");
  aLines.push("Source: RM performance emails extracted from inbox (sender pattern: `" + bank.senderEmail.replace(/[a-z]/g, "*").replace(/\d/g, "*") + "`, subject: `" + bank.subjectMatch + "`).");
  aLines.push("");
  aLines.push("## Latest Snapshot");
  if (latestClosing != null) {
    aLines.push("- **Closing value**: " + fmtMoney(latestClosing, latestCurrency) + " (as of " + latestPeriod + ")");
  } else {
    aLines.push("- _No closing value extracted yet._");
  }
  aLines.push("- **Statements indexed**: " + statementEntries.length);
  aLines.push("");
  aLines.push("## Periodic Statements");
  if (statementEntries.length === 0) {
    aLines.push("_No statements extracted._");
  } else {
    statementEntries.sort(function(a, b) { return (a.period < b.period) ? 1 : -1; });
    for (var se = 0; se < Math.min(12, statementEntries.length); se++) {
      var s = statementEntries[se];
      aLines.push("- [[statement-" + bank.id + "-" + s.period + "|" + s.period + " — " + fmtMoney(s.closingValue, s.currency) + "]]");
    }
  }
  aLines.push("");
  aLines.push("---");
  aLines.push("EntityId: " + accountId);
  aLines.push("Type: financial-account");
  aLines.push("Source: finances");
  aLines.push("Updated: " + new Date().toISOString());
  aLines.push("");
  fs.writeFileSync(accountPath, aLines.join("\n"), "utf-8");

  indexEntriesByBank[bank.id] = {
    accountId: accountId,
    slug: accountSlug,
    displayName: bank.displayName,
    institution: bank.displayName,
    accountType: bank.accountType,
    baseCurrency: latestCurrency,
    currentValue: latestClosing != null ? latestClosing : 0,
    cash: null,
    holdingsCount: 0,
    statementCount: statementEntries.length,
    lastUpdated: new Date().toISOString(),
    cortexPath: "entities/account-" + accountSlug + ".md",
    sourceKind: "rm-emails",
    bankId: bank.id
  };

  bankResults.push({
    bankId: bank.id,
    displayName: bank.displayName,
    scanned: (fetchResult.data && fetchResult.data.scanned) || 0,
    matched: pulled.length,
    extracted: statementEntries.length,
    latestPeriod: latestPeriod,
    extracts: bankExtracts
  });
}

// ── Update accounts index (preserve other-source entries like KK_Live) ──
var existingIndex = { accounts: [], lastRefreshAt: null };
if (fs.existsSync(INDEX_PATH)) {
  try { existingIndex = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")); } catch (e) { /* fresh */ }
}
var updatedIds = Object.keys(indexEntriesByBank).map(function(k) { return indexEntriesByBank[k].accountId; });
var merged = (existingIndex.accounts || []).filter(function(a) { return updatedIds.indexOf(a.accountId) < 0; });
for (var k in indexEntriesByBank) merged.push(indexEntriesByBank[k]);

fs.writeFileSync(INDEX_PATH, JSON.stringify({
  accounts: merged,
  lastRefreshAt: new Date().toISOString()
}, null, 2), "utf-8");

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_finances_refresh_rm_emails",
  success: true,
  banksProcessed: bankResults.length,
  totalScanned: totalScanned,
  totalMatched: totalMatched,
  totalExtracted: totalExtracted,
  totalCached: totalCached,
  bankResults: bankResults,
  message: "Processed " + bankResults.length + " bank(s): " + totalMatched + " emails matched, " + totalExtracted + " statements extracted (" + totalCached + " from cache)"
}) }] };
