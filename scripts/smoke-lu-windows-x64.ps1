# Isolated Windows Actions smoke test for a Lu x86-64 NSIS development preview.
# Deliberately refuses to install anything on the user's own Windows machine.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $ArtifactDir,
    [Parameter(Mandatory = $true)][string] $ExpectedCommit,
    [switch] $ProbeStartup,
    [switch] $RequireNativeMcpFirstRun,
    [switch] $ProbeWorker
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'Lu NSIS smoke installation is permitted only in an ephemeral Windows GitHub Actions runner.'
}
if ($ExpectedCommit -notmatch '^[0-9a-f]{40}$') {
    throw 'ExpectedCommit must be the exact 40-character Git commit SHA.'
}

$artifactRoot = (Resolve-Path -LiteralPath $ArtifactDir -ErrorAction Stop).ProviderPath
$manifestFile = Join-Path $artifactRoot 'lu-windows-x64-build.json'
if (!(Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
    throw 'Missing Lu build provenance manifest.'
}
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ($manifest.application -cne 'Lu' -or $manifest.identity -cne 'ai.lu.preview' -or
    $manifest.architecture -cne 'x86_64-pc-windows-msvc' -or
    $manifest.installerType -cne 'nsis' -or $manifest.engineVariant -cne 'vulkan' -or
    $manifest.signedInstaller -ne $false -or $manifest.gitCommit -cne $ExpectedCommit) {
    throw 'Lu installer metadata, commit, architecture or distribution identity does not match.'
}
if ($manifest.installerFile -notmatch '^[\w .()+-]+\.exe$' -or
    $manifest.installerSha256 -notmatch '^[0-9a-f]{64}$') {
    throw 'Invalid installer filename or SHA-256 in build manifest.'
}

# Artifact uploads preserve the NSIS directory tree when the installer,
# checksum and provenance manifest are uploaded as multiple source paths.
$installers = @(Get-ChildItem -LiteralPath $artifactRoot -Recurse -File -Filter '*.exe')
if ($installers.Count -ne 1 -or $installers[0].Name -cne $manifest.installerFile) {
    throw "Expected exactly one Lu installer: $($manifest.installerFile)"
}
$installer = $installers[0]
$hash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -cne $manifest.installerSha256) {
    throw 'Installer SHA-256 does not match the build manifest.'
}
Write-Host "Verified Lu installer SHA-256: $hash"

