# Lu Alpha 0.1 evidence schema validation. Does NOT authenticate run outcomes.
# This fail-closed preflight never installs Lu or touches user data.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$EvidencePath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$required = @('A01','A02','A03','A04','A05','A06','A07','A08','A09',
  'AX-00','AX-01','AX-02','AX-03','AX-04',
  'DX-00','DX-01','DX-02','DX-03','DX-04',
  'W01','W02','W03','W04','W05','W06')
if (!(Test-Path -LiteralPath $EvidencePath -PathType Leaf)) { throw "Evidence file not found: $EvidencePath" }
$record = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
if ($null -eq $record -or $record -isnot [pscustomobject]) { throw 'Evidence root must be an object' }
function Require-String($object, [string]$key, [string]$pattern) {
  $field = $object.PSObject.Properties[$key]
  if ($null -eq $field -or $field.Value -isnot [string] -or $field.Value -cnotmatch $pattern) {
    throw "Missing or invalid $key"
  }
  return [string]$field.Value
}
$commit = Require-String $record 'candidate_commit' '^[0-9a-f]{40}$'
$digest = Require-String $record 'installer_sha256' '^[0-9a-f]{64}$'
$gatesProp = $record.PSObject.Properties['gates']
if ($null -eq $gatesProp -or $gatesProp.Value -isnot [array]) { throw 'Missing gates array' }
$gates = @($gatesProp.Value)
if ($gates.Count -ne $required.Count) { throw 'Exactly A01-A09, AX-00..04, DX-00..04 and W01..06 must be recorded' }
$seen = @{}
foreach ($gate in $gates) {
  if ($null -eq $gate -or $gate -isnot [pscustomobject]) { throw 'Each gate must be an object' }
  $id = Require-String $gate 'id' '^(A0[1-9]|AX-0[0-4]|DX-0[0-4]|W0[1-6])$'
  if ($seen.ContainsKey($id)) { throw "Duplicate gate $id" }
  $seen[$id] = $true
  if ((Require-String $gate 'status' '^passed$') -cne 'passed') { throw "$id not passed" }
  $kind = Require-String $gate 'evidence_kind' '^(actual-(installed|webview2)-windows|candidate-source-review)$'
  if ($kind -eq 'candidate-source-review' -and $id -notin @('AX-00','AX-04','DX-00')) {
    throw "$id requires a real Windows run on the candidate"
  }
  # Valid JSON text alone is not enough: run authentication is a separate CI step.
  $run = Require-String $gate 'run_url' '^https://github\.com/vjmichael/jan_alt/actions/runs/[1-9][0-9]*$'
  if ((Require-String $gate 'commit' '^[0-9a-f]{40}$') -cne $commit) { throw "$id commit differs from candidate" }
  if ((Require-String $gate 'artifact_sha256' '^[0-9a-f]{64}$') -cne $digest) { throw "$id artifact hash differs from installer" }
}
foreach ($id in $required) { if (!$seen.ContainsKey($id)) { throw "Missing gate $id" } }
Write-Output 'LU_ALPHA01_EVIDENCE_SCHEMA_PASS gates=25 ax_dx_windows_claims=true pinned_values=true (NOT runtime authentication)'
