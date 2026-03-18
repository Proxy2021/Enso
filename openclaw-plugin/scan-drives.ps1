param(
    [string[]]$Drives = @(),
    [string]$OutputPath = "C:\Users\Administrator\AppData\Local\Temp\enso-doc-scan.json",
    [int]$MaxFiles = 50000,
    [string[]]$Extensions = @(".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",".txt",".csv",".odt",".ods",".odp",".rtf",".md",".json",".xml",".html",".htm",".eml",".msg",".pages",".numbers",".key"),
    [string[]]$SkipDirs = @("Windows","Program Files","Program Files (x86)","ProgramData","$Recycle.Bin","System Volume Information","Recovery","PerfLogs","MSOCache")
)

# Auto-detect drives if none specified
if ($Drives.Count -eq 0) {
    $Drives = (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null -or $_.Free -ne $null } | Select-Object -ExpandProperty Root)
}

$extSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($e in $Extensions) { $null = $extSet.Add($e) }

$skipSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($s in $SkipDirs) { $null = $skipSet.Add($s) }
$skipPathPatterns = @("AppData\Local\Temp","AppData\Local\Microsoft","node_modules",".git","__pycache__",".cache",".npm",".nuget")

$allFiles = [System.Collections.Generic.List[object]]::new()
$driveStats = [ordered]@{}
$extStats = [ordered]@{}
$totalScanned = 0
$errors = 0
$hitCap = $false

function Get-TopFolder {
    param([string]$FilePath, [string]$DriveRoot)
    $rel = $FilePath.Substring($DriveRoot.Length)
    $parts = $rel -split '[/\\]'
    # Walk into Users\<user>\<folder> to get the meaningful folder
    if ($parts.Count -ge 1) {
        $top = $parts[0]
        if ($top -eq "Users" -and $parts.Count -ge 3) {
            return $parts[2]  # e.g. Documents, Downloads, Desktop
        }
        return $top
    }
    return "Root"
}

foreach ($drive in $Drives) {
    $driveLetter = $drive.TrimEnd('\','/').Substring(0,1).ToUpper()
    $driveRoot = "${driveLetter}:\"
    Write-Host "=== Scanning drive ${driveLetter}: ==="

    $queue = [System.Collections.Generic.Queue[string]]::new()
    $queue.Enqueue($driveRoot)
    $driveFileCount = 0

    while ($queue.Count -gt 0) {
        if ($hitCap) { break }
        $dir = $queue.Dequeue()

        # Check skip patterns
        $skip = $false
        foreach ($p in $skipPathPatterns) {
            if ($dir -like "*$p*") { $skip = $true; break }
        }
        if ($skip) { continue }

        try {
            $entries = [System.IO.Directory]::GetFileSystemEntries($dir)
        } catch {
            $errors++
            continue
        }

        foreach ($entry in $entries) {
            if ($hitCap) { break }
            try {
                $attr = [System.IO.File]::GetAttributes($entry)
                if ($attr -band [System.IO.FileAttributes]::Directory) {
                    $dirName = [System.IO.Path]::GetFileName($entry)
                    $relDepth = ($entry.Replace($driveRoot,"").Split('\').Count)
                    if ($relDepth -le 1 -and $skipSet.Contains($dirName)) { continue }
                    if ($dirName.StartsWith('.') -and $dirName -ne ".openclaw") { continue }
                    $queue.Enqueue($entry)
                } else {
                    $totalScanned++
                    $ext = [System.IO.Path]::GetExtension($entry)
                    if ($ext -and $extSet.Contains($ext)) {
                        if ($allFiles.Count -ge $MaxFiles) {
                            $hitCap = $true
                            Write-Host "  *** Reached file cap ($MaxFiles). Stopping. ***"
                            break
                        }
                        $info = [System.IO.FileInfo]::new($entry)
                        $topFolder = Get-TopFolder -FilePath $entry -DriveRoot $driveRoot
                        $obj = [ordered]@{
                            path = $entry
                            filename = $info.Name
                            extension = $ext.ToLower()
                            sizeBytes = $info.Length
                            lastModified = $info.LastWriteTime.ToString("yyyy-MM-ddTHH:mm:ss")
                            drive = "${driveLetter}:"
                            topFolder = $topFolder
                        }
                        $allFiles.Add($obj)
                        $driveFileCount++

                        # Track extension stats
                        $extLower = $ext.ToLower()
                        if (-not $extStats.ContainsKey($extLower)) { $extStats[$extLower] = 0 }
                        $extStats[$extLower]++
                    }
                }
            } catch {
                $errors++
                continue
            }
        }

        if ($totalScanned % 100000 -eq 0 -and $totalScanned -gt 0) {
            Write-Host "  ... scanned $totalScanned files, found $($allFiles.Count) documents"
        }
    }

    $driveStats["${driveLetter}:"] = $driveFileCount
    Write-Host "  Drive ${driveLetter}: found $driveFileCount documents (scanned $totalScanned total)"
    if ($hitCap) { break }
}

Write-Host ""
Write-Host "=== SCAN COMPLETE ==="
Write-Host "Total files scanned: $totalScanned"
Write-Host "Documents found: $($allFiles.Count)"
Write-Host "Permission errors (skipped): $errors"
Write-Host ""
Write-Host "--- Per Drive ---"
foreach ($kv in $driveStats.GetEnumerator()) {
    Write-Host "  $($kv.Key): $($kv.Value) files"
}
Write-Host ""
Write-Host "--- Per Extension (top 20) ---"
$extStats.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 20 | ForEach-Object {
    Write-Host "  $($_.Key): $($_.Value) files"
}

# Build structured output
$driveList = @()
foreach ($kv in $driveStats.GetEnumerator()) {
    $driveList += [ordered]@{ drive = $kv.Key; fileCount = $kv.Value }
}

$result = [ordered]@{
    scanDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
    totalFiles = $allFiles.Count
    totalScanned = $totalScanned
    permissionErrors = $errors
    hitCap = $hitCap
    drives = $driveList
    files = $allFiles.ToArray()
}

$json = $result | ConvertTo-Json -Depth 5 -Compress
[System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.Encoding]::UTF8)
$outSize = [math]::Round((Get-Item $OutputPath).Length / 1MB, 2)
Write-Host ""
Write-Host "Output written to: $OutputPath ($outSize MB)"
