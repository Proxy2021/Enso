# install-watchdog.ps1 — Install Enso watchdog as a Windows Scheduled Task (10-minute interval)

$TaskName = "Enso Watchdog"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$WatchdogScript = Join-Path $ScriptDir "watchdog.ps1"

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[watchdog] Removed existing task"
}

# Create action: run PowerShell with the watchdog script
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$WatchdogScript`""

# Create trigger: at logon, repeating every 10 minutes indefinitely
$trigger = New-ScheduledTaskTrigger -AtLogon
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "00:00" -RepetitionInterval (New-TimeSpan -Minutes 10)).Repetition

# Create settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

# Register the task
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -Description "Monitors Enso services and restarts them if down (every 10 minutes)"

# Start it now
Start-ScheduledTask -TaskName $TaskName

Write-Host "[watchdog] Installed and started: '$TaskName' (every 10 minutes)"
Write-Host "[watchdog] Script: $WatchdogScript"
Write-Host "[watchdog] Log:    $env:USERPROFILE\.openclaw\watchdog.log"
