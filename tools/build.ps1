param(
    [Parameter(Mandatory)][ValidateSet('configure', 'build', 'test')][string]$Action,
    [Parameter(Mandatory)][string]$Preset,
    [Parameter(ValueFromRemainingArguments)][string[]]$Forward
)

$ErrorActionPreference = 'Stop'
if (-not $env:VSCMD_VER) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    $env:PATH = "$(Split-Path $vswhere);$env:PATH"
    $install = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $install) { throw 'Visual Studio with the C++ tools was not found' }
    & (Join-Path $install 'Common7\Tools\Launch-VsDevShell.ps1') -Arch amd64 -HostArch amd64 -SkipAutomaticLocation | Out-Null
}

if ($env:VSINSTALLDIR) { $install = $env:VSINSTALLDIR }
$ninja = Join-Path $install 'Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja'
if (Test-Path $ninja) { $env:PATH = "$ninja;$env:PATH" }

Push-Location (Split-Path $PSScriptRoot)
try {
    switch ($Action) {
        'configure' { cmake --preset $Preset @Forward }
        'build' { cmake --build --preset $Preset @Forward }
        'test' { ctest --preset $Preset @Forward }
    }
    exit $LASTEXITCODE
}
finally { Pop-Location }
