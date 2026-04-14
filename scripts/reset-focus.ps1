# reset-focus.ps1 — Clean reset of all Focus Area state
#
# Resets focus areas to a fresh start while preserving core identity
# (title, description, intent, evidence, experts). Clears all evaluation,
# sprint, conversation, and TL state artifacts.
#
# Usage:
#   .\scripts\reset-focus.ps1              # Reset focus state only
#   .\scripts\reset-focus.ps1 -All         # Reset focus + TL + conversations + Cortex
#   .\scripts\reset-focus.ps1 -WhatIf      # Show what would be cleaned without doing it

param(
    [switch]$All,        # Also clean TL state, remarks, conversations, Cortex sprint pages
    [switch]$WhatIf      # Dry run — show what would be cleaned
)

$ensoHome = Join-Path $env:USERPROFILE ".enso"
$action = if ($WhatIf) { "Would clean" } else { "Cleaning" }

Write-Host "`n=== Enso Focus Reset ===" -ForegroundColor Cyan
if ($WhatIf) { Write-Host "(DRY RUN — no changes will be made)`n" -ForegroundColor Yellow }

# ── 1. Reset Focus Areas ──
$focusPath = Join-Path $ensoHome "data/focus-areas.json"
if (Test-Path $focusPath) {
    $data = Get-Content $focusPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $count = 0
    foreach ($area in $data.areas) {
        # Clear evaluation artifacts
        $area.PSObject.Properties.Remove("preparedBriefing")
        $area.PSObject.Properties.Remove("preparedAt")
        # Clear sprint artifacts
        $area.PSObject.Properties.Remove("lastSprintResults")
        $area.PSObject.Properties.Remove("lastSprintDate")
        $area.PSObject.Properties.Remove("lastSprintSummary")
        # Clear conversation
        $area.PSObject.Properties.Remove("conversationId")
        # Clear related entity IDs (sprint deliverables)
        $area.relatedEntityIds = @()
        # Reset expert metrics (keep experts, reset activity)
        foreach ($expert in $area.experts) {
            $expert.metrics = @{
                conversationCount = 0
                lastActiveAt = $null
                sprintCount = 0
                insightsGenerated = 0
            }
            $expert.PSObject.Properties.Remove("conversationId")
        }
        # Reset progress
        $area.progress.recentActivity = @()
        # Clear refinements (keep only initial inference)
        $area.refinements = @($area.refinements | Where-Object { $_.source -eq "inference" } | Select-Object -First 1)
        $count++
        Write-Host "  Reset: $($area.title)" -ForegroundColor Green
    }
    $data.version = $data.version + 1
    if (-not $WhatIf) {
        $data | ConvertTo-Json -Depth 20 | Set-Content $focusPath -Encoding UTF8
    }
    Write-Host "$action $count focus areas`n" -ForegroundColor Cyan
} else {
    Write-Host "  No focus-areas.json found" -ForegroundColor Gray
}

# ── 2. Reset TL State ──
if ($All) {
    Write-Host "--- TL State ---" -ForegroundColor Cyan
    $tlPath = Join-Path $ensoHome "data/team-leader-state.json"
    if (-not $WhatIf) {
        @{
            lastMorningRoutineAt = $null
            lastCheckInAt = $null
            lastBriefing = $null
            recentActions = @()
            taskQueue = @()
            backgroundTasks = @()
            restartPending = $false
        } | ConvertTo-Json -Depth 5 | Set-Content $tlPath -Encoding UTF8
    }
    Write-Host "  $action TL state" -ForegroundColor Green

    # Remarks
    $remarksPath = Join-Path $ensoHome "data/remarks.json"
    if (-not $WhatIf) { "[]" | Set-Content $remarksPath -Encoding UTF8 }
    Write-Host "  $action remarks" -ForegroundColor Green

    # Notification contexts
    $ctxPath = Join-Path $ensoHome "data/notification-contexts.json"
    if (-not $WhatIf) { "{}" | Set-Content $ctxPath -Encoding UTF8 }
    Write-Host "  $action notification contexts" -ForegroundColor Green

    # Focus agent state
    $faPath = Join-Path $ensoHome "data/focus-agent-state.json"
    if (-not $WhatIf) {
        @{
            lastPulseAt = $null
            lastMonitorAt = $null
            recommendations = @()
            acceptedCount = 0
            rejectedCount = 0
        } | ConvertTo-Json -Depth 5 | Set-Content $faPath -Encoding UTF8
    }
    Write-Host "  $action focus agent state" -ForegroundColor Green
    Write-Host ""
}

