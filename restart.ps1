<#
.SYNOPSIS
    Restart all Enso + OpenClaw services on Windows.

.DESCRIPTION
    1. Kills existing OpenClaw gateway + Enso dev processes
    2. Rebuilds AlphaRank plugin (if source is newer than dist)
    3. Starts OpenClaw gateway (which auto-starts the Enso WS server on :3001)
    4. Starts the Enso Vite dev server on :5173

.NOTES
    Run from any PowerShell terminal:
        .\restart.ps1
    Or from Git Bash / CMD:
        powershell -ExecutionPolicy Bypass -File restart.ps1
#>

param(
    [switch]$SkipBuild,       # Skip AlphaRank rebuild check
    [switch]$NoDev,           # Don't start Vite dev server
    [int]$GatewayPort = 18789,
    [int]$EnsoPort    = 3001,
    [int]$VitePort    = 5173
)

$ErrorActionPreference = "Stop"

# -- Paths -----------------------------------------------------------------
$EnsoDir      = "D:\Github\Enso"
$AlphaRankDir = "D:\Github\AlphaRank\openclaw-plugin"
$OpenClawDir  = "D:\Github\openclaw"

# -- Colors ----------------------------------------------------------------
function Write-Step  ($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok    ($msg) { Write-Host "   [OK] $msg" -ForegroundColor Green }
function Write-Skip  ($msg) { Write-Host "   [SKIP] $msg" -ForegroundColor Yellow }
function Write-Err   ($msg) { Write-Host "   [ERR] $msg" -ForegroundColor Red }

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

    $isOurs = ($cmd -match "openclaw.*gateway") -or
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
$portsInUse = netstat -ano | Select-String "(:$GatewayPort|:$EnsoPort|:$VitePort).*LISTENING"
if ($portsInUse) {
    Write-Err "Ports still in use after kill:`n$portsInUse"
    Write-Host "   Waiting 3 more seconds..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
}

# ==========================================================================
#  STEP 2 -- Rebuild AlphaRank plugin (if needed)
# ==========================================================================
Write-Step "Checking AlphaRank plugin build..."

if ($SkipBuild) {
    Write-Skip "Build check skipped (-SkipBuild)"
} else {
    $srcFile  = Join-Path $AlphaRankDir "src\index.ts"
    $distFile = Join-Path $AlphaRankDir "dist\index.js"

    if ((Test-Path $srcFile) -and (Test-Path $distFile)) {
        $srcTime  = (Get-Item $srcFile).LastWriteTime
        $distTime = (Get-Item $distFile).LastWriteTime

        if ($srcTime -gt $distTime) {
            Write-Host "   Source newer than dist ($($srcTime.ToString('HH:mm:ss')) > $($distTime.ToString('HH:mm:ss')))" -ForegroundColor Yellow
            Write-Host "   Building..." -ForegroundColor Yellow
            Push-Location $AlphaRankDir
            try {
                npm run build 2>&1 | Out-Null
                Write-Ok "AlphaRank plugin rebuilt"
            } catch {
                Write-Err "AlphaRank build failed: $_"
            } finally {
                Pop-Location
            }
        } else {
            Write-Ok "AlphaRank dist is up-to-date"
        }
    } elseif (Test-Path $srcFile) {
        Write-Host "   No dist found, building..." -ForegroundColor Yellow
        Push-Location $AlphaRankDir
        try {
            npm run build 2>&1 | Out-Null
            Write-Ok "AlphaRank plugin built"
        } catch {
            Write-Err "AlphaRank build failed: $_"
        } finally {
            Pop-Location
        }
    } else {
        Write-Skip "AlphaRank source not found at $srcFile"
    }
}

# ==========================================================================
#  STEP 3 -- Start OpenClaw gateway (spawns Enso WS server on :3001)
# ==========================================================================
Write-Step "Starting OpenClaw gateway on :$GatewayPort ..."

$gatewayLog    = Join-Path $env:TEMP "openclaw-gateway.log"
$gatewayErrLog = Join-Path $env:TEMP "openclaw-gateway-err.log"

# openclaw is an npm global script (.ps1 / .cmd wrapper) -- Start-Process
# with -RedirectStandardOutput requires a real .exe, so we resolve the
# underlying node entry point and launch via node.exe directly.
$openclawMjs = "C:\Users\Administrator\AppData\Roaming\npm\node_modules\openclaw\openclaw.mjs"
$nodeExe     = "C:\Program Files\nodejs\node.exe"

$gatewayProc = Start-Process -FilePath $nodeExe `
    -ArgumentList "--disable-warning=ExperimentalWarning", $openclawMjs, "gateway", "--port", $GatewayPort `
    -WorkingDirectory $OpenClawDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $gatewayLog `
    -RedirectStandardError $gatewayErrLog `
    -PassThru

# Wait for gateway + Enso server to be ready
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $gwUp   = netstat -ano | Select-String ":$GatewayPort.*LISTENING"
    $ensoUp = netstat -ano | Select-String ":$EnsoPort.*LISTENING"
    if ($gwUp -and $ensoUp) {
        $ready = $true
        break
    }
    if ($gwUp -and -not $ensoUp) {
        Write-Host "   Gateway up, waiting for Enso server..." -ForegroundColor Yellow
    }
}

if ($ready) {
    Write-Ok "OpenClaw gateway running (PID $($gatewayProc.Id)) -- :$GatewayPort (gateway) + :$EnsoPort (Enso)"
} else {
    Write-Err "Gateway did not start within 30s. Check $gatewayLog"
    Write-Host "   Last 5 lines of log:" -ForegroundColor Yellow
    if (Test-Path $gatewayLog) {
        Get-Content $gatewayLog -Tail 5 | ForEach-Object { Write-Host "   $_" }
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
#  Summary
# ==========================================================================
Write-Host "`n" -NoNewline
Write-Host "===========================================" -ForegroundColor DarkGray
Write-Host "  Services:" -ForegroundColor White
Write-Host "    Gateway   -> http://localhost:$GatewayPort" -ForegroundColor Gray
Write-Host "    Enso WS   -> http://localhost:$EnsoPort" -ForegroundColor Gray
if (-not $NoDev) {
    Write-Host "    Vite      -> http://localhost:$VitePort" -ForegroundColor Gray
}
Write-Host "  Logs:" -ForegroundColor White
Write-Host "    Gateway   -> $gatewayLog" -ForegroundColor Gray
if (-not $NoDev) {
    Write-Host "    Vite      -> $viteLog" -ForegroundColor Gray
}
Write-Host "===========================================" -ForegroundColor DarkGray
Write-Host ""
