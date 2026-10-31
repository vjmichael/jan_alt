# LU-WIN-GUI-01: run an UNMODIFIED, previously compiled native-only NSIS
# Lu-Desktop on a disposable Windows x64 CI machine. All GUI interactions
# use Windows accessibility patterns and real keyboard actions; no CDP or special binary.
# GitHub is a repository/evidence archive, NOT the Lu development control plane.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $ArtifactDir,
    [string] $ModelPath = '',
    [string] $ExpectedCommit = '7fae3e19c42bf58d2223a4ea675690438a821e74',
    [string] $ExpectedInstallerSha256 = '35acb87b602ed2a5313c70e8cadf79b77965dc6b91993c6820bcbfc64b6f9be3',
    [switch] $ProbeOnly
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
$model = $null
Assert-UnderRunnerTemp $source
if (!$ProbeOnly) {
    $model = (Resolve-Path -LiteralPath $ModelPath).ProviderPath
    Assert-UnderRunnerTemp $model
}
$metaPath = Join-Path $source 'lu-windows-x64-build.json'
$manifest = Get-Content -LiteralPath $metaPath -Raw | ConvertFrom-Json
if ($ExpectedCommit -cnotmatch '^[0-9a-f]{40}
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
if (!$ProbeOnly) {
    if ([IO.Path]::GetFileName($model) -cne 'qwen2.5-0.5b-instruct-q4_k_m.gguf' -or
        (Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedGguf) {
        throw 'Lu installed GUI acceptance refuses a non-pinned real GGUF.'
    }
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
    # Windows' native accessibility/UI Automation handles the unchanged app.
    # It does not inject JavaScript or invoke Lu tool IPC directly.
    $ps5 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if (!(Test-Path -LiteralPath $ps5 -PathType Leaf)) { throw 'Windows UI Automation runtime unavailable.' }
    if ($ProbeOnly) {
        & $ps5 -NoProfile -NonInteractive -Sta -ExecutionPolicy Bypass `
            -File (Join-Path $PSScriptRoot 'probe-installed-lu-uia.ps1') `
            -InstalledApp $app -ProfileRoot $profileRoot
        if ($LASTEXITCODE -ne 0) { throw 'Installed Lu Windows accessibility preflight failed.' }
    } else {
        & $ps5 -NoProfile -NonInteractive -Sta -ExecutionPolicy Bypass `
            -File (Join-Path $PSScriptRoot 'run-installed-lu-uia-full.ps1') `
            -InstalledApp $app -ProfileRoot $profileRoot -ModelPath $model
        if ($LASTEXITCODE -ne 0) { throw 'Installed Lu Windows native GUI tool gate failed.' }
    }
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
if ($ProbeOnly) {
    Write-Host 'LU_INSTALLED_GUI_UIA_PREFLIGHT_UNINSTALL_PASS source_pin=true model=not_run'
} else {
    Write-Host 'LU_INSTALLED_GUI_NATIVE_ONLY_UNINSTALL_PASS source_pin=true user_profile_untouched=true'
}
 -or
    $ExpectedInstallerSha256 -cnotmatch '^[0-9a-f]{64}
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
if (!$ProbeOnly) {
    if ([IO.Path]::GetFileName($model) -cne 'qwen2.5-0.5b-instruct-q4_k_m.gguf' -or
        (Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedGguf) {
        throw 'Lu installed GUI acceptance refuses a non-pinned real GGUF.'
    }
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
    # Windows' native accessibility/UI Automation handles the unchanged app.
    # It does not inject JavaScript or invoke Lu tool IPC directly.
    $ps5 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if (!(Test-Path -LiteralPath $ps5 -PathType Leaf)) { throw 'Windows UI Automation runtime unavailable.' }
    if ($ProbeOnly) {
        & $ps5 -NoProfile -NonInteractive -Sta -ExecutionPolicy Bypass `
            -File (Join-Path $PSScriptRoot 'probe-installed-lu-uia.ps1') `
            -InstalledApp $app -ProfileRoot $profileRoot
        if ($LASTEXITCODE -ne 0) { throw 'Installed Lu Windows accessibility preflight failed.' }
    } else {
        & $ps5 -NoProfile -NonInteractive -Sta -ExecutionPolicy Bypass `
            -File (Join-Path $PSScriptRoot 'run-installed-lu-uia-full.ps1') `
            -InstalledApp $app -ProfileRoot $profileRoot -ModelPath $model
        if ($LASTEXITCODE -ne 0) { throw 'Installed Lu Windows native GUI tool gate failed.' }
    }
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
if ($ProbeOnly) {
    Write-Host 'LU_INSTALLED_GUI_UIA_PREFLIGHT_UNINSTALL_PASS source_pin=true model=not_run'
} else {
    Write-Host 'LU_INSTALLED_GUI_NATIVE_ONLY_UNINSTALL_PASS source_pin=true user_profile_untouched=true'
}
) {
    throw 'Lu GUI gate requires source SHA-1 and actual NSIS SHA-256 in lowercase hexadecimal.'
}
$expectedCommit = $ExpectedCommit
$expectedNsis = $ExpectedInstallerSha256
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
if (!$ProbeOnly) {
    if ([IO.Path]::GetFileName($model) -cne 'qwen2.5-0.5b-instruct-q4_k_m.gguf' -or
        (Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedGguf) {
        throw 'Lu installed GUI acceptance refuses a non-pinned real GGUF.'
    }
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
    # Windows' native accessibility/UI Automation handles the unchanged app.
    # It does not inject JavaScript or invoke Lu tool IPC directly.
    $ps5 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if (!(Test-Path -LiteralPath $ps5 -PathType Leaf)) { throw 'Windows UI Automation runtime unavailable.' }
    if ($ProbeOnly) {
        & $ps5 -NoProfile -NonInteractive -Sta -ExecutionPolicy Bypass `
            -File (Join-Path $PSScriptRoot 'probe-installed-lu-uia.ps1') `
            -InstalledApp $app -ProfileRoot $profileRoot
        if ($LASTEXITCODE -ne 0) { throw 'Installed Lu Windows accessibility preflight failed.' }
    } else {
        & $ps5 -NoProfile -NonInteractive -Sta -ExecutionPolicy Bypass `
            -File (Join-Path $PSScriptRoot 'run-installed-lu-uia-full.ps1') `
            -InstalledApp $app -ProfileRoot $profileRoot -ModelPath $model
        if ($LASTEXITCODE -ne 0) { throw 'Installed Lu Windows native GUI tool gate failed.' }
    }
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
if ($ProbeOnly) {
    Write-Host 'LU_INSTALLED_GUI_UIA_PREFLIGHT_UNINSTALL_PASS source_pin=true model=not_run'
} else {
    Write-Host 'LU_INSTALLED_GUI_NATIVE_ONLY_UNINSTALL_PASS source_pin=true user_profile_untouched=true'
}
