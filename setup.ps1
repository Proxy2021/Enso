# ═══════════════════════════════════════════════════════════════════════
#  Enso Setup (Windows PowerShell)
#  One command to set up a complete self-evolving AI sandbox.
#
#  Usage:  .\setup.ps1
#  Or with pre-set values (non-interactive / testing):
#    $env:ENSO_INSTALL_PATH="$HOME\Enso"; $env:ENSO_LLM_CHOICE="1"; .\setup.ps1
# ═══════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnsoDir = Join-Path $env:USERPROFILE ".enso"
$Port = 3001

# ── Helpers ────────────────────────────────────────────────────────────

function Show-Banner {
    Write-Host ""
    Write-Host "  +=======================================+" -ForegroundColor Cyan
    Write-Host "  |          Enso Setup                   |" -ForegroundColor Cyan
    Write-Host "  |   AI sandbox that builds itself.      |" -ForegroundColor Cyan
    Write-Host "  +=======================================+" -ForegroundColor Cyan
    Write-Host ""
}

function Show-Step($msg) {
    Write-Host ""
    Write-Host "-- $msg ------------------------------------------" -ForegroundColor Yellow
    Write-Host ""
}

function Show-Ok($msg)   { Write-Host "  OK $msg" -ForegroundColor Green }
function Show-Warn($msg) { Write-Host "  !! $msg" -ForegroundColor DarkYellow }
function Show-Info($msg) { Write-Host "  .. $msg" -ForegroundColor Gray }

function Prompt-WithDefault($prompt, $default, $envOverride) {
    if ($envOverride) { return $envOverride }
    $value = Read-Host "  $prompt [$default]"
    if ([string]::IsNullOrWhiteSpace($value)) { return $default }
    return $value
}

function Prompt-Secret($prompt, $envOverride) {
    if ($envOverride) { return $envOverride }
    $value = Read-Host "  $prompt"
    return $value
}

function Prompt-YN($prompt, $default, $envOverride) {
    if ($envOverride) { return $envOverride }
    $value = Read-Host "  $prompt [$default]"
    if ([string]::IsNullOrWhiteSpace($value)) { return $default }
    return $value
}

# ── Banner ─────────────────────────────────────────────────────────────

Show-Banner

# ═══════════════════════════════════════════════════════════════════════
#  Step 1: Install Location
# ═══════════════════════════════════════════════════════════════════════

Show-Step "Step 1: Install Location"

Write-Host "  Where do you want to install Enso?"
Write-Host "  This is where the source code will live for self-evolution."
Write-Host ""

$DefaultPath = Join-Path $env:USERPROFILE "Enso"
$InstallPath = Prompt-WithDefault "Install path" $DefaultPath $env:ENSO_INSTALL_PATH

$SourceDir = $ScriptDir
$TargetDir = $InstallPath

$SourceReal = (Resolve-Path $SourceDir).Path
$TargetReal = if (Test-Path $TargetDir) { (Resolve-Path $TargetDir).Path } else { "" }

if ($SourceReal -ne $TargetReal) {
    Write-Host "  -> Copying source to $InstallPath..."
    if (-not (Test-Path $TargetDir)) { New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null }

    robocopy $SourceDir $TargetDir /E /XD node_modules .git dist "android\app\build" .claude /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null

    Set-Location $TargetDir

    if (-not (Test-Path ".git")) {
        Write-Host "  -> Initializing git repository..."
        git init -q
        git add -A
        git commit -q -m "Initial Enso setup"
    }
    Show-Ok "Source installed at $InstallPath"
} else {
    Set-Location $TargetDir
    Show-Ok "Already at install location: $InstallPath"
}

$RepoDir = (Get-Location).Path
$ServerDir = Join-Path $RepoDir "server"
$EnvFile = Join-Path $ServerDir ".env"

# ═══════════════════════════════════════════════════════════════════════
#  Step 2: Prerequisites
# ═══════════════════════════════════════════════════════════════════════

Show-Step "Step 2: Prerequisites"

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "  Node.js not found. Installing via winget..."
    try {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    } catch {
        Write-Host "  X Failed. Install from https://nodejs.org/" -ForegroundColor Red
        exit 1
    }
}

$nodeMajor = [int](node -e "console.log(process.version.split('.')[0].slice(1))" | Out-String).Trim()
if ($nodeMajor -lt 22) {
    Write-Host "  X Node.js $nodeMajor found, 22+ required." -ForegroundColor Red
    exit 1
}
Show-Ok "Node.js $(node --version)"

