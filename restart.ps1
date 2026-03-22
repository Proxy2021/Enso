<#
.SYNOPSIS
    Restart all Enso services on Windows.

.DESCRIPTION
    1. Stops the watchdog (prevents interference during restart)
    2. Kills existing guardian + server + Vite processes
    3. Pulls latest code
    4. Starts the guardian (which spawns the server)
    5. Optionally starts Vite dev server
    6. Restarts Cloudflare tunnel
    7. Restarts the watchdog

.NOTES
    Run from any PowerShell terminal:
        .\restart.ps1
    Or from Git Bash / CMD:
        powershell -ExecutionPolicy Bypass -File restart.ps1
#>

param(
    [switch]$NoDev,           # Don't start Vite dev server
    [switch]$NoPull,          # Skip git pull
    [int]$EnsoPort    = 3001,
    [int]$VitePort    = 5173
)

$ErrorActionPreference = "Stop"

# -- Paths -----------------------------------------------------------------
$WatchdogTask = "Enso Guardian Watchdog"
$OldWatchdogTask = "Enso Watchdog"
$EnsoDir      = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnsoHome     = Join-Path $env:USERPROFILE ".enso"
$GuardianPid  = Join-Path $EnsoHome "guardian.pid"
$ServerPid    = Join-Path $EnsoHome "server.pid"
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $nodeExe) { $nodeExe = "C:\Program Files\nodejs\node.exe" }

# -- Colors ----------------------------------------------------------------
function Write-Step  ($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok    ($msg) { Write-Host "   [OK] $msg" -ForegroundColor Green }
function Write-Skip  ($msg) { Write-Host "   [SKIP] $msg" -ForegroundColor Yellow }
function Write-Err   ($msg) { Write-Host "   [ERR] $msg" -ForegroundColor Red }

# ==========================================================================
#  STEP 0 -- Disable watchdog (prevent interference during restart)
# ==========================================================================
Write-Step "Disabling watchdog..."
foreach ($taskName in @($WatchdogTask, $OldWatchdogTask)) {
    $wdTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($wdTask) {
        if ($wdTask.State -eq "Running") {
            Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        }
        Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Write-Ok "Disabled '$taskName'"
    }
}

# ==========================================================================
#  STEP 1 -- Kill existing processes (guardian, server, vite)
# ==========================================================================
Write-Step "Killing existing services..."

$killed = 0

# Kill by PID files first (most reliable)
foreach ($pidFile in @($GuardianPid, $ServerPid)) {
    if (Test-Path $pidFile) {
        $procId = [int](Get-Content $pidFile -Raw).Trim()
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Ok "Killed PID $procId (from $([System.IO.Path]::GetFileName($pidFile)))"
            $killed++
        } catch {
            # Already dead
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
}

# Also sweep for any orphaned node processes matching our scripts
$nodeProcs = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Select-Object ProcessId, CommandLine

foreach ($proc in $nodeProcs) {
    $cmd = $proc.CommandLine
    if (-not $cmd) { continue }

    $isOurs = ($cmd -match "standalone\.ts") -or
              ($cmd -match "guardian\.ts") -or
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
            # Already dead
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
if ($NoPull) {
    Write-Skip "Git pull skipped (-NoPull)"
} else {
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
}

# ==========================================================================
#  STEP 3 -- Start Guardian (supervises the Enso server on :3001)
# ==========================================================================
Write-Step "Starting Enso guardian (server on :$EnsoPort) ..."

$nullInput = Join-Path $env:TEMP "enso-null-input.txt"
if (-not (Test-Path $nullInput)) { [System.IO.File]::WriteAllText($nullInput, "") }

$guardianLog    = Join-Path $env:TEMP "enso-guardian.log"
$guardianErrLog = Join-Path $env:TEMP "enso-guardian-err.log"

$guardianProc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npx tsx server/guardian.ts > `"$guardianLog`" 2> `"$guardianErrLog`"" `
    -WorkingDirectory $EnsoDir `
    -WindowStyle Hidden `
    -PassThru

# Wait for server to be ready
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$EnsoPort/health" -TimeoutSec 5 -UseBasicParsing
        if ($r.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {}
}

if ($ready) {
    Write-Ok "Guardian + server running (PID $($guardianProc.Id)) -- :$EnsoPort"
} else {
    Write-Err "Server did not start within 30s. Check $guardianLog"
    Write-Host "   Last 5 lines of log:" -ForegroundColor Yellow
    if (Test-Path $guardianLog) {
        Get-Content $guardianLog -Tail 5 | ForEach-Object { Write-Host "   $_" }
    }
    if (Test-Path $guardianErrLog) {
        Get-Content $guardianErrLog -Tail 5 | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
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
    $npmCli = (Get-Command npm -ErrorAction SilentlyContinue)?.Source
    if ($npmCli) {
        $npmCli = (Resolve-Path (Join-Path (Split-Path $npmCli) "../node_modules/npm/bin/npm-cli.js") -ErrorAction SilentlyContinue)?.Path
    }
    if (-not $npmCli) { $npmCli = "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" }

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

$cloudflaredExe = (Get-Command cloudflared -ErrorAction SilentlyContinue)?.Source
if (-not $cloudflaredExe) { $cloudflaredExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe" }
if (Test-Path $cloudflaredExe) {
    Start-Process -FilePath $cloudflaredExe `
        -ArgumentList "tunnel", "run", "enso" `
        -WindowStyle Hidden

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
#  STEP 6 -- Re-enable and restart watchdog
# ==========================================================================
Write-Step "Re-enabling watchdog..."
$wdTask = Get-ScheduledTask -TaskName $WatchdogTask -ErrorAction SilentlyContinue
if ($wdTask) {
    Enable-ScheduledTask -TaskName $WatchdogTask -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName $WatchdogTask -ErrorAction SilentlyContinue
    Write-Ok "Watchdog re-enabled and started ($WatchdogTask)"
} else {
    Write-Skip "Watchdog not installed -- run install-watchdog.ps1 to install"
}

# ==========================================================================
#  Summary
# ==========================================================================
Write-Host "`n" -NoNewline
Write-Host "===========================================" -ForegroundColor DarkGray
Write-Host "  Services:" -ForegroundColor White
Write-Host "    Guardian  -> supervised, auto-restart" -ForegroundColor Gray
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
Write-Host "    Guardian  -> $guardianLog" -ForegroundColor Gray
Write-Host "    Guardian  -> $env:USERPROFILE\.enso\guardian.log" -ForegroundColor Gray
if (-not $NoDev) {
    Write-Host "    Vite      -> $viteLog" -ForegroundColor Gray
}
Write-Host "  Crash reports:" -ForegroundColor White
Write-Host "    $env:USERPROFILE\.enso\crashes" -ForegroundColor Gray
Write-Host "===========================================" -ForegroundColor DarkGray
Write-Host ""
