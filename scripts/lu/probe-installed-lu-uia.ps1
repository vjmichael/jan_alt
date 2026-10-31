# LU-WIN-GUI-01/UIA-A: real installed Windows Lu desktop accessibility preflight.
# Runs only in a disposable Windows runner; does NOT invoke any Lu IPC or tools,
# download a model, or edit the installed binary. Outputs only enum witnesses.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$InstalledApp,
    [Parameter(Mandatory=$true)][string]$ProfileRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'UIA preflight requires disposable Windows runner.'
}
$runner = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
function Assert-RunnerPath([string]$path) {
    $full = [IO.Path]::GetFullPath($path)
    if (!$full.StartsWith("$runner\",[StringComparison]::OrdinalIgnoreCase)) {
        throw 'UIA preflight path escaped runner temp.'
    }
}
Assert-RunnerPath $InstalledApp
Assert-RunnerPath $ProfileRoot
if (!(Test-Path -LiteralPath $InstalledApp -PathType Leaf) -or
    [IO.Path]::GetFileName($InstalledApp) -cne 'Lu-Desktop.exe') {
    throw 'UIA preflight requires installed Lu-Desktop.exe.'
}
if (Test-Path -LiteralPath $ProfileRoot) {
    throw 'UIA preflight refuses an existing profile root.'
}
$stage = 'load-uia'
$status = 'unavailable'
$hostExited = $false
$hasWindow = $false
$hasPicker = $false
$hasMessage = $false
$owned = $null
$saved = @{}
try {
    # UIAutomationClient is part of Windows/.NET Framework, not an app add-on.
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    Add-Type -AssemblyName System.Windows.Forms
    $stage = 'start-host'
    foreach ($name in @('JAN_DATA_ROOT','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','TEMP','TMP')) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
    }
    New-Item -ItemType Directory -Path $ProfileRoot -Force | Out-Null
    foreach ($dir in @('AppData\Roaming','AppData\Local','tmp')) {
        New-Item -ItemType Directory -Path (Join-Path $ProfileRoot $dir) -Force | Out-Null
    }
    $env:JAN_DATA_ROOT = $ProfileRoot
    $env:USERPROFILE = $ProfileRoot
    $env:HOME = $ProfileRoot
    $env:APPDATA = Join-Path $ProfileRoot 'AppData\Roaming'
    $env:LOCALAPPDATA = Join-Path $ProfileRoot 'AppData\Local'
    $env:TEMP = Join-Path $ProfileRoot 'tmp'
    $env:TMP = $env:TEMP
    $owned = Start-Process -FilePath $InstalledApp -WorkingDirectory ([IO.Path]::GetDirectoryName($InstalledApp)) -PassThru
    if (!$owned) { throw 'Lu test process not created.' }
    $expectedId = [int]$owned.Id
    $stage = 'window-discovery'
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    $window = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        $owned.Refresh()
        if ($owned.HasExited) { $hostExited = $true; break }
        $handle = $owned.MainWindowHandle
        if ($handle -ne [IntPtr]::Zero) {
            try {
                $window = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
                if ($null -ne $window -and $window.Current.ProcessId -eq $expectedId) {
                    $hasWindow = $true
                    break
                }
            } catch [System.Windows.Automation.ElementNotAvailableException] {
                $window = $null
            }
        }
        Start-Sleep -Milliseconds 350
    }
    if (!$hasWindow) {
        $status = if ($hostExited) { 'host-exited' } else { 'window-unavailable' }
        throw 'Lu Windows accessibility main window not found.'
    }
    $stage = 'uia-control-discovery'
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $pickerCond = [System.Windows.Automation.PropertyCondition]::new(
                [System.Windows.Automation.AutomationElement]::NameProperty, 'Lu GGUF model')
            $messageCond = [System.Windows.Automation.PropertyCondition]::new(
                [System.Windows.Automation.AutomationElement]::NameProperty, 'Message Lu')
            $picker = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$pickerCond)
            $message = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$messageCond)
            $hasPicker = $null -ne $picker
            $hasMessage = $null -ne $message
            if ($hasPicker -and $hasMessage) { break }
        } catch [System.Windows.Automation.ElementNotAvailableException] {
            $window = [System.Windows.Automation.AutomationElement]::FromHandle($owned.MainWindowHandle)
        }
        Start-Sleep -Milliseconds 350
    }
    if (!$hasPicker -or !$hasMessage) {
        $status = if (!$hasPicker) { 'model-picker-unavailable' } else { 'message-edit-unavailable' }
        throw 'Lu UIA control availability rejected.'
    }
    # An accessible picker and first-message edit are a preflight, not a chat
    # or tool execution. Do not claim installed GUI tool acceptance here.
    Write-Host 'LU_INSTALLED_UIA_PREFLIGHT_PASS window=true picker=true editor=true model=not_run tool=not_run'
    $status = 'pass'
} catch {
    Write-Host "LU_INSTALLED_UIA_PREFLIGHT_FAIL stage=$stage status=$status hostExited=$($hostExited.ToString().ToLowerInvariant()) window=$($hasWindow.ToString().ToLowerInvariant()) picker=$($hasPicker.ToString().ToLowerInvariant()) editor=$($hasMessage.ToString().ToLowerInvariant())"
    exit 1
} finally {
    foreach ($name in $saved.Keys) {
        [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process')
    }
    if ($null -ne $owned) {
        try {
            if (!$owned.HasExited) {
                # Own only this exact test process created above. Do not match
                # other Lu/Jan processes by name, title or window hierarchy.
                $owned.Kill()
                $owned.WaitForExit(15000) | Out-Null
            }
        } catch {}
        $owned.Dispose()
    }
}
