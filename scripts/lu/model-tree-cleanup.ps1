# Windows UIA test-only process tree snapshot. Not an app containment primitive.
# Snapshot before Lu exits; compare PID + creation time after it exits.
# Capture the model service and its descendants BEFORE Lu closes.
# Their parent links may disappear after shutdown; a post-exit parent-only
# query would incorrectly accept orphaned grandchildren as cleaned up.
function Capture-LuModelTree([int]$HostProcessId) {
    $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    $frontier = @($all | Where-Object {
        $_.ParentProcessId -eq $HostProcessId -and $_.Name -ceq 'llama-server.exe'
    })
    $tracked = @()
    while ($frontier.Count -gt 0) {
        $tracked += $frontier
        $parentIds = @($frontier | ForEach-Object { [int]$_.ProcessId })
        $trackedIds = @($tracked | ForEach-Object { [int]$_.ProcessId })
        $frontier = @($all | Where-Object {
            ($parentIds -contains $_.ParentProcessId) -and
            !($trackedIds -contains $_.ProcessId)
        })
    }
    return @($tracked | ForEach-Object {
        [pscustomobject]@{
            ProcessId = [int]$_.ProcessId
            Started = [string]$_.CreationDate
        }
    })
}
function Test-LuModelTreeExited([array]$snapshot) {
    if ($snapshot.Count -eq 0) { return $false }
    foreach($entry in $snapshot) {
        $live = @(Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.ProcessId)" -ErrorAction Stop)
        if ($live.Count -gt 0 -and
            ([string]$live[0].CreationDate) -ceq $entry.Started) {
            return $false
        }
    }
    return $true
}
