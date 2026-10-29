# Isolated Windows Actions smoke test for a Lu x86-64 NSIS development preview.
# Deliberately refuses to install anything on the user's own Windows machine.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $ArtifactDir,
    [Parameter(Mandatory = $true)][string] $ExpectedCommit,
    [switch] $ProbeStartup,
    [switch] $RequireNativeMcpFirstRun,
    [switch] $ProbeWorker,
    [switch] $ProbeInstalledNativeToolTurn,
    [switch] $ProbeProfileRestart,
    [string] $RealGgufPath = '',
    [string] $RealGgufSha256 = ''
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

# Verify that shipped binaries carry both the inherited Jan notice and the
# full Apache 2.0 license, not merely the short README-style notice.
$notices = @(
    @{ destination = 'LICENSE'; source = (Join-Path $PSScriptRoot '..\LICENSE') },
    @{ destination = 'NOTICE'; source = (Join-Path $PSScriptRoot '..\NOTICE') },
    @{ destination = 'licenses\Apache-2.0.txt'; source = (Join-Path $PSScriptRoot '..\LICENSES\Apache-2.0.txt') }
)
foreach ($entry in $notices) {
    $installedNotice = Join-Path $installPath $entry.destination
    if (!(Test-Path -LiteralPath $installedNotice -PathType Leaf)) {
        throw "Required Lu Jan-origin license/notice missing from NSIS installation: $($entry.destination)"
    }
    $actualNoticeHash = (Get-FileHash -LiteralPath $installedNotice -Algorithm SHA256).Hash
    $expectedNoticeHash = (Get-FileHash -LiteralPath $entry.source -Algorithm SHA256).Hash
    if ($actualNoticeHash -cne $expectedNoticeHash) {
        throw "Installed Lu license/notice differs from checked-in source: $($entry.destination)"
    }
}
Write-Host 'Installed Lu contains unchanged Jan LICENSE, Lu NOTICE and complete Apache-2.0 license.'

Write-Host 'Confirmed installed Lu-Desktop.exe is a Windows x86-64 PE binary.'

# Verify each runtime in its actual installed layout. Tauri may install an
# externalBin at the root while Lu's resources/bin contains an identical copy.
# The worker is a resource under bin/, not a root-level sidecar.
foreach ($binary in @('jan-llama-worker.exe', 'bun.exe', 'uv.exe')) {
    $found = @(Get-ChildItem -LiteralPath $installPath -Recurse -File -Filter $binary)
    $approved = @((Join-Path 'bin' $binary))
    if ($binary -ne 'jan-llama-worker.exe') {
        $approved += $binary
    }
    $paths = @($found | ForEach-Object {
        $_.FullName.Substring($installPath.Length).TrimStart([char]92, [char]47)
    })
    if ($found.Count -eq 0 -or (Join-Path 'bin' $binary) -notin $paths) {
        throw "Required bundled runtime bin\\$binary missing; installed matches: $($paths -join ', ')"
    }
    $referenceHash = $null
    foreach ($entry in $found) {
        $relative = $entry.FullName.Substring($installPath.Length).TrimStart([char]92, [char]47)
        if ($relative -notin $approved) {
            throw "Unexpected $binary copy at $relative; approved locations: $($approved -join ', ')"
        }
        Assert-Windows-X64-PE $entry.FullName
        $entryHash = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash
        if ($null -eq $referenceHash) {
            $referenceHash = $entryHash
        } elseif ($entryHash -cne $referenceHash) {
            throw "Bundled $binary copies differ in SHA-256"
        }
    }
    Write-Host "Verified $binary at: $($paths -join ', ')"
}
Write-Host 'All essential bundled runtimes are present, AMD64 and identity-consistent.'

