# Lu local engineering checks — explicitly offline, no GitHub Actions.
# Run from a Windows PowerShell 7 shell with the preinstalled Rust toolchain
# and previously cached Cargo dependencies. This is not an installed-alpha test.
[CmdletBinding()]
param(
  [ValidateSet('Quick', 'Full')]
  [string]$Profile = 'Quick'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Join-Path $repoRoot 'src-tauri/lu-core/Cargo.toml'
if (!(Test-Path -LiteralPath $manifest -PathType Leaf)) {
  throw 'Lu core manifest not found; run this script from the Lu source checkout.'
}
if (!(Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw 'Cargo is not installed. Install an approved Rust toolchain first; this script never downloads one.'
}

# All build artifacts and Rust test scratch data stay inside an ignored
# repository target folder rather than a real Lu profile or Windows AppData.
$workspace = Join-Path $repoRoot 'src-tauri/lu-core/target/lu-offline-checks'
$testTemp = Join-Path $workspace 'temp'
$testProfile = Join-Path $workspace 'profile'
foreach ($folder in @($workspace, $testTemp, $testProfile)) {
  New-Item -ItemType Directory -Path $folder -Force | Out-Null
}
$names = @('CARGO_NET_OFFLINE', 'CARGO_TARGET_DIR',
  'RUSTUP_AUTO_INSTALL', 'TEMP', 'TMP', 'TMPDIR', 'JAN_E2E_HOME')
$prior = @{}
foreach ($name in $names) {
  $prior[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

function Invoke-LuCargo {
  param([Parameter(Mandatory=$true)][string]$Label,
    [Parameter(Mandatory=$true)][string[]]$Arguments)
  Write-Host ("LU_LOCAL_OFFLINE_START " + $Label)
  & cargo @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw ("LU_LOCAL_OFFLINE_FAIL " + $Label + " cargo_exit=" + $LASTEXITCODE)
  }
  Write-Host ("LU_LOCAL_OFFLINE_PASS " + $Label)
}

try {
  # Prevent downloads, including implicit rustup toolchain installation.
  $env:CARGO_NET_OFFLINE = 'true'
  $env:RUSTUP_AUTO_INSTALL = '0'
  $env:CARGO_TARGET_DIR = Join-Path $workspace 'build'
  $env:TEMP = $testTemp
  $env:TMP = $testTemp
  $env:TMPDIR = $testTemp
  $env:JAN_E2E_HOME = $testProfile
  Push-Location $repoRoot
  try {
    Invoke-LuCargo 'format' @('fmt', '--manifest-path', $manifest, '--', '--check')
    if ($Profile -eq 'Quick') {
      # Fast and focused: native schema/authorization and supervised model-loop.
      foreach ($test in @('model_json_boundary', 'native_agent_tool_turn',
        'supervised_native_turn')) {
        Invoke-LuCargo $test @('test', '--offline', '--manifest-path',
          $manifest, '--test', $test)
      }
      Invoke-LuCargo 'persistent-llama-unit' @('test', '--offline',
        '--manifest-path', $manifest, '--lib', 'persistent_llama_backend::tests')
    } else {
      Invoke-LuCargo 'all-targets' @('test', '--offline', '--manifest-path',
        $manifest, '--all-targets')
      Invoke-LuCargo 'strict-clippy' @('clippy', '--offline', '--manifest-path',
        $manifest, '--all-targets', '--', '-D', 'warnings')
    }
  } finally {
    Pop-Location
  }
  Write-Host ("LU_LOCAL_OFFLINE_CHECK_PASS profile=" + $Profile +
    " network=disabled actions=unused acceptance=not_claimed")
} finally {
  foreach ($name in $names) {
    [Environment]::SetEnvironmentVariable($name, $prior[$name], 'Process')
  }
}
