param([switch]$Docker)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$workDir = Join-Path $projectRoot 'work'
New-Item -ItemType Directory -Path $workDir -Force | Out-Null
$env:GOPATH = Join-Path $workDir 'gopath'
$env:GOCACHE = Join-Path $workDir 'gocache'
$env:GOTELEMETRY = 'off'
$env:TEMP = $workDir
$env:TMP = $workDir
$env:npm_config_cache = Join-Path $workDir 'npm-cache'
$goCommand = Get-Command go -ErrorAction SilentlyContinue
$goExe = if ($goCommand) { $goCommand.Source } else { Join-Path $workDir 'tools\go\bin\go.exe' }
if (-not (Test-Path -LiteralPath $goExe)) { throw 'Install Go >=1.26 or use the portable Go tool in work/tools/go.' }
function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable $Arguments failed with exit code $LASTEXITCODE" }
}
Start-Transcript -Path (Join-Path $workDir 'validation-local.log') -Force | Out-Null
try {
    Push-Location (Join-Path $projectRoot 'go-api')
    try {
        Invoke-Checked $goExe @('test', '-count=1', '-coverprofile=../work/go-coverage.out', './...')
        Invoke-Checked $goExe @('vet', './...')
        Invoke-Checked $goExe @('build', '-o', '../work/bin/go-api.exe', './cmd/server')
    } finally { Pop-Location }
    Push-Location (Join-Path $projectRoot 'node-api')
    try {
        Invoke-Checked 'npm.cmd' @('ci', '--no-fund', '--no-audit')
        Invoke-Checked 'npm.cmd' @('run', 'test:coverage')
        Invoke-Checked 'npm.cmd' @('run', 'build')
        Invoke-Checked 'npm.cmd' @('run', 'lint')
        Invoke-Checked 'npm.cmd' @('audit')
    } finally { Pop-Location }
    Push-Location (Join-Path $projectRoot 'frontend')
    try {
        Invoke-Checked 'npm.cmd' @('ci', '--no-fund', '--no-audit')
        Invoke-Checked 'npm.cmd' @('test')
        Invoke-Checked 'npm.cmd' @('run', 'build')
        Invoke-Checked 'npm.cmd' @('run', 'lint')
        Invoke-Checked 'npm.cmd' @('audit')
    } finally { Pop-Location }
    Push-Location $projectRoot
    try {
        Invoke-Checked 'node' @('scripts/run-local-e2e.mjs')
        if ($Docker) {
            Invoke-Checked 'docker' @('compose', 'config', '--quiet')
            Invoke-Checked 'docker' @('compose', 'up', '--build', '--wait', '--wait-timeout', '120')
            try {
                Invoke-Checked 'node' @('--test', 'tests/e2e.test.mjs')
                Invoke-Checked 'node' @('--test', 'tests/web.test.mjs')
            }
            finally { Invoke-Checked 'docker' @('compose', 'down') }
        }
    } finally { Pop-Location }
} finally { Stop-Transcript | Out-Null }
