$ErrorActionPreference = "Stop"

# Every port, the Docker Compose project and the log directory can be overridden through the
# environment so that a second, fully isolated stack (other ports, other containers, other volumes,
# other logs) can run next to the default one. The defaults below are the historical values; with no
# variable set the launcher behaves exactly as before. The `run-all-apps` skill is the main user of
# these overrides: it picks ports nothing else on a developer machine normally listens on.
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
$LogDir = Read-EnvText "ASSURMATCH_LOCAL_LOG_DIR" (Join-Path $Root ".local\logs")
$ComposeProject = Read-EnvText "ASSURMATCH_COMPOSE_PROJECT" "assurmatch"
$ApiPort = Read-EnvInt "ASSURMATCH_LOCAL_API_PORT" 3600
$PublicPort = Read-EnvInt "ASSURMATCH_LOCAL_PUBLIC_PORT" 3601
$AdminPort = Read-EnvInt "ASSURMATCH_LOCAL_ADMIN_PORT" 3602
$BrokerPort = Read-EnvInt "ASSURMATCH_LOCAL_BROKER_PORT" 3603
$PostgresPort = Read-EnvInt "ASSURMATCH_POSTGRES_PORT" 55433
$RedisPort = Read-EnvInt "ASSURMATCH_REDIS_PORT" 56380
$MailpitSmtpPort = Read-EnvInt "ASSURMATCH_MAILPIT_SMTP_PORT" 1025
$MailpitHttpPort = Read-EnvInt "ASSURMATCH_MAILPIT_HTTP_PORT" 8025

$ApiUrl = "http://127.0.0.1:$ApiPort"
$PublicUrl = "http://127.0.0.1:$PublicPort"
$AdminUrl = "http://127.0.0.1:$AdminPort"
$BrokerUrl = "http://127.0.0.1:$BrokerPort"
$MailpitUrl = "http://127.0.0.1:$MailpitHttpPort"
$DatabaseUrl = "postgresql://assurmatch:assurmatch@127.0.0.1:$PostgresPort/assurmatch"
$RedisUrl = "redis://127.0.0.1:$RedisPort"
$CommonEnv = @(
  'set "APP_ENV=local"',
  'set "NODE_ENV=development"',
  "set `"DATABASE_URL=$DatabaseUrl`"",
  "set `"REDIS_URL=$RedisUrl`"",
  'set "ASSURMATCH_AUTH_TOKEN_SECRET=assurmatch-local-dev-auth-token-secret-32-plus"',
  'set "EMAIL_SERVICE_TYPE=mailpit"',
  'set "EMAIL_FROM=local@assurmatch.local"',
  'set "EMAIL_SMTP_HOST=127.0.0.1"',
  "set `"EMAIL_SMTP_PORT=$MailpitSmtpPort`"",
  "set `"ASSURMATCH_LOCAL_LOG_DIR=$LogDir`"",
  'set "ASSURMATCH_BROKER_CRM_ENABLED=false"'
)

function Test-PortFree([int] $Port) {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    $owners = ($listener | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
    throw "Port $Port is already in use by process id(s): $owners. Run stop-local.bat or free the port before launching. If Windows reports Access denied while stopping those processes, close the elevated Node process or run stop-local.bat as Administrator."
  }
}

function Wait-Http([string] $Url, [int[]] $AllowedStatuses = @(200), [int] $TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 30 -ErrorAction Stop
      if ($AllowedStatuses -contains [int] $response.StatusCode) { return }
    } catch {
      $response = $_.Exception.Response
      if ($response -and ($AllowedStatuses -contains [int] $response.StatusCode)) { return }
      Start-Sleep -Milliseconds 750
    }
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $Url"
}

function Wait-TcpPort([string] $HostName, [int] $Port, [int] $TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
      $task = $client.ConnectAsync($HostName, $Port)
      if ($task.Wait(1000) -and $client.Connected) { return }
    } finally {
      $client.Dispose()
    }
    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $HostName`:$Port"
}

function Assert-NativeSuccess([string] $Action) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Action failed with exit code $LASTEXITCODE"
  }
}

function Ensure-LocalDatabase {
  $container = "$ComposeProject-postgres-1"
  $dbExists = docker exec $container psql -U assurmatch -d postgres -tAc "select 1 from pg_database where datname='assurmatch'" 2>$null
  $dbExistsText = $dbExists | Out-String
  if ($dbExistsText -notmatch "1") {
    Write-Host "Creating local PostgreSQL database assurmatch in $container..."
    docker exec $container createdb -U assurmatch assurmatch
    Assert-NativeSuccess "Create local PostgreSQL database"
  }
}

function Start-LocalProcess([string] $Name, [string] $WorkingDirectory, [string[]] $EnvLines, [string] $Command) {
  $stdout = Join-Path $LogDir "$Name.out.log"
  $stderr = Join-Path $LogDir "$Name.err.log"
  $cmdFile = Join-Path $LogDir "$Name.cmd"
  $cmdLines = @("@echo off", "cd /d `"$WorkingDirectory`"") + $EnvLines + @($Command)
  Set-Content -Path $cmdFile -Value $cmdLines -Encoding ASCII
  Write-Host "Starting $Name ..."
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList @("/d", "/c", "`"$cmdFile`"") `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru | Out-Null
}

New-Item -ItemType Directory -Force $LogDir | Out-Null

foreach ($port in @($ApiPort, $PublicPort, $AdminPort, $BrokerPort)) {
  Test-PortFree $port
}

