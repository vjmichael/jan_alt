# Build and stage the Lu-owned Windows CPU inference engine for packaging.
# Requires Git/CMake/MSVC. The source revision is pinned; no prebuilt binaries
# or arbitrary engine path from the user/model are admitted.
param(
    [string] $Destination = 'src-tauri/resources/lu-inference',
    [switch] $SkipBuild
)
$ErrorActionPreference = 'Stop'
$Pinned = '7fe450e19305b828c199d602c23a8337aaa1f03b'
$root = (Resolve-Path '.').Path
$dest = Join-Path $root $Destination
$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
if (!$tempRoot) { throw 'No trusted build scratch directory' }
$source = Join-Path $tempRoot 'lu-pinned-llama-source'
$build = Join-Path $tempRoot 'lu-pinned-llama-cpu-build'
if (!$SkipBuild) {
    if (!(Test-Path -LiteralPath $source)) {
        & git clone --filter=blob:none --no-checkout https://github.com/ggml-org/llama.cpp.git $source
        if ($LASTEXITCODE -ne 0) { throw 'Could not clone pinned llama.cpp source' }
    }
    & git -C $source checkout --detach $Pinned
    if ($LASTEXITCODE -ne 0) { throw 'Pinned llama.cpp commit unavailable' }
    $revision = (& git -C $source rev-parse HEAD).Trim()
    if ($revision -cne $Pinned) { throw 'Inference engine source provenance mismatch' }
    & cmake -S $source -B $build -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_SERVER=ON -DLLAMA_BUILD_EXAMPLES=OFF -DBUILD_SHARED_LIBS=OFF -DGGML_CUDA=OFF -DGGML_VULKAN=OFF -DGGML_NATIVE=OFF
    if ($LASTEXITCODE -ne 0) { throw 'Pinned Lu CPU engine configuration failed' }
    & cmake --build $build --config Release --parallel 4
    if ($LASTEXITCODE -ne 0) { throw 'Pinned Lu CPU inference engine build failed' }
}
$server = @(Get-ChildItem -LiteralPath $build -File -Recurse -Filter 'llama-server.exe')
if ($server.Count -ne 1) { throw "Expected one pinned llama-server.exe; found $($server.Count)" }
$bin = $server[0].DirectoryName
if (!(Test-Path -LiteralPath $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }
# Only these verified artifacts are staged; no user's writable executable
# directories or pre-existing installer assets are copied.
Get-ChildItem -LiteralPath $dest -File | Where-Object {
    $_.Name -eq '.keep' -or $_.Name -eq 'manifest.json' -or $_.Name -eq 'llama-server.exe' -or $_.Extension -eq '.dll'
} | Remove-Item -Force
Copy-Item -LiteralPath $server[0].FullName -Destination (Join-Path $dest 'llama-server.exe') -Force
$libs = @(Get-ChildItem -LiteralPath $bin -File -Filter '*.dll' | Sort-Object Name)
foreach ($lib in $libs) {
    Copy-Item -LiteralPath $lib.FullName -Destination (Join-Path $dest $lib.Name) -Force
}
$files = @(Get-ChildItem -LiteralPath $dest -File | Where-Object {
    $_.Name -eq 'llama-server.exe' -or $_.Extension -eq '.dll'
} | Sort-Object Name | ForEach-Object {
    @{ name = $_.Name; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
})
$manifest = @{
    schema = 'lu-inference-package-v1'
    upstreamCommit = $Pinned
    architecture = 'x86_64-pc-windows-msvc'
    files = $files
} | ConvertTo-Json -Depth 6 -Compress
$manifestPath = Join-Path $dest 'manifest.json'
[System.IO.File]::WriteAllText($manifestPath, $manifest, (New-Object System.Text.UTF8Encoding($false)))
$exeHash = (Get-FileHash -LiteralPath (Join-Path $dest 'llama-server.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
$manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$env:LU_TRUSTED_LLAMA_SERVER_SHA256 = $exeHash
$env:LU_TRUSTED_LLAMA_PACKAGE_SHA256 = $manifestHash
if ($env:GITHUB_ENV) {
    "LU_TRUSTED_LLAMA_SERVER_SHA256=$exeHash" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
    "LU_TRUSTED_LLAMA_PACKAGE_SHA256=$manifestHash" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
}
Write-Host "Lu pinned inference source: $Pinned"
Write-Host "Lu engine SHA-256: $exeHash"
Write-Host "Lu complete-package manifest SHA-256: $manifestHash"
Write-Host "Lu staged engine artifacts: $($files.Count)"
