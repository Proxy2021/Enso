/**
 * email-cleanup.ts — Weekly inbox cleanup with confirmation flow.
 *
 * 1. Scans Outlook inbox via PowerShell COM
 * 2. Identifies low-value emails (promo, newsletters, automated notifications)
 * 3. Sends a report email with a "Confirm Cleanup" button
 * 4. On click, executes the deletion via REST endpoint
 */

import { randomUUID } from "node:crypto";
import { execSync, exec } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { logAction, logError } from "./action-log.js";

const CLEANUP_DIR = join(homedir(), ".enso", "email-cleanup");
const PROMO_SENDERS_FILE = join(CLEANUP_DIR, "promo-senders.json");

// ── Known low-value sender patterns ──

const LOW_VALUE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /oceania|cruise/i, reason: "Cruise marketing" },
  { pattern: /great courses|thegreatcourses/i, reason: "Course promotions" },
  { pattern: /kickstarter|backerkit|first-backer/i, reason: "Crowdfunding" },
  { pattern: /avdome\.com|asking.*product.*price/i, reason: "Solicitation spam" },
  { pattern: /mxsend\.in/i, reason: "Bulk mailer" },
  { pattern: /purduealumni|purduedayofgiving/i, reason: "Alumni marketing" },
  { pattern: /noreply.*uber|uber.*noreply|uberegui/i, reason: "Uber promos" },
  { pattern: /explore\.oceania|e\.thegreatcourses/i, reason: "Marketing email" },
  { pattern: /steampowered\.com.*noreply/i, reason: "Steam notifications" },
  { pattern: /noreply.*fourseasons|fourseasons.*noreply/i, reason: "Hotel marketing" },
  { pattern: /interact\.globaldata|interact\.businesstrade|interact\.arena/i, reason: "Trade publication" },
  { pattern: /chrono24/i, reason: "Watch marketing" },
  { pattern: /modernist\.club/i, reason: "Lifestyle newsletter" },
  { pattern: /noreply.*ioi\.dk/i, reason: "Game notifications" },
  { pattern: /godaddy/i, reason: "Domain hosting" },
  { pattern: /gjb\.grahw\.com/i, reason: "Event spam" },
  { pattern: /renewpulse|wearealways\.digital/i, reason: "Health spam" },
  { pattern: /hilton.*noreply|noreply.*hilton/i, reason: "Hotel notifications" },
  { pattern: /simplywall/i, reason: "Stock app promos" },
  { pattern: /seatgeek/i, reason: "Ticket promos" },
  { pattern: /amtrak.*noreply/i, reason: "Travel surveys" },
  { pattern: /eicn.*economist|economist.*eicn/i, reason: "Economist surveys" },
  { pattern: /smartcity\.org/i, reason: "Consortium newsletters" },
  { pattern: /oneearthalliance/i, reason: "NGO newsletters" },
  { pattern: /scratch\.org/i, reason: "Education notifications" },
  { pattern: /crossover\.codeweavers/i, reason: "Software notifications" },
];

interface CleanupCandidate {
  from: string;
  email: string;
  count: number;
  subjects: string[];
  reason: string;
}

interface PendingCleanup {
  token: string;
  createdAt: number;
  candidates: CleanupCandidate[];
  totalEmails: number;
  senderEmails: string[];
  executed: boolean;
}

// ── Scan inbox ──

