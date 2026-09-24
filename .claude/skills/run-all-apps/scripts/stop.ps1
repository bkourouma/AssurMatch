$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ports.ps1")
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")

Write-Host "run-all-apps: stopping the alternate AssurMatch stack (ports $($env:ASSURMATCH_LOCAL_API_PORT)-$($env:ASSURMATCH_LOCAL_BROKER_PORT), Compose project $($env:ASSURMATCH_COMPOSE_PROJECT))"
& (Join-Path $Root "scripts\local-app\stop-local.ps1")
