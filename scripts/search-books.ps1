param([string]$Query = '')
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$raw = Get-Content 'C:\Users\Administrator\.enso\data\entity-index.json' -Raw -Encoding UTF8
$idx = $raw | ConvertFrom-Json
$idx.PSObject.Properties | ForEach-Object {
  $e = $_.Value
  if ($e.type -eq 'book' -and $e.source -ne 'research') {
    $title = [string]$e.title
    if ($Query -eq '' -or $title.ToLower() -like "*$($Query.ToLower())*") {
      $a = ''
      if ($e.metadata -and $e.metadata.author) { $a = [string]$e.metadata.author }
      Write-Host ("{0} | {1} | {2}" -f $e.source, $title, $a)
      Write-Host "    id=$($e.entityId)"
    }
  }
}
