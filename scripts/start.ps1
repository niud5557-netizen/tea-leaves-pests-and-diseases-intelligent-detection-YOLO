$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Node = 'node'
$BundledNode = 'C:\Users\刁金生\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (Test-Path -LiteralPath $BundledNode) { $Node = $BundledNode }
$env:PORT = if ($env:PORT) { $env:PORT } else { '8080' }
$env:HOST = if ($env:HOST) { $env:HOST } else { '127.0.0.1' }
$env:ANALYZER_MODE = if ($env:ANALYZER_MODE) { $env:ANALYZER_MODE } else { 'model' }
$env:PYTHON_PATH = Join-Path $Root '.venv\Scripts\python.exe'
$LogDir = Join-Path $Root 'data\logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Out = Join-Path $LogDir 'server.out.log'
$Err = Join-Path $LogDir 'server.err.log'
$Existing = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*$Root*server.mjs*" }
if (-not $Existing) {
  Start-Process -FilePath $Node -ArgumentList 'server.mjs' -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $Out -RedirectStandardError $Err
}
Start-Sleep -Seconds 2
Write-Host "AI茶查查服务：http://127.0.0.1:$($env:PORT)/manager/"
Write-Host "移动网页端：http://127.0.0.1:$($env:PORT)/mobile/"
