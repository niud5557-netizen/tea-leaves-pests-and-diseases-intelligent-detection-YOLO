$Root = Split-Path -Parent $PSScriptRoot
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -like "*$Root*server.mjs*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host 'AI茶查查服务已停止。'
