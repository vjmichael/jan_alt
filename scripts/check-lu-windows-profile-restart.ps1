# W05: run the installed Lu-Desktop.exe as three separate processes:
# profile A -> profile B -> profile A. Confirm owned worker, positive profile
# writes, preserved checkpoint and no Jan / cross-profile modifications.
# Does not claim to restore a model session or chat transcript.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $InstallDir,
    [ValidateRange(5, 45)][int] $StartupTimeoutSeconds = 30
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'Lu profile restart probe runs only in disposable Windows Actions.'
}
$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd([char]92)
$installed = (Resolve-Path -LiteralPath $InstallDir -ErrorAction Stop).ProviderPath
if (!$installed.StartsWith("$runnerRoot\", [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Lu installed profile probe refuses an installation outside runner temp.'
}
$app = Join-Path $installed 'Lu-Desktop.exe'
if (!(Test-Path -LiteralPath $app -PathType Leaf) -or
    (Test-Path -LiteralPath (Join-Path $installed 'Jan-Desktop.exe'))) {
    throw 'Expected installed Lu executable only, without Jan-Desktop.exe.'
}
$probeRoot = Join-Path $runnerRoot ("lu-profile-restart-" + [guid]::NewGuid().ToString('N'))
$profileA = Join-Path $probeRoot 'profile-a'
$profileB = Join-Path $probeRoot 'profile-b'
$janHome = Join-Path $probeRoot 'jan-sentinel'
$janRoaming = Join-Path $janHome 'AppData\Roaming'
$janData = Join-Path $janRoaming 'Jan\data'
$janMarker = Join-Path $janData 'jan-owned-do-not-change.txt'
$janText = 'LU_W05_JAN_SENTINEL_' + [guid]::NewGuid().ToString('N')
$checkpointText = 'LU_W05_PERSISTED_LU_SENTINEL_' + [guid]::NewGuid().ToString('N')

function Initialize-Home([string] $profileRoot) {
    foreach ($path in @(
        $profileRoot,
        (Join-Path $profileRoot 'AppData\Roaming'),
        (Join-Path $profileRoot 'AppData\Local'),
        (Join-Path $profileRoot 'tmp')
    )) {
        [IO.Directory]::CreateDirectory($path) | Out-Null
    }
}
function Get-ProfileData([string] $profileRoot) {
    return (Join-Path $profileRoot 'AppData\Roaming\Lu\data')
}
function Assert-JanSentinel {
    if (!(Test-Path -LiteralPath $janMarker -PathType Leaf) -or
        [IO.File]::ReadAllText($janMarker) -cne $janText) {
        throw 'Installed Lu modified the disposable Jan profile sentinel.'
    }
}
function Get-ProfileFingerprint([string] $profileRoot) {
    $data = Get-ProfileData $profileRoot
    if (!(Test-Path -LiteralPath $data -PathType Container)) {
        throw "Lu did not create its own profile: $data"
    }
    $records = @(
        Get-ChildItem -LiteralPath $data -Recurse -File |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($data.Length)
            $digest = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
            "$relative=$digest"
        }
    )
    if (@($records).Count -eq 0) { throw 'Lu startup produced no app-owned files.' }
    return ($records -join [Environment]::NewLine)
}
function Invoke-LuProfileStart([string] $profileRoot, [string] $phase) {
    $roaming = Join-Path $profileRoot 'AppData\Roaming'
    $local = Join-Path $profileRoot 'AppData\Local'
    $data = Get-ProfileData $profileRoot
    $process = $null
    try {
        $psi = [Diagnostics.ProcessStartInfo]::new()
        $psi.FileName = $app
        $psi.WorkingDirectory = $installed
        $psi.UseShellExecute = $false
        # The shipped Lu resolver uses LU_DATA_ROOT; confine Chromium and
        # all legacy Jan fallback variables to disposable roots as well.
        $psi.Environment['LU_DATA_ROOT'] = $roaming
        $psi.Environment['LU_DATA_FOLDER'] = $data
        $psi.Environment['JAN_DATA_ROOT'] = $janRoaming
        $psi.Environment['JAN_DATA_FOLDER'] = $janData
        $psi.Environment['APPDATA'] = $roaming
        $psi.Environment['LOCALAPPDATA'] = $local
        $psi.Environment['USERPROFILE'] = $profileRoot
        $psi.Environment['HOME'] = $profileRoot
        $psi.Environment['TEMP'] = (Join-Path $profileRoot 'tmp')
        $psi.Environment['TMP'] = (Join-Path $profileRoot 'tmp')
        Write-Host "Starting installed Lu in disposable $phase profile."
        $process = [Diagnostics.Process]::Start($psi)
        if ($null -eq $process) { throw "Lu $phase did not start." }
        $ready = $false
        for ($second = 0; $second -lt $StartupTimeoutSeconds; $second++) {
            if ($process.HasExited) { throw "Lu $phase exited ($($process.ExitCode))." }
            $logs = Join-Path $data 'logs'
            $logFiles = if (Test-Path -LiteralPath $logs -PathType Container) {
                @(Get-ChildItem -LiteralPath $logs -File -Filter 'app*.log')
            } else { @() }
            $workers = @(Get-CimInstance Win32_Process -Filter "Name = 'jan-llama-worker.exe'" -ErrorAction Stop |
                Where-Object { [int]$_.ParentProcessId -eq [int]$process.Id })
            $mcpPath = Join-Path $data 'mcp_config.json'
            # PowerShell StrictMode rejects .Count on an unexpected scalar.
            # Normalize collections before evaluating the startup gate.
            if (@($logFiles).Count -gt 0 -and @($workers).Count -eq 1 -and
                (Test-Path -LiteralPath $mcpPath -PathType Leaf)) {
                $allLogs = ($logFiles | ForEach-Object {
                    Get-Content -LiteralPath $_.FullName -Raw
                }) -join [Environment]::NewLine
                if ($allLogs -match '(?i)(engine failed to start during provisioning|jan-llama-worker(?:\.exe)? was not found|router refresh after import[^\r\n]*worker[^\r\n]*not found)') {
                    throw "Lu $phase reported an engine provisioning/worker discovery error."
                }
                $ready = $true
                break
            }
            Start-Sleep -Seconds 1
        }
        if (!$ready) {
            throw "Installed Lu $phase never created a log and directly owned worker."
        }
        $mcpPath = Join-Path $data 'mcp_config.json'
        if (!(Test-Path -LiteralPath $mcpPath -PathType Leaf)) {
            throw "Lu $phase did not establish its native-first MCP config."
        }
        $config = Get-Content -LiteralPath $mcpPath -Raw | ConvertFrom-Json -AsHashtable
        # A malformed/missing config must fail as an explicit schema error,
        # rather than as a cryptic StrictMode "Count property not found".
        if ($config -isnot [System.Collections.IDictionary] -or
            !$config.Contains('mcpServers') -or
            $config['mcpServers'] -isnot [System.Collections.IDictionary]) {
            throw "Lu $phase wrote invalid native-first MCP config shape."
        }
        $serverEntries = @($config['mcpServers'].Keys)
        if ($serverEntries.Count -ne 0) {
            throw "Lu $phase imported foreign Jan MCP defaults."
        }
        Assert-JanSentinel
        Write-Host "Lu $phase started with its own profile and resident directly owned worker."
    } catch {
        # The caller's stack used to end at smoke-lu-windows-x64.ps1 only.
        # Surface the exact W05 phase and first failed probe to make the next
        # disposable Windows run diagnostically useful.
        throw "LU_W05_PHASE_FAILURE phase=$phase detail=$($_.Exception.Message) location=$($_.ScriptStackTrace)"
    } finally {
        if ($null -ne $process) {
            try {
                if (!$process.HasExited) {
                    $process.Kill($true)
                    if (!$process.WaitForExit(15000)) {
                        throw "Failed to stop the $phase installed Lu process."
                    }
                }
            } finally { $process.Dispose() }
        }
    }
}
try {
    Initialize-Home $profileA
    Initialize-Home $profileB
    [IO.Directory]::CreateDirectory($janData) | Out-Null
    [IO.File]::WriteAllText($janMarker, $janText)

    Invoke-LuProfileStart $profileA 'A-first'
    $aData = Get-ProfileData $profileA
    $aMarker = Join-Path $aData 'lu-only-restore-checkpoint.txt'
    [IO.File]::WriteAllText($aMarker, $checkpointText)
    $aFingerprint = Get-ProfileFingerprint $profileA
    if (Test-Path -LiteralPath (Get-ProfileData $profileB)) {
        throw 'Profile A unexpectedly initialized profile B.'
    }

    Invoke-LuProfileStart $profileB 'B-independent'
    $bData = Get-ProfileData $profileB
    if (Test-Path -LiteralPath (Join-Path $bData 'lu-only-restore-checkpoint.txt')) {
        throw 'Lu B inherited the Lu A checkpoint.'
    }
    if ((Get-ProfileFingerprint $profileA) -cne $aFingerprint) {
        throw 'Lu B changed profile A data.'
    }
    $bFingerprint = Get-ProfileFingerprint $profileB

    Invoke-LuProfileStart $profileA 'A-restart'
    if (!(Test-Path -LiteralPath $aMarker -PathType Leaf) -or
        [IO.File]::ReadAllText($aMarker) -cne $checkpointText) {
        throw 'Lu A restart failed to preserve its existing data.'
    }
    if ((Get-ProfileFingerprint $profileB) -cne $bFingerprint) {
        throw 'Lu A restart changed profile B data.'
    }
    Assert-JanSentinel
    Write-Host 'LU_W05_INSTALLED_PROFILE_RESTART_PASS runs=3 roots=2 preserved=true cross_profile_writes=0 jan_sentinel=true'
} finally {
    if (Test-Path -LiteralPath $probeRoot) {
        $checked = [IO.Path]::GetFullPath($probeRoot)
        if (!$checked.StartsWith("$runnerRoot\", [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Refusing to clean a directory outside disposable runner temp.'
        }
        Remove-Item -LiteralPath $checked -Recurse -Force
    }
}
