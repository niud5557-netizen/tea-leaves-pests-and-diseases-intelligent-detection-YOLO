$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Node = 'node'
$BundledNode = 'C:\Users\刁金生\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (Test-Path -LiteralPath $BundledNode) { $Node = $BundledNode }
$env:PORT = if ($env:PORT) { $env:PORT } else { '8080' }
$env:HOST = if ($env:HOST) { $env:HOST } else { '0.0.0.0' }
$env:ANALYZER_MODE = if ($env:ANALYZER_MODE) { $env:ANALYZER_MODE } else { 'model' }
$env:PYTHON_PATH = Join-Path $Root '.venv\Scripts\python.exe'
$LogDir = Join-Path $Root 'data\logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Out = Join-Path $LogDir 'server.out.log'
$Err = Join-Path $LogDir 'server.err.log'
$PidFile = Join-Path $Root 'data\server.pid'
$Existing = $null
if (Test-Path -LiteralPath $PidFile) {
  $SavedPid = Get-Content -LiteralPath $PidFile -Raw -ErrorAction SilentlyContinue
  if ($SavedPid -and (Get-Process -Id ([int]$SavedPid.Trim()) -ErrorAction SilentlyContinue)) {
    $Existing = Get-Process -Id ([int]$SavedPid.Trim())
  }
}
if (-not $Existing) {
  $Process = Start-Process -FilePath $Node -ArgumentList 'server.mjs' -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $Out -RedirectStandardError $Err -PassThru
  Set-Content -LiteralPath $PidFile -Value $Process.Id -NoNewline -Encoding ascii
}
Start-Sleep -Seconds 2
$LanAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1 -ExpandProperty IPAddress
if (-not $LanAddress) { $LanAddress = '127.0.0.1' }
Write-Host "AI Tea Check: http://127.0.0.1:$($env:PORT)/manager/"
Write-Host "Mobile site: http://127.0.0.1:$($env:PORT)/mobile/"
Write-Host "WeChat real-device API: http://${LanAddress}:$($env:PORT)"
