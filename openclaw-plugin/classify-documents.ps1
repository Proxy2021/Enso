param(
    [string]$InputPath = "C:\Users\Administrator\AppData\Local\Temp\enso-doc-scan.json",
    [string]$OutputPath = "C:\Users\Administrator\AppData\Local\Temp\enso-doc-classified.json"
)

Write-Host "Reading scan data from: $InputPath"
$raw = [System.IO.File]::ReadAllText($InputPath)
Write-Host "Parsing JSON..."
$files = $raw | ConvertFrom-Json
$raw = $null
[GC]::Collect()

$total = $files.Count
Write-Host "Total files to classify: $total"

$now = Get-Date

# Build filename occurrence map for duplicate detection
Write-Host "Building duplicate detection map..."
$nameMap = @{}
foreach ($f in $files) {
    $key = $f.filename.ToLower()
    if (-not $nameMap.ContainsKey($key)) { $nameMap[$key] = 0 }
    $nameMap[$key]++
}
$dupNames = @{}
foreach ($kv in $nameMap.GetEnumerator()) {
    if ($kv.Value -ge 2) { $dupNames[$kv.Key] = $kv.Value }
}
Write-Host "Found $($dupNames.Count) duplicate filenames"

# Classification function
function Classify-File($file) {
    $path = $file.path.ToLower()
    $name = $file.filename.ToLower()
    $ext = $file.extension.ToLower()
    $tags = [System.Collections.Generic.List[string]]::new()

    # --- CATEGORY ---
    $category = "Other"

    # Finance keywords
    if ($name -match "(invoice|receipt|tax|budget|payroll|expense|billing|ledger|bank|financial|accounting|fiscal|salary|profit|loss|balance.sheet)") {
        $category = "Finance"
        if ($name -match "invoice") { $tags.Add("invoice") }
        if ($name -match "receipt") { $tags.Add("receipt") }
        if ($name -match "tax") { $tags.Add("tax") }
        if ($name -match "budget") { $tags.Add("budget") }
        if ($name -match "bank") { $tags.Add("bank") }
    }
    elseif ($path -match "([\\/]financ|[\\/]accounting|[\\/]invoices|[\\/]receipts|[\\/]tax|[\\/]budget|[\\/]billing)") {
        $category = "Finance"
    }
    # Legal
    elseif ($name -match "(contract|agreement|terms|nda|lease|legal|compliance|deed|notari|warrant|affidavit|litigation)") {
        $category = "Legal"
        if ($name -match "contract") { $tags.Add("contract") }
        if ($name -match "agreement") { $tags.Add("agreement") }
        if ($name -match "nda") { $tags.Add("nda") }
        if ($name -match "lease") { $tags.Add("lease") }
    }
    elseif ($path -match "([\\/]legal|[\\/]contracts|[\\/]agreements|[\\/]compliance)") {
        $category = "Legal"
    }
    # Work/Projects
    elseif ($name -match "(report|proposal|presentation|spec|brief|meeting|minutes|agenda|memo|roadmap|strategy|quarterly|annual.report)") {
        $category = "Work/Projects"
        if ($name -match "report") { $tags.Add("report") }
        if ($name -match "proposal") { $tags.Add("proposal") }
        if ($name -match "presentation|slides|deck") { $tags.Add("presentation") }
        if ($name -match "meeting|minutes") { $tags.Add("meeting") }
    }
    elseif ($path -match "([\\/]work|[\\/]projects?|[\\/]office|[\\/]business|[\\/]clients?|[\\/]team)") {
        $category = "Work/Projects"
    }
    elseif ($ext -eq ".ppt" -or $ext -eq ".pptx") {
        $category = "Work/Projects"
        $tags.Add("presentation")
    }
    elseif (($ext -eq ".doc" -or $ext -eq ".docx") -and $category -eq "Other") {
        $category = "Work/Projects"
    }
    elseif (($ext -eq ".xls" -or $ext -eq ".xlsx") -and $category -eq "Other") {
        $category = "Work/Projects"
        $tags.Add("spreadsheet")
    }
    # Personal
    elseif ($name -match "(journal|diary|personal|letter|resume|cv|passport|birth.cert|photo.?caption|notes)") {
        $category = "Personal"
        if ($name -match "resume|cv") { $tags.Add("resume") }
        if ($name -match "journal|diary") { $tags.Add("journal") }
    }
    elseif ($path -match "([\\/]personal|[\\/]desktop|[\\/]downloads|[\\/]my.doc|[\\/]onedrive[\\/]documents)") {
        $category = "Personal"
    }
    elseif ($ext -eq ".eml" -or $ext -eq ".msg") {
        $category = "Personal"
        $tags.Add("email")
    }
    # Media
    elseif ($name -match "(playlist|subtitle|\.srt|metadata|album|track|podcast)") {
        $category = "Media"
    }
    elseif ($path -match "([\\/]media|[\\/]music|[\\/]video|[\\/]audio|[\\/]photos?|[\\/]pictures?)") {
        $category = "Media"
    }
    # Reference
    elseif ($name -match "(manual|guide|documentation|handbook|tutorial|ebook|reference|faq|howto|readme|changelog|license|contributing)") {
        $category = "Reference"
        if ($name -match "readme") { $tags.Add("readme") }
        if ($name -match "changelog") { $tags.Add("changelog") }
        if ($name -match "license") { $tags.Add("license") }
    }
    elseif ($ext -eq ".md" -and $category -eq "Other") {
        $category = "Reference"
        $tags.Add("markdown")
    }
    # Archive
    elseif ($name -match "(backup|\.bak|archive|old_|_old|deprecated|legacy)") {
        $category = "Archive"
        $tags.Add("archive")
    }
    elseif ($path -match "([\\/]archive|[\\/]backup|[\\/]old[\\/]|[\\/]legacy|[\\/]deprecated)") {
        $category = "Archive"
        $tags.Add("archive")
    }
    # Data/Config
    elseif ($ext -eq ".csv" -or $ext -eq ".json" -or $ext -eq ".xml") {
        $category = "Data/Config"
        if ($ext -eq ".csv") { $tags.Add("data") }
        if ($ext -eq ".json") { $tags.Add("json") }
        if ($ext -eq ".xml") { $tags.Add("xml") }
        if ($name -match "(config|setting|preference|manifest|package\.json|tsconfig|\.eslint|\.prettier)") {
            $tags.Add("config")
        }
    }
    elseif ($ext -eq ".html" -or $ext -eq ".htm") {
        if ($path -match "([\\/]doc|[\\/]help|[\\/]api|[\\/]reference)") {
            $category = "Reference"
        } else {
            $category = "Data/Config"
            $tags.Add("html")
        }
    }

    # Add extension tag
    $tags.Add($ext.TrimStart('.'))

    # --- AGE CATEGORY ---
    $ageCategory = "archive"
    try {
        $modified = [DateTime]::Parse($file.lastModified)
        $daysDiff = ($now - $modified).TotalDays
        if ($daysDiff -lt 30) { $ageCategory = "recent" }
        elseif ($daysDiff -lt 365) { $ageCategory = "current" }
        elseif ($daysDiff -lt 1825) { $ageCategory = "old" }
        else { $ageCategory = "archive" }
    } catch {}

    # --- SIZE BUCKET ---
    $size = $file.sizeBytes
    $sizeBucket = "medium"
    if ($size -lt 10240) { $sizeBucket = "tiny" }
    elseif ($size -lt 102400) { $sizeBucket = "small" }
    elseif ($size -lt 1048576) { $sizeBucket = "medium" }
    elseif ($size -lt 10485760) { $sizeBucket = "large" }
    else { $sizeBucket = "huge" }

    # --- DUPLICATE ---
    $isDup = $dupNames.ContainsKey($file.filename.ToLower())

    return @{
        category = $category
        tags = $tags.ToArray()
        ageCategory = $ageCategory
        sizeBucket = $sizeBucket
        isLikelyDuplicate = $isDup
    }
}