# Confirm Lu's own engine exists in the *installed* NSIS package, and that
# the installed manifest and every executable/DLL match the build identity.
if ($manifest.luNativeInference -cne 'cpu-llama-server' -or
    $manifest.luPackageManifestSha256 -notmatch '^[0-9a-f]{64}$' -or
    $manifest.luEngineSha256 -notmatch '^[0-9a-f]{64}$') {
    throw 'Lu native inference package provenance missing from installer manifest.'
}
$engineManifests = @(Get-ChildItem -LiteralPath $installPath -Recurse -File -Filter 'manifest.json' |
    Where-Object { $_.FullName -match '[\\/]lu-inference[\\/]manifest\.json$' })
if ($engineManifests.Count -ne 1) {
    throw "Expected one installed Lu native inference manifest; found $($engineManifests.Count)."
}
$installedManifest = $engineManifests[0]
$installedHash = (Get-FileHash -LiteralPath $installedManifest.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($installedHash -cne $manifest.luPackageManifestSha256) {
    throw 'Installed Lu engine manifest checksum differs from release build manifest.'
}
$package = Get-Content -LiteralPath $installedManifest.FullName -Raw | ConvertFrom-Json
if ($package.schema -cne 'lu-inference-package-v1' -or
    $package.upstreamCommit -cne '7fe450e19305b828c199d602c23a8337aaa1f03b' -or
    $package.architecture -cne 'x86_64-pc-windows-msvc') {
    throw 'Invalid installed Lu engine source revision or architecture.'
}
$engineRoot = $installedManifest.DirectoryName
$declared = @($package.files | ForEach-Object { $_.name } | Sort-Object)
$installed = @(Get-ChildItem -LiteralPath $engineRoot -File |
    Where-Object { $_.Name -cne 'manifest.json' } |
    Select-Object -ExpandProperty Name | Sort-Object)
if (($declared -join '|') -cne ($installed -join '|')) {
    throw 'Installed Lu engine inventory differs from the release package manifest.'
}
foreach ($entry in $package.files) {
    if ($entry.name -notmatch '^[a-zA-Z0-9_.-]+$' -or
        $entry.sha256 -notmatch '^[0-9a-f]{64}$') {
        throw 'Malformed Lu engine file manifest entry.'
    }
    $component = Join-Path $engineRoot $entry.name
    $hash = (Get-FileHash -LiteralPath $component -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -cne $entry.sha256) {
        throw "Installed Lu engine component hash mismatch: $($entry.name)"
    }
}
$server = Join-Path $engineRoot 'llama-server.exe'
if (!(Test-Path -LiteralPath $server -PathType Leaf) -or
    (Get-FileHash -LiteralPath $server -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.luEngineSha256) {
    throw 'Installed Lu native llama-server.exe identity mismatch.'
}
Assert-Windows-X64-PE $server
Write-Host "LU_INSTALLED_NATIVE_INFERENCE_PACKAGE_PASS components=$($declared.Count)"


if ($ProbeStartup) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-startup.ps1') -InstallDir $installPath -RequireNativeMcpFirstRun:$RequireNativeMcpFirstRun
}
if ($ProbeWorker) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-engine-worker.ps1') -InstallDir $installPath -ModelPath $RealGgufPath
}
if ($ProbeInstalledNativeToolTurn) {
    if ([string]::IsNullOrWhiteSpace($RealGgufPath) -or
        $RealGgufSha256 -cnotmatch '^[0-9a-f]{64}$') {
        throw 'Installed native tool test requires an explicit pinned real GGUF and SHA-256.'
    }
    $toolProbeArgs = @{
        InstalledEngine = $server
        EngineSha256 = $manifest.luEngineSha256
        ModelPath = $RealGgufPath
        ModelSha256 = $RealGgufSha256
    }
    & (Join-Path $PSScriptRoot 'check-lu-windows-installed-native-tool-turn.ps1') @toolProbeArgs
}

# W05 must run while the installed binary and worker are still present,
# before silent uninstall. This is a *second* process-level acceptance gate
# and never executes on an actual user's Windows installation.
if ($ProbeProfileRestart) {
    & (Join-Path $PSScriptRoot 'check-lu-windows-profile-restart.ps1') -InstallDir $installPath
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
