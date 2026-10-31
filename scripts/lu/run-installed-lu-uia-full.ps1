# LU-WIN-GUI-01/UIA-B: genuine installed Lu GUI native tool and cold restart.
# No debug app, CDP, WebDriver, direct tool IPC, model text injection or model mock.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$InstalledApp,
    [Parameter(Mandatory=$true)][string]$ProfileRoot,
    [Parameter(Mandatory=$true)][string]$ModelPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$stage = 'preflight'
$state = 'unverified'
$appProcess = $null
$secondProcess = $null
$environment = @{}
$didLaunch = $false
$threadId = ''
$firstPrompt = 'Say hello.'
$toolPrompt = 'Read notes.txt using the advertised lu_files_read_text tool. First respond with ONLY a JSON tool request, not Python, Markdown or prose. Do not invent or guess the file content. Once the tool result is provided, respond with ONLY a JSON final response containing the exact file marker.'

function Check-RunnerPath([string]$path) {
    $root = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
    $full = [IO.Path]::GetFullPath($path)
    if (!$full.StartsWith("$root\", [StringComparison]::OrdinalIgnoreCase)) {
        throw 'UIA worker refuses a file outside isolated runner temp.'
    }
}
function Await-Condition([scriptblock]$condition, [int]$seconds, [string]$label) {
    $limit = [DateTime]::UtcNow.AddSeconds($seconds)
    while ([DateTime]::UtcNow -lt $limit) {
        if (& $condition) { return }
        Start-Sleep -Milliseconds 350
    }
    throw "UIA timed out at $label"
}
function Find-UiName($root, [string]$name) {
    $condition = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::NameProperty, $name)
    return $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}
function Find-UiWindow([System.Diagnostics.Process]$process) {
    $process.Refresh()
    if ($process.HasExited -or $process.MainWindowHandle -eq [IntPtr]::Zero) { return $null }
    $window = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
    if ($null -ne $window -and $window.Current.ProcessId -eq $process.Id) { return $window }
    return $null
}
function Invoke-Ui($element) {
    if ($null -eq $element -or !$element.Current.IsEnabled) { throw 'UIA control unavailable or disabled.' }
    $pattern = $null
    if (!$element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
        throw 'UIA control does not permit invoke.'
    }
    ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
}
function Type-Ui($element, [string]$text, [switch]$SubmitWithEnter) {
    if ($null -eq $element -or !$element.Current.IsEnabled -or
        $element.Current.ControlType -ne [System.Windows.Automation.ControlType]::Edit) {
        throw 'Refusing to type into non-editor UI element.'
    }
    # No SendKeys meta-characters. This is a text/user action, not an IPC call.
    if ($text -cnotmatch '^[A-Za-z0-9 _.,\-]+$') { throw 'UIA fixture text contains send-key controls.' }
    $element.SetFocus()
    [System.Windows.Forms.SendKeys]::SendWait($text)
    if ($SubmitWithEnter) { [System.Windows.Forms.SendKeys]::SendWait('~') }
}
function Find-FirstChatEditor($window) {
    # HTML <label> and <textarea> may share the accessibility Name "Message Lu".
    # Never type into a Text label or select a control by DOM position.
    $condition = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Edit)
    $all = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)
    $enabled = @()
    for($i=0; $i -lt $all.Count; $i++) {
        $candidate = $all.Item($i)
        if ($candidate.Current.IsEnabled -and !$candidate.Current.IsOffscreen) {
            $enabled += $candidate
        }
    }
    $named = @($enabled | Where-Object { $_.Current.Name -ceq 'Message Lu' })
    if ($named.Count -eq 1) { return $named[0] }
    if ($enabled.Count -eq 1) { return $enabled[0] }
    throw 'First chat editor identity ambiguous.'
}
function Find-ThreadEditor([System.Windows.Automation.AutomationElement]$window) {
    $condition = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Edit)
    $all = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)
    $visible = @()
    for($i=0; $i -lt $all.Count; $i++) {
        $candidate = $all.Item($i)
        if ($candidate.Current.IsEnabled -and !$candidate.Current.IsOffscreen -and
            $candidate.Current.Name -cne 'Message Lu') { $visible += $candidate }
    }
    if ($visible.Count -eq 1) { return $visible[0] }
    $message = @($visible | Where-Object { $_.Current.Name -match '(?i)message|chat|ask|prompt' })
    if ($message.Count -eq 1) { return $message[0] }
    throw 'UIA conversation editor identity ambiguous.'
}
function Get-SavedRows([string]$profile) {
    $root = Join-Path $profile 'AppData\Roaming\Lu\data\threads'
    if (!(Test-Path -LiteralPath $root -PathType Container)) { return @() }
    $dirs = @(Get-ChildItem -LiteralPath $root -Directory | Where-Object {
        $_.Name -match '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
    })
    if ($dirs.Count -ne 1) { return @() }
    $script:threadId = $dirs[0].Name
    $file = Join-Path $dirs[0].FullName 'messages.jsonl'
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { return @() }
    if ((Get-Item -LiteralPath $file).Length -gt 1048576) { throw 'Oversized disposable message record.' }
    $rows = @()
    foreach ($line in (Get-Content -LiteralPath $file -Encoding UTF8)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $rows += ($line | ConvertFrom-Json)
    }
    return $rows
}

