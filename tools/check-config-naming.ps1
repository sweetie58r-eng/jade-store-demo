$ErrorActionPreference = "Stop"

$allowedTextKeys = @("displayName", "shortDisplayName", "description")
$errors = New-Object System.Collections.Generic.List[string]

function Test-AsciiString {
  param([string] $Value)
  return -not ($Value -match "[^\x00-\x7F]")
}

function Test-JsonNode {
  param(
    [object] $Node,
    [string] $Path,
    [string] $ParentKey,
    [bool] $AllowTextValues
  )

  if ($null -eq $Node) {
    return
  }

  if ($Node -is [string]) {
    if (-not (Test-AsciiString $Node) -and -not $AllowTextValues -and -not ($allowedTextKeys -contains $ParentKey)) {
      $errors.Add("Non-ASCII value outside display text at $Path")
    }
    return
  }

  if ($Node -is [System.Collections.IEnumerable] -and -not ($Node -is [string])) {
    $index = 0
    foreach ($item in $Node) {
      Test-JsonNode -Node $item -Path "$Path[$index]" -ParentKey $ParentKey -AllowTextValues $AllowTextValues
      $index += 1
    }
    return
  }

  if ($Node.PSObject.Properties.Count -gt 0) {
    foreach ($property in $Node.PSObject.Properties) {
      $key = $property.Name
      $childPath = if ($Path) { "$Path.$key" } else { $key }

      if ($key -eq "name") {
        $errors.Add("Forbidden key 'name' at $childPath; use displayName instead")
      }

      if (-not (Test-AsciiString $key)) {
        $errors.Add("Non-ASCII config key at $childPath")
      }

      Test-JsonNode -Node $property.Value -Path $childPath -ParentKey $key -AllowTextValues $AllowTextValues
    }
  }
}

$jsonFiles = Get-ChildItem -Path "assets/resources/config" -Filter "*.json" -Recurse

foreach ($file in $jsonFiles) {
  $json = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  $allowTextValues = $file.Name -eq "text_config.json"
  Test-JsonNode -Node $json -Path $file.FullName -ParentKey "" -AllowTextValues $allowTextValues
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "OK config naming rules"