Write-Host "  -> Installing dependencies..."
Push-Location $RepoDir
npm install --no-audit --no-fund 2>&1 | Select-Object -Last 1
Show-Ok "Dependencies installed"

# ═══════════════════════════════════════════════════════════════════════
#  Step 3: Chat AI Model
# ═══════════════════════════════════════════════════════════════════════

Show-Step "Step 3: Chat AI Model"

Write-Host "  Choose your primary chat AI:"
Write-Host ""
Write-Host "  [1] Google Gemini     -- free tier, recommended"
Write-Host "  [2] OpenAI            -- GPT-4o, GPT-4o Mini"
Write-Host "  [3] Anthropic         -- Claude Sonnet, Haiku"
Write-Host "  [4] DeepSeek          -- affordable reasoning"
Write-Host "  [5] Ollama            -- local, free, no API key"
Write-Host "  [6] OpenRouter        -- hundreds of models, one key"
Write-Host ""

$LlmChoice = Prompt-WithDefault "Choice" "1" $env:ENSO_LLM_CHOICE

switch ($LlmChoice) {
    "1" { $LlmId="gemini";    $LlmName="Google Gemini";  $LlmEnv="GEMINI_API_KEY";    $LlmUrl="https://aistudio.google.com/apikey" }
    "2" { $LlmId="openai";    $LlmName="OpenAI";         $LlmEnv="OPENAI_API_KEY";    $LlmUrl="https://platform.openai.com/api-keys" }
    "3" { $LlmId="anthropic"; $LlmName="Anthropic";      $LlmEnv="ANTHROPIC_API_KEY"; $LlmUrl="https://console.anthropic.com/settings/keys" }
    "4" { $LlmId="deepseek";  $LlmName="DeepSeek";       $LlmEnv="DEEPSEEK_API_KEY";  $LlmUrl="https://platform.deepseek.com/api_keys" }
    "5" { $LlmId="ollama";    $LlmName="Ollama (Local)"; $LlmEnv="";                  $LlmUrl="https://ollama.com" }
    "6" { $LlmId="openrouter"; $LlmName="OpenRouter";    $LlmEnv="OPENROUTER_API_KEY"; $LlmUrl="https://openrouter.ai/keys" }
    default { $LlmId="gemini"; $LlmName="Google Gemini"; $LlmEnv="GEMINI_API_KEY";    $LlmUrl="https://aistudio.google.com/apikey" }
}

$LlmKey = ""
if ($LlmEnv) {
    Write-Host ""
    Write-Host "  Enter your $LlmName API key:"
    Write-Host "  (Get one at $LlmUrl)"
    $envKey = if ($env:ENSO_GEMINI_KEY) { $env:ENSO_GEMINI_KEY } else { $env:ENSO_LLM_KEY }
    $LlmKey = Prompt-Secret "  Key: " $envKey
    Write-Host ""
}

# Write providers.json
if (-not (Test-Path $EnsoDir)) { New-Item -ItemType Directory -Path $EnsoDir -Force | Out-Null }

if ($LlmKey) {
    $providersPath = Join-Path $EnsoDir "providers.json"
    $provEsc = $providersPath -replace '\\', '\\\\'
    node -e @"
const fs = require('fs');
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync('$provEsc', 'utf-8')); } catch {}
if (!cfg.apiKeys) cfg.apiKeys = {};
cfg.apiKeys['$LlmId'] = '$LlmKey';
fs.writeFileSync('$provEsc', JSON.stringify(cfg, null, 2) + '\n');
"@
}

# Write server/.env
$AccessToken = [guid]::NewGuid().ToString()
$MachineName = $env:COMPUTERNAME

if (Test-Path $EnvFile) {
    $envContent = Get-Content $EnvFile -Raw
    if ($envContent -match '(?m)^ENSO_ACCESS_TOKEN=(.+)$') {
        $AccessToken = $Matches[1].Trim()
    }
    if ($LlmEnv -and $LlmKey -and $envContent -notmatch "(?m)^${LlmEnv}=") {
        Add-Content -Path $EnvFile -Value "${LlmEnv}=${LlmKey}"
    }
} else {
    $lines = @()
    if ($LlmEnv -and $LlmKey) { $lines += "${LlmEnv}=${LlmKey}" }
    $lines += "ENSO_ACCESS_TOKEN=${AccessToken}"
    $lines += "ENSO_MACHINE_NAME=${MachineName}"
    Set-Content -Path $EnvFile -Value ($lines -join "`n") -Encoding UTF8
}