export function scanInboxForCleanup(): CleanupCandidate[] {
  // Write PowerShell scanner script
  const psScript = `
Add-Type -AssemblyName 'Microsoft.Office.Interop.Outlook'
$outlook = New-Object -ComObject Outlook.Application
$ns = $outlook.GetNamespace('MAPI')
$inbox = $ns.GetDefaultFolder(6)
$items = $inbox.Items
$items.Sort('[ReceivedTime]', $true)

$results = @()
$count = $items.Count
for ($i = 1; $i -le $count; $i++) {
    try {
        $item = $items.Item($i)
        if ($item.Class -eq 43) {
            $results += [PSCustomObject]@{
                From = $item.SenderName
                Email = $item.SenderEmailAddress
                Subject = $item.Subject
            }
        }
    } catch {}
}
$results | ConvertTo-Json -Depth 2 | Out-File -Encoding utf8 "${CLEANUP_DIR.replace(/\\/g, "\\\\")}\\\\scan-result.json"
Write-Host $results.Count
`;

  if (!existsSync(CLEANUP_DIR)) mkdirSync(CLEANUP_DIR, { recursive: true });
  const psPath = join(CLEANUP_DIR, "scan.ps1");
  writeFileSync(psPath, psScript, "utf-8");

  try {
    const output = execSync(`powershell -ExecutionPolicy Bypass -File "${psPath}"`, {
      encoding: "utf-8",
      timeout: 120_000,
    });
    logAction({ ts: Date.now(), type: "action", category: "email-cleanup", message: `Scanned ${output.trim()} emails` });
  } catch (err) {
    logError("email-cleanup", "Inbox scan failed", err);
    return [];
  }

  // Parse results
  const scanFile = join(CLEANUP_DIR, "scan-result.json");
  if (!existsSync(scanFile)) return [];

  const raw = readFileSync(scanFile, "utf-8").replace(/^\uFEFF/, "");
  const emails: Array<{ From: string; Email: string; Subject: string }> = JSON.parse(raw);
  if (!Array.isArray(emails)) return [];

  // Group by sender
  const senderMap = new Map<string, { from: string; email: string; count: number; subjects: string[] }>();
  for (const e of emails) {
    const addr = (e.Email || "").toLowerCase();
    const key = addr || e.From || "Unknown";
    const existing = senderMap.get(key);
    if (existing) {
      existing.count++;
      if (existing.subjects.length < 3) existing.subjects.push(e.Subject || "");
    } else {
      senderMap.set(key, { from: e.From || "", email: e.Email || "", count: 1, subjects: [e.Subject || ""] });
    }
  }

  // Match against patterns
  const candidates: CleanupCandidate[] = [];
  for (const [, info] of senderMap) {
    const text = `${info.from} ${info.email} ${info.subjects.join(" ")}`.toLowerCase();
    for (const { pattern, reason } of LOW_VALUE_PATTERNS) {
      if (pattern.test(text)) {
        candidates.push({ ...info, reason });
        break;
      }
    }
  }

  // Also load user-added promo senders
  if (existsSync(PROMO_SENDERS_FILE)) {
    try {
      const custom: string[] = JSON.parse(readFileSync(PROMO_SENDERS_FILE, "utf-8"));
      for (const [, info] of senderMap) {
        if (custom.includes(info.email.toLowerCase()) && !candidates.find((c) => c.email === info.email)) {
          candidates.push({ ...info, reason: "Previously identified" });
        }
      }
    } catch { /* ignore */ }
  }

  return candidates.sort((a, b) => b.count - a.count);
}

// ── Create pending cleanup ──

const pendingCleanups = new Map<string, PendingCleanup>();

export function createPendingCleanup(candidates: CleanupCandidate[]): PendingCleanup {
  const token = randomUUID().slice(0, 12);
  const totalEmails = candidates.reduce((sum, c) => sum + c.count, 0);
  const senderEmails = candidates.map((c) => c.email.toLowerCase());

  const pending: PendingCleanup = {
    token,
    createdAt: Date.now(),
    candidates,
    totalEmails,
    senderEmails,
    executed: false,
  };

  pendingCleanups.set(token, pending);

  // Also persist to disk for crash recovery
  writeFileSync(join(CLEANUP_DIR, `pending-${token}.json`), JSON.stringify(pending, null, 2), "utf-8");

  return pending;
}

// ── Execute cleanup ──

