$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$logDirectory = Join-Path $projectDirectory '.private/work-reporting'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
& node (Join-Path $PSScriptRoot 'work-reminders.cjs') *> (Join-Path $logDirectory 'last-reminder-run.log')
exit $LASTEXITCODE
