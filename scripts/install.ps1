# ─── Enso Server Installer (Windows PowerShell) ──────────────────────
# Run from the Enso repo root:  .\scripts\install.ps1
# ─────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Split-Path -Parent $ScriptDir
$OpenClawDir = Join-Path $env:USERPROFILE ".openclaw"
$OpenClawJson = Join-Path $OpenClawDir "openclaw.json"
$SetupJson = Join-Path $OpenClawDir "enso-setup.json"
$PluginDir = Join-Path $RepoDir "openclaw-plugin"
$Port = 3001

Write-Host ""
Write-Host "  +=======================================+" -ForegroundColor Cyan
Write-Host "  |        Enso Server Setup              |" -ForegroundColor Cyan
Write-Host "  |   Every answer is an app.             |" -ForegroundColor Cyan
Write-Host "  +=======================================+" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Node.js ─────────────────────────────────────────────────
Write-Host "# Checking Node.js..." -ForegroundColor Yellow
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "  X Node.js not found. Installing via winget..." -ForegroundColor Red
    try {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    } catch {
        Write-Host "  X Failed to install Node.js. Install manually from https://nodejs.org/" -ForegroundColor Red
        exit 1
    }
}

$nodeVersion = (node -e "console.log(process.version.split('.')[0].slice(1))") | Out-String
$nodeMajor = [int]$nodeVersion.Trim()
if ($nodeMajor -lt 22) {
    Write-Host "  X Node.js $nodeMajor found, but 22+ is required." -ForegroundColor Red
    Write-Host "  Install from https://nodejs.org/ or: winget install OpenJS.NodeJS.LTS"
    exit 1
}
Write-Host "  OK Node.js $(node --version)" -ForegroundColor Green

# ── 2. Check OpenClaw ────────────────────────────────────────────────
Write-Host "# Checking OpenClaw..." -ForegroundColor Yellow
$ocCmd = Get-Command openclaw -ErrorAction SilentlyContinue
if (-not $ocCmd) {
    Write-Host "  Installing OpenClaw..." -ForegroundColor Cyan
    npm install -g openclaw
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

$ocCmd = Get-Command openclaw -ErrorAction SilentlyContinue
if ($ocCmd) {
    Write-Host "  OK OpenClaw installed" -ForegroundColor Green
} else {
    Write-Host "  X Failed to install OpenClaw. Run manually: npm install -g openclaw" -ForegroundColor Red
    exit 1
}

# ── 3. npm install ───────────────────────────────────────────────────
Write-Host "# Installing dependencies..." -ForegroundColor Yellow
Push-Location $RepoDir
npm install --no-audit --no-fund 2>&1 | Select-Object -Last 1
Write-Host "  OK Dependencies installed" -ForegroundColor Green

# ── 4. OpenClaw Onboarding ─────────────────────────────────────────
Write-Host ""

# Escape backslashes for JSON/Node (needed early for onboarding check)
$OpenClawJsonEscaped = $OpenClawJson -replace '\\', '\\\\'

$Onboarded = node -e @"
const fs = require('fs');
try {
  const cfg = JSON.parse(fs.readFileSync('$OpenClawJsonEscaped', 'utf-8'));
  console.log(cfg.wizard && cfg.wizard.lastRunAt ? 'yes' : 'no');
} catch { console.log('no'); }
"@

if ($Onboarded.Trim() -ne "yes") {
    Write-Host "# Running OpenClaw first-time setup..." -ForegroundColor Yellow
    Write-Host "  This will guide you through picking an AI model, entering your API key,"
    Write-Host "  and configuring the gateway."
    Write-Host ""
    openclaw onboard
    Write-Host ""
    Write-Host "  OK OpenClaw onboarding complete" -ForegroundColor Green
} else {
    Write-Host "# OpenClaw already configured - skipping onboarding" -ForegroundColor Yellow
}

# ── 5. Generate openclaw.json ────────────────────────────────────────
Write-Host ""
Write-Host "# Configuring OpenClaw..." -ForegroundColor Yellow
if (-not (Test-Path $OpenClawDir)) {
    New-Item -ItemType Directory -Path $OpenClawDir -Force | Out-Null
}

$AccessToken = [guid]::NewGuid().ToString()
$MachineName = $env:COMPUTERNAME

# Escape backslashes for JSON/Node (OpenClawJsonEscaped already set in step 4)
$PluginDirEscaped = $PluginDir -replace '\\', '\\\\'
$SetupJsonEscaped = $SetupJson -replace '\\', '\\\\'
$RepoDirEscaped = $RepoDir -replace '\\', '\\\\'

node -e @"
const fs = require('fs');
const path = '$OpenClawJsonEscaped';
const pluginDir = '$PluginDirEscaped';
const token = '$AccessToken';

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path, 'utf-8')); } catch {}

