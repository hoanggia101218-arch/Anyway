# Copies the latest output/ (source of truth, in the shared Drive) into this
# Capacitor project's www/ folder, then re-syncs both native platforms.
# Run this any time output/ changes and you want the iOS/Android wrapper updated.

$ErrorActionPreference = "Stop"
$outputSrc = "G:\マイドライブ\nexora game pram\output"
$wwwDest = Join-Path $PSScriptRoot "www"

Write-Host "Copying $outputSrc -> $wwwDest ..."
Copy-Item -Path (Join-Path $outputSrc "*") -Destination $wwwDest -Recurse -Force

Write-Host "Running npx cap sync ..."
Push-Location $PSScriptRoot
npx cap sync
Pop-Location

Write-Host "Done."
