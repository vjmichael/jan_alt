# Lu Alpha 0.1 evidence gate (PowerShell 7 / Windows PowerShell 5.1)
# Documentation-only gate: does not install, execute, or modify Lu.
# Usage: pwsh -NoProfile -File scripts/lu/check-alpha01-evidence.ps1 -EvidencePath evidence.json
param(
  [Parameter(Mandatory=$true)][string]$EvidencePath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$required = @('A01','A02','A03','A04','A05','A06','A07','A08','A09')
if (-not (Test-Path -LiteralPath $EvidencePath -PathType Leaf)) {
  throw "Evidence file not found: $EvidencePath"
}
$record = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
if (-not $record.PSObject.Properties['candidate_commit'] -or
    $record.candidate_commit -notmatch '^[0-9a-fA-F]{40}$') {
  throw 'Missing or invalid 40-character candidate_commit'
}
if (-not $record.PSObject.Properties['installer_sha256'] -or
    $record.installer_sha256 -notmatch '^[0-9a-fA-F]{64}$') {
  throw 'Missing or invalid installer_sha256'
}
if (-not $record.PSObject.Properties['gates']) { throw 'Missing gates array' }
$failures = New-Object System.Collections.Generic.List[string]
foreach ($id in $required) {
  $matches = @($record.gates | Where-Object { $_.id -eq $id })
  if ($matches.Count -ne 1) {
    $failures.Add("$id requires exactly one evidence entry")
    continue
  }
  $g = $matches[0]
  if ($g.status -ne 'passed') {
    $failures.Add("$id is not passed")
    continue
  }
  if ($g.evidence_kind -notin @('actual-installed-windows','actual-webview2-windows')) {
    $failures.Add("$id lacks actual Windows acceptance evidence")
  }
  if (-not $g.PSObject.Properties['run_url'] -or
      $g.run_url -notmatch '^https://github\.com/vjmichael/jan_alt/actions/runs/[0-9]+(?:/.*)?$') {
    $failures.Add("$id lacks a GitHub Actions run URL")
  }
  if (-not $g.PSObject.Properties['commit'] -or $g.commit -ne $record.candidate_commit) {
    $failures.Add("$id commit differs from pinned candidate")
  }
  if (-not $g.PSObject.Properties['artifact_sha256'] -or
      $g.artifact_sha256 -ne $record.installer_sha256) {
    $failures.Add("$id artifact digest differs from pinned installer")
  }
}
if ($failures.Count -gt 0) {
  foreach ($failure in $failures) { Write-Error -Message $failure -ErrorAction Continue }
  throw "Lu Alpha 0.1 evidence gate FAILED ($($failures.Count) issue(s))"
}
Write-Output "Lu Alpha 0.1 evidence gate PASS: all nine actual-Windows checks match the pinned candidate."
