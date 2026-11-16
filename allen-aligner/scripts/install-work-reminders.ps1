$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$runner = Join-Path $PSScriptRoot 'work-reminders.cjs'
$quotedNode = $nodePath.Replace("'", "''")
$quotedRunner = $runner.Replace("'", "''")
$command = "& '$quotedNode' '$quotedRunner'; exit `$LASTEXITCODE"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -Command "' + $command + '"') -WorkingDirectory $projectDirectory
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'AllenAligner-EmployeeWorkReminders' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Hourly Allen Aligner missing work report reminders and assigned manager escalations.' -Force | Select-Object TaskName,State
