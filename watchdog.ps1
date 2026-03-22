# watchdog.ps1 — Verify Enso guardian + server are running; restart if needed.
# Runs on a 2-minute interval via the "Enso Guardian Watchdog" Scheduled Task.
#
# Defense layer 3: catches the case where both guardian and server are dead.
# Under normal operation the guardian (layer 2) handles server restarts, so
# this script only intervenes when the guardian itself is gone.

$ErrorActionPreference = "SilentlyContinue"

$EnsoDir   = "$env:USERPROFILE\.enso"
$LogFile   = "$EnsoDir\watchdog.log"
$MaxLogLines = 500
$GuardianPid = "$EnsoDir\guardian.pid"
$RepoDir   = "D:\Github\Enso"
$Port      = 3001

# Ensure directory
if (-not (Test-Path $EnsoDir)) { New-Item -ItemType Directory -Path $EnsoDir -Force | Out-Null }

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

function Test-ProcessAlive($pid) {
    if (-not $pid) { return $false }
    try {
        $proc = Get-Process -Id $pid -ErrorAction Stop
        return ($proc -ne $null)
    } catch {
        return $false
    }
}

Trim-Log

$allHealthy = $true

# ── 1. Check guardian process via PID file ──
$guardianAlive = $false
if (Test-Path $GuardianPid) {
    $gpid = [int](Get-Content $GuardianPid -Raw).Trim()
    $guardianAlive = Test-ProcessAlive $gpid
}

# ── 2. Check server health endpoint ──
$serverUp = $false
try {
    $r = Invoke-WebRequest -Uri "http://localhost:$Port/health" -TimeoutSec 10 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $serverUp = $true }
} catch {}

# ── 3. Decide what to do ──

if ($guardianAlive -and $serverUp) {
    Write-Log "[ok] Guardian (PID $gpid) + server healthy"
}
elseif ($guardianAlive -and -not $serverUp) {
    # Guardian is alive but server is down — let the guardian handle it.
    # It has its own health polling and will restart the server.
    Write-Log "[wait] Guardian alive (PID $gpid) but server not responding — guardian will handle"
    $allHealthy = $false
}
else {
    # Guardian is dead (or PID file missing) — we need to restart it.
    $allHealthy = $false
    Write-Log "[FAIL] Guardian not running — restarting"

    # Kill any orphaned Enso node processes
    $nodeProcs = Get-WmiObject Win32_Process -Filter "Name='node.exe'" | Where-Object {
        $_.CommandLine -match "standalone\.ts" -or $_.CommandLine -match "guardian\.ts"
    }
    foreach ($proc in $nodeProcs) {
        Write-Log "[restart] Killing orphaned node.exe PID $($proc.ProcessId)"
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if ($nodeProcs) { Start-Sleep -Seconds 2 }

    # Start the guardian
    $nullInput = Join-Path $env:TEMP "enso-null-input.txt"
    if (-not (Test-Path $nullInput)) { [System.IO.File]::WriteAllText($nullInput, "") }

    $guardianLog    = Join-Path $env:TEMP "enso-guardian-stdout.log"
    $guardianErrLog = Join-Path $env:TEMP "enso-guardian-stderr.log"

    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "npx tsx server/guardian.ts > `"$guardianLog`" 2> `"$guardianErrLog`"" `
        -WorkingDirectory $RepoDir `
        -WindowStyle Hidden

    # Wait for server to become healthy
    $recovered = $false
    for ($i = 1; $i -le 30; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:$Port/health" -TimeoutSec 5 -UseBasicParsing
            if ($r.StatusCode -eq 200) {
                Write-Log "[restart] Server recovered after ${i}s"
                $recovered = $true
                break
            }
        } catch {}
        Start-Sleep -Seconds 1
    }
    if (-not $recovered) {
        Write-Log "[restart] Server did NOT recover within 30s"
    }
}

# ── 4. Check Vite dev server (optional, non-critical) ──
$viteUp = $false
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("127.0.0.1", 5173)
    $tcp.Close()
    $viteUp = $true
} catch {}

if ($viteUp) {
    Write-Log "[ok] Vite dev server healthy (:5173)"
} else {
    Write-Log "[info] Vite dev server not running (:5173) — this is normal in production"
}

# ── 5. Check Cloudflare tunnel ──
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
