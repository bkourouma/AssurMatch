$ErrorActionPreference = "Stop"

# Mirrors the overrides of launch-local.ps1: run it with the same environment as the launch and it
# stops that stack only (its ports, its Compose project, its log directory), leaving any other
# AssurMatch stack untouched.
function Read-EnvInt([string] $Name, [int] $Default) {
  $raw = [Environment]::GetEnvironmentVariable($Name)
  $value = 0
  if (-not [string]::IsNullOrWhiteSpace($raw) -and [int]::TryParse($raw.Trim(), [ref] $value) -and $value -gt 0) { return $value }
  return $Default
}

function Read-EnvText([string] $Name, [string] $Default) {
  $raw = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
  return $raw.Trim()
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$ApiPort = Read-EnvInt "ASSURMATCH_LOCAL_API_PORT" 3600
$PublicPort = Read-EnvInt "ASSURMATCH_LOCAL_PUBLIC_PORT" 3601
$AdminPort = Read-EnvInt "ASSURMATCH_LOCAL_ADMIN_PORT" 3602
$BrokerPort = Read-EnvInt "ASSURMATCH_LOCAL_BROKER_PORT" 3603
$Ports = @($ApiPort, $PublicPort, $AdminPort, $BrokerPort)
$LogDir = Read-EnvText "ASSURMATCH_LOCAL_LOG_DIR" (Join-Path $Root ".local\logs")
$ComposeProject = Read-EnvText "ASSURMATCH_COMPOSE_PROJECT" "assurmatch"
$WorkerPidFile = Join-Path $LogDir "worker-notifications.pid"

Write-Host "Stopping AssurMatch local app listeners on ports $($Ports -join ', ') (logs: $LogDir)..."

$rootString = $Root.Path
$escapedRoot = [WildcardPattern]::Escape($rootString)
$escapedLogDir = [WildcardPattern]::Escape(($LogDir.TrimEnd('\')).Replace("/", "\"))
$portOwnerIds = @(Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -ne 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique)

$allProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID })

function Test-AssurMatchLocalProcess($Process) {
  $commandLine = $Process.CommandLine
  if ([string]::IsNullOrWhiteSpace($commandLine)) {
    return (($portOwnerIds -contains $Process.ProcessId) -and ($Process.Name -eq "node.exe"))
  }
  $normalized = $commandLine.Replace("/", "\")

  # The API runner listens on the API port of this stack; the wrapper .cmd files live in this
  # stack's log directory. Both are unambiguous even when a second stack runs from the same checkout.
  if ($normalized -like "*scripts\local-app\api-runner.mjs*" -and ($portOwnerIds -contains $Process.ProcessId)) { return $true }
  if ($commandLine -notlike "*$escapedRoot*") { return $false }

  return $normalized -like "*$escapedLogDir\api-$ApiPort.cmd*" -or
    $normalized -like "*$escapedLogDir\worker-notifications.cmd*" -or
    $normalized -like "*$escapedLogDir\public-$PublicPort.cmd*" -or
    $normalized -like "*$escapedLogDir\admin-$AdminPort.cmd*" -or
    $normalized -like "*$escapedLogDir\broker-$BrokerPort.cmd*" -or
    ($portOwnerIds -contains $Process.ProcessId -and
      $normalized -like "*node_modules\next\dist\server\lib\start-server.js*") -or
    ($normalized -like "*node_modules\next\dist\bin\next*" -and
      ($normalized -like "*--port $PublicPort*" -or
        $normalized -like "*--port $AdminPort*" -or
        $normalized -like "*--port $BrokerPort*"))
}

$launched = @($allProcesses | Where-Object { Test-AssurMatchLocalProcess $_ } | Select-Object -ExpandProperty ProcessId -Unique)

# Children of the matched wrappers (cmd -> npx -> node, cmd -> node) belong to this stack too. The
# notification loop in particular has a command line identical in every stack ("node
# scripts/local-app/notification-worker-loop.mjs"), so its parentage is the only safe identifier.
$frontier = @($launched)
for ($depth = 0; $depth -lt 4 -and $frontier.Count -gt 0; $depth++) {
  $frontier = @($allProcesses |
    Where-Object { ($frontier -contains $_.ParentProcessId) -and ($launched -notcontains $_.ProcessId) -and ($_.Name -in @("node.exe", "cmd.exe", "npx.cmd")) } |
    Select-Object -ExpandProperty ProcessId -Unique)
  $launched += $frontier
}

# Belt and braces for the port-less notification loop: if its command line could not be read
# (WMI returns an empty CommandLine for processes another account owns), the pid file it writes
# in the log directory still identifies it. Only a live node.exe with that pid is touched.
if (Test-Path $WorkerPidFile) {
  $workerPidText = (Get-Content -Path $WorkerPidFile -Raw -ErrorAction SilentlyContinue)
  $workerPid = 0
  if ([int]::TryParse(($workerPidText | Out-String).Trim(), [ref] $workerPid) -and $workerPid -gt 0 -and $workerPid -ne $PID) {
    $workerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $workerPid" -ErrorAction SilentlyContinue
    if ($workerProcess -and $workerProcess.Name -eq "node.exe" -and ($launched -notcontains $workerPid)) {
      $launched += $workerPid
    }
  }
  Remove-Item -Path $WorkerPidFile -Force -ErrorAction SilentlyContinue
}

if ($launched) {
  $failedStops = @()
  foreach ($processId in $launched) {
    # A child often dies with its parent before its turn comes; that is success, not a failure.
    if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) { continue }
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
      if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
        $failedStops += "  PID $processId`: $($_.Exception.Message)"
      }
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
  $env:COMPOSE_PROJECT_NAME = $ComposeProject
  $env:ASSURMATCH_POSTGRES_PORT = "$(Read-EnvInt 'ASSURMATCH_POSTGRES_PORT' 55433)"
  $env:ASSURMATCH_REDIS_PORT = "$(Read-EnvInt 'ASSURMATCH_REDIS_PORT' 56380)"
  $env:ASSURMATCH_MAILPIT_SMTP_PORT = "$(Read-EnvInt 'ASSURMATCH_MAILPIT_SMTP_PORT' 1025)"
  $env:ASSURMATCH_MAILPIT_HTTP_PORT = "$(Read-EnvInt 'ASSURMATCH_MAILPIT_HTTP_PORT' 8025)"
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