function Assert-Windows-X64-PE([string]$Path) {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $reader = [System.IO.BinaryReader]::new($stream)
        try {
            if ($stream.Length -lt 0x100 -or $reader.ReadUInt16() -ne 0x5a4d) {
                throw 'Installed application is not a valid DOS/PE executable.'
            }
            $stream.Position = 0x3c
            $peOffset = $reader.ReadInt32()
            if ($peOffset -lt 0x40 -or $peOffset -gt ($stream.Length - 6)) {
                throw 'Installed application has an invalid PE offset.'
            }
            $stream.Position = $peOffset
            if ($reader.ReadUInt32() -ne 0x00004550) {
                throw 'Installed application lacks a PE signature.'
            }
            $machine = $reader.ReadUInt16()
            if ($machine -ne 0x8664) {
                throw "Installed Lu app has PE machine 0x$($machine.ToString('x4')), expected AMD64 (0x8664)."
            }
        } finally {
            $reader.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

# Even an authentic installer must not be installed by this test into an
# ordinary user profile or machine-wide Program Files. The target is unique
# and lives only in the disposable CI runner's temporary directory.
$runnerRoot = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
$installPath = Join-Path $runnerRoot "lu-x64-smoke-$([guid]::NewGuid().ToString('N'))"
if (!( [System.IO.Path]::GetFullPath($installPath).StartsWith(
    "$runnerRoot\", [System.StringComparison]::OrdinalIgnoreCase
))) {
    throw 'Installation target escapes the ephemeral runner directory.'
}

function Invoke-Nsis-Quietly([string]$Exe, [string]$ArgsText, [int]$TimeoutSeconds) {
    $info = [System.Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $Exe
    $info.Arguments = $ArgsText
    $info.UseShellExecute = $false
    $proc = [System.Diagnostics.Process]::Start($info)
    if ($null -eq $proc) {
        throw "Could not start NSIS executable $Exe"
    }
    try {
        if (!$proc.WaitForExit($TimeoutSeconds * 1000)) {
            $proc.Kill($true)
            throw "NSIS process exceeded the $TimeoutSeconds-second CI deadline."
        }
        if ($proc.ExitCode -ne 0) {
            throw "NSIS process exited with code $($proc.ExitCode)."
        }
    } finally {
        $proc.Dispose()
    }
}

Write-Host 'Running Lu NSIS silent install inside the disposable Windows CI runner.'
# NSIS requires /D=path as the final option, with no quotes around the value.
Invoke-Nsis-Quietly $installer.FullName "/S /D=$installPath" 180
$appExe = Join-Path $installPath 'Lu-Desktop.exe'
if (!(Test-Path -LiteralPath $appExe -PathType Leaf)) {
    throw "Lu-Desktop.exe was not installed at the isolated target: $installPath"
}
if (Test-Path -LiteralPath (Join-Path $installPath 'Jan-Desktop.exe')) {
    throw 'The Lu installer unexpectedly installed Jan-Desktop.exe.'
}
Assert-Windows-X64-PE $appExe
Write-Host 'Confirmed installed Lu-Desktop.exe is a Windows x86-64 PE binary.'

# Tauri strips the target-triple suffix when installing externalBin:
# bundled bun-x86_64-pc-windows-msvc.exe becomes bun.exe, and likewise uv.
foreach ($binary in @(
    'jan-llama-worker.exe',
    'bun.exe',
    'uv.exe'
)) {
    $found = @(Get-ChildItem -LiteralPath $installPath -Recurse -File -Filter $binary)
    if ($found.Count -ne 1) {
        throw "Expected one bundled $binary in the isolated Lu installation; found $($found.Count)."
    }
    Assert-Windows-X64-PE $found[0].FullName
}
Write-Host 'All three essential bundled runtimes are present and AMD64.'

# Require the *installed* Lu-owned CPU package, not merely a successful
# staging step before NSIS. Every component must match the pinned manifest.
if ($manifest.luNativeInference -cne 'cpu-llama-server' -or
    $manifest.luPackageManifestSha256 -notmatch '^[0-9a-f]{64}

if ($ProbeStartup) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-startup.ps1') -InstallDir $installPath -RequireNativeMcpFirstRun:$RequireNativeMcpFirstRun
}
if ($ProbeWorker) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-engine-worker.ps1') -InstallDir $installPath
}

$uninstallers = @(Get-ChildItem -LiteralPath $installPath -File |
    Where-Object { $_.Name -match '^uninstall.*\.exe$' })
if ($uninstallers.Count -ne 1) {
    throw "Expected one Lu NSIS uninstaller; found $($uninstallers.Count)."
}
Write-Host 'Running Lu silent uninstall inside the disposable CI runner.'
Invoke-Nsis-Quietly $uninstallers[0].FullName '/S' 180
# NSIS uninstall.exe can exit after launching its temporary copied child,
# before the child deletes the installed files. Require eventual cleanup,
# without interpreting the first process's exit code as proof of removal.
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if (!(Test-Path -LiteralPath $appExe -PathType Leaf)) {
        break
    }
    Start-Sleep -Seconds 1
}
if (Test-Path -LiteralPath $appExe -PathType Leaf) {
    $remaining = @(Get-ChildItem -LiteralPath $installPath -File -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Name)
    throw "Silent NSIS uninstall did not remove Lu-Desktop.exe. Remaining root files: $($remaining -join ', ')"
}
Write-Host 'Lu NSIS installation and uninstallation smoke test passed.'
 -or
    $manifest.luEngineSha256 -notmatch '^[0-9a-f]{64}

if ($ProbeStartup) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-startup.ps1') -InstallDir $installPath -RequireNativeMcpFirstRun:$RequireNativeMcpFirstRun
}
if ($ProbeWorker) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-engine-worker.ps1') -InstallDir $installPath
}

$uninstallers = @(Get-ChildItem -LiteralPath $installPath -File |
    Where-Object { $_.Name -match '^uninstall.*\.exe$' })
