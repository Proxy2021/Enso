# ─── Enso Server Installer (Windows PowerShell) ──────────────────────
# Run from the Enso repo root:  .\scripts\install.ps1
# ─────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Split-Path -Parent $ScriptDir
$EnsoDir = Join-Path $env:USERPROFILE ".enso"
$SetupJson = Join-Path $EnsoDir "enso-setup.json"
$ServerDir = Join-Path $RepoDir "server"
$EnvFile = Join-Path $ServerDir ".env"
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

# ── 2. npm install ───────────────────────────────────────────────────
Write-Host "# Installing dependencies..." -ForegroundColor Yellow
Push-Location $RepoDir
npm install --no-audit --no-fund 2>&1 | Select-Object -Last 1
Write-Host "  OK Dependencies installed" -ForegroundColor Green

# ── 3. Configure .env ────────────────────────────────────────────────
Write-Host ""
Write-Host "# Configuring server..." -ForegroundColor Yellow

if (-not (Test-Path $EnsoDir)) {
    New-Item -ItemType Directory -Path $EnsoDir -Force | Out-Null
}

$AccessToken = [guid]::NewGuid().ToString()
$MachineName = $env:COMPUTERNAME

if (Test-Path $EnvFile) {
    Write-Host "  OK server\.env already exists - preserving" -ForegroundColor Green
    # Read existing token if available
    $envContent = Get-Content $EnvFile -Raw
    if ($envContent -match '(?m)^ENSO_ACCESS_TOKEN=(.+)$') {
        $AccessToken = $Matches[1].Trim()
    }
} else {
    Write-Host ""
    Write-Host "  Enso uses the Gemini API for chat and UI generation." -ForegroundColor White
    Write-Host "  Get a free API key at: https://aistudio.google.com/apikey" -ForegroundColor Cyan
    Write-Host ""
    $GeminiKey = Read-Host "  Enter your Gemini API key (or press Enter to skip)"
    Write-Host ""

    $envContent = @"
GEMINI_API_KEY=$GeminiKey
ENSO_ACCESS_TOKEN=$AccessToken
ENSO_MACHINE_NAME=$MachineName
"@
    Set-Content -Path $EnvFile -Value $envContent -Encoding UTF8
    Write-Host "  OK Config written to server\.env" -ForegroundColor Green

    if ([string]::IsNullOrWhiteSpace($GeminiKey)) {
        Write-Host "  ! No Gemini API key set. Chat will not work until you add it to server\.env" -ForegroundColor DarkYellow
    }
}

# Read back actual token from .env
$envContent = Get-Content $EnvFile -Raw -ErrorAction SilentlyContinue
if ($envContent -match '(?m)^ENSO_ACCESS_TOKEN=(.+)$') {
    $AccessToken = $Matches[1].Trim()
} else {
    # Token not in .env, append it
    Add-Content -Path $EnvFile -Value "`nENSO_ACCESS_TOKEN=$AccessToken"
}

# ── 4. Install CLI ──────────────────────────────────────────────────
Write-Host ""
Write-Host "# Installing CLI..." -ForegroundColor Yellow

$BinDir = Join-Path $RepoDir "bin"
$CliJson = Join-Path $EnsoDir "cli.json"

# Write cli.json so the CLI knows where the server is and the token
node -e @"
const fs = require('fs');
const dir = '$($EnsoDir -replace '\\', '\\\\')';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync('$($CliJson -replace '\\', '\\\\')', JSON.stringify({
  server: 'http://localhost:$Port',
  token: '$AccessToken'
}, null, 2));
"@
Write-Host "  OK CLI config written to ~\.enso\cli.json" -ForegroundColor Green

# Add bin/ to user PATH if not already there
$CurrentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -notlike "*$BinDir*") {
    [System.Environment]::SetEnvironmentVariable("Path", "$CurrentPath;$BinDir", "User")
    $env:Path = "$env:Path;$BinDir"
    Write-Host "  OK Added bin\ to PATH — 'enso' command available globally" -ForegroundColor Green
} else {
    Write-Host "  OK bin\ already in PATH" -ForegroundColor Green
}

# ── 5. Build frontend ───────────────────────────────────────────────
Write-Host ""
Write-Host "# Building frontend..." -ForegroundColor Yellow
npm run build 2>&1 | Select-Object -Last 1
Write-Host "  OK Frontend built" -ForegroundColor Green

# ── 6. Start server ─────────────────────────────────────────────────
Write-Host ""
Write-Host "# Starting Enso server..." -ForegroundColor Yellow
$serverJob = Start-Job -ScriptBlock {
    param($repoDir)
    Set-Location $repoDir
    npx tsx server/standalone.ts 2>&1
} -ArgumentList $RepoDir

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
    Write-Host "  ! Server did not respond within 30s. Check terminal output." -ForegroundColor DarkYellow
}

# ── 7. Display QR code ──────────────────────────────────────────────
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
$EnsoJsonEscaped = $SetupJson -replace '\\', '\\\\'
$RepoDirEscaped = $RepoDir -replace '\\', '\\\\'

node -e @"
const fs = require('fs');
const dir = '$($EnsoDir -replace '\\', '\\\\')';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync('$EnsoJsonEscaped', JSON.stringify({
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
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    - Try the CLI: enso chat `"Hello, world!`"" -ForegroundColor Gray
Write-Host "    - For development: npm run dev (starts Vite on :5173)" -ForegroundColor Gray
Write-Host "    - For remote access: see SETUP.md (Cloudflare Tunnel)" -ForegroundColor Gray
Write-Host "    - For Claude Code: npm install -g @anthropic-ai/claude-code" -ForegroundColor Gray
Write-Host ""

Pop-Location
