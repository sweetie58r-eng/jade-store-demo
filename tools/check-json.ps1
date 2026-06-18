$ErrorActionPreference = "Stop"

$jsonFiles = Get-ChildItem -Path "assets/resources/config" -Filter "*.json" -Recurse

foreach ($file in $jsonFiles) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  $null = $content | ConvertFrom-Json
  Write-Output "OK $($file.FullName)"
}
