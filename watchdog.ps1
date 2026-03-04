# watchdog.ps1 — Check if Enso services are healthy, restart gateway if not
# Intended to run on a 10-minute interval via Windows Scheduled Task.

$ErrorActionPreference = "SilentlyContinue"

$HealthUrl = "http://localhost:3001/health"
$LogFile = "$env:USERPROFILE\.openclaw\watchdog.log"
$TaskName = "OpenClaw Gateway"
$MaxLogLines = 500

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

Trim-Log

# Health check
try {
    $response = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Log "[ok] Enso plugin healthy"
        exit 0
    }
} catch {}

Write-Log "[FAIL] Enso plugin not responding at $HealthUrl — restarting gateway"

# Kill orphaned gateway node processes
$gatewayCmd = "gateway.cmd"
$nodeProcs = Get-WmiObject Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -match "openclaw" -and $_.CommandLine -match "gateway"
}
foreach ($proc in $nodeProcs) {
    Write-Log "[restart] Killing node.exe PID $($proc.ProcessId)"
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}
if ($nodeProcs) { Start-Sleep -Seconds 2 }

# Restart via scheduled task
try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    if ($task.State -eq "Running") {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    Start-ScheduledTask -TaskName $TaskName
    Write-Log "[restart] Started scheduled task '$TaskName'"
} catch {
    Write-Log "[restart] Scheduled task '$TaskName' not found, trying openclaw CLI"
    & openclaw gateway start 2>$null
}

# Wait for recovery
for ($i = 1; $i -le 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 5 -UseBasicParsing
        if ($r.StatusCode -eq 200) {
            Write-Log "[restart] Gateway recovered after ${i}s"
            exit 0
        }
    } catch {}
    Start-Sleep -Seconds 1
}

Write-Log "[restart] Gateway did NOT recover within 30s"
exit 1
