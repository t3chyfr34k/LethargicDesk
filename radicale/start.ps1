$ErrorActionPreference = 'Stop'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot
$radicalePython = Join-Path $projectRoot '.radicale-venv\Scripts\python.exe'
$configPath = Join-Path $projectRoot '.radicale-data\config'
if (-not (Test-Path -LiteralPath $radicalePython)) { throw 'Radicale is not installed. Run .\radicale\setup.ps1 first.' }
if (-not (Test-Path -LiteralPath $configPath)) { throw 'Radicale is not configured. Run .\radicale\setup.ps1 first.' }
& $radicalePython -m radicale --config $configPath
