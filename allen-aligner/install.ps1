$stageRoot = [System.IO.Path]::GetFullPath('C:\Users\NZ\Documents\Codex\2026-10-31\realtime-voice-chat-2\work\audit-module').TrimEnd('\')
$stagePrefix = $stageRoot + '\'
$projectRoot = [System.IO.Path]::GetFullPath('C:\Users\NZ\Desktop\AllenAligner\allen-aligner').TrimEnd('\')
$projectPrefix = $projectRoot + '\'
foreach ($file in Get-ChildItem -LiteralPath $stageRoot -Recurse -File) {
  $sourcePath = [System.IO.Path]::GetFullPath($file.FullName)
  if (-not $sourcePath.StartsWith($stagePrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Source escaped the staging directory.' }
  $relative = $sourcePath.Substring($stagePrefix.Length)
  $destination = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
  if (-not $destination.StartsWith($projectPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Destination escaped the project directory.' }
  $parent = Split-Path -Parent $destination
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $destination -Force
}
