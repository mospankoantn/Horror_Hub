$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$data = Join-Path $root 'storage\test-db'
$php = 'C:\xampp\php\php.exe'
$mysql = 'C:\xampp\mysql\bin'
foreach ($port in @(3311, 9876)) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    try { $listener.Start() } catch { throw ('Test port is occupied: ' + $port) } finally { $listener.Stop() }
}
if (!(Test-Path -LiteralPath (Join-Path $data 'my.ini'))) {
    & (Join-Path $mysql 'mysql_install_db.exe') ('--datadir=' + $data) '--port=3311'
    if ($LASTEXITCODE -ne 0) { throw 'Test database initialization failed.' }
}
$database = $null
$server = $null
try {
    $database = Start-Process (Join-Path $mysql 'mysqld.exe') -ArgumentList ('--defaults-file="' + (Join-Path $data 'my.ini') + '" --bind-address=127.0.0.1 --console') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardInput (Join-Path $root 'README.md') -RedirectStandardOutput (Join-Path $data 'out.log') -RedirectStandardError (Join-Path $data 'error.log')
    for ($i = 0; $i -lt 30; $i++) {
        & (Join-Path $mysql 'mysqladmin.exe') --no-defaults -h 127.0.0.1 -P 3311 -u root ping 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Milliseconds 200
    }
    & $php tests/db_fixture.php init
    if ($LASTEXITCODE -ne 0) { throw 'Test schema failed.' }
    $env:HORROR_HUB_DB_HOST = '127.0.0.1'
    $env:HORROR_HUB_DB_PORT = '3311'
    $env:HORROR_HUB_DB_NAME = 'horror_hub_test'
    $env:HORROR_HUB_DB_USER = 'root'
    $env:HORROR_HUB_DB_PASSWORD = ''
    $server = Start-Process $php -ArgumentList ('-S 127.0.0.1:9876 -t "' + $root + '" "' + (Join-Path $root 'dev\router.php') + '"') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardInput (Join-Path $root 'README.md') -RedirectStandardOutput (Join-Path $data 'php.out.log') -RedirectStandardError (Join-Path $data 'php.error.log')
    Start-Sleep -Milliseconds 500
    node tests/backend.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed.' }
} finally {
    if ($server) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
    if ($database) {
        & (Join-Path $mysql 'mysqladmin.exe') --no-defaults -h 127.0.0.1 -P 3311 -u root shutdown 2>$null | Out-Null
        $database.WaitForExit(5000) | Out-Null
        if (!$database.HasExited) { Stop-Process -Id $database.Id -ErrorAction SilentlyContinue }
    }
}
