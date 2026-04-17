[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$raw = Get-Content 'C:\Users\Administrator\.enso\data\entity-index.json' -Raw -Encoding UTF8
$idx = $raw | ConvertFrom-Json
$books = @()
$idx.PSObject.Properties | ForEach-Object {
  $e = $_.Value
  if ($e.type -eq 'book') {
    $r = 0
    try { if ($e.metadata -and $e.metadata.rating) { $r = [double]$e.metadata.rating } } catch {}
    $a = ''
    if ($e.metadata -and $e.metadata.author) { $a = [string]$e.metadata.author }
    $books += [PSCustomObject]@{
      rating = $r
      source = $e.source
      title = $e.title
      entityId = $e.entityId
      author = $a
    }
  }
}

Write-Host '=== Source counts ==='
$books | Group-Object source | Sort-Object Count -Descending | ForEach-Object { "$($_.Count) | $($_.Name)" }

Write-Host ''
Write-Host '=== Top 20 with non-zero rating (non-research) ==='
$books | Where-Object { $_.rating -gt 0 -and $_.source -ne 'research' } | Sort-Object rating -Descending | Select-Object -First 20 | ForEach-Object {
  $line = "{0} | {1} | {2} | {3}" -f $_.rating, $_.source, $_.title, $_.author
  Write-Host $line
  Write-Host "    id=$($_.entityId)"
}