Write-Host "Starting local PostgreSQL, Redis and Mailpit with Docker Compose (project $ComposeProject)..."
Push-Location $Root
try {
  $env:COMPOSE_PROJECT_NAME = $ComposeProject
  $env:ASSURMATCH_POSTGRES_PORT = "$PostgresPort"
  $env:ASSURMATCH_REDIS_PORT = "$RedisPort"
  $env:ASSURMATCH_MAILPIT_SMTP_PORT = "$MailpitSmtpPort"
  $env:ASSURMATCH_MAILPIT_HTTP_PORT = "$MailpitHttpPort"
  docker compose up -d --wait --remove-orphans postgres redis mailpit
  Assert-NativeSuccess "Docker Compose local infrastructure startup"
  Wait-TcpPort "127.0.0.1" $PostgresPort
  Wait-TcpPort "127.0.0.1" $RedisPort
  Wait-Http $MailpitUrl @(200)
  Ensure-LocalDatabase

  Write-Host "Applying Prisma migrations and local seed..."
  $env:APP_ENV = "local"
  $env:NODE_ENV = "development"
  $env:DATABASE_URL = $DatabaseUrl
  $env:REDIS_URL = $RedisUrl
  $env:EMAIL_SERVICE_TYPE = "mailpit"
  $env:EMAIL_FROM = "local@assurmatch.local"
  npx prisma migrate deploy --schema backend/prisma/schema.prisma
  Assert-NativeSuccess "Prisma migrate deploy"
  npx tsx backend/prisma/seed.ts
  Assert-NativeSuccess "Prisma local seed"

  # Optional broker demo data (fake, local-only): the base seed leaves quotes disabled and nothing
  # published, so the comparator and the quote journey are empty without it. It has to run BEFORE
  # the app servers start: the public site caches the country directory and the catalogue for ten
  # minutes, so anything seeded after the first render stays invisible for that long.
  $demoSeed = (Read-EnvText "ASSURMATCH_LOCAL_DEMO_SEED" "0").ToLowerInvariant()
  if ($demoSeed -eq "1" -or $demoSeed -eq "true" -or $demoSeed -eq "yes") {
    Write-Host "Applying the local broker demo seed (ASSURMATCH_LOCAL_DEMO_SEED=$demoSeed)..."
    if ([string]::IsNullOrWhiteSpace($env:LOCAL_DEMO_BROKER_PASSWORD)) {
      # The demo accounts sign in through the local "Mode local" picker, which needs no password, so
      # a random one per launch satisfies the seed's 12-character rule without committing a secret.
      $env:LOCAL_DEMO_BROKER_PASSWORD = [Convert]::ToBase64String((1..24 | ForEach-Object { [byte] (Get-Random -Maximum 256) }))
    }
    $env:ASSURMATCH_LOCAL_API_URL = $ApiUrl
    npx tsx scripts/local-app/seed-broker-demo.ts --apply
    Assert-NativeSuccess "Broker demo seed"
  }

  Start-LocalProcess "api-$ApiPort" $Root $CommonEnv "set `"PORT=$ApiPort`" && node --import tsx scripts/local-app/api-runner.mjs"
  Start-LocalProcess "public-$PublicPort" (Join-Path $Root "apps\public") ($CommonEnv + @("set `"NEXT_PUBLIC_ASSURMATCH_API_URL=$ApiUrl`"", "set `"NEXT_PUBLIC_ASSURMATCH_PUBLIC_URL=$PublicUrl`"", "set `"NEXT_PUBLIC_ASSURMATCH_BROKER_URL=$BrokerUrl`"")) "npx next dev --hostname 127.0.0.1 --port $PublicPort"
  Start-LocalProcess "admin-$AdminPort" (Join-Path $Root "apps\admin") ($CommonEnv + @("set `"NEXT_PUBLIC_ASSURMATCH_API_URL=$ApiUrl`"", "set `"NEXT_PUBLIC_ASSURMATCH_ADMIN_API_URL=$ApiUrl`"")) "npx next dev --hostname 127.0.0.1 --port $AdminPort"
  Start-LocalProcess "broker-$BrokerPort" (Join-Path $Root "apps\broker") ($CommonEnv + @("set `"NEXT_PUBLIC_ASSURMATCH_API_URL=$ApiUrl`"", "set `"NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL=$ApiUrl`"")) "npx next dev --hostname 127.0.0.1 --port $BrokerPort"

  Write-Host "Waiting for local app URLs..."
  Wait-Http "$ApiUrl/countries" @(200)

  # The API only queues quote notifications; this loop is what actually delivers them locally,
  # so a demo submission reaches Mailpit within seconds instead of waiting for a manual run.
  Start-LocalProcess "worker-notifications" $Root $CommonEnv 'node scripts/local-app/notification-worker-loop.mjs'

  Wait-Http $PublicUrl @(200)
  Wait-Http "$AdminUrl/login" @(200)
  Wait-Http "$BrokerUrl/login" @(200)

  Write-Host ""
  Write-Host "AssurMatch local stack is ready:"
  Write-Host "  API:          http://localhost:$ApiPort"
  Write-Host "  Public:       http://localhost:$PublicPort"
  Write-Host "  Back-office:  http://localhost:$AdminPort"
  Write-Host "  Broker aux:   http://localhost:$BrokerPort"
  Write-Host "  Mailpit:      http://localhost:$MailpitHttpPort"
  Write-Host "  PostgreSQL:   127.0.0.1:$PostgresPort   Redis: 127.0.0.1:$RedisPort   Compose project: $ComposeProject"
  Write-Host ""
  Write-Host "Queued quote notifications are delivered automatically every 10s by worker-notifications."
  Write-Host "  Worker log:   $(Join-Path $LogDir 'worker-notifications.out.log')"
  Write-Host ""
  Write-Host "Logs are in $LogDir"
  Write-Host "Run npm run local:health or npm run test:web:local for validation."
  Write-Host "Run stop-local.bat to stop the local stack."
} finally {
  Pop-Location
}