# ── 3. Clean Cortex Sprint Pages ──
if ($All) {
    Write-Host "--- Cortex Wiki ---" -ForegroundColor Cyan
    $focusWiki = Join-Path $ensoHome "wiki/focuses"
    $synthWiki = Join-Path $ensoHome "wiki/synthesis"

    # Remove sprint-specific files and directories
    $sprintItems = Get-ChildItem $focusWiki -Filter "*sprint*" -Recurse -ErrorAction SilentlyContinue
    foreach ($item in $sprintItems) {
        Write-Host "  $action $($item.FullName)" -ForegroundColor Yellow
        if (-not $WhatIf) { Remove-Item $item.FullName -Recurse -Force }
    }

    # Remove sprint deliverable synthesis pages
    $sprintPatterns = @("sprint-*", "evolution-sprint*", "golden-hour-*", "elite-travel-*",
        "destination-deep-*", "scene-to-technique-*", "gift-worthy-*", "gift-quality-*",
        "travel-photography-project*", "sprint-report-*", "sprint-synthesis-*",
        "research-travel-*", "build-sprint-*")
    foreach ($pattern in $sprintPatterns) {
        $matches = Get-ChildItem $synthWiki -Filter $pattern -ErrorAction SilentlyContinue
        foreach ($item in $matches) {
            Write-Host "  $action synthesis/$($item.Name)" -ForegroundColor Yellow
            if (-not $WhatIf) { Remove-Item $item.FullName -Force }
        }
    }

    # Remove duplicate/old focus wiki pages (keep current ID-matching ones)
    $focusIds = @()
    if (Test-Path $focusPath) {
        $d = Get-Content $focusPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $focusIds = $d.areas | ForEach-Object { $_.id }
    }
    $focusPages = Get-ChildItem $focusWiki -Filter "*.md" -ErrorAction SilentlyContinue
    foreach ($page in $focusPages) {
        $stem = $page.BaseName
        $isCurrentFocus = $focusIds | Where-Object { $stem -eq $_ }
        if (-not $isCurrentFocus) {
            Write-Host "  $action stale focus page: $($page.Name)" -ForegroundColor Yellow
            if (-not $WhatIf) { Remove-Item $page.FullName -Force }
        }
    }
    Write-Host ""
}

# ── 4. Clean Focus/Expert Conversations ──
if ($All) {
    Write-Host "--- Conversations ---" -ForegroundColor Cyan
    $cardsDir = Join-Path $ensoHome "cards"
    $cleanedConvs = 0
    $cleanedCards = 0

    foreach ($clientDir in Get-ChildItem $cardsDir -Directory -ErrorAction SilentlyContinue) {
        $convPath = Join-Path $clientDir.FullName "conversations.json"
        if (-not (Test-Path $convPath)) { continue }

        try {
            $convs = Get-Content $convPath -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch { continue }

        $filtered = @()
        $removedIds = @()
        foreach ($c in $convs) {
            $ctxType = $c.context.type
            if ($ctxType -eq "focus" -or $ctxType -eq "expert") {
                $removedIds += $c.id
                $cleanedConvs++
            } else {
                $filtered += $c
            }
        }

        if ($removedIds.Count -gt 0 -and -not $WhatIf) {
            $filtered | ConvertTo-Json -Depth 10 | Set-Content $convPath -Encoding UTF8
            foreach ($rid in $removedIds) {
                $jsonlPath = Join-Path $clientDir.FullName "$rid.jsonl"
                if (Test-Path $jsonlPath) {
                    Remove-Item $jsonlPath -Force
                    $cleanedCards++
                }
            }
        }

        # Clean stale TL cards from main conversation
        $mainPath = Join-Path $clientDir.FullName "main.jsonl"
        if (Test-Path $mainPath) {
            $lines = Get-Content $mainPath -Encoding UTF8 -ErrorAction SilentlyContinue
            $staleMarkers = @("Enso Daily", "TL Routine", "Needs Your Input",
                "sprint results", "Sprint Results", "deliverable",
                "Focus Pulse", "TL Routine Running")
            $kept = @()
            foreach ($line in $lines) {
                $isStale = $false
                foreach ($marker in $staleMarkers) {
                    if ($line -match [regex]::Escape($marker)) {
                        $isStale = $true
                        $cleanedCards++
                        break
                    }
                }
                if (-not $isStale -and $line.Trim()) { $kept += $line }
            }
            if (-not $WhatIf) {
                $kept -join "`n" | Set-Content $mainPath -Encoding UTF8
            }
        }
    }
    Write-Host "  $action $cleanedConvs focus/expert conversations" -ForegroundColor Green
    Write-Host "  $action $cleanedCards conversation card files" -ForegroundColor Green
    Write-Host ""
}

# ── Summary ──
Write-Host "=== Done ===" -ForegroundColor Cyan
if ($WhatIf) {
    Write-Host "Run without -WhatIf to apply changes." -ForegroundColor Yellow
} else {
    Write-Host "All focus state reset. Restart the server to pick up changes:" -ForegroundColor Green
    Write-Host "  powershell -ExecutionPolicy Bypass -File restart.ps1" -ForegroundColor Gray
}
Write-Host ""
