$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $projectRoot ".env.local"
$python = Join-Path $projectRoot ".venv-owner-intelligence\Scripts\python.exe"
$allowed = @(
  "AA_OWNER_ENGINE_KEY",
  "AA_OWNER_DB_HOST",
  "AA_OWNER_DB_PORT",
  "AA_OWNER_DB_NAME",
  "AA_OWNER_DB_USER",
  "AA_OWNER_DB_PASSWORD"
)

if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Project .env.local file is missing."
}
if (-not (Test-Path -LiteralPath $python)) {
  throw "Python service dependencies are not installed in .venv-owner-intelligence."
}

foreach ($line in Get-Content -LiteralPath $envFile) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
    $name = $Matches[1]
    if ($allowed -contains $name) {
      $value = $Matches[2]
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

Push-Location (Join-Path $projectRoot "python-services\owner-intelligence")
try {
  & $python -m uvicorn main:app --host 127.0.0.1 --port 8100
} finally {
  Pop-Location
}
