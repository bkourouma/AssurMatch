@echo off
setlocal

set "ROOT=%~dp0"
set "NODE24=C:\Users\BABA\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.15.0-win-x64"
set "ROOT_URL=%ROOT:\=/%"
set "API_RUNNER=%TEMP%\assurmatch-preprod-api-3700.mjs"

if exist "%NODE24%\node.exe" (
  set "PATH=%NODE24%;%PATH%"
)

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker is required for the preproduction local stack.
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node v24.15.0 or newer is required.
  exit /b 1
)

echo Starting Docker services: postgres, redis, minio, mailpit...
docker compose up -d postgres redis minio mailpit
if errorlevel 1 exit /b 1

set "DATABASE_URL=postgresql://assurmatch:assurmatch@127.0.0.1:5432/assurmatch?schema=public"
set "REDIS_URL=redis://127.0.0.1:6379"
set "APP_ENV=preproduction"
set "NODE_ENV=development"
if not defined ENCRYPTION_KEY set "ENCRYPTION_KEY=local-preprod-encryption-key-32-bytes-minimum"
if not defined ASSURMATCH_AUTH_TOKEN_SECRET set "ASSURMATCH_AUTH_TOKEN_SECRET=local-preprod-auth-token-secret-32-bytes-minimum"
set "SMTP_HOST=127.0.0.1"
set "SMTP_PORT=1025"

echo Running Prisma migrate deploy...
npx prisma migrate deploy --schema backend/prisma/schema.prisma
if errorlevel 1 exit /b 1

> "%API_RUNNER%" echo import { bootstrap } from "file:///%ROOT_URL%backend/src/main.ts";
>> "%API_RUNNER%" echo await bootstrap(3700);

echo.
echo Starting AssurMatch preproduction local stack...
echo API:     http://127.0.0.1:3700
echo Public:  http://127.0.0.1:3701
echo Admin:   http://127.0.0.1:3702/login
echo Broker:  http://127.0.0.1:3703/login
echo Mailpit: http://127.0.0.1:8025
echo.

start "AssurMatch Preprod API 3700" cmd /k "cd /d "%ROOT%" && set "PATH=%PATH%" && node --import tsx "%API_RUNNER%""

start "AssurMatch Preprod Public 3701" cmd /k "cd /d "%ROOT%apps\public" && set "PATH=%PATH%" && set "NEXT_PUBLIC_ASSURMATCH_API_URL=http://127.0.0.1:3700" && npx next dev --hostname 127.0.0.1 --port 3701"

start "AssurMatch Preprod Admin 3702" cmd /k "cd /d "%ROOT%apps\admin" && set "PATH=%PATH%" && set "NEXT_PUBLIC_ASSURMATCH_API_URL=http://127.0.0.1:3700" && npx next dev --hostname 127.0.0.1 --port 3702"

start "AssurMatch Preprod Broker 3703" cmd /k "cd /d "%ROOT%apps\broker" && set "PATH=%PATH%" && set "NEXT_PUBLIC_ASSURMATCH_API_URL=http://127.0.0.1:3700" && npx next dev --hostname 127.0.0.1 --port 3703"

if defined LOCAL_BOOTSTRAP_ADMIN_EMAIL (
  echo Local bootstrap admin email: %LOCAL_BOOTSTRAP_ADMIN_EMAIL%
) else (
  echo No local bootstrap admin email configured.
)
echo Set LOCAL_BOOTSTRAP_ADMIN_EMAIL and LOCAL_BOOTSTRAP_ADMIN_PASSWORD before running this script to enable local bootstrap.
echo Use Mailpit at http://127.0.0.1:8025 to verify activation/password reset mail.
echo Use stop-preprod.bat to stop app windows and Docker services.

endlocal