$envContent = Get-Content $EnvFile -Raw -ErrorAction SilentlyContinue
if ($envContent -match '(?m)^ENSO_ACCESS_TOKEN=(.+)$') {
    $AccessToken = $Matches[1].Trim()
} elseif ($envContent -notmatch "ENSO_ACCESS_TOKEN") {
    Add-Content -Path $EnvFile -Value "ENSO_ACCESS_TOKEN=${AccessToken}"
}

Show-Ok "Chat AI: $LlmName"

# ═══════════════════════════════════════════════════════════════════════
#  Step 4: Service API Keys
# ═══════════════════════════════════════════════════════════════════════

Show-Step "Step 4: Service API Keys (optional)"

Write-Host "  Brave Search enables web research in Enso."
Write-Host "  Get a free key at: https://brave.com/search/api/"
Write-Host ""

$BraveKey = Prompt-Secret "  Brave Search API key (Enter to skip): " $env:ENSO_BRAVE_KEY
Write-Host ""

if ($BraveKey) {
    $apiKeysPath = Join-Path $EnsoDir "api-keys.json"
    $akEsc = $apiKeysPath -replace '\\', '\\\\'
    node -e @"
const fs = require('fs');
let keys = {};
try { keys = JSON.parse(fs.readFileSync('$akEsc', 'utf-8')); } catch {}
keys.brave = '$BraveKey';
fs.writeFileSync('$akEsc', JSON.stringify(keys, null, 2) + '\n');
"@
    Show-Ok "Brave Search configured"
} else {
    Show-Info "Skipped -- can be added later in Enso Settings"
}

Show-Info "More service keys available in Enso Settings"

# ═══════════════════════════════════════════════════════════════════════
#  Step 5: Claude Code
# ═══════════════════════════════════════════════════════════════════════

Show-Step "Step 5: Claude Code (self-evolution engine)"

Write-Host "  Claude Code powers /code, Build App, orchestration,"
Write-Host "  and self-evolution sprints (/evolve)."
Write-Host ""

$ClaudeInstalled = $false
$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if ($claudeCmd) {
    $cv = claude --version 2>$null
    Show-Ok "Claude Code already installed: $cv"
    $ClaudeInstalled = $true
} else {
    $installClaude = Prompt-YN "Install Claude Code CLI? (Y/n)" "Y" $env:ENSO_INSTALL_CLAUDE
    if ($installClaude -match '^[Yy]$') {
        Write-Host "  -> Installing @anthropic-ai/claude-code..."
        npm install -g @anthropic-ai/claude-code 2>&1 | Select-Object -Last 3
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        $claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
        if ($claudeCmd) {
            Show-Ok "Claude Code installed"
            $ClaudeInstalled = $true
        } else {
            Show-Warn "Claude not found in PATH after install"
        }
    } else {
        Show-Info "Skipped -- install later: npm install -g @anthropic-ai/claude-code"
    }
}

if ($ClaudeInstalled) {
    try {
        $authJson = claude auth status 2>$null | Out-String
        $authObj = $authJson | ConvertFrom-Json
        $loggedIn = $authObj.loggedIn
    } catch { $loggedIn = $false }

    if ($loggedIn) {
        Show-Ok "Claude Code already authenticated"
    } else {
        Write-Host ""
        Write-Host "  How do you authenticate with Anthropic?"
        Write-Host ""
        Write-Host "  [1] API Key         -- pay-per-token"
        Write-Host "  [2] Subscription    -- Claude Pro/Team/Max (opens browser)"
        Write-Host "  [3] Skip            -- set up later"
        Write-Host ""

        $authChoice = Prompt-WithDefault "Choice" "2" $env:ENSO_CLAUDE_AUTH

        switch ($authChoice) {
            "1" {
                $anthroKey = Prompt-Secret "  Anthropic API key: " $env:ENSO_ANTHROPIC_KEY
                if ($anthroKey) {
                    $current = Get-Content $EnvFile -Raw -ErrorAction SilentlyContinue
                    if ($current -match "(?m)^ANTHROPIC_API_KEY=") {
                        $current = $current -replace "(?m)^ANTHROPIC_API_KEY=.*", "ANTHROPIC_API_KEY=$anthroKey"
                        Set-Content -Path $EnvFile -Value $current -Encoding UTF8
                    } else {
                        Add-Content -Path $EnvFile -Value "ANTHROPIC_API_KEY=$anthroKey"
                    }
                    $env:ANTHROPIC_API_KEY = $anthroKey
                    Show-Ok "API key saved"
                }
            }
            "2" {
                Write-Host "  -> Opening browser for OAuth login..."
                claude auth login 2>&1
                Show-Ok "Authentication flow completed"
            }
            default {
                Show-Info "Skipped -- authenticate later: claude auth login"
            }
        }
    }
}

