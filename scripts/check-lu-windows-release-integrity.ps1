# W06: Real cross-commit NSIS replacement, license preservation and uninstall.
# Runs only in an ephemeral Windows Actions VM. Never use on user Windows.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $PriorArtifactDir,
    [Parameter(Mandatory = $true)][string] $NewArtifactDir,
    [Parameter(Mandatory = $true)][string] $ExpectedPriorCommit,
    [Parameter(Mandatory = $true)][string] $ExpectedNewCommit,
    [Parameter(Mandatory = $true)][string] $BuiltDesktopExe
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'Lu release-integrity probe requires a disposable Windows Actions runner.'
}
$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd([char]92)
function Assert-RunnerPath([string] $path) {
    $full = [IO.Path]::GetFullPath($path)
    if (!$full.StartsWith("$runnerRoot\", [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Lu release-integrity probe refuses paths outside RUNNER_TEMP.'
    }
    return $full
}
foreach ($commit in @($ExpectedPriorCommit, $ExpectedNewCommit)) {
    if ($commit -cnotmatch '^[0-9a-f]{40}$') { throw 'Release provenance requires a 40-character commit.' }
}
if ($ExpectedPriorCommit -ceq $ExpectedNewCommit) {
    throw 'Cross-commit NSIS replacement requires distinct baseline and candidate revisions.'
}
$priorRoot = Assert-RunnerPath $PriorArtifactDir
$newRoot = Assert-RunnerPath $NewArtifactDir
$builtExe = (Resolve-Path -LiteralPath $BuiltDesktopExe -ErrorAction Stop).ProviderPath
if ([IO.Path]::GetFileName($builtExe) -cne 'Lu-Desktop.exe') {
    throw 'Replacement must be compared with the newly built Lu-Desktop.exe.'
}
$builtExeHash = (Get-FileHash -LiteralPath $builtExe -Algorithm SHA256).Hash
function Get-VerifiedInstaller([string] $root, [string] $revision) {
    $manifestPath = Join-Path $root 'lu-windows-x64-build.json'
    if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "Missing Lu NSIS release manifest for $revision."
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.application -cne 'Lu' -or
        $manifest.identity -cne 'ai.lu.preview' -or
        $manifest.architecture -cne 'x86_64-pc-windows-msvc' -or
        $manifest.installerType -cne 'nsis' -or
        $manifest.engineVariant -cne 'vulkan' -or
        $manifest.signedInstaller -ne $false -or
        $manifest.gitCommit -cne $revision) {
        throw "Unexpected Lu NSIS provenance for $revision."
    }
    if ($manifest.installerFile -cnotmatch '^[A-Za-z0-9_ .()+-]+[.]exe$' -or
        $manifest.installerSha256 -cnotmatch '^[0-9a-f]{64}$') {
        throw 'Invalid release installer name or SHA-256.'
    }
    $exeFiles = @(Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.exe')
    if ($exeFiles.Count -ne 1 -or $exeFiles[0].Name -cne $manifest.installerFile) {
        throw 'Release artifact must contain exactly one manifest-matched NSIS executable.'
    }
    $actualHash = (Get-FileHash -LiteralPath $exeFiles[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -cne $manifest.installerSha256) {
        throw 'Lu NSIS release installer SHA-256 did not match provenance.'
    }
    return [PSCustomObject]@{ File = $exeFiles[0].FullName; Manifest = $manifest }
}
$prior = Get-VerifiedInstaller $priorRoot $ExpectedPriorCommit
$new = Get-VerifiedInstaller $newRoot $ExpectedNewCommit

# The old/new builds may have identical machine code if only CI scripts
# changed. Different build commits + verified provenance are required, but we
# don't fabricate a changed version number or demand different EXE bytes.
$installRoot = Join-Path $runnerRoot ("lu-w06-install-" + [guid]::NewGuid().ToString('N'))
$roaming = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
if ([string]::IsNullOrWhiteSpace($roaming) -or !(Test-Path -LiteralPath $roaming -PathType Container)) {
    throw 'Windows roaming profile unavailable in disposable Actions VM.'
}
$janFolder = Join-Path $roaming 'Jan'
$janBundle = Join-Path $roaming 'jan.ai.app'
$luFolder = Join-Path $roaming 'Lu'
$luBundle = Join-Path $roaming 'ai.lu.preview'
foreach ($folder in @($janFolder, $janBundle, $luFolder, $luBundle)) {
    if (Test-Path -LiteralPath $folder) {
        throw "Runner has an existing Jan or Lu profile ($folder); refusing to modify it."
    }
}
$registryPath = 'Software\Classes\jan'
$registry = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($registryPath, $false)
if ($null -ne $registry) {
    $registry.Dispose()
    throw 'Runner already contains jan:// association; refusing to change it.'
}
$janMarker = Join-Path $janFolder 'data\jan-w06.txt'
$janBundleMarker = Join-Path $janBundle 'jan-bundle-w06.txt'
$luMarker = Join-Path $luFolder 'data\lu-w06.txt'
$luBundleMarker = Join-Path $luBundle 'lu-bundle-w06.txt'
$canary = "LU_W06_PRESERVE_" + [guid]::NewGuid().ToString('N')
$handler = '"C:\W06-Sentinel-Jan\Jan-Desktop.exe" "%1"'
$createdRegistry = $false
$createdCanaries = $false
function Assert-Canaries([string] $phase) {
    foreach ($file in @($janMarker, $janBundleMarker, $luMarker, $luBundleMarker)) {
        if (!(Test-Path -LiteralPath $file -PathType Leaf) -or
            [IO.File]::ReadAllText($file) -cne $canary) {
            throw "NSIS $phase changed an existing Lu or Jan profile canary: $file."
        }
    }
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(
        "$registryPath\shell\open\command", $false
    )
    if ($null -eq $key) { throw "NSIS $phase removed Jan's jan:// handler." }
    try {
        if ($key.GetValue('') -cne $handler) {
            throw "NSIS $phase replaced Jan's jan:// handler."
        }
    } finally { $key.Dispose() }
}
function Invoke-Nsis([string] $exe, [string] $argsText, [string] $stage) {
    $psi = [Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $exe
    $psi.Arguments = $argsText
    $psi.UseShellExecute = $false
    $process = [Diagnostics.Process]::Start($psi)
    if ($null -eq $process) { throw "Could not launch NSIS $stage." }
    try {
        if (!$process.WaitForExit(180000)) {
            $process.Kill($true)
            throw "NSIS $stage exceeded 180 seconds."
        }
        if ($process.ExitCode -ne 0) {
            throw "NSIS $stage returned exit code $($process.ExitCode)."
        }
    } finally { $process.Dispose() }
}
function Assert-Notice([string] $path, [string] $source) {
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Lu release has missing Apache/Jan attribution: $path"
    }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -cne
        (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) {
        throw "Installed Lu attribution differs from checked-in notice: $path"
    }
}
function Assert-NewRelease {
    $desktop = Join-Path $installRoot 'Lu-Desktop.exe'
    if (!(Test-Path -LiteralPath $desktop -PathType Leaf) -or
        (Get-FileHash -LiteralPath $desktop -Algorithm SHA256).Hash -cne $builtExeHash) {
        throw 'Cross-commit NSIS replacement did not install the exact current Lu-Desktop.exe.'
    }
    foreach ($entry in @(
        @{ name = 'LICENSE'; source = 'LICENSE' },
        @{ name = 'NOTICE'; source = 'NOTICE' },
        @{ name = 'licenses\Apache-2.0.txt'; source = 'LICENSES\Apache-2.0.txt' }
    )) {
        Assert-Notice (Join-Path $installRoot $entry.name) (
            Join-Path $PSScriptRoot ('..\' + $entry.source)
        )
    }
    # Tauri resources can be nested in an NSIS installation.
    $manifests = @(Get-ChildItem -LiteralPath $installRoot -Recurse -File -Filter 'manifest.json' |
        Where-Object { $_.FullName -match '[\\/]lu-inference[\\/]manifest[.]json$' })
    if ($manifests.Count -ne 1) {
        throw "New Lu NSIS installation has $($manifests.Count) inference manifests; expected one."
    }
    $engineManifest = $manifests[0].FullName
    if ((Get-FileHash -LiteralPath $engineManifest -Algorithm SHA256).Hash.ToLowerInvariant() -cne
        $new.Manifest.luPackageManifestSha256) {
        throw 'Updated native Lu engine manifest differs from current build provenance.'
    }
    $engine = Join-Path $manifests[0].DirectoryName 'llama-server.exe'
    if (!(Test-Path -LiteralPath $engine -PathType Leaf) -or
        (Get-FileHash -LiteralPath $engine -Algorithm SHA256).Hash.ToLowerInvariant() -cne
        $new.Manifest.luEngineSha256) {
        throw 'Updated Lu inference engine binary differs from current build provenance.'
    }
    return [PSCustomObject]@{ Engine = $engine; Manifest = $engineManifest }
}
function Await-Removal([string] $path) {
    for ($i = 0; $i -lt 45; $i++) {
        if (!(Test-Path -LiteralPath $path -PathType Leaf)) { return }
        Start-Sleep -Seconds 1
    }
    throw "NSIS uninstaller failed to remove installed file: $path"
}

try {
    foreach ($file in @($janMarker, $janBundleMarker, $luMarker, $luBundleMarker)) {
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file)) | Out-Null
        [IO.File]::WriteAllText($file, $canary)
    }
    $createdCanaries = $true
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey(
        "$registryPath\shell\open\command"
    )
    if ($null -eq $key) { throw 'Unable to set disposable Jan protocol sentinel.' }
    $createdRegistry = $true
    try { $key.SetValue('', $handler, [Microsoft.Win32.RegistryValueKind]::String) }
    finally { $key.Dispose() }
    Assert-Canaries 'before install'

    # NSIS requires /D as the final parameter and the target must be unquoted.
    Write-Host 'Installing checksum-verified prior Lu preview into CI-only directory.'
    Invoke-Nsis $prior.File ("/S /D=" + $installRoot) 'prior installation'
    $desktop = Join-Path $installRoot 'Lu-Desktop.exe'
    if (!(Test-Path -LiteralPath $desktop -PathType Leaf)) {
        throw 'Baseline Lu preview did not install its executable.'
    }
    # The checksum-pinned October preview predates installed notice packaging.
    # Record that debt explicitly; only this exact legacy revision may omit the
    # notices. Every later baseline must already contain valid attribution.
    $legacyPrior = $ExpectedPriorCommit -ceq 'd6edb050d797e0d492223db6da8f335dd7c37ce1'
    $priorNoticePaths = @('LICENSE', 'NOTICE', 'licenses\Apache-2.0.txt')
    $presentNotices = @($priorNoticePaths | Where-Object {
        Test-Path -LiteralPath (Join-Path $installRoot $_) -PathType Leaf
    })
    if ($presentNotices.Count -ne $priorNoticePaths.Count) {
        if (!$legacyPrior -or $presentNotices.Count -ne 0) {
            throw 'Prior Lu preview has incomplete Jan/Apache attribution.'
        }
        Write-Host 'LU_W06_LEGACY_PRIOR_NOTICES_MISSING commit=d6edb050d797e0d492223db6da8f335dd7c37ce1'
    } else {
        $previousLicense = Get-Content -LiteralPath (Join-Path $installRoot 'LICENSE') -Raw
        $previousNotice = Get-Content -LiteralPath (Join-Path $installRoot 'NOTICE') -Raw
        if (!$previousLicense.Contains('Copyright 2025 Menlo Research') -or
            !$previousLicense.Contains('Apache License, Version 2.0') -or
            !$previousNotice.Contains('Menlo Research')) {
            throw 'Prior Lu preview did not preserve Jan copyright and Apache attribution.'
        }
    }
    Assert-Canaries 'after prior install'

    Write-Host 'Replacing prior Lu preview with a distinct, checksum-verified commit.'
    Invoke-Nsis $new.File ("/S /D=" + $installRoot) 'cross-commit replacement'
    $releaseFiles = Assert-NewRelease
    Assert-Canaries 'after replacement'
    Write-Host "LU_W06_CROSS_COMMIT_REPLACEMENT_PASS current_notices=true prior_notices=$($presentNotices.Count -eq 3) current_engine_hash=true preserved_profiles=true"

    $uninstallers = @(Get-ChildItem -LiteralPath $installRoot -File |
        Where-Object { $_.Name -match '^uninstall.*[.]exe$' })
    if ($uninstallers.Count -ne 1) {
        throw 'Updated Lu release lacks exactly one uninstall executable.'
    }
    Invoke-Nsis $uninstallers[0].FullName '/S' 'updated release uninstall'
    foreach ($file in @(
        (Join-Path $installRoot 'Lu-Desktop.exe'),
        (Join-Path $installRoot 'LICENSE'),
        (Join-Path $installRoot 'NOTICE'),
        (Join-Path $installRoot 'licenses\Apache-2.0.txt'),
        $releaseFiles.Engine,
        $releaseFiles.Manifest
    )) {
        Await-Removal $file
    }
    Assert-Canaries 'after uninstall'
    Write-Host 'LU_W06_RELEASE_INTEGRITY_PASS previous_commit=true new_commit=true uninstall=true notices=true jan_profile=true lu_data=true'
} finally {
    if ($createdRegistry) {
        [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($registryPath, $false)
    }
    if ($createdCanaries) {
        # These directories were refused if already present. Only synthetic
        # files created by this test on a disposable runner can be removed.
        foreach ($folder in @($janFolder, $janBundle, $luFolder, $luBundle)) {
            if (Test-Path -LiteralPath $folder) { Remove-Item -LiteralPath $folder -Recurse -Force }
        }
    }
    if (Test-Path -LiteralPath $installRoot) {
        $checked = Assert-RunnerPath $installRoot
        Remove-Item -LiteralPath $checked -Recurse -Force
    }
}
