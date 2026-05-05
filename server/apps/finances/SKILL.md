---
name: finances
description: "Financial accounts dashboard — unified view across brokerage and private-bank accounts with wealth monitoring, refresh logs, and notification settings. Each account is a Cortex entity; each periodic statement is its own synthesis page. Privacy: all data lives at ~/.enso/wiki/ and ~/.enso/data/finances/ (local only — never committed to git)."
---

Financial accounts dashboard — unified view across brokerage and private-bank accounts with wealth monitoring, refresh logs, and notification settings. Each account is a Cortex entity; each periodic statement is its own synthesis page. Privacy: all data lives at ~/.enso/wiki/ and ~/.enso/data/finances/ (local only — never committed to git).

## Tool Reference

### enso_finances_list_accounts (primary)

List all known financial accounts with current balance, account type, and holdings count. Reads ~/.enso/data/finances/accounts.json (the local index built by the refresh executors). Use when the user says 'show my accounts', 'financial dashboard', 'net worth', 'wealth overview'.

### enso_finances_account_detail

Show full detail for one financial account: holdings, recent activity, statements list. Use when user clicks an account row or says 'show <account>'.

Parameters:
- `accountId` (string): Stable account identifier

### enso_finances_statement_detail

Show one periodic statement (snapshot) for an account. Renders opening/closing value, net change, holdings, transactions, fees.

Parameters:
- `statementId` (string)

### enso_finances_refresh_kk_live

Re-read the local FactorStrategies accounts directory (data/development/accounts/*.json) and rewrite the financial-account entity pages + per-rebalance statement pages in the Cortex. Use when user says 'refresh accounts', 'update KK_Live', or after a new rebalance.

Parameters:
- `accountsDir` (string): Override the default FactorStrategies accounts dir.

### enso_finances_configure_bank

Add, update, or remove a bank entry in the local config at ~/.enso/data/finances/banks.json. Each entry binds a sender email + subject pattern to a bank id used by refresh_rm_emails. The shipped repo has NO seed entries — config is per-user, local-only, never committed.

Parameters:
- `id` (string): Short bank slug (e.g. 'gtjas', 'citi-pb').
- `displayName` (string): Human-readable bank name.
- `senderEmail` (string): Substring or full sender email (e.g. RM address).
- `subjectMatch` (string): Substring (case-insensitive) the email subject must contain.
- `accountType` (string): 'brokerage' or 'private-bank'. Default 'brokerage'.
- `baseCurrency` (string): Default currency. Default 'USD'.
- `remove` (boolean): If true, remove the entry with this id.

### enso_finances_refresh_rm_emails

For each configured bank in ~/.enso/data/finances/banks.json, fetch matching RM performance emails via Outlook COM, LLM-extract structured statement data, and persist as financial-account entity + financial-statement synthesis pages. Use when user says 'refresh RM statements', 'pull bank emails', or after a new RM email arrives.

Parameters:
- `bankId` (string): Optional: only refresh this bank id.
- `limit` (number): Max emails per bank to process (default 6, max 20).
- `force` (boolean): If true, re-extract emails even if cached.

### enso_finances_wealth_status

Wealth monitoring dashboard: shows all accounts with staleness indicators, active alerts (daily swings, milestone crossings, concentration risk, refresh failures), refresh schedule status, and net worth sparkline. Use when user says 'wealth status', 'account health', 'wealth dashboard', 'monitoring dashboard'.

### enso_finances_refresh_log

Show history of all wealth data refreshes with success/failure status, duration, accounts updated, and net worth deltas. Use when user says 'refresh history', 'refresh log', 'what refreshes ran'.

Parameters:
- `limit` (number): Max entries to return (default 50, max 200).
- `source` (string): Filter by source: 'kk-live' or 'rm-emails'.

### enso_finances_wealth_config

View or update wealth monitoring settings: refresh schedule (KK Live, RM emails), staleness thresholds, alert thresholds (daily change %, concentration), and notification channels (email, WeChat, in-app). Use when user says 'wealth settings', 'configure monitoring', 'notification settings'.

Parameters:
- `action` (string): 'view' (default) or 'update' to save changes.
- `kkLiveEnabled` (boolean): Enable/disable KK Live auto-refresh.
- `kkLiveCron` (string): Cron for KK Live refresh.
- `rmEmailsEnabled` (boolean): Enable/disable RM emails auto-refresh.
- `rmEmailsCron` (string): Cron for RM emails refresh.
- `warnDays` (number): Days before staleness warning.
- `alertDays` (number): Days before staleness alert.
- `criticalDays` (number): Days before critical staleness.
- `dailyChangePct` (number): Daily swing alert threshold (%).
- `concentrationPct` (number): Single-position concentration threshold (%).
- `emailEnabled` (boolean): Enable email notifications.
- `wechatEnabled` (boolean): Enable WeChat notifications.
- `inAppEnabled` (boolean): Enable in-app notifications.
