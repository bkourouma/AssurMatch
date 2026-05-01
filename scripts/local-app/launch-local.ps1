$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$LogDir = Join-Path $Root ".local\logs"
$PostgresPort = 55433
$RedisPort = 56380
$DatabaseUrl = "postgresql://assurmatch:assurmatch@127.0.0.1:$PostgresPort/assurmatch"
$RedisUrl = "redis://127.0.0.1:$RedisPort"
$CommonEnv = @(
  'set "APP_ENV=local"',
  'set "NODE_ENV=development"',
  "set `"DATABASE_URL=$DatabaseUrl`"",
  "set `"REDIS_URL=$RedisUrl`"",
  'set "EMAIL_SERVICE_TYPE=mailpit"',
  'set "EMAIL_FROM=local@assurmatch.local"',
  'set "EMAIL_SMTP_HOST=127.0.0.1"',
  'set "EMAIL_SMTP_PORT=1025"',
  'set "ASSURMATCH_BROKER_CRM_ENABLED=false"'
)

function Test-PortFree([int] $Port) {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    $owners = ($listener | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
    throw "Port $Port is already in use by process id(s): $owners. Run stop-local.bat or free the port before launching."
  }
}

function Wait-Http([string] $Url, [int[]] $AllowedStatuses = @(200), [int] $TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 3 -ErrorAction Stop
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
  $dbExists = docker exec assurmatch-postgres-1 psql -U assurmatch -d postgres -tAc "select 1 from pg_database where datname='assurmatch'" 2>$null
  $dbExistsText = $dbExists | Out-String
  if ($dbExistsText -notmatch "1") {
    Write-Host "Creating local PostgreSQL database assurmatch..."
    docker exec assurmatch-postgres-1 createdb -U assurmatch assurmatch
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

foreach ($port in @(3600, 3601, 3602, 3603)) {
  Test-PortFree $port
}

Write-Host "Starting local PostgreSQL, Redis and Mailpit with Docker Compose..."
Push-Location $Root
try {
  $env:ASSURMATCH_POSTGRES_PORT = "$PostgresPort"
  $env:ASSURMATCH_REDIS_PORT = "$RedisPort"
  docker compose up -d --remove-orphans postgres redis mailpit
  Assert-NativeSuccess "Docker Compose local infrastructure startup"
  Wait-TcpPort "127.0.0.1" $PostgresPort
  Wait-TcpPort "127.0.0.1" $RedisPort
  Wait-Http "http://127.0.0.1:8025" @(200)
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

  Start-LocalProcess "api-3600" $Root $CommonEnv 'set "PORT=3600" && node --import tsx scripts/local-app/api-runner.mjs'
  Start-LocalProcess "public-3601" (Join-Path $Root "apps\public") ($CommonEnv + @('set "NEXT_PUBLIC_ASSURMATCH_API_URL=http://127.0.0.1:3600"')) 'npx next dev --hostname 127.0.0.1 --port 3601'
  Start-LocalProcess "admin-3602" (Join-Path $Root "apps\admin") ($CommonEnv + @('set "NEXT_PUBLIC_ASSURMATCH_API_URL=http://127.0.0.1:3600"', 'set "NEXT_PUBLIC_ASSURMATCH_ADMIN_API_URL=http://127.0.0.1:3600"')) 'npx next dev --hostname 127.0.0.1 --port 3602'
  Start-LocalProcess "broker-3603" (Join-Path $Root "apps\broker") ($CommonEnv + @('set "NEXT_PUBLIC_ASSURMATCH_API_URL=http://127.0.0.1:3600"', 'set "NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL=http://127.0.0.1:3600"')) 'npx next dev --hostname 127.0.0.1 --port 3603'

  Write-Host "Waiting for local app URLs..."
  Wait-Http "http://127.0.0.1:3600/countries" @(200)
  Wait-Http "http://127.0.0.1:3601" @(200)
  Wait-Http "http://127.0.0.1:3602/login" @(200)
  Wait-Http "http://127.0.0.1:3603/login" @(200)

  Write-Host ""
  Write-Host "AssurMatch local stack is ready:"
  Write-Host "  API:          http://localhost:3600"
  Write-Host "  Public:       http://localhost:3601"
  Write-Host "  Back-office:  http://localhost:3602"
  Write-Host "  Broker aux:   http://localhost:3603"
  Write-Host "  Mailpit:      http://localhost:8025"
  Write-Host ""
  Write-Host "Logs are in $LogDir"
  Write-Host "Run npm run local:health or npm run test:web:local for validation."
  Write-Host "Run stop-local.bat to stop the local stack."
} finally {
  Pop-Location
}
