$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Ports = @(3600, 3601, 3602, 3603)

Write-Host "Stopping AssurMatch local app listeners on ports $($Ports -join ', ')..."

$rootString = $Root.Path
$escapedRoot = [WildcardPattern]::Escape($rootString)
$portOwnerIds = Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -ne 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique

function Test-AssurMatchLocalProcess($Process) {
  $commandLine = $Process.CommandLine
  if ([string]::IsNullOrWhiteSpace($commandLine)) {
    return (($portOwnerIds -contains $Process.ProcessId) -and ($Process.Name -eq "node.exe"))
  }
  $normalized = $commandLine.Replace("/", "\")

  if ($normalized -like "*scripts\local-app\api-runner.mjs*") { return $true }
  if ($commandLine -notlike "*$escapedRoot*") { return $false }

  return $normalized -like "*\.local\logs\api-3600.cmd*" -or
    $normalized -like "*\.local\logs\public-3601.cmd*" -or
    $normalized -like "*\.local\logs\admin-3602.cmd*" -or
    $normalized -like "*\.local\logs\broker-3603.cmd*" -or
    ($portOwnerIds -contains $Process.ProcessId -and
      $normalized -like "*node_modules\next\dist\server\lib\start-server.js*") -or
    ($normalized -like "*node_modules\next\dist\bin\next*" -and
      ($normalized -like "*--port 3601*" -or
        $normalized -like "*--port 3602*" -or
        $normalized -like "*--port 3603*"))
}

$launched = Get-CimInstance Win32_Process |
  Where-Object { $_.ProcessId -ne $PID -and (Test-AssurMatchLocalProcess $_) } |
  Select-Object -ExpandProperty ProcessId -Unique

if ($launched) {
  $failedStops = @()
  foreach ($processId in $launched) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
      $failedStops += "  PID $processId`: $($_.Exception.Message)"
    }
  }
  if ($failedStops.Count -gt 0) {
    Write-Host "Some AssurMatch local app processes could not be stopped:"
    $failedStops | ForEach-Object { Write-Host $_ }
    Write-Host "Close those Node processes from the same elevated context that started them, or run stop-local.bat as Administrator."
  }
} else {
  Write-Host "No AssurMatch local app processes were found; no app process was stopped."
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
  Write-Host "Some listeners are still active on local app ports. Non-AssurMatch processes are left untouched:"
  $remaining | Format-Table LocalAddress, LocalPort, State, OwningProcess
  exit 1
}

Write-Host "Stopped."