# Process all files
Write-Host "Classifying files..."
$classified = [System.Collections.Generic.List[object]]::new()
$catCounts = @{}
$catSizes = @{}
$extCounts = @{}
$drvCounts = @{}
$drvSizes = @{}
$ageCounts = @{}
$sizeBucketCounts = @{}
$dupCount = 0
$count = 0

foreach ($file in $files) {
    $count++
    if ($count % 10000 -eq 0) {
        Write-Host "  Classified $count / $total..."
    }

    $cls = Classify-File $file

    $entry = [ordered]@{
        path = $file.path
        filename = $file.filename
        extension = $file.extension
        sizeBytes = $file.sizeBytes
        lastModified = $file.lastModified
        drive = $file.drive
        topFolder = $file.topFolder
        category = $cls.category
        tags = $cls.tags
        ageCategory = $cls.ageCategory
        sizeBucket = $cls.sizeBucket
        isLikelyDuplicate = $cls.isLikelyDuplicate
    }
    $classified.Add($entry)

    # Accumulate stats
    $cat = $cls.category
    if (-not $catCounts.ContainsKey($cat)) { $catCounts[$cat] = 0; $catSizes[$cat] = [long]0 }
    $catCounts[$cat]++
    $catSizes[$cat] += $file.sizeBytes

    $e = $file.extension
    if (-not $extCounts.ContainsKey($e)) { $extCounts[$e] = 0 }
    $extCounts[$e]++

    $d = $file.drive
    if (-not $drvCounts.ContainsKey($d)) { $drvCounts[$d] = 0; $drvSizes[$d] = [long]0 }
    $drvCounts[$d]++
    $drvSizes[$d] += $file.sizeBytes

    $age = $cls.ageCategory
    if (-not $ageCounts.ContainsKey($age)) { $ageCounts[$age] = 0 }
    $ageCounts[$age]++

    $sb = $cls.sizeBucket
    if (-not $sizeBucketCounts.ContainsKey($sb)) { $sizeBucketCounts[$sb] = 0 }
    $sizeBucketCounts[$sb]++

    if ($cls.isLikelyDuplicate) { $dupCount++ }
}

