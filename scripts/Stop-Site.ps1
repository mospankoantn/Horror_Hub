$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $root 'storage\runtime\server.json'
if (!(Test-Path -LiteralPath $stateFile)) { Write-Output 'Site is not running.'; exit 0 }
$saved = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
$process = Get-Process -Id ([int]$saved.pid) -ErrorAction SilentlyContinue
$router = Join-Path $root 'dev\router.php'
if ($process -and $process.ProcessName -eq 'php' -and $saved.router -eq $router -and $saved.executable -eq $process.Path -and $saved.started -eq $process.StartTime.ToUniversalTime().ToString('o')) {
    Stop-Process -Id $process.Id
    Write-Output 'Site stopped.'
} elseif ($process) { throw 'The saved process is not this site. It was not stopped.' }
Remove-Item -LiteralPath $stateFile
