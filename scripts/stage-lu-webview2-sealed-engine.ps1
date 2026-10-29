# CI-only: stage the exact checksum-sealed Lu inference package into BOTH
# possible Cargo-debug Tauri resource layouts. Never recursive-copy a folder
# into an existing folder: PowerShell can produce lu-inference/lu-inference.
# The shipping Rust verifier remains strict and rejects unknown files.
[CmdletBinding()]
param(
    [string] $SealedSource = 'src-tauri/resources/lu-inference',
    [string] $DebugRoot = 'src-tauri/target/debug',
    [Parameter(Mandatory = $true)][string] $ExpectedManifestSha256,
    [Parameter(Mandatory = $true)][string] $ExpectedEngineSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'Debug staging is restricted to disposable Windows GitHub Actions VMs.'
}
foreach ($hash in @($ExpectedManifestSha256, $ExpectedEngineSha256)) {
    if ($hash -cnotmatch '^[a-fA-F0-9]{64}$') {
        throw 'Sealed Lu engine staging requires explicit SHA-256 digests.'
    }
}
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd([char]92)
$runnerTemp = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd([char]92)
$source = [IO.Path]::GetFullPath((Join-Path $repo $SealedSource))
$debug = [IO.Path]::GetFullPath((Join-Path $repo $DebugRoot))
$expectedSource = [IO.Path]::GetFullPath((Join-Path $repo 'src-tauri/resources/lu-inference'))
$expectedDebug = [IO.Path]::GetFullPath((Join-Path $repo 'src-tauri/target/debug'))
$fixtureSource = $source.StartsWith("$runnerTemp\", [StringComparison]::OrdinalIgnoreCase)
$fixtureDebug = $debug.StartsWith("$runnerTemp\", [StringComparison]::OrdinalIgnoreCase)
if (!(($source -ceq $expectedSource -and $debug -ceq $expectedDebug) -or
      ($fixtureSource -and $fixtureDebug))) {
    throw 'Sealed engine staging refuses sources/targets outside approved CI paths.'
}
# Refuse path redirection at the source or target directory, even for fixtures.
if (!(Test-Path -LiteralPath $source -PathType Container)) {
    throw 'The sealed Lu inference source directory is missing.'
}
$srcItem = Get-Item -LiteralPath $source -Force
if (($srcItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Sealed inference source must not be a symlink or junction.'
}
$manifestPath = Join-Path $source 'manifest.json'
if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw 'Sealed inference source manifest missing.'
}
$manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($manifestHash -cne $ExpectedManifestSha256.ToLowerInvariant()) {
    throw 'Sealed inference source manifest SHA-256 mismatch.'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -cne 'lu-inference-package-v1' -or
    $manifest.upstreamCommit -cne '7fe450e19305b828c199d602c23a8337aaa1f03b' -or
    $manifest.architecture -cne 'x86_64-pc-windows-msvc') {
    throw 'Staged Lu inference package provenance mismatch.'
}
$files = @($manifest.files)
if ($files.Count -lt 1 -or $files.Count -gt 48) {
    throw 'Sealed Lu package contains an invalid manifest file count.'
}
$allow = @('manifest.json')
foreach ($entry in $files) {
    $name = [string] $entry.name
    if ($name -cne 'llama-server.exe' -and
        ($name -cnotmatch '^[A-Za-z0-9_.-]+[.]dll$')) {
        throw 'Sealed Lu source has an unapproved component name.'
    }
    if ($name -cin $allow) { throw 'Sealed Lu source has duplicate components.' }
    $allow += $name
    if ($entry.sha256 -cnotmatch '^[a-fA-F0-9]{64}$') {
        throw 'Sealed Lu component digest malformed.'
    }
    $file = Join-Path $source $name
    $item = Get-Item -LiteralPath $file -Force -ErrorAction Stop
    if (!$item.PSIsContainer -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
        $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -cne $entry.sha256.ToLowerInvariant()) {
            throw 'Sealed Lu source component checksum mismatch.'
        }
    } else {
        throw 'Sealed Lu source includes nonregular/redirected component.'
    }
}
if ('llama-server.exe' -cnotin $allow) {
    throw 'Sealed Lu source has no native inference executable.'
}
$exeHash = (Get-FileHash -LiteralPath (Join-Path $source 'llama-server.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($exeHash -cne $ExpectedEngineSha256.ToLowerInvariant()) {
    throw 'Sealed Lu executable differs from trusted host hash.'
}
$sourceNames = @(Get-ChildItem -LiteralPath $source -Force | Select-Object -ExpandProperty Name | Sort-Object)
if (($sourceNames -cjoin '|') -cne (@($allow | Sort-Object) -cjoin '|')) {
    throw 'Sealed Lu source contains unmanifested files, directories or links.'
}
foreach ($relative in @('lu-inference', 'resources/lu-inference')) {
    $target = [IO.Path]::GetFullPath((Join-Path $debug $relative))
    if (!$target.StartsWith("$debug\", [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Staging target escaped the approved debug folder.'
    }
    if (Test-Path -LiteralPath $target) {
        $item = Get-Item -LiteralPath $target -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw 'Refusing to stage over a symlinked inference directory.'
        }
        # Only this known Cargo-debug package subdirectory is replaced.
        # Never remove Lu installation, source resources or user AppData.
        Remove-Item -LiteralPath $target -Force -Recurse
    }
    [IO.Directory]::CreateDirectory($target) | Out-Null
    foreach ($name in $allow) {
        Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $target $name)
    }
    $targetNames = @(Get-ChildItem -LiteralPath $target -Force | Select-Object -ExpandProperty Name | Sort-Object)
    if (($targetNames -cjoin '|') -cne (@($allow | Sort-Object) -cjoin '|')) {
        throw 'Debug Lu staging created unmanifested files or a nested package.'
    }
    foreach ($name in $allow) {
        if ((Get-FileHash -LiteralPath (Join-Path $target $name) -Algorithm SHA256).Hash -cne
            (Get-FileHash -LiteralPath (Join-Path $source $name) -Algorithm SHA256).Hash) {
            throw 'Debug Lu staged component checksum mismatch.'
        }
    }
    Write-Host "LU_DEBUG_SEALED_PACKAGE_PASS root=$relative files=$($allow.Count)"
}