# ═══════════════════════════════════════════════════════════════════════
#  Step 6: Remote Access
# ═══════════════════════════════════════════════════════════════════════

Show-Step "Step 6: Remote Access"

Write-Host "  Set up remote access via enso.net?"
Write-Host "  Your Enso will be available at: <name>.enso.net"
Write-Host ""

$SetupTunnel = Prompt-YN "Set up remote access? (Y/n)" "Y" $env:ENSO_TUNNEL
$TunnelUrl = ""
$Specifier = ""

if ($SetupTunnel -match '^[Yy]$') {
    $Suggested = ($env:COMPUTERNAME).ToLower() -replace '[^a-z0-9-]', '-' -replace '--+', '-' -replace '^-|-$', ''
    if (-not $Suggested) { $Suggested = "my-enso" }

    Write-Host "  Choose your machine name:"
    $Specifier = Prompt-WithDefault "Name" $Suggested $env:ENSO_TUNNEL_NAME

    $RegistryUrl = if ($env:ENSO_REGISTRY_URL) { $env:ENSO_REGISTRY_URL } else { "http://localhost:$Port" }

    Write-Host "  -> Registering ${Specifier}.enso.net..."

    try {
        $body = @{ specifier = $Specifier; accessToken = $AccessToken } | ConvertTo-Json
        $result = Invoke-RestMethod -Uri "$RegistryUrl/api/tunnel/register" -Method POST -ContentType "application/json" -Body $body -ErrorAction Stop

        if ($result.tunnelToken) {
            $TunnelUrl = $result.publicUrl

            $cfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
            if (-not $cfCmd) {
                Write-Host "  -> Installing cloudflared..."
                winget install cloudflare.cloudflared --accept-package-agreements --accept-source-agreements 2>$null
                $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            }

            $cfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
            if ($cfCmd) {
                Write-Host "  -> Configuring tunnel..."
                cloudflared service install $result.tunnelToken 2>$null
                Show-Ok "Remote: $TunnelUrl"
            } else {
                Show-Warn "cloudflared not installed -- install manually: winget install cloudflare.cloudflared"
            }

            $current = Get-Content $EnvFile -Raw -ErrorAction SilentlyContinue
            if ($current -notmatch "ENSO_TUNNEL_SPECIFIER") {
                Add-Content -Path $EnvFile -Value "ENSO_TUNNEL_SPECIFIER=$Specifier"
                Add-Content -Path $EnvFile -Value "ENSO_PUBLIC_URL=$TunnelUrl"
            }
        }
    } catch {
        Show-Warn "Tunnel registry not available -- skipped"
        Show-Info "Set up later via SETUP.md"
        if ((Get-Content $EnvFile -Raw -ErrorAction SilentlyContinue) -notmatch "ENSO_TUNNEL_SPECIFIER") {
            Add-Content -Path $EnvFile -Value "ENSO_TUNNEL_SPECIFIER=$Specifier"
        }
    }
} else {
    Show-Info "Skipped -- set up later via SETUP.md"
}

# ═══════════════════════════════════════════════════════════════════════
#  Step 7: Build
# ═══════════════════════════════════════════════════════════════════════

Show-Step "Step 7: Build"

Write-Host "  -> Building frontend..."
npm run build 2>&1 | Select-Object -Last 1
Show-Ok "Frontend built"

$ApkPath = Join-Path $RepoDir "android\app\build\outputs\apk\release\app-release.apk"
$ApkBuilt = $false

if (Test-Path (Join-Path $RepoDir "android")) {
    $javaCmd = Get-Command java -ErrorAction SilentlyContinue
    if ($javaCmd -or $env:JAVA_HOME) {
        Write-Host ""
        Write-Host "  -> Building mobile app (APK)..."
        npx cap sync android 2>&1 | Select-Object -Last 1
        Push-Location (Join-Path $RepoDir "android")
        try {
            .\gradlew.bat assembleRelease 2>&1 | Select-Object -Last 3
            if (Test-Path $ApkPath) {
                $ApkSize = [math]::Round((Get-Item $ApkPath).Length / 1MB, 1)
                Show-Ok "APK built: ${ApkSize} MB"
                $ApkBuilt = $true
            }
        } catch {
            Show-Warn "APK build failed -- build later: npm run android:build-apk"
        }
        Pop-Location
    } else {
        Write-Host ""
        Show-Warn "Android build tools not found. Skipping APK."
        Show-Info "Install JDK 17+ and Android SDK, then: npm run android:build-apk"
    }
}

