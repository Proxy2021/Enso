<#
.SYNOPSIS
    Restart all Enso services on Windows.

.DESCRIPTION
    1. Kills existing Enso server + Vite dev processes
    2. Starts Enso standalone server on :3001
    3. Starts the Enso Vite dev server on :5173
    4. Restarts the Cloudflare tunnel

.NOTES
    Run from any PowerShell terminal:
        .\restart.ps1
    Or from Git Bash / CMD:
        powershell -ExecutionPolicy Bypass -File restart.ps1
#>

param(
    [switch]$NoDev,           # Don't start Vite dev server
    [int]$EnsoPort    = 3001,
    [int]$VitePort    = 5173
)

$ErrorActionPreference = "Stop"

# -- Paths -----------------------------------------------------------------
$WatchdogTask = "Enso Watchdog"
$EnsoDir      = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeExe      = "C:\Program Files\nodejs\node.exe"

# -- Colors ----------------------------------------------------------------
function Write-Step  ($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok    ($msg) { Write-Host "   [OK] $msg" -ForegroundColor Green }
function Write-Skip  ($msg) { Write-Host "   [SKIP] $msg" -ForegroundColor Yellow }
function Write-Err   ($msg) { Write-Host "   [ERR] $msg" -ForegroundColor Red }

# ==========================================================================
#  STEP 0 -- Stop watchdog (prevent interference during restart)
# ==========================================================================
Write-Step "Stopping watchdog..."
$wdTask = Get-ScheduledTask -TaskName $WatchdogTask -ErrorAction SilentlyContinue
if ($wdTask -and $wdTask.State -eq "Running") {
    Stop-ScheduledTask -TaskName $WatchdogTask -ErrorAction SilentlyContinue
    Write-Ok "Watchdog stopped"
} else {
    Write-Skip "Watchdog not running"
}

# ==========================================================================
#  STEP 1 -- Kill existing processes
# ==========================================================================
Write-Step "Killing existing services..."

$killed = 0
$nodeProcs = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Select-Object ProcessId, CommandLine

foreach ($proc in $nodeProcs) {
    $cmd = $proc.CommandLine
    if (-not $cmd) { continue }

    $isOurs = ($cmd -match "standalone\.ts") -or
              ($cmd -match "Enso") -or
              ($cmd -match "concurrently") -or
              ($cmd -match "tsx\b.*watch") -or
              ($cmd -match "vite")

    if ($isOurs) {
        try {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
            Write-Ok "Killed PID $($proc.ProcessId)"
            $killed++
        } catch {
            Write-Err "Failed to kill PID $($proc.ProcessId): $_"
        }
    }
}

if ($killed -eq 0) {
    Write-Skip "No existing services found"
} else {
    Write-Ok "Killed $killed process(es)"
}

# Wait for ports to be released
Start-Sleep -Seconds 2

# Verify ports are free
$portsInUse = netstat -ano | Select-String "(:$EnsoPort|:$VitePort).*LISTENING"
if ($portsInUse) {
    Write-Err "Ports still in use after kill:`n$portsInUse"
    Write-Host "   Waiting 3 more seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}

# ==========================================================================
#  STEP 2 -- Pull latest code
# ==========================================================================
Write-Step "Pulling latest code..."

if (Test-Path (Join-Path $EnsoDir ".git")) {
    Push-Location $EnsoDir
    try {
        $pullOutput = git pull --ff-only 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Enso -- $($pullOutput | Select-Object -Last 1)"
        } else {
            Write-Err "Enso git pull failed: $pullOutput"
        }
    } catch {
        Write-Err "Enso git pull failed: $_"
    } finally {
        Pop-Location
    }
} else {
    Write-Skip "Not a git repo at $EnsoDir"
}

# ==========================================================================
#  STEP 3 -- Start Enso standalone server on :3001
# ==========================================================================
Write-Step "Starting Enso server on :$EnsoPort ..."

# Redirect stdin to an empty file so child node.exe processes don't inherit
# the console's stdin handle (which would consume keystrokes from this terminal).
$nullInput = Join-Path $env:TEMP "enso-null-input.txt"
if (-not (Test-Path $nullInput)) { [System.IO.File]::WriteAllText($nullInput, "") }

$serverLog    = Join-Path $env:TEMP "enso-server.log"
$serverErrLog = Join-Path $env:TEMP "enso-server-err.log"

# Find npx to launch tsx
$npxCmd = Get-Command npx -ErrorAction SilentlyContinue
$tsxArgs = if ($npxCmd) {
    # Use npx tsx
    $npxPath = $npxCmd.Source
    @($npxPath, "tsx", "server/standalone.ts")
} else {
    # Fallback: direct tsx
    $tsxCmd = Get-Command tsx -ErrorAction SilentlyContinue
    if ($tsxCmd) {
        @($tsxCmd.Source, "server/standalone.ts")
    } else {
        @("C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js", "tsx", "server/standalone.ts")
    }
}

$serverProc = Start-Process -FilePath $nodeExe `
    -ArgumentList $tsxArgs `
    -WorkingDirectory $EnsoDir `
    -WindowStyle Hidden `
    -RedirectStandardInput $nullInput `
    -RedirectStandardOutput $serverLog `
    -RedirectStandardError $serverErrLog `
    -PassThru

# Wait for server to be ready
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    $ensoUp = netstat -ano | Select-String ":$EnsoPort.*LISTENING"
    if ($ensoUp) {
        $ready = $true
        break
    }
}

if ($ready) {
    Write-Ok "Enso server running (PID $($serverProc.Id)) -- :$EnsoPort"
} else {
    Write-Err "Server did not start within 20s. Check $serverLog"
    Write-Host "   Last 5 lines of log:" -ForegroundColor Yellow
    if (Test-Path $serverLog) {
        Get-Content $serverLog -Tail 5 | ForEach-Object { Write-Host "   $_" }
    }
    if (Test-Path $serverErrLog) {
        Get-Content $serverErrLog -Tail 5 | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    }
}

# ==========================================================================
#  STEP 4 -- Start Vite dev server
# ==========================================================================
if ($NoDev) {
    Write-Skip "Vite dev server skipped (-NoDev)"
} else {
    Write-Step "Starting Vite dev server on :$VitePort ..."

    $viteLog    = Join-Path $env:TEMP "enso-vite.log"
    $viteErrLog = Join-Path $env:TEMP "enso-vite-err.log"
    $npmCli     = "`"C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`""

    $viteProc = Start-Process -FilePath $nodeExe `
        -ArgumentList $npmCli, "run", "dev" `
        -WorkingDirectory $EnsoDir `
        -WindowStyle Hidden `
        -RedirectStandardInput $nullInput `
        -RedirectStandardOutput $viteLog `
        -RedirectStandardError $viteErrLog `
        -PassThru

    # Wait for Vite to be ready
    $viteReady = $false
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $viteUp = netstat -ano | Select-String ":$VitePort.*LISTENING"
        if ($viteUp) {
            $viteReady = $true
            break
        }
    }

    if ($viteReady) {
        Write-Ok "Vite dev server running (PID $($viteProc.Id)) -- http://localhost:$VitePort"
    } else {
        Write-Err "Vite did not start within 15s. Check $viteLog"
    }
}

# ==========================================================================
#  STEP 5 -- Restart Cloudflare tunnel
# ==========================================================================
Write-Step "Restarting Cloudflare tunnel..."

$cfProcs = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
if ($cfProcs) {
    Stop-Process -Name cloudflared -Force
    Write-Ok "Killed $($cfProcs.Count) cloudflared process(es)"
    Start-Sleep -Seconds 1
} else {
    Write-Skip "No existing cloudflared processes"
}

$cloudflaredExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (Test-Path $cloudflaredExe) {
    Start-Process -FilePath $cloudflaredExe `
        -ArgumentList "tunnel", "run", "enso" `
        -WindowStyle Hidden

    # Quick check that the process started
    Start-Sleep -Seconds 2
    $cfCheck = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
    if ($cfCheck) {
        Write-Ok "Cloudflare tunnel running (PID $($cfCheck[0].Id))"
    } else {
        Write-Err "Cloudflare tunnel failed to start"
    }
} else {
    Write-Skip "cloudflared not found at $cloudflaredExe"
}

# ==========================================================================
#  STEP 6 -- Restart watchdog
# ==========================================================================
Write-Step "Restarting watchdog..."
$wdTask = Get-ScheduledTask -TaskName $WatchdogTask -ErrorAction SilentlyContinue
if ($wdTask) {
    Start-ScheduledTask -TaskName $WatchdogTask -ErrorAction SilentlyContinue
    Write-Ok "Watchdog restarted"
} else {
    Write-Skip "Watchdog not installed"
}

# ==========================================================================
#  Summary
# ==========================================================================
Write-Host "`n" -NoNewline
Write-Host "===========================================" -ForegroundColor DarkGray
Write-Host "  Services:" -ForegroundColor White
Write-Host "    Server    -> http://localhost:$EnsoPort" -ForegroundColor Gray
if (-not $NoDev) {
    Write-Host "    Vite      -> http://localhost:$VitePort" -ForegroundColor Gray
}

# Show tunnel URL from cloudflared config
$cfConfig = Join-Path $env:USERPROFILE ".cloudflared\config.yml"
if (Test-Path $cfConfig) {
    $tunnelHost = Select-String -Path $cfConfig -Pattern "hostname:\s*(.+)" | ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() } | Select-Object -First 1
    if ($tunnelHost) {
        Write-Host "    Tunnel    -> https://$tunnelHost" -ForegroundColor Gray
    }
}

Write-Host "  Logs:" -ForegroundColor White
Write-Host "    Server    -> $serverLog" -ForegroundColor Gray
if (-not $NoDev) {
    Write-Host "    Vite      -> $viteLog" -ForegroundColor Gray
}
Write-Host "===========================================" -ForegroundColor DarkGray
Write-Host ""
