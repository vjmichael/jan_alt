# Synthetic fixture tests only. A passing synthetic test is NOT installed Alpha evidence.
[CmdletBinding()]
param([string]$Validator = (Join-Path $PSScriptRoot 'check-alpha01-evidence.ps1'))
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$dir = Join-Path ([IO.Path]::GetTempPath()) ("lu-alpha-evidence-fixtures-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $dir | Out-Null
try {
  $commit = 'a' * 40; $hash = 'b' * 64
  $gateIds = @((1..9 | ForEach-Object { 'A{0:D2}' -f $_ })) +
    @('AX-00','AX-01','AX-02','AX-03','AX-04','DX-00','DX-01','DX-02','DX-03','DX-04','W01','W02','W03','W04','W05','W06')
  $valid = [pscustomobject]@{
    candidate_commit = $commit; installer_sha256 = $hash
    gates = @($gateIds | ForEach-Object {
      [pscustomobject]@{
        id = $_; status = 'passed'; evidence_kind = 'actual-installed-windows'
        run_url = 'https://github.com/vjmichael/jan_alt/actions/runs/12345'
        commit = $commit; artifact_sha256 = $hash
      }
    })
  }
  $index = 0
  function Check-Fixture($sample, [bool]$shouldPass, [string]$case) {
    $script:index++
    $path = Join-Path $dir ("fixture-" + $script:index + '.json')
    $sample | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $path -Encoding UTF8
    $passed = $true
    try { & $Validator -EvidencePath $path | Out-Null } catch { $passed = $false }
    if ($passed -ne $shouldPass) { throw "Evidence validator unexpected result: $case expected=$shouldPass actual=$passed" }
  }
  function Copy-Fixture { return ($valid | ConvertTo-Json -Depth 12 | ConvertFrom-Json) }
  Check-Fixture (Copy-Fixture) $true 'valid shape only'
  $x = Copy-Fixture; $x.gates[0].artifact_sha256 = 'c' * 64
  Check-Fixture $x $false 'mismatched artifact hash'
  $x = Copy-Fixture; $x.gates[1].commit = 'c' * 40
  Check-Fixture $x $false 'mismatched source commit'
  $x = Copy-Fixture; $x.gates[2].evidence_kind = 'harness-only'
  Check-Fixture $x $false 'harness masquerades as installed runtime'
  $x = Copy-Fixture; $x.gates[3].status = 'failed'
  Check-Fixture $x $false 'failed gate'
  $x = Copy-Fixture; $x.gates[4].run_url = 'https://evil.example/actions/runs/123'
  Check-Fixture $x $false 'untrusted run'
  $x = Copy-Fixture; $x.gates[5].run_url += '/garbage'
  Check-Fixture $x $false 'run URL suffix'
  $x = Copy-Fixture; $x.gates[6].id = 'A02'
  Check-Fixture $x $false 'duplicate gate'
  $x = Copy-Fixture; $x.gates = @($x.gates | Select-Object -First 24)
  Check-Fixture $x $false 'missing gate'
  $x = Copy-Fixture; $x.gates += [pscustomobject]@{ id='A10'; status='passed' }
  Check-Fixture $x $false 'unexpected gate'
  $x = Copy-Fixture; $x.installer_sha256 = '0'
  Check-Fixture $x $false 'malformed SHA'
  $x = Copy-Fixture; $x.gates[0].status = $true
  Check-Fixture $x $false 'wrong status type'
  $x = Copy-Fixture; $x.gates = 'not an array'
  Check-Fixture $x $false 'gates not array'
  $x = Copy-Fixture; $x.gates[2].commit = $null
  Check-Fixture $x $false 'null gate commit'
  $x = Copy-Fixture; $x.gates = @($x.gates | Where-Object { $_.id -ne 'DX-04' })
  Check-Fixture $x $false 'missing diagnostic containment gate'
  $x = Copy-Fixture; $x.gates = @($x.gates | Where-Object { $_.id -ne 'AX-02' })
  Check-Fixture $x $false 'missing Cowork exclusion gate'
  $x = Copy-Fixture; $x.gates = @($x.gates | Where-Object { $_.id -ne 'W01' })
  Check-Fixture $x $false 'missing native first-turn gate'
  $x = Copy-Fixture; $x.gates[21].evidence_kind = 'candidate-source-review'
  Check-Fixture $x $false 'source review cannot replace real native tool run'
  $x = Copy-Fixture; $x.gates[9].evidence_kind = 'candidate-source-review'
  Check-Fixture $x $true 'inventory source review with candidate pin'
  Write-Host "LU_ALPHA01_EVIDENCE_FIXTURES_PASS cases=$index synthetic_only=true"
} finally {
  if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
}
