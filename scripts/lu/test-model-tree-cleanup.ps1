[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'Lu model-tree test requires isolated Windows Actions runner'
}
. (Join-Path $PSScriptRoot 'model-tree-cleanup.ps1')
$folder = Join-Path $env:RUNNER_TEMP ('lu-model-tree-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$fake = Join-Path $folder 'llama-server.exe'
$owned = $null
$captured = @()
try {
    # Renamed native Windows Command Processor is a disposable test fixture,
    # NOT the Lu model engine or a replacement NSIS executable.
    Copy-Item -LiteralPath $env:ComSpec -Destination $fake -ErrorAction Stop
    $owned = Start-Process -FilePath $fake -ArgumentList '/c ping -n 25 127.0.0.1 >nul' -PassThru -NoNewWindow
    if (!$owned) { throw 'Could not start fake supervised subprocess tree' }
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ([DateTime]::UtcNow -lt $deadline) {
        $captured = @(Capture-LuModelTree $PID)
        if ($captured.Count -ge 2) { break }
        Start-Sleep -Milliseconds 250
    }
    if ($captured.Count -lt 2) { throw 'Did not capture model child and descendant' }
    if (Test-LuModelTreeExited $captured) {
        throw 'Live model tree was mistakenly classified as cleaned up'
    }
    $owned.Kill()
    $owned.WaitForExit(10000) | Out-Null
    # The parent is gone: the test checks original descendant identities,
    # not only current ParentProcessId; orphaned children must be detected.
    $still = @(Get-CimInstance Win32_Process -ErrorAction Stop |
        Where-Object { $captured.ProcessId -contains $_.ProcessId })
    if ($still.Count -gt 0 -and (Test-LuModelTreeExited $captured)) {
        throw 'Orphaned descendant was incorrectly accepted as exited'
    }
    foreach ($item in $captured) {
        $live = @(Get-CimInstance Win32_Process -Filter "ProcessId = $($item.ProcessId)" -ErrorAction Stop)
        if ($live.Count -gt 0 -and
            ([string]$live[0].CreationDate) -ceq $item.Started) {
            Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    $closed = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-LuModelTreeExited $captured) { $closed = $true; break }
        Start-Sleep -Milliseconds 200
    }
    if (!$closed) { throw 'Model tree snapshot still detects owned descendant after test cleanup' }
    Write-Host 'LU_WIN6_MODEL_TREE_EVIDENCE_TEST_PASS model_service=true descendant=true parent_exited=true'
} finally {
    if ($null -ne $owned) {
        try { if (!$owned.HasExited) { $owned.Kill(); $owned.WaitForExit(10000) | Out-Null } } catch {}
        $owned.Dispose()
    }
    foreach ($item in $captured) {
        try {
            $live = @(Get-CimInstance Win32_Process -Filter "ProcessId = $($item.ProcessId)" -ErrorAction SilentlyContinue)
            if ($live.Count -gt 0 -and ([string]$live[0].CreationDate) -ceq $item.Started) {
                Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue
            }
        } catch {}
    }
    Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue
}
