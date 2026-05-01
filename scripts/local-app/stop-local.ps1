$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Ports = @(3600, 3601, 3602, 3603)

Write-Host "Stopping AssurMatch local app listeners on ports $($Ports -join ', ')..."

$owners = Get-NetTCPConnection -LocalPort $Ports -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -ne 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($owner in $owners) {
  Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
}

$rootString = $Root.Path
$launched = Get-CimInstance Win32_Process |
  Where-Object {
    $_.ProcessId -ne $PID -and
    $_.CommandLine -like "*$rootString*" -and
    ($_.CommandLine -like "*scripts/local-app/api-runner.mjs*" -or
      $_.CommandLine -like "*--port 3601*" -or
      $_.CommandLine -like "*--port 3602*" -or
      $_.CommandLine -like "*--port 3603*")
  } |
  Select-Object -ExpandProperty ProcessId -Unique

foreach ($processId in $launched) {
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

Push-Location $Root
try {
  $env:ASSURMATCH_POSTGRES_PORT = "55433"
  $env:ASSURMATCH_REDIS_PORT = "56380"
  docker compose stop postgres redis mailpit | Out-Host
} catch {
  Write-Host "Docker Compose stop skipped or failed: $($_.Exception.Message)"
} finally {
  Pop-Location
}

Start-Sleep -Milliseconds 500
$remaining = Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue
if ($remaining) {
  Write-Host "Some app listeners are still active:"
  $remaining | Format-Table LocalAddress, LocalPort, State, OwningProcess
  exit 1
}

Write-Host "Stopped."