if ($uninstallers.Count -ne 1) {
    throw "Expected one Lu NSIS uninstaller; found $($uninstallers.Count)."
}
Write-Host 'Running Lu silent uninstall inside the disposable CI runner.'
Invoke-Nsis-Quietly $uninstallers[0].FullName '/S' 180
# NSIS uninstall.exe can exit after launching its temporary copied child,
# before the child deletes the installed files. Require eventual cleanup,
# without interpreting the first process's exit code as proof of removal.
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if (!(Test-Path -LiteralPath $appExe -PathType Leaf)) {
        break
    }
    Start-Sleep -Seconds 1
}
if (Test-Path -LiteralPath $appExe -PathType Leaf) {
    $remaining = @(Get-ChildItem -LiteralPath $installPath -File -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Name)
    throw "Silent NSIS uninstall did not remove Lu-Desktop.exe. Remaining root files: $($remaining -join ', ')"
}
Write-Host 'Lu NSIS installation and uninstallation smoke test passed.'
) {
    throw 'Lu installer missing native inference package provenance.'
}
$engineManifests = @(Get-ChildItem -LiteralPath $installPath -Recurse -File -Filter 'manifest.json' |
    Where-Object { $_.FullName -match '[\\/]lu-inference[\\/]manifest\.json

if ($ProbeStartup) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-startup.ps1') -InstallDir $installPath -RequireNativeMcpFirstRun:$RequireNativeMcpFirstRun
}
if ($ProbeWorker) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-engine-worker.ps1') -InstallDir $installPath
}

$uninstallers = @(Get-ChildItem -LiteralPath $installPath -File |
    Where-Object { $_.Name -match '^uninstall.*\.exe$' })
if ($uninstallers.Count -ne 1) {
    throw "Expected one Lu NSIS uninstaller; found $($uninstallers.Count)."
}
Write-Host 'Running Lu silent uninstall inside the disposable CI runner.'
Invoke-Nsis-Quietly $uninstallers[0].FullName '/S' 180
# NSIS uninstall.exe can exit after launching its temporary copied child,
# before the child deletes the installed files. Require eventual cleanup,
# without interpreting the first process's exit code as proof of removal.
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if (!(Test-Path -LiteralPath $appExe -PathType Leaf)) {
        break
    }
    Start-Sleep -Seconds 1
}
if (Test-Path -LiteralPath $appExe -PathType Leaf) {
    $remaining = @(Get-ChildItem -LiteralPath $installPath -File -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Name)
    throw "Silent NSIS uninstall did not remove Lu-Desktop.exe. Remaining root files: $($remaining -join ', ')"
}
Write-Host 'Lu NSIS installation and uninstallation smoke test passed.'
 })
if ($engineManifests.Count -ne 1) {
    throw "Expected one installed native Lu inference manifest; found $($engineManifests.Count)."
}
$engineManifestFile = $engineManifests[0]
$packageHash = (Get-FileHash -LiteralPath $engineManifestFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($packageHash -cne $manifest.luPackageManifestSha256) {
    throw 'Installed Lu native package manifest differs from build provenance.'
}
$engine = Get-Content -LiteralPath $engineManifestFile.FullName -Raw | ConvertFrom-Json
if ($engine.schema -cne 'lu-inference-package-v1' -or
    $engine.upstreamCommit -cne '7fe450e19305b828c199d602c23a8337aaa1f03b' -or
    $engine.architecture -cne 'x86_64-pc-windows-msvc') {
    throw 'Installed Lu native inference engine provenance is invalid.'
}
$engineRoot = $engineManifestFile.DirectoryName
$declared = @($engine.files | ForEach-Object { $_.name } | Sort-Object)
$actual = @(Get-ChildItem -LiteralPath $engineRoot -File |
    Where-Object { $_.Name -cne 'manifest.json' } |
    Select-Object -ExpandProperty Name | Sort-Object)
if (($declared -join '|') -cne ($actual -join '|')) {
    throw 'Installed Lu inference package component inventory mismatch.'
}
foreach ($entry in $engine.files) {
    if ($entry.name -notmatch '^[a-zA-Z0-9_.-]+

if ($ProbeStartup) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-startup.ps1') -InstallDir $installPath -RequireNativeMcpFirstRun:$RequireNativeMcpFirstRun
}
if ($ProbeWorker) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-engine-worker.ps1') -InstallDir $installPath
}

$uninstallers = @(Get-ChildItem -LiteralPath $installPath -File |
    Where-Object { $_.Name -match '^uninstall.*\.exe$' })
if ($uninstallers.Count -ne 1) {
    throw "Expected one Lu NSIS uninstaller; found $($uninstallers.Count)."
}
Write-Host 'Running Lu silent uninstall inside the disposable CI runner.'
Invoke-Nsis-Quietly $uninstallers[0].FullName '/S' 180
# NSIS uninstall.exe can exit after launching its temporary copied child,
# before the child deletes the installed files. Require eventual cleanup,
# without interpreting the first process's exit code as proof of removal.
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if (!(Test-Path -LiteralPath $appExe -PathType Leaf)) {
        break
    }
    Start-Sleep -Seconds 1
}
if (Test-Path -LiteralPath $appExe -PathType Leaf) {
    $remaining = @(Get-ChildItem -LiteralPath $installPath -File -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Name)
    throw "Silent NSIS uninstall did not remove Lu-Desktop.exe. Remaining root files: $($remaining -join ', ')"
}
Write-Host 'Lu NSIS installation and uninstallation smoke test passed.'
 -or
        $entry.sha256 -notmatch '^[0-9a-f]{64}