try {
    if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
        [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) { throw 'Isolated Windows runner required.' }
    Check-RunnerPath $InstalledApp
    Check-RunnerPath $ProfileRoot
    Check-RunnerPath $ModelPath
    if (Test-Path -LiteralPath $ProfileRoot) { throw 'Refusing to overwrite profile.' }
    if ([IO.Path]::GetFileName($InstalledApp) -cne 'Lu-Desktop.exe' -or
        !(Test-Path -LiteralPath $InstalledApp -PathType Leaf)) { throw 'No installed Lu app.' }
    $modelName = 'qwen2.5-0.5b-instruct-q4_k_m.gguf'
    $expectedHash = '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db'
    if ([IO.Path]::GetFileName($ModelPath) -cne $modelName -or
        (Get-FileHash -LiteralPath $ModelPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedHash) {
        throw 'Unpinned GGUF fixture.'
    }
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    Add-Type -AssemblyName System.Windows.Forms
    foreach($name in @('JAN_DATA_ROOT','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','TEMP','TMP')) {
        $environment[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
    }
    $stage = 'profile'
    New-Item -ItemType Directory -Path $ProfileRoot -Force | Out-Null
    foreach($dir in @('AppData\Roaming','AppData\Local','tmp')) {
        New-Item -ItemType Directory -Path (Join-Path $ProfileRoot $dir) -Force | Out-Null
    }
    $modelDir = Join-Path $ProfileRoot 'AppData\Roaming\Lu\data\lu-models'
    New-Item -ItemType Directory -Path $modelDir -Force | Out-Null
    Copy-Item -LiteralPath $ModelPath -Destination (Join-Path $modelDir $modelName)
    if ((Get-FileHash -LiteralPath (Join-Path $modelDir $modelName) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedHash) {
        throw 'Copied model changed.'
    }
    $env:JAN_DATA_ROOT = $ProfileRoot
    $env:USERPROFILE = $ProfileRoot
    $env:HOME = $ProfileRoot
    $env:APPDATA = Join-Path $ProfileRoot 'AppData\Roaming'
    $env:LOCALAPPDATA = Join-Path $ProfileRoot 'AppData\Local'
    $env:TEMP = Join-Path $ProfileRoot 'tmp'
    $env:TMP = $env:TEMP
    $stage = 'desktop-A'
    $appProcess = Start-Process -FilePath $InstalledApp -WorkingDirectory ([IO.Path]::GetDirectoryName($InstalledApp)) -PassThru
    $didLaunch = $true
    $window = $null
    Await-Condition { $script:window = Find-UiWindow $appProcess; $null -ne $script:window } 60 'desktop-A-window'
    $stage = 'model-picker'
    $picker = $null
    Await-Condition { $script:picker = Find-UiName $window 'Lu GGUF model'; $null -ne $script:picker } 45 'model-picker'
    $stage = 'model-load'
    $load = Find-UiName $window 'Load'
    Invoke-Ui $load
    Await-Condition { $null -ne (Find-UiName $window 'Loaded') } 150 'real-GGUF-ready'
    $stage = 'native-chat-selection'
    $toggle = Find-UiName $window 'Use Lu for this chat'
    if ($null -eq $toggle) { throw 'Native chat toggle missing.' }
    $tp = $null
    if (!$toggle.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern,[ref]$tp)) {
        throw 'Native chat checkbox cannot be toggled.'
    }
    if (([System.Windows.Automation.TogglePattern]$tp).Current.ToggleState -ne
        [System.Windows.Automation.ToggleState]::On) {
        ([System.Windows.Automation.TogglePattern]$tp).Toggle()
    }
    $stage = 'first-editor-selection'
    $firstEdit = Find-FirstChatEditor $window
    $stage = 'first-type'
    Type-Ui $firstEdit $firstPrompt
    $stage = 'first-send'
    Invoke-Ui (Find-UiName $window 'Send to Lu')
    $stage = 'first-assistant-persistence'
    Await-Condition {
        try {
            $rows = @(Get-SavedRows $ProfileRoot)
            @($rows | Where-Object { $_.role -ceq 'user' }).Count -ge 1 -and
                @($rows | Where-Object { $_.role -ceq 'assistant' }).Count -ge 1
        } catch { $false }
    } 200 'first-assistant-persistence'
    $stage = 'isolated-tool-fixture'
    if ([string]::IsNullOrWhiteSpace($threadId)) { throw 'No trusted chat directory identity.' }
    $workspace = Join-Path $ProfileRoot ("AppData\Roaming\Lu\data\agent-workspace\threads\$threadId")
    New-Item -ItemType Directory -Path $workspace -Force | Out-Null
    $marker = 'LU_GUI_NATIVE_PROOF_' + [guid]::NewGuid().ToString('N')
    $file = Join-Path $workspace 'notes.txt'
    if (Test-Path -LiteralPath $file) { throw 'Tool fixture already exists.' }
    [IO.File]::WriteAllText($file, $marker + "`n", [Text.UTF8Encoding]::new($false))
    $stage = 'model-tool-prompt'
    $window = Find-UiWindow $appProcess
    if ($null -eq $window) { throw 'Lu window vanished before real native tool prompt.' }
    $threadEdit = Find-ThreadEditor $window
    Type-Ui $threadEdit $toolPrompt -SubmitWithEnter
    $stage = 'model-tool-and-audit'
    $validated = $false
    $evidenceScript = Join-Path $PSScriptRoot 'verify-installed-lu-uia-evidence.mjs'
    Await-Condition {
        & node --no-warnings $evidenceScript $ProfileRoot $threadId $marker $toolPrompt *> $null
        $script:validated = $LASTEXITCODE -eq 0
        $script:validated
    } 240 'real-tool-audit'
    if (!$validated) { throw 'Native tool evidence missing.' }
    Write-Host 'LU_INSTALLED_UIA_REAL_NATIVE_TOOL_PASS model=true tool=1 journal=true assistant_saved=true'
    $stage = 'normal-exit'
    if (!$appProcess.CloseMainWindow()) { throw 'Normal Lu desktop close was not accepted.' }
    if (!$appProcess.WaitForExit(20000)) { throw 'Lu desktop did not stop normally.' }
    $oldId = $appProcess.Id
    $stage = 'cold-process-B'
    $secondProcess = Start-Process -FilePath $InstalledApp -WorkingDirectory ([IO.Path]::GetDirectoryName($InstalledApp)) -PassThru
    if ($secondProcess.Id -eq $oldId) { throw 'Second desktop did not receive new process identity.' }
    $secondWindow = $null
    Await-Condition { $script:secondWindow = Find-UiWindow $secondProcess; $null -ne $script:secondWindow } 60 'second-desktop-window'
    # Independent persistence check after process A exited; model is not loaded
    # or prompted in process B. This checks disk presence, not GUI render.
    $stage = 'cold-persisted-recovery'
    & node --no-warnings $evidenceScript $ProfileRoot $threadId $marker $toolPrompt *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Saved native tool turn was not recoverable on second host.' }
    Write-Host 'LU_INSTALLED_UIA_COLD_STORAGE_PASS second_process=true no_regeneration=true saved=true'
    $state = 'success'
} catch {
    # Only fixed stage codes leave the disposable runner. Never print model
    # prompts/output, token, private profile paths, raw exceptions or SQL.
    Write-Host "LU_INSTALLED_UIA_NATIVE_TOOL_FAIL stage=$stage category=runtime"
    exit 1
} finally {
    foreach($p in @($appProcess,$secondProcess)) {
        if ($null -eq $p) { continue }
        try { if (!$p.HasExited) { $p.Kill(); $p.WaitForExit(15000) | Out-Null } } catch {}
        $p.Dispose()
    }
    foreach($name in $environment.Keys) {
        [Environment]::SetEnvironmentVariable($name,$environment[$name],'Process')
    }
}
