# Run the real model -> Lu native Protobuf tool -> model continuation gate
# against the exact llama-server.exe extracted from Lu's NSIS installer.
# This is NOT a desktop UI interaction test.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $InstalledEngine,
    [Parameter(Mandatory = $true)][string] $EngineSha256,
    [Parameter(Mandatory = $true)][string] $ModelPath,
    [Parameter(Mandatory = $true)][string] $ModelSha256
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or
    [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    throw 'Lu installed-model tool gate requires a disposable Windows GitHub Actions runner.'
}
$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
$engine = (Resolve-Path -LiteralPath $InstalledEngine -ErrorAction Stop).ProviderPath
$model = (Resolve-Path -LiteralPath $ModelPath -ErrorAction Stop).ProviderPath
foreach ($path in @($engine, $model)) {
    if (!$path.StartsWith("$runnerRoot\", [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Real-model tool gate refuses an executable or model outside runner temp.'
    }
}
if ([IO.Path]::GetFileName($engine) -cne 'llama-server.exe' -or
    $engine -notmatch '(?i)[\\/]lu-inference[\\/]llama-server\.exe$') {
    throw 'Real-model tool gate requires the installed Lu inference engine.'
}
if ([IO.Path]::GetExtension($model) -cne '.gguf') {
    throw 'Real-model tool gate requires a GGUF model.'
}
foreach ($digest in @($EngineSha256, $ModelSha256)) {
    if ($digest -cnotmatch '^[0-9a-f]{64}$') {
        throw 'Real-model gate requires explicitly pinned SHA-256 digests.'
    }
}
if ((Get-FileHash -LiteralPath $engine -Algorithm SHA256).Hash.ToLowerInvariant() -cne $EngineSha256 -or
    (Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ModelSha256) {
    throw 'Real-model tool gate detected changed installed engine or GGUF model.'
}

# Do not reuse another service's credentials. The trusted test host mints
# an independent ephemeral key and Lu uses authenticated loopback HTTP.
$secret = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($secret) }
finally { $rng.Dispose() }
$key = [Convert]::ToHexString($secret).ToLowerInvariant()
$values = @{
    LU_REAL_GGUF_PATH = $model
    LU_REAL_GGUF_SHA256 = $ModelSha256
    LU_REAL_LLAMA_SERVER_PATH = $engine
    LU_REAL_LLAMA_SERVER_SHA256 = $EngineSha256
    LU_REAL_LLAMA_API_KEY = $key
}
$previous = @{}
foreach ($name in $values.Keys) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    foreach ($name in $values.Keys) {
        [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
    }
    $manifest = Join-Path $PSScriptRoot '..\src-tauri\lu-core\Cargo.toml'
    if (!(Test-Path -LiteralPath $manifest -PathType Leaf)) {
        throw 'Lu native test manifest missing from checked-out repository.'
    }
    Write-Host 'Testing real model-generated tool JSON using the installed, hash-verified Lu NSIS engine.'
    & cargo test --manifest-path $manifest --test real_gguf_tool_json -- --ignored --nocapture
    if ($LASTEXITCODE -ne 0) {
        throw 'Installed Lu inference engine failed real model -> native Protobuf tool -> final answer gate.'
    }
    Write-Host 'LU_INSTALLED_NATIVE_GGUF_TOOL_TURN_PASS'
} finally {
    foreach ($name in $values.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
    }
}
