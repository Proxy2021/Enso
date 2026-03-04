# watchdog.ps1 — Check if Enso services are healthy, restart any that are down
# Intended to run on a 10-minute interval via Windows Scheduled Task.
#
# Monitors: Enso plugin (:3001), Vite dev server (:5173), Cloudflare tunnel

$ErrorActionPreference = "SilentlyContinue"

$LogFile = "$env:USERPROFILE\.openclaw\watchdog.log"
$MaxLogLines = 500
$EnsoDir = "D:\Github\Enso"
$OpenClawDir = "D:\Github\openclaw"

# Ensure log directory exists
$logDir = Split-Path $LogFile
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "$ts $msg"
}

function Trim-Log {
    if (Test-Path $LogFile) {
        $lines = Get-Content $LogFile
        if ($lines.Count -gt $MaxLogLines) {
            $lines | Select-Object -Last $MaxLogLines | Set-Content $LogFile
        }
    }
}

function Test-Port($port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", $port)
        $tcp.Close()
        return $true
    } catch {
        return $false
    }
}

Trim-Log

$allHealthy = $true

# ── 1. Check Enso plugin (gateway + plugin) ──
$ensoUp = $false
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 10 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $ensoUp = $true }
} catch {}

if ($ensoUp) {
    Write-Log "[ok] Enso plugin healthy (:3001)"
} else {
    $allHealthy = $false
    Write-Log "[FAIL] Enso plugin not responding — restarting gateway"

    # Kill orphaned gateway node processes
    $nodeProcs = Get-WmiObject Win32_Process -Filter "Name='node.exe'" | Where-Object {
        $_.CommandLine -match "openclaw" -and $_.CommandLine -match "gateway"
    }
    foreach ($proc in $nodeProcs) {
        Write-Log "[restart] Killing gateway node.exe PID $($proc.ProcessId)"
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if ($nodeProcs) { Start-Sleep -Seconds 2 }

    # Restart via scheduled task
    $TaskName = "OpenClaw Gateway"
    try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        if ($task.State -eq "Running") {
            Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
        Start-ScheduledTask -TaskName $TaskName
        Write-Log "[restart] Started scheduled task '$TaskName'"
    } catch {
        Write-Log "[restart] Scheduled task not found, trying openclaw CLI"
        & openclaw gateway start 2>$null
    }

    # Wait for recovery
    $recovered = $false
    for ($i = 1; $i -le 30; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3001/health" -TimeoutSec 5 -UseBasicParsing
            if ($r.StatusCode -eq 200) {
                Write-Log "[restart] Gateway recovered after ${i}s"
                $recovered = $true
                break
            }
        } catch {}
        Start-Sleep -Seconds 1
    }
    if (-not $recovered) {
        Write-Log "[restart] Gateway did NOT recover within 30s"
    }
}

# ── 2. Check Vite dev server ──
$viteUp = Test-Port 5173

if ($viteUp) {
    Write-Log "[ok] Vite dev server healthy (:5173)"
} else {
    $allHealthy = $false
    Write-Log "[FAIL] Vite dev server not responding — restarting"

    # Kill any lingering vite node processes
    $viteProcs = Get-WmiObject Win32_Process -Filter "Name='node.exe'" | Where-Object {
        $_.CommandLine -match "vite" -and $_.CommandLine -match "Enso"
    }
    foreach ($proc in $viteProcs) {
        Write-Log "[restart] Killing vite node.exe PID $($proc.ProcessId)"
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if ($viteProcs) { Start-Sleep -Seconds 1 }

    # Start Vite
    $nullInput = Join-Path $env:TEMP "openclaw-null-input.txt"
    if (-not (Test-Path $nullInput)) { [System.IO.File]::WriteAllText($nullInput, "") }
    $nodeExe = "C:\Program Files\nodejs\node.exe"
    $npmCli = "`"C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`""
    $viteLog = Join-Path $env:TEMP "enso-vite.log"
    $viteErrLog = Join-Path $env:TEMP "enso-vite-err.log"

    Start-Process -FilePath $nodeExe `
        -ArgumentList $npmCli, "run", "dev" `
        -WorkingDirectory $EnsoDir `
        -WindowStyle Hidden `
        -RedirectStandardInput $nullInput `
        -RedirectStandardOutput $viteLog `
        -RedirectStandardError $viteErrLog

    # Wait for Vite
    $viteRecovered = $false
    for ($i = 1; $i -le 15; $i++) {
        if (Test-Port 5173) {
            Write-Log "[restart] Vite recovered after ${i}s"
            $viteRecovered = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $viteRecovered) {
        Write-Log "[restart] Vite did NOT recover within 15s"
    }
}

# ── 3. Check Cloudflare tunnel ──
$cfProc = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
$cloudflaredExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

if ($cfProc) {
    Write-Log "[ok] Cloudflare tunnel running (PID $($cfProc[0].Id))"
} elseif (Test-Path $cloudflaredExe) {
    $allHealthy = $false
    Write-Log "[FAIL] Cloudflare tunnel not running — restarting"

    Start-Process -FilePath $cloudflaredExe `
        -ArgumentList "tunnel", "run", "enso" `
        -WindowStyle Hidden

    Start-Sleep -Seconds 2
    $cfCheck = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
    if ($cfCheck) {
        Write-Log "[restart] Cloudflare tunnel started (PID $($cfCheck[0].Id))"
    } else {
        Write-Log "[restart] Cloudflare tunnel failed to start"
    }
}

if ($allHealthy) { exit 0 } else { exit 1 }
