# LU-WIN-GUI-01: run an UNMODIFIED, previously compiled native-only NSIS
# Lu-Desktop on a disposable Windows x64 CI machine. All GUI interactions
# happen in WebView2, using process-local CDP enabled only for this test run.
# GitHub is a repository/evidence archive, NOT the Lu development control plane.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $ArtifactDir,
    [Parameter(Mandatory = $true)][string] $ModelPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'Installed Lu GUI test can only run in an explicitly disposable Windows runner.'
}
$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
function Assert-UnderRunnerTemp([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (!$full.StartsWith("$runnerRoot\", [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Lu GUI acceptance path escapes disposable Windows runner.'
    }
}
$source = (Resolve-Path -LiteralPath $ArtifactDir).ProviderPath
$model = (Resolve-Path -LiteralPath $ModelPath).ProviderPath
Assert-UnderRunnerTemp $source
Assert-UnderRunnerTemp $model
$metaPath = Join-Path $source 'lu-windows-x64-build.json'
$manifest = Get-Content -LiteralPath $metaPath -Raw | ConvertFrom-Json
$expectedCommit = '7fae3e19c42bf58d2223a4ea675690438a821e74'
$expectedNsis = '35acb87b602ed2a5313c70e8cadf79b77965dc6b91993c6820bcbfc64b6f9be3'
$expectedGguf = '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db'
if ($manifest.gitCommit -cne $expectedCommit -or
    $manifest.installerSha256 -cne $expectedNsis -or
    $manifest.distributionMode -cne 'native-only' -or
    $manifest.legacyRuntimeBundled -ne $false -or
    $manifest.architecture -cne 'x86_64-pc-windows-msvc' -or
    $manifest.application -cne 'Lu') {
    throw 'Lu installed GUI gate refuses an unpinned or legacy NSIS artifact.'
}
$files = @(Get-ChildItem -LiteralPath $source -Recurse -File -Filter '*.exe')
if ($files.Count -ne 1 -or $files[0].Name -cne $manifest.installerFile -or
    (Get-FileHash -LiteralPath $files[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedNsis) {
    throw 'Lu installed GUI NSIS checksum/identity verification failed.'
}
if ([IO.Path]::GetFileName($model) -cne 'qwen2.5-0.5b-instruct-q4_k_m.gguf' -or
    (Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedGguf) {
    throw 'Lu installed GUI acceptance refuses a non-pinned real GGUF.'
}
$installDir = Join-Path $runnerRoot ('lu-gui-installed-' + [guid]::NewGuid().ToString('N'))
$profileRoot = Join-Path $runnerRoot ('lu-gui-profile-' + [guid]::NewGuid().ToString('N'))
Assert-UnderRunnerTemp $installDir
Assert-UnderRunnerTemp $profileRoot
$installerStarted = $false
$gatePassed = $false
$cleanupFailed = $false
try {
    $install = Start-Process -FilePath $files[0].FullName -ArgumentList ("/S /D=" + $installDir) -PassThru -Wait -NoNewWindow
    $installerStarted = $true
    if ($install.ExitCode -ne 0) { throw 'Lu native-only NSIS silent installation failed.' }
    $app = Join-Path $installDir 'Lu-Desktop.exe'
    if (!(Test-Path -LiteralPath $app -PathType Leaf)) { throw 'Installed Lu desktop binary missing.' }
    $legacy = @(Get-ChildItem -LiteralPath $installDir -Recurse -File |
        Where-Object { $_.Name -in @('jan-llama-worker.exe', 'bun.exe', 'uv.exe') })
    if ($legacy.Count -gt 0) { throw 'Installed Lu contains a forbidden Jan/Bun/UV runtime.' }
    $engine = @(Get-ChildItem -LiteralPath $installDir -Recurse -File -Filter 'llama-server.exe' |
        Where-Object { $_.FullName -match '[\\/]lu-inference[\\/]llama-server\.exe$' })
    if ($engine.Count -ne 1) { throw 'Installed Lu-owned GGUF engine is missing or ambiguous.' }
    if ($manifest.luEngineSha256 -cnotmatch '^[0-9a-f]{64}$' -or
        (Get-FileHash -LiteralPath $engine[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.luEngineSha256) {
        throw 'Installed Lu model engine differs from the pinned NSIS manifest.'
    }
    $script = Join-Path $PSScriptRoot 'verify-installed-lu-gui-tool.mjs'
    if (!(Test-Path -LiteralPath $script -PathType Leaf)) { throw 'Lu installed GUI driver missing.' }
    & node --no-warnings $script $app $profileRoot $model
    if ($LASTEXITCODE -ne 0) { throw 'Installed Lu GUI real model/tool/restart gate did not pass.' }
    $gatePassed = $true
} finally {
    # Tear down ONLY exact installed-path processes, never user Lu or Jan.
    if (Test-Path -LiteralPath $installDir) {
        $app = Join-Path $installDir 'Lu-Desktop.exe'
        $owned = @(Get-CimInstance Win32_Process -Filter "Name='Lu-Desktop.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.ExecutablePath -ceq $app })
        foreach ($process in $owned) {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
        }
        $uninstall = @(Get-ChildItem -LiteralPath $installDir -File -Filter 'uninstall*.exe')
        if ($uninstall.Count -eq 1) {
            try {
                $removed = Start-Process -FilePath $uninstall[0].FullName -ArgumentList '/S' -Wait -PassThru -NoNewWindow
                if ($removed.ExitCode -ne 0) { $cleanupFailed = $true }
            } catch { $cleanupFailed = $true }
        } elseif ($installerStarted) { $cleanupFailed = $true }
    }
}
if (!$gatePassed -or $cleanupFailed) { throw 'Installed Lu GUI gate or cleanup failed.' }
Write-Host 'LU_INSTALLED_GUI_NATIVE_ONLY_UNINSTALL_PASS source_pin=true user_profile_untouched=true'
