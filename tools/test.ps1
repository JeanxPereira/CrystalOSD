[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Mandatory, ValueFromRemainingArguments)][string[]]$Labels,
    [string]$Preset = 'tests-debug',
    [int]$Jobs = 4,
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$known = 'clock', 'menus', 'opening', 'cold', 'assets', 'audio', 'parity', 'render', 'fast', 'slow'
foreach ($l in $Labels) { if ($l -notin $known) { throw "unknown label '$l' (known: $($known -join ' '))" } }

$root = Split-Path $PSScriptRoot
$build = Join-Path $root 'build/tests'
$config = if ($Preset -like '*release') { 'Release' } else { 'Debug' }
$buildScript = Join-Path $PSScriptRoot 'build.ps1'
if (-not (Test-Path (Join-Path $build 'CMakeCache.txt'))) { throw 'configure first: tools/build.ps1 configure tests' }

function Invoke-Ctest([string[]]$CtestArgs) {
    Push-Location $build
    try { & ctest -C $config @CtestArgs } finally { Pop-Location }
}

$labelArgs = @(); foreach ($l in $Labels) { $labelArgs += '-L', "^$l$" }
$json = (Invoke-Ctest (@('--show-only=json-v1') + $labelArgs)) -join "`n" | ConvertFrom-Json
$all = (Invoke-Ctest @('--show-only=json-v1')) -join "`n" | ConvertFrom-Json
$selected = @($json.tests)
if ($selected.Count -eq 0) { Write-Host "no tests carry labels: $($Labels -join ' ')"; exit 1 }

function Get-Prop($test, $name) { ($test.properties | Where-Object name -eq $name | Select-Object -First 1).value }
$needed = @{}
foreach ($t in $selected) { foreach ($f in @(Get-Prop $t 'FIXTURES_REQUIRED')) { if ($f) { $needed[$f] = $true } } }
$closure = @($selected)
foreach ($t in $all.tests) {
    $setup = @(Get-Prop $t 'FIXTURES_SETUP') + @(Get-Prop $t 'FIXTURES_CLEANUP')
    if ($setup | Where-Object { $_ -and $needed.ContainsKey($_) }) { $closure += $t }
}

$targets = [ordered]@{}
$binPattern = [regex]'[\\/]bin[\\/]([A-Za-z0-9_]+)\.exe$'
foreach ($t in $closure) {
    foreach ($part in $t.command) {
        $text = "$part"
        foreach ($piece in ($text -split '[=;]')) {
            $m = $binPattern.Match($piece)
            if ($m.Success) { $targets[$m.Groups[1].Value] = $true }
        }
    }
}
$targets.Remove('CrystalClock')
$targets.Remove('cmake')
$targets.Remove('node')

if (-not $NoBuild -and $targets.Count -gt 0) {
    Write-Host "build: $($targets.Count) targets"
    $buildArgs = @('--target') + @($targets.Keys)
    $log = & $buildScript build $Preset @buildArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        $log | Where-Object { $_ -match 'error|FAILED' } | Select-Object -First 12 | ForEach-Object { Write-Host $_ }
        Write-Host 'FAIL build'
        exit 1
    }
}

$started = Get-Date
$out = Invoke-Ctest (@('-j', $Jobs, '--output-on-failure') + $labelArgs)
$code = $LASTEXITCODE
$lines = $out | Where-Object { $_ -match '^\s*\d+/\d+ Test\s+#' }
$lines | ForEach-Object { ($_ -replace '^\s*\d+/\d+ Test\s+#\d+:\s*', '' -replace '\.{3,}', ' ' -replace '\s+', ' ').Trim() }
$failedBlocks = $out | Where-Object { $_ -notmatch '^\s*\d+/\d+ Test\s+#' -and $_ -notmatch '^\s*Start\s+\d+:' }
if ($code -ne 0) { $failedBlocks | Select-Object -First 60 | ForEach-Object { Write-Host $_ } }
$passed = @($lines | Where-Object { $_ -match 'Passed' }).Count
$skipped = @($lines | Where-Object { $_ -match 'Skipped|Not Run' }).Count
$failed = @($lines).Count - $passed - $skipped
$seconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
Write-Host "TOTAL [$($Labels -join ' ')]: $passed passed, $failed failed, $skipped skipped of $(@($lines).Count) in $seconds s"
exit $(if ($failed -gt 0) { 1 } else { 0 })
