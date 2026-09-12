$Root = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $Root 'data\server.pid'
if (Test-Path -LiteralPath $PidFile) {
  $SavedPid = Get-Content -LiteralPath $PidFile -Raw -ErrorAction SilentlyContinue
  if ($SavedPid) { Stop-Process -Id ([int]$SavedPid.Trim()) -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}
Write-Host 'AI Tea Check service stopped.'