Write-Host "Building summary stats..."

# Build summary
$summary = [ordered]@{
    totalFiles = $total
    totalSizeBytes = 0
    drivesScanned = @($drvCounts.Keys | Sort-Object)
    scanDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
    countsByCategory = [ordered]@{}
    sizeByCategory = [ordered]@{}
    countsByExtension = [ordered]@{}
    countsByDrive = [ordered]@{}
    sizeByDrive = [ordered]@{}
    countsByAgeCategory = [ordered]@{}
    countsBySizeBucket = [ordered]@{}
    duplicateFileCount = $dupCount
    uniqueDuplicateNames = $dupNames.Count
}

$totalSize = [long]0
foreach ($f in $files) { $totalSize += $f.sizeBytes }
$summary.totalSizeBytes = $totalSize

foreach ($k in ($catCounts.Keys | Sort-Object)) {
    $summary.countsByCategory[$k] = $catCounts[$k]
    $summary.sizeByCategory[$k] = $catSizes[$k]
}
foreach ($k in ($extCounts.Keys | Sort-Object)) {
    $summary.countsByExtension[$k] = $extCounts[$k]
}
foreach ($k in ($drvCounts.Keys | Sort-Object)) {
    $summary.countsByDrive[$k] = $drvCounts[$k]
    $summary.sizeByDrive[$k] = $drvSizes[$k]
}
foreach ($k in ("recent","current","old","archive")) {
    if ($ageCounts.ContainsKey($k)) { $summary.countsByAgeCategory[$k] = $ageCounts[$k] }
}
foreach ($k in ("tiny","small","medium","large","huge")) {
    if ($sizeBucketCounts.ContainsKey($k)) { $summary.countsBySizeBucket[$k] = $sizeBucketCounts[$k] }
}

# Output
$result = [ordered]@{
    summary = $summary
    files = $classified.ToArray()
}

Write-Host "Writing output to: $OutputPath"
$json = $result | ConvertTo-Json -Depth 5 -Compress
[System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.Encoding]::UTF8)
$outSize = [math]::Round((Get-Item $OutputPath).Length / 1MB, 2)
Write-Host "Output: $OutputPath ($outSize MB)"

Write-Host ""
Write-Host "=== CLASSIFICATION SUMMARY ==="
Write-Host "Total files: $total"
Write-Host "Total size: $([math]::Round($totalSize / 1GB, 2)) GB"
Write-Host ""
Write-Host "By Category:"
foreach ($k in ($catCounts.Keys | Sort-Object)) {
    $pct = [math]::Round(($catCounts[$k] / $total) * 100, 1)
    $sizeMB = [math]::Round($catSizes[$k] / 1MB, 1)
    Write-Host "  $k`: $($catCounts[$k]) files ($pct%) - $sizeMB MB"
}
Write-Host ""
Write-Host "By Age:"
foreach ($k in ("recent","current","old","archive")) {
    if ($ageCounts.ContainsKey($k)) {
        Write-Host "  $k`: $($ageCounts[$k]) files"
    }
}
Write-Host ""
Write-Host "By Size Bucket:"
foreach ($k in ("tiny","small","medium","large","huge")) {
    if ($sizeBucketCounts.ContainsKey($k)) {
        Write-Host "  $k`: $($sizeBucketCounts[$k]) files"
    }
}
Write-Host ""
Write-Host "Duplicate filenames: $($dupNames.Count) names ($dupCount files)"
