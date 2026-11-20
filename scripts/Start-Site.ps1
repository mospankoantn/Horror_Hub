param([int]$Port = 8765, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$router = Join-Path $root 'dev\router.php'
$runtime = Join-Path $root 'storage\runtime'
$stateFile = Join-Path $runtime 'server.json'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$candidates = @($env:HORROR_HUB_PHP, 'C:\xampp\php\php.exe', (Join-Path (Split-Path -Parent (Split-Path -Parent $root)) 'php\php.exe'))
$command = Get-Command php -ErrorAction SilentlyContinue
if ($command) { $candidates += $command.Source }
$php = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (!$php) { throw 'PHP 8.1+ not found. Install XAMPP or set HORROR_HUB_PHP to php.exe.' }
$version = & $php -r 'echo PHP_VERSION_ID;'
if ([int]$version -lt 80100) { throw 'PHP 8.1+ is required.' }
$hasher = [Security.Cryptography.SHA256]::Create()
$rootHash = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($root)))).Replace('-', '').ToLowerInvariant()
$hasher.Dispose()
function Get-OwnServer($url) {
    try {
        $health = Invoke-RestMethod -Uri ($url + '/__health') -TimeoutSec 2
        return $health.site -eq 'horror-hub' -and $health.root -eq $rootHash
    } catch { return $false }
}
function Save-ServerState($process, $url) {
    @{ pid = $process.Id; url = $url; router = $router; executable = $process.Path; started = $process.StartTime.ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
}
if (Test-Path -LiteralPath $stateFile) {
    try {
        $saved = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
        if ($saved.url -match '^http://127\.0\.0\.1:\d+$' -and (Get-OwnServer $saved.url)) {
            $process = Get-Process -Id ([int]$saved.pid) -ErrorAction Stop
            if ($process.ProcessName -ne 'php') { throw 'Saved process does not match PHP.' }
            Save-ServerState $process $saved.url
            Write-Output $saved.url
            if (!$NoBrowser) { Start-Process $saved.url }
            exit 0
        }
    } catch { }
}
if ($Port -lt 1024 -or $Port -gt 65525) { throw 'Choose a port between 1024 and 65525.' }
while ($Port -le 65535) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    try { $listener.Start(); break } catch { $Port++ } finally { $listener.Stop() }
}
if ($Port -gt 65535) { throw 'No free port found.' }
$url = 'http://127.0.0.1:' + $Port
$arguments = '-d log_errors=1 -d error_log="' + (Join-Path $runtime 'server.error.log') + '" -S 127.0.0.1:' + $Port + ' -t "' + $root + '" "' + $router + '"'
$server = Start-Process -FilePath $php -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if (Get-OwnServer $url) {
        Save-ServerState $server $url
        Write-Output $url
        $modules = & $php -m
        if ($modules -notcontains 'pdo_mysql') { Write-Warning 'pdo_mysql is missing; accounts and comments need it.' }
        $connection = New-Object Net.Sockets.TcpClient
        try {
            $task = $connection.ConnectAsync('127.0.0.1', 3306)
            if (!$task.Wait(500) -or !$connection.Connected) { Write-Warning 'Start MySQL in XAMPP for accounts, comments and admin data. Articles and games work without it.' }
        } catch { Write-Warning 'MySQL is not running. Articles and games still work.' } finally { $connection.Dispose() }
        if (!$NoBrowser) { Start-Process ($url + '/index.html') }
        exit 0
    }
    $server.Refresh()
    if ($server.HasExited) { throw ('PHP failed to start. See ' + (Join-Path $runtime 'server.error.log')) }
    Start-Sleep -Milliseconds 200
}
Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
throw 'Server did not become ready. Check storage\runtime\server.error.log.'
