# Windows x86-64 Lu startup and side-by-side profile isolation smoke.
# Runs ONLY inside an ephemeral GitHub Actions Windows VM. It neither installs
# Lu nor contacts a model provider. The calling installer smoke owns uninstall.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $InstallDir,
    [int] $UptimeSeconds = 12,
    [switch] $RequireNativeMcpFirstRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'Lu startup smoke requires a disposable Windows GitHub Actions runner.'
}
if ($UptimeSeconds -lt 3 -or $UptimeSeconds -gt 60) {
    throw 'Lu startup probe uptime must be between 3 and 60 seconds.'
}
$runnerRoot = [System.IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
$folder = [System.IO.Path]::GetFullPath($InstallDir)
if (!$folder.StartsWith("$runnerRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Lu startup executable is outside the runner temporary installation directory.'
}
$appExe = Join-Path $folder 'Lu-Desktop.exe'
if (!(Test-Path -LiteralPath $appExe -PathType Leaf)) {
    throw 'Cannot run Lu startup smoke without an installed Lu-Desktop.exe.'
}
$roaming = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
if ([string]::IsNullOrWhiteSpace($roaming) -or !(Test-Path -LiteralPath $roaming)) {
    throw 'Windows roaming application data location is unavailable.'
}

# These guards are installed ONLY in this disposable VM. A real Jan install
# should not be present; refuse to touch its files or protocol registration.
$janProfile = Join-Path $roaming 'Jan'
$janBundle = Join-Path $roaming 'jan.ai.app'
$janRegPath = 'Software\Classes\jan'
$existingJanRegistry = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($janRegPath, $false)
if ($null -ne $existingJanRegistry) {
    $existingJanRegistry.Dispose()
    throw 'Runner unexpectedly contains a jan:// handler; refusing to overwrite it.'
}
foreach ($p in @($janProfile, $janBundle)) {
    if (Test-Path -LiteralPath $p) {
        throw "Runner unexpectedly contains a Jan profile at $p; refusing to modify it."
    }
}

$probeRoot = Join-Path $runnerRoot "lu-live-probe-$([guid]::NewGuid().ToString('N'))"
$janData = Join-Path $janProfile 'data'
$janSettings = Join-Path $janProfile 'settings.json'
$janMarker = Join-Path $janData 'mcp_config.json'
$janBundleMarker = Join-Path $janBundle 'jan-only-marker.txt'
$markerText = "Jan must survive Lu startup — $([guid]::NewGuid())"
$expectedHandler = '"C:\SentinelJan\Jan-Desktop.exe" "%1"'
$createdJanProfile = $false
$createdJanBundle = $false
$createdJanRegistry = $false
$proc = $null

function Assert-JanUntouched {
    if (!(Test-Path -LiteralPath $janSettings -PathType Leaf) -or
        !(Test-Path -LiteralPath $janMarker -PathType Leaf) -or
        !(Test-Path -LiteralPath $janBundleMarker -PathType Leaf)) {
        throw 'Lu startup deleted or moved a sentinel in Jan application data.'
    }
    if ((Get-Content -LiteralPath $janSettings -Raw) -cne $markerText -or
        (Get-Content -LiteralPath $janMarker -Raw) -cne $markerText -or
        (Get-Content -LiteralPath $janBundleMarker -Raw) -cne $markerText) {
        throw 'Lu startup modified an existing Jan profile sentinel.'
    }
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("$janRegPath\shell\open\command", $false)
    if ($null -eq $key) {
        throw 'Lu startup removed the jan:// protocol association.'
    }
    try {
        if ($key.GetValue('') -cne $expectedHandler) {
            throw 'Lu startup replaced the jan:// protocol handler owned by Jan.'
        }
    } finally {
        $key.Dispose()
    }
}

try {
    [System.IO.Directory]::CreateDirectory($janData) | Out-Null
    $createdJanProfile = $true
    [System.IO.Directory]::CreateDirectory($janBundle) | Out-Null
    $createdJanBundle = $true
    # No JSON deserialization should occur in Lu's copy of Jan's settings.
    # It is an intentionally opaque user-owned sentinel, not a Lu fixture.
    [System.IO.File]::WriteAllText($janSettings, $markerText)
    [System.IO.File]::WriteAllText($janMarker, $markerText)
    [System.IO.File]::WriteAllText($janBundleMarker, $markerText)

    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("$janRegPath\shell\open\command")
    if ($null -eq $key) { throw 'Cannot create disposable Jan protocol sentinel.' }
    $createdJanRegistry = $true
    try { $key.SetValue('', $expectedHandler, [Microsoft.Win32.RegistryValueKind]::String) }
    finally { $key.Dispose() }
    Assert-JanUntouched

    [System.IO.Directory]::CreateDirectory($probeRoot) | Out-Null
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $appExe
    $psi.WorkingDirectory = $folder
    $psi.UseShellExecute = $false
    # LU_DATA_ROOT is the shipping resolver's explicit OS data root override.
    # This must NOT reconfigure JAN_DATA_ROOT or the user's real Jan install.
    $psi.Environment['LU_DATA_ROOT'] = $probeRoot
    $psi.Environment['LU_DATA_FOLDER'] = (Join-Path $probeRoot 'Lu\data')
    $psi.Environment['JAN_DATA_ROOT'] = $roaming
    $psi.Environment['JAN_DATA_FOLDER'] = $janData

    Write-Host 'Launching installed Lu-Desktop.exe with an isolated Lu data root.'
    $proc = [System.Diagnostics.Process]::Start($psi)
    if ($null -eq $proc) { throw 'Windows refused to create the Lu desktop process.' }
    for ($second = 0; $second -lt $UptimeSeconds; $second++) {
        if ($proc.HasExited) {
            $code = $proc.ExitCode
            throw "Lu-Desktop.exe exited during the $UptimeSeconds-second bootstrap probe (exit code $code)."
        }
        Start-Sleep -Seconds 1
    }
    if ($proc.HasExited) {
        throw "Lu-Desktop.exe exited during startup (exit code $($proc.ExitCode))."
    }
    Assert-JanUntouched
    # The desktop writes its own logs under the isolated LU_DATA_FOLDER.
    # Merely keeping the GUI process alive hid a missing worker in previous CI:
    # the installed worker existed at bin/ but desktop looked in resources/bin/.
    # Fail closed if the startup log is missing, or if provisioning reports an
    # engine/worker startup error despite the process remaining alive.
    $appLogFolder = Join-Path $probeRoot 'Lu\data\logs'
    $appLogFiles = @()
    if (Test-Path -LiteralPath $appLogFolder -PathType Container) {
        $appLogFiles = @(Get-ChildItem -LiteralPath $appLogFolder -File -Filter 'app*.log')
    }
    if ($appLogFiles.Count -eq 0) {
        throw "Lu desktop startup did not produce its expected diagnostic log at $appLogFolder; cannot establish worker startup health."
    }
    $appLogText = ($appLogFiles | ForEach-Object {
        Get-Content -LiteralPath $_.FullName -Raw
    }) -join "`n"
    if ($appLogText -match '(?i)(engine failed to start during provisioning|jan-llama-worker(?:\.exe)? was not found|router refresh after import[^\r\n]*worker[^\r\n]*not found)') {
        throw 'Lu desktop reported an engine provisioning/worker discovery error; bootstrap uptime and direct worker handshake do not satisfy desktop startup acceptance.'
    }
    Write-Host 'Lu desktop diagnostic log exists and contains no engine provisioning or worker discovery failure.'
    # A missing or unrecognized error line must not count as successful engine
    # provisioning. Prove that this installed Lu process spawned its own
    # resident worker, rather than accepting an unrelated process by name.
    $ownedWorkers = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'jan-llama-worker.exe'" -ErrorAction Stop |
        Where-Object { [int]$_.ParentProcessId -eq [int]$proc.Id })
    if ($ownedWorkers.Count -ne 1) {
        throw "Installed Lu desktop did not retain exactly one directly owned jan-llama-worker.exe (found $($ownedWorkers.Count))."
    }
    Write-Host "Installed Lu desktop has its own running worker PID $($ownedWorkers[0].ProcessId)."
    if ($RequireNativeMcpFirstRun) {
        $luMcpConfig = Join-Path $probeRoot 'Lu\data\mcp_config.json'
        if (!(Test-Path -LiteralPath $luMcpConfig -PathType Leaf)) {
            throw 'Fresh Lu profile did not create its own MCP configuration.'
        }
        $config = Get-Content -LiteralPath $luMcpConfig -Raw | ConvertFrom-Json -AsHashtable
        if (!$config.ContainsKey('mcpServers') -or $config.mcpServers.Count -ne 0) {
            throw 'Fresh Lu profile imported Jan MCP server defaults instead of native-first empty servers.'
        }
        Write-Host 'Confirmed Lu fresh profile uses an empty MCP server list.'
    }
    Write-Host "Lu desktop process stayed alive for $UptimeSeconds seconds; Jan sentinels and jan:// handler are intact."
    Write-Host 'This is a process bootstrap check, not a GUI rendering, model-loading, or inference test.'
} finally {
    if ($null -ne $proc) {
        try {
            if (!$proc.HasExited) {
                $proc.Kill($true)
                $null = $proc.WaitForExit(15000)
            }
        } finally { $proc.Dispose() }
    }
    if ($createdJanRegistry) {
        [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($janRegPath, $false)
    }
    if ($createdJanProfile -and (Test-Path -LiteralPath $janProfile)) {
        Remove-Item -LiteralPath $janProfile -Recurse -Force
    }
    if ($createdJanBundle -and (Test-Path -LiteralPath $janBundle)) {
        Remove-Item -LiteralPath $janBundle -Recurse -Force
    }
    if (Test-Path -LiteralPath $probeRoot) {
        Remove-Item -LiteralPath $probeRoot -Recurse -Force
    }
}
