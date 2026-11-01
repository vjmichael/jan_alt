# Pure Windows PowerShell 5.1 acceptance-harness unit tests.
# Extract only the helper AST: never launch Lu, read a user profile, or call IPC.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'run-installed-lu-uia-full.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $source, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw 'Installed UIA script has invalid PowerShell syntax.' }
$functions = @($ast.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $node.Name -ceq 'Get-FirstAssistantDisplayWitness'
}, $true))
if ($functions.Count -ne 1) { throw 'First assistant witness helper missing or duplicated.' }
# Dot-source only the trusted function declaration, not the parent script.
. ([scriptblock]::Create($functions[0].Extent.Text))
function One-Row([string]$value) {
    return [pscustomobject]@{
        role = 'assistant'
        content = @([pscustomobject]@{
            type = 'text'
            text = [pscustomobject]@{ value = $value }
        })
    }
}
function Assert-Rejected([object[]]$rows, [string]$label) {
    $rejected = $false
    try { [void](Get-FirstAssistantDisplayWitness $rows 'Say hello.') }
    catch { $rejected = $true }
    if (!$rejected) { throw "First assistant witness did not reject $label." }
}
$rows = @([pscustomobject]@{ role='user'; content=@() }, (One-Row 'Hello from Lu!'))
$proof = Get-FirstAssistantDisplayWitness $rows 'Say hello.'
if ($proof -cne 'Hello from Lu!') { throw 'First saved assistant text not extracted.' }
$long = 'Lu provides a meaningful native first response visible on screen.'
$truncated = Get-FirstAssistantDisplayWitness @((One-Row $long)) 'Say hello.'
if ($truncated -cne $long.Substring(0,32)) { throw 'Assistant display witness not bounded.' }
Assert-Rejected @([pscustomobject]@{ role='user'; content=@() }) 'missing assistant'
Assert-Rejected @((One-Row 'First'), (One-Row 'Second')) 'duplicate assistant'
Assert-Rejected @((One-Row '')) 'empty assistant'
Assert-Rejected @((One-Row 'Say hello.')) 'echo of user prompt'
Write-Host 'LU_WIN_G2_FIRST_RENDER_WITNESS_SOURCE_PASS synthetic=true log_payloads=false'
