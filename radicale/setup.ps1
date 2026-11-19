$ErrorActionPreference = 'Stop'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

$pythonCommand = Get-Command py -ErrorAction SilentlyContinue
if ($pythonCommand) {
    & py -3 --version
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.9 or later is required. Install Python from python.org and enable Add Python to PATH.' }
    & py -3 -m venv .radicale-venv
} else {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) { throw 'Python 3.9 or later is required. Install Python from python.org and enable Add Python to PATH.' }
    & python --version
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.9 or later is required.' }
    & python -m venv .radicale-venv
}
if ($LASTEXITCODE -ne 0) { throw 'Could not create the Radicale virtual environment.' }

$venvPython = Join-Path $projectRoot '.radicale-venv\Scripts\python.exe'
& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Could not update pip in the isolated Radicale environment.' }
& $venvPython -m pip install -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Could not install Radicale.' }
& $venvPython (Join-Path $PSScriptRoot 'setup.py')
if ($LASTEXITCODE -ne 0) { throw 'Could not configure the local Radicale account.' }

Write-Host ''
Write-Host 'Radicale setup complete. Start it with: .\radicale\start.ps1'