if ($ProbeStartup) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-startup.ps1') -InstallDir $installPath -RequireNativeMcpFirstRun:$RequireNativeMcpFirstRun
}
if ($ProbeWorker) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-engine-worker.ps1') -InstallDir $installPath
}

$uninstallers = @(Get-ChildItem -LiteralPath $installPath -File |
    Where-Object { $_.Name -match '^uninstall.*\.exe$' })
if ($uninstallers.Count -ne 1) {
    throw "Expected one Lu NSIS uninstaller; found $($uninstallers.Count)."
}
Write-Host 'Running Lu silent uninstall inside the disposable CI runner.'
Invoke-Nsis-Quietly $uninstallers[0].FullName '/S' 180
# NSIS uninstall.exe can exit after launching its temporary copied child,
# before the child deletes the installed files. Require eventual cleanup,
# without interpreting the first process's exit code as proof of removal.
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if (!(Test-Path -LiteralPath $appExe -PathType Leaf)) {
        break
    }
    Start-Sleep -Seconds 1
}
if (Test-Path -LiteralPath $appExe -PathType Leaf) {
    $remaining = @(Get-ChildItem -LiteralPath $installPath -File -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Name)
    throw "Silent NSIS uninstall did not remove Lu-Desktop.exe. Remaining root files: $($remaining -join ', ')"
}
Write-Host 'Lu NSIS installation and uninstallation smoke test passed.'
) {
        throw 'Installed Lu engine component manifest entry invalid.'
    }
    $component = Join-Path $engineRoot $entry.name
    $componentHash = (Get-FileHash -LiteralPath $component -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($componentHash -cne $entry.sha256) {
        throw "Installed native inference component hash mismatch: $($entry.name)"
    }
}
$nativeServer = Join-Path $engineRoot 'llama-server.exe'
if (!(Test-Path -LiteralPath $nativeServer -PathType Leaf) -or
    (Get-FileHash -LiteralPath $nativeServer -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.luEngineSha256) {
    throw 'Installed Lu llama-server executable identity mismatch.'
}
Assert-Windows-X64-PE $nativeServer
Write-Host "LU_INSTALLED_NATIVE_INFERENCE_PACKAGE_PASS components=$($declared.Count)"



if ($ProbeStartup) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-startup.ps1') -InstallDir $installPath -RequireNativeMcpFirstRun:$RequireNativeMcpFirstRun
}
if ($ProbeWorker) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-engine-worker.ps1') -InstallDir $installPath
}

$uninstallers = @(Get-ChildItem -LiteralPath $installPath -File |
    Where-Object { $_.Name -match '^uninstall.*\.exe$' })
if ($uninstallers.Count -ne 1) {
    throw "Expected one Lu NSIS uninstaller; found $($uninstallers.Count)."
}
Write-Host 'Running Lu silent uninstall inside the disposable CI runner.'
Invoke-Nsis-Quietly $uninstallers[0].FullName '/S' 180
# NSIS uninstall.exe can exit after launching its temporary copied child,
# before the child deletes the installed files. Require eventual cleanup,
# without interpreting the first process's exit code as proof of removal.
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if (!(Test-Path -LiteralPath $appExe -PathType Leaf)) {
        break
    }
    Start-Sleep -Seconds 1
}
if (Test-Path -LiteralPath $appExe -PathType Leaf) {
    $remaining = @(Get-ChildItem -LiteralPath $installPath -File -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Name)
    throw "Silent NSIS uninstall did not remove Lu-Desktop.exe. Remaining root files: $($remaining -join ', ')"
}
Write-Host 'Lu NSIS installation and uninstallation smoke test passed.'
