# Packaged Lu Windows x86-64 llama.cpp worker smoke, with no external API
# or model/GPU requirement. Runs exclusively on an ephemeral Windows CI VM.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $InstallDir,
    [int] $StartupTimeoutSeconds = 90,
    [string] $ModelPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'Worker probe runs only on disposable Windows GitHub Actions hosts.'
}
$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
$install = [IO.Path]::GetFullPath($InstallDir)
if (!$install.StartsWith("$runnerRoot\", [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Worker probe refuses any installation outside disposable runner root.'
}
if ($StartupTimeoutSeconds -lt 5 -or $StartupTimeoutSeconds -gt 120) {
    throw 'Invalid startup timeout.'
}
$workers = @(Get-ChildItem -LiteralPath $install -Filter 'jan-llama-worker.exe' -Recurse -File)
if ($workers.Count -ne 1) {
    throw "Expected one installed llama.cpp worker, found $($workers.Count)."
}
$worker = $workers[0]
$folder = $worker.DirectoryName
if (!$folder.StartsWith("$install\", [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Worker path escapes Lu installation.'
}
if (@(Get-ChildItem -LiteralPath $folder -Filter 'ggml*.dll' -File).Count -eq 0) {
    throw 'No ggml backend DLL is adjacent to Lu worker.'
}
$presetDir = Join-Path $runnerRoot "lu-engine-probe-$([Guid]::NewGuid().ToString('N'))"
[IO.Directory]::CreateDirectory($presetDir) | Out-Null
$preset = Join-Path $presetDir 'empty.preset.ini'
$modelPresent = ![string]::IsNullOrWhiteSpace($ModelPath)
if ($modelPresent) {
    $modelFull = [IO.Path]::GetFullPath($ModelPath)
    if (!$modelFull.StartsWith("$runnerRoot\", [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $modelFull -PathType Leaf) -or [IO.Path]::GetExtension($modelFull) -ne '.gguf') {
        throw 'GGUF must be an existing file in ephemeral runner temp.'
    }
    $presetLines = @('[*]', 'parallel = 1', 'threads = 2', 'ctx-size = 512', 'n-gpu-layers = 0', 'no-warmup = true', 'fit = off', '', '[smoke-model]', "model = $modelFull", 'load-on-startup = false')
} else {
    $presetLines = @('[*]', 'parallel = 1')
}
[IO.File]::WriteAllLines($preset, $presetLines)
$key = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$proc = $null
$stopped = $false
try {
    $psi = [Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $worker.FullName
    $psi.WorkingDirectory = $folder
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    # Never deadlock on worker startup stderr; let the disposable CI host log it.
    $psi.RedirectStandardError = $false
    $psi.Arguments = '--preset "' + $preset + '" --port 0 --models-max 1'
    $psi.Environment['JAN_LLAMA_API_KEY'] = $key
    # Do not inherit the CI image's LLVM, Vulkan SDK, CMake, or other build-tool
    # directories. Their DLLs can conceal an installer that fails on a fresh
    # Windows machine. The worker must resolve shipped dependencies beside its
    # executable and Windows-owned libraries from the OS directories.
    $windowsRoot = [Environment]::GetEnvironmentVariable('SystemRoot')
    if ([string]::IsNullOrWhiteSpace($windowsRoot) -or
        !(Test-Path -LiteralPath (Join-Path $windowsRoot 'System32') -PathType Container)) {
        throw 'Windows system directory is unavailable for clean worker probe.'
    }
    $system32 = Join-Path $windowsRoot 'System32'
    $psi.Environment['PATH'] = @($folder, $system32, $windowsRoot, (Join-Path $system32 'Wbem')) -join ';'
    foreach ($variable in @('GGML_BACKEND_PATH', 'VULKAN_SDK', 'CUDA_PATH', 'CUDA_HOME')) {
        $null = $psi.Environment.Remove($variable)
    }

    Write-Host 'Starting bundled Windows x86-64 Lu llama.cpp worker with isolated runtime PATH.'
    $proc = [Diagnostics.Process]::Start($psi)
    if ($null -eq $proc) { throw 'Could not start worker.' }

    $lineTask = $proc.StandardOutput.ReadLineAsync()
    try {
        $line = $lineTask.WaitAsync([TimeSpan]::FromSeconds($StartupTimeoutSeconds)).GetAwaiter().GetResult()
    } catch [TimeoutException] {
        throw 'Worker startup handshake exceeded timeout.'
    }
    if ([string]::IsNullOrWhiteSpace($line)) {
        if ($proc.WaitForExit(5000)) {
            $hex = [Convert]::ToString([int]$proc.ExitCode, 16).PadLeft(8, '0').ToUpperInvariant()
            if ($hex -ceq 'C0000135') {
                throw 'Installed worker exited before handshake (0xC0000135: a required DLL or one of its dependencies was not found).'
            }
            throw "Installed worker exited before handshake (0x$hex)."
        }
        throw 'Worker stopped without a valid startup handshake (process has not exited).'
    }
    try { $handshake = $line | ConvertFrom-Json }
    catch { throw 'Worker emitted invalid startup handshake JSON.' }
    $expectedModels = $(if ($modelPresent) { 1 } else { 0 })
    if ($handshake.port -lt 1 -or $handshake.port -gt 65535 -or
        $handshake.pid -ne $proc.Id -or
        @($handshake.models).Count -ne $expectedModels -or
        ($modelPresent -and @($handshake.models)[0] -ne 'smoke-model')) {
        throw 'Worker handshake PID, port or model registry did not match fixture.'
    }
    $uri = "http://127.0.0.1:$([int]$handshake.port)/v1/models"
    $anonymous = Invoke-WebRequest -Uri $uri -SkipHttpErrorCheck -TimeoutSec 20
    if ($anonymous.StatusCode -ne 401) {
        throw "Worker accepted anonymous HTTP request (status $($anonymous.StatusCode))."
    }
    $wrong = Invoke-WebRequest -Uri $uri -SkipHttpErrorCheck -TimeoutSec 20 -Headers @{ Authorization = 'Bearer not-the-worker-secret' }
    if ($wrong.StatusCode -ne 401) {
        throw "Worker accepted a wrong bearer token (status $($wrong.StatusCode))."
    }
    $correct = Invoke-WebRequest -Uri $uri -SkipHttpErrorCheck -TimeoutSec 20 -Headers @{ Authorization = "Bearer $key" }
    if ($correct.StatusCode -ne 200) {
        throw "Worker rejected correct bearer token (status $($correct.StatusCode))."
    }
    $body = $correct.Content | ConvertFrom-Json
    if ($null -eq $body.data) {
        throw 'Worker did not return model registry response.'
    }
    if (!$modelPresent -and @($body.data).Count -ne 0) {
        throw 'Worker did not return empty preset model registry.'
    }
    Write-Host 'Bundled worker handshake and loopback HTTP authentication passed.'
    if ($modelPresent) {
        $completionBody = @{ model = 'smoke-model'; messages = @(@{role = 'user'; content = 'Say one greeting.'}); max_tokens = 24; temperature = 0; stream = $false } | ConvertTo-Json -Depth 6 -Compress
        $url = "http://127.0.0.1:$([int]$handshake.port)/v1/chat/completions"
        $reply = Invoke-WebRequest -Uri $url -Method Post -TimeoutSec 120 -SkipHttpErrorCheck -Headers @{Authorization = "Bearer $key"} -ContentType 'application/json' -Body $completionBody
        if ($reply.StatusCode -ne 200) {
            throw "Bundled worker failed GGUF chat inference (HTTP $($reply.StatusCode))."
        }
        $completion = $reply.Content | ConvertFrom-Json
        if ($completion.choices[0].message.role -ne 'assistant' -or [string]::IsNullOrWhiteSpace($completion.choices[0].message.content) -or $completion.usage.completion_tokens -lt 1) {
            throw 'Bundled worker returned no assistant completion or token accounting.'
        }
        Write-Host "Local GGUF chat inference passed ($($completion.usage.completion_tokens) tokens)."
        # The Lu chat frontend consumes OpenAI-compatible SSE frames, not just
        # whole JSON completions. Exercise the actual packaged worker stream.
        $streamBody = @{ model = 'smoke-model'; messages = @(@{role = 'user'; content = 'Count to three.'}); max_tokens = 12; temperature = 0; stream = $true } | ConvertTo-Json -Depth 6 -Compress
        $streamReply = Invoke-WebRequest -Uri $url -Method Post -TimeoutSec 120 -SkipHttpErrorCheck -Headers @{Authorization = "Bearer $key"} -ContentType 'application/json' -Body $streamBody
        if ($streamReply.StatusCode -ne 200) {
            throw "Bundled worker failed SSE streaming (HTTP $($streamReply.StatusCode))."
        }
        if ($streamReply.Headers['Content-Type'] -notmatch 'text/event-stream' -or
            $streamReply.Content -notmatch 'data:\s*\{' -or
            $streamReply.Content -notmatch 'data:\s*\[DONE\]') {
            throw 'Worker streaming response missed SSE content type, token frames or DONE marker.'
        }
        Write-Host 'Local GGUF streaming completion passed (SSE frames and DONE marker).'

    }

    # The shipping supervisor stops the worker by closing its stdin pipe.
    $proc.StandardInput.Close()
    if (!$proc.WaitForExit(20000)) {
        throw 'Worker ignored stdin EOF.'
    }
    $stopped = $true
    if ($proc.ExitCode -ne 0) {
        throw "Worker terminated with nonzero code $($proc.ExitCode)."
    }
    Write-Host 'Bundled worker stopped gracefully on stdin EOF.'
} finally {
    if ($null -ne $proc) {
        try {
            if (!$stopped -and !$proc.HasExited) {
                $proc.Kill($true)
                $null = $proc.WaitForExit(10000)
            }
        } finally { $proc.Dispose() }
    }
    if (Test-Path -LiteralPath $presetDir) {
        Remove-Item -LiteralPath $presetDir -Recurse -Force
    }
}
