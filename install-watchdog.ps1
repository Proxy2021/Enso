# install-watchdog.ps1 — Install Enso watchdog as a Windows Scheduled Task (2-minute interval)

$TaskName = "Enso Guardian Watchdog"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$WatchdogScript = Join-Path $ScriptDir "watchdog.ps1"

# Remove existing tasks (old and new names)
foreach ($name in @($TaskName, "Enso Watchdog")) {
    $existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $name -Confirm:$false
        Write-Host "[watchdog] Removed existing task '$name'"
    }
}

# Create action: run PowerShell with the watchdog script
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$WatchdogScript`""

# Trigger: at logon, repeating every 2 minutes indefinitely
$trigger = New-ScheduledTaskTrigger -AtLogon
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At "00:00" -RepetitionInterval (New-TimeSpan -Minutes 2)).Repetition

# Settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 3)

# Register the task
Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -Description "Monitors Enso guardian and server, restarts if dead (every 2 minutes)"

# Start it now
Start-ScheduledTask -TaskName $TaskName

Write-Host "[watchdog] Installed and started: '$TaskName' (every 2 minutes)"
Write-Host "[watchdog] Script: $WatchdogScript"
Write-Host "[watchdog] Log:    $env:USERPROFILE\.enso\watchdog.log"
