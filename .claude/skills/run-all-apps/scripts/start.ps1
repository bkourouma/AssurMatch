$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "ports.ps1")
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")

Write-Host "run-all-apps: starting the full AssurMatch stack on the alternate port profile"
Write-Host "  API $($env:ASSURMATCH_LOCAL_API_PORT) | public $($env:ASSURMATCH_LOCAL_PUBLIC_PORT) | admin $($env:ASSURMATCH_LOCAL_ADMIN_PORT) | broker $($env:ASSURMATCH_LOCAL_BROKER_PORT)"
Write-Host "  PostgreSQL $($env:ASSURMATCH_POSTGRES_PORT) | Redis $($env:ASSURMATCH_REDIS_PORT) | Mailpit SMTP $($env:ASSURMATCH_MAILPIT_SMTP_PORT) / UI $($env:ASSURMATCH_MAILPIT_HTTP_PORT)"
Write-Host "  Compose project $($env:ASSURMATCH_COMPOSE_PROJECT) | logs $($env:ASSURMATCH_LOCAL_LOG_DIR)"
Write-Host ""

# Next 16 allows a single `next dev` per app directory: it writes `.next/dev/lock` ({pid, port}) and a
# second instance exits with "You can access the existing server at ...". Two stacks can therefore
# never run from the same checkout, whatever their ports. Detect that before touching Docker, so the
# failure is one clear sentence instead of three dead Next servers ten seconds after a green launch.
$apps = @(
  @{ Name = "public"; Port = [int] $env:ASSURMATCH_LOCAL_PUBLIC_PORT },
  @{ Name = "admin";  Port = [int] $env:ASSURMATCH_LOCAL_ADMIN_PORT },
  @{ Name = "broker"; Port = [int] $env:ASSURMATCH_LOCAL_BROKER_PORT }
)
foreach ($app in $apps) {
  $lockPath = Join-Path $Root "apps\$($app.Name)\.next\dev\lock"
  if (-not (Test-Path $lockPath)) { continue }
  # The running server keeps the lock open without read sharing for Get-Content; opening it with
  # full sharing reads it fine. If even that fails, treat it as held.
  $lock = $null
  try {
    $stream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete))
    try { $reader = New-Object System.IO.StreamReader($stream); $lock = $reader.ReadToEnd() | ConvertFrom-Json; $reader.Dispose() } finally { $stream.Dispose() }
  } catch {
    throw "run-all-apps: apps/$($app.Name)/.next/dev/lock is held by a running dev server of this checkout. Next allows one `next dev` per app directory: stop that stack first (scripts/stop.ps1 for the alternate one, cmd /c stop-local.bat for the default one)."
  }
  if (-not $lock.pid -or -not (Get-Process -Id ([int] $lock.pid) -ErrorAction SilentlyContinue)) { continue }
  if ([int] $lock.port -eq $app.Port) {
    throw "run-all-apps: the alternate stack already runs (apps/$($app.Name) dev server pid $($lock.pid) on port $($lock.port)). Run scripts/stop.ps1 first, or use status.ps1 to check it."
  }
  throw "run-all-apps: another dev server of this checkout is running for apps/$($app.Name) (pid $($lock.pid), port $($lock.port)), probably the default stack. Next allows one `next dev` per app directory, so stop it first (cmd /c stop-local.bat) or run the alternate stack from a separate git worktree."
}

# The base Prisma seed leaves every product with quotes disabled and no published quote form, so a
# freshly created stack answers on every URL but the comparator and the quote journey are empty and
# `npm run local:health` fails on the quote form. The launcher applies the broker demo seed (fake,
# local-only, idempotent) before the servers start when this variable is set; seeding afterwards would
# stay invisible for ten minutes because the public site caches the catalogue.
if ($args -notcontains "-SkipDemoSeed") { $env:ASSURMATCH_LOCAL_DEMO_SEED = "1" }

& (Join-Path $Root "scripts\local-app\launch-local.ps1")

Push-Location $Root
try {
  if ($args -notcontains "-SkipHealth") {
    Write-Host ""
    Write-Host "run-all-apps: running npm run local:health against the alternate stack..."
    npm run local:health
    if ($LASTEXITCODE -ne 0) { Write-Host "run-all-apps: health check reported a failure (exit $LASTEXITCODE); the stack is up, inspect the logs." }
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "run-all-apps: ready."
Write-Host "  Public   $($env:ASSURMATCH_LOCAL_PUBLIC_URL)"
Write-Host "  Admin    $($env:ASSURMATCH_LOCAL_ADMIN_URL)/login"
Write-Host "  Broker   $($env:ASSURMATCH_LOCAL_BROKER_URL)/login"
Write-Host "  API      $($env:ASSURMATCH_LOCAL_API_URL)"
Write-Host "  Mailpit  $($env:ASSURMATCH_LOCAL_MAILPIT_URL)"
Write-Host "  Stop:    powershell -ExecutionPolicy Bypass -File .claude/skills/run-all-apps/scripts/stop.ps1"