# ═══════════════════════════════════════════════════════════════════════
#  Step 8: Start Server
# ═══════════════════════════════════════════════════════════════════════

Show-Step "Step 8: Start Server"

# CLI config
$CliJson = Join-Path $EnsoDir "cli.json"
$cliEsc = $CliJson -replace '\\', '\\\\'
node -e @"
const fs = require('fs');
const dir = '$($EnsoDir -replace '\\', '\\\\')';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync('$cliEsc', JSON.stringify({
  server: 'http://localhost:$Port',
  token: '$AccessToken'
}, null, 2));
"@

# Add bin to PATH
$BinDir = Join-Path $RepoDir "bin"
$CurrentPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -notlike "*$BinDir*") {
    [System.Environment]::SetEnvironmentVariable("Path", "$CurrentPath;$BinDir", "User")
    $env:Path = "$env:Path;$BinDir"
}

# Start guardian
Write-Host "  -> Starting server (guardian-supervised)..."
$guardianLog = Join-Path $env:TEMP "enso-guardian.log"
$guardianErrLog = Join-Path $env:TEMP "enso-guardian-err.log"

Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npx tsx server/guardian.ts > `"$guardianLog`" 2> `"$guardianErrLog`"" `
    -WorkingDirectory $RepoDir -WindowStyle Hidden

Write-Host -NoNewline "  Waiting for server"
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 2 -ErrorAction Stop
        if ($response.status -eq "ok") { $ready = $true; break }
    } catch {}
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
}
Write-Host ""
if ($ready) { Show-Ok "Server running on port $Port" }
else { Show-Warn "Server did not respond in 30s" }

# Watchdog
$watchdog = Join-Path $RepoDir "install-watchdog.ps1"
if (Test-Path $watchdog) {
    try { & $watchdog; Show-Ok "Watchdog installed" } catch {}
}

# Setup info
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

$setupJsonEsc = (Join-Path $EnsoDir "enso-setup.json") -replace '\\', '\\\\'
$repoDirEsc = $RepoDir -replace '\\', '\\\\'
node -e @"
const fs = require('fs');
fs.writeFileSync('$setupJsonEsc', JSON.stringify({
  installPath: '$repoDirEsc',
  accessToken: '$AccessToken',
  machineName: '$MachineName',
  port: $Port,
  llmProvider: '$LlmId',
  tunnelSpecifier: '$Specifier',
  tunnelUrl: '$TunnelUrl',
  apkBuilt: $($ApkBuilt.ToString().ToLower()),
  lanAddresses: '$LanIps'.split(',').filter(Boolean),
  installedAt: new Date().toISOString()
}, null, 2));
"@

# ═══════════════════════════════════════════════════════════════════════
#  Summary
# ═══════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Enso is ready!" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Installed at:  $RepoDir"
Write-Host "  Chat AI:       $LlmName"

if ($ClaudeInstalled) { Write-Host "  Claude Code:   Installed" -ForegroundColor Green }
else { Write-Host "  Claude Code:   Not installed" -ForegroundColor DarkYellow }

if ($TunnelUrl) { Write-Host "  Remote:        $TunnelUrl" }
Write-Host "  Local:         http://localhost:$Port"

if ($ApkBuilt) {
    Write-Host ""
    Write-Host "  Install on phone:" -ForegroundColor White
    $apkUrl = if ($TunnelUrl) { "$TunnelUrl/api/apk" } else { "http://${PrimaryIp}:${Port}/api/apk" }
    Write-Host "     Download: $apkUrl" -ForegroundColor Gray
    $qrScript = Join-Path $RepoDir "scripts\qr-terminal.js"
    if (Test-Path $qrScript) { try { node $qrScript $apkUrl } catch {} }
}

Write-Host ""
Write-Host "  Get started:" -ForegroundColor White
Write-Host "    - Open http://localhost:$Port" -ForegroundColor Gray
Write-Host "    - Type /code hello  -- test Claude Code" -ForegroundColor Gray
Write-Host "    - Type /evolve      -- self-evolution sprint" -ForegroundColor Gray
Write-Host "    - CLI: enso chat `"Hello!`"" -ForegroundColor Gray
Write-Host ""

Pop-Location