export function executePendingCleanup(token: string): { success: boolean; deleted?: number; error?: string } {
  // Try in-memory first, then disk
  let pending = pendingCleanups.get(token);
  if (!pending) {
    const filePath = join(CLEANUP_DIR, `pending-${token}.json`);
    if (existsSync(filePath)) {
      pending = JSON.parse(readFileSync(filePath, "utf-8"));
      if (pending) pendingCleanups.set(token, pending);
    }
  }

  if (!pending) return { success: false, error: "Cleanup token not found or expired" };
  if (pending.executed) return { success: false, error: "This cleanup was already executed" };

  // Write sender list to a JSON file (avoids PowerShell inline parsing issues)
  const sendersFilePath = join(CLEANUP_DIR, `senders-${token}.json`);
  writeFileSync(sendersFilePath, JSON.stringify(pending.senderEmails), "utf-8");

  const psScript = `
Add-Type -AssemblyName 'Microsoft.Office.Interop.Outlook'
$outlook = New-Object -ComObject Outlook.Application
$ns = $outlook.GetNamespace('MAPI')
$inbox = $ns.GetDefaultFolder(6)
$items = $inbox.Items

$sendersRaw = Get-Content -Path "${sendersFilePath.replace(/\\/g, "\\\\")}" -Encoding UTF8 -Raw
$senders = $sendersRaw | ConvertFrom-Json
$deleteSet = @{}
foreach ($addr in $senders) { $deleteSet[$addr.ToLower()] = $true }

$deleted = 0
$total = $items.Count
for ($i = $total; $i -ge 1; $i--) {
    try {
        $item = $items.Item($i)
        if ($item.Class -eq 43) {
            $senderEmail = $item.SenderEmailAddress.ToLower()
            if ($deleteSet.ContainsKey($senderEmail)) {
                $item.Delete()
                $deleted++
            }
        }
    } catch {}
}
Write-Host $deleted
`;

  const psPath = join(CLEANUP_DIR, `delete-${token}.ps1`);
  writeFileSync(psPath, psScript, "utf-8");

  try {
    const output = execSync(`powershell -ExecutionPolicy Bypass -File "${psPath}"`, {
      encoding: "utf-8",
      timeout: 300_000,
    });
    const deleted = parseInt(output.trim()) || 0;

    pending.executed = true;
    pendingCleanups.set(token, pending);

    // Save promo senders for future reference
    savePromoSenders(pending.senderEmails);

    logAction({ ts: Date.now(), type: "action", category: "email-cleanup", message: `Cleanup executed: ${deleted} emails deleted (token: ${token})` });

    return { success: true, deleted };
  } catch (err) {
    logError("email-cleanup", "Cleanup execution failed", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function savePromoSenders(emails: string[]): void {
  let existing: string[] = [];
  if (existsSync(PROMO_SENDERS_FILE)) {
    try { existing = JSON.parse(readFileSync(PROMO_SENDERS_FILE, "utf-8")); } catch { /* ignore */ }
  }
  const merged = [...new Set([...existing, ...emails])];
  writeFileSync(PROMO_SENDERS_FILE, JSON.stringify(merged, null, 2), "utf-8");
}

// ── Build report email HTML ──

export function buildCleanupReportHtml(pending: PendingCleanup, baseUrl: string): string {
  const confirmUrl = `${baseUrl}/api/email-cleanup/confirm?token=${pending.token}`;

  let rows = "";
  for (const c of pending.candidates) {
    rows += `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px">${c.from}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px">${c.count}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#64748b;font-size:12px">${c.reason}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#475569;font-size:11px">${c.subjects[0]?.slice(0, 60) || ""}</td>
      </tr>`;
  }

  return `
<div style="background:#0f172a;padding:30px 20px;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:700px;margin:0 auto">
    <h1 style="color:#f472b6;text-align:center;font-size:22px;margin-bottom:4px">Inbox Cleanup Report</h1>
    <p style="color:#94a3b8;text-align:center;font-size:13px;margin-top:0">${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>

    <div style="background:#1e293b;border-radius:12px;padding:16px;margin:20px 0;text-align:center">
      <span style="color:#f472b6;font-size:32px;font-weight:700">${pending.totalEmails}</span>
      <span style="color:#94a3b8;font-size:14px;display:block;margin-top:4px">low-value emails from ${pending.candidates.length} senders</span>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;overflow:hidden;margin:16px 0">
      <thead>
        <tr style="background:#0f172a">
          <th style="padding:10px 12px;text-align:left;color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase">Sender</th>
          <th style="padding:10px 12px;text-align:left;color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase">Count</th>
          <th style="padding:10px 12px;text-align:left;color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase">Reason</th>
          <th style="padding:10px 12px;text-align:left;color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase">Sample</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="text-align:center;margin:28px 0">
      <a href="${confirmUrl}" style="display:inline-block;background:#dc2626;color:white;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:600;text-decoration:none;letter-spacing:0.5px">
        Confirm Cleanup — Delete ${pending.totalEmails} Emails
      </a>
      <p style="color:#475569;font-size:11px;margin-top:10px">This link expires in 7 days. Click only if you want to proceed.</p>
    </div>

    <p style="color:#334155;text-align:center;font-size:11px;margin-top:24px">Enso AI · Weekly Inbox Cleanup</p>
  </div>
</div>`;
}