if (!cfg.plugins) cfg.plugins = {};
if (!cfg.plugins.load) cfg.plugins.load = {};
if (!Array.isArray(cfg.plugins.load.paths)) cfg.plugins.load.paths = [];
if (!cfg.plugins.load.paths.includes(pluginDir)) cfg.plugins.load.paths.push(pluginDir);
if (!cfg.plugins.entries) cfg.plugins.entries = {};
cfg.plugins.entries.enso = { enabled: true };

if (!cfg.channels) cfg.channels = {};
if (!cfg.channels.enso) cfg.channels.enso = {};
cfg.channels.enso.port = cfg.channels.enso.port || $Port;
cfg.channels.enso.dmPolicy = cfg.channels.enso.dmPolicy || 'open';
if (!cfg.channels.enso.accessToken) cfg.channels.enso.accessToken = token;

fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
console.log('  OK Config written to ' + path);
"@

# Read back actual token
$AccessToken = node -e @"
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$OpenClawJsonEscaped', 'utf-8'));
console.log(cfg.channels.enso.accessToken);
"@

# ── 6. Build frontend ───────────────────────────────────────────────
Write-Host ""
Write-Host "# Building frontend..." -ForegroundColor Yellow
npm run build 2>&1 | Select-Object -Last 1
Write-Host "  OK Frontend built" -ForegroundColor Green

# ── 7. Start gateway ────────────────────────────────────────────────
Write-Host ""
Write-Host "# Starting OpenClaw gateway..." -ForegroundColor Yellow
try { openclaw gateway start 2>$null } catch {}

Write-Host -NoNewline "  Waiting for server"
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 2 -ErrorAction Stop
        if ($response.status -eq "ok") {
            $ready = $true
            break
        }
    } catch {}
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
}
Write-Host ""
if ($ready) {
    Write-Host "  OK Server is running on port $Port" -ForegroundColor Green
} else {
    Write-Host "  ! Server did not respond within 30s. Check: openclaw logs" -ForegroundColor DarkYellow
}

# ── 8. Display QR code ──────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Detect LAN IPs
$LanIps = node -e @"
const os = require('os');
const ips = [];
for (const ifaces of Object.values(os.networkInterfaces())) {
  for (const i of ifaces || []) {
    if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  }
}
console.log(ips.join(','));
"@

$IpArray = $LanIps.Split(',') | Where-Object { $_ }
$PrimaryIp = if ($IpArray.Count -gt 0) { $IpArray[0] } else { "localhost" }

$EncodedToken = [System.Uri]::EscapeDataString($AccessToken)
$EncodedName = [System.Uri]::EscapeDataString($MachineName)
$DeepLink = "enso://connect?backend=http://${PrimaryIp}:${Port}&token=${EncodedToken}&name=${EncodedName}"

# Save setup info
node -e @"
const fs = require('fs');
fs.writeFileSync('$SetupJsonEscaped', JSON.stringify({
  installPath: '$RepoDirEscaped',
  accessToken: '$AccessToken',
  machineName: '$MachineName',
  port: $Port,
  lanAddresses: '$LanIps'.split(',').filter(Boolean),
  installedAt: new Date().toISOString()
}, null, 2));
"@

Write-Host ""
Write-Host "  Scan this QR code with your phone camera" -ForegroundColor White
Write-Host "  to connect the Enso app:" -ForegroundColor White
Write-Host ""

$qrScript = Join-Path $ScriptDir "qr-terminal.js"
try {
    node $qrScript $DeepLink
} catch {
    Write-Host "  Deep link: $DeepLink"
}

Write-Host ""
Write-Host "  Or enter manually in the app:" -ForegroundColor White
Write-Host "    URL:   http://${PrimaryIp}:${Port}" -ForegroundColor Gray
Write-Host "    Token: ${AccessToken}" -ForegroundColor Gray
Write-Host ""
Write-Host "  To show this QR code again later:" -ForegroundColor DarkGray
Write-Host "    node $RepoDir\scripts\show-qr.js" -ForegroundColor DarkGray
Write-Host ""

Pop-Location
