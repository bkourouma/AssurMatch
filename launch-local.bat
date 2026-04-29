@echo off
setlocal

set "ROOT=%~dp0"
set "NODE24=C:\Users\BABA\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.15.0-win-x64"
set "ROOT_URL=%ROOT:\=/%"
set "API_RUNNER=%TEMP%\assurmatch-local-api-3700.mjs"

if exist "%NODE24%\node.exe" (
  set "PATH=%NODE24%;%PATH%"
)

> "%API_RUNNER%" echo import { bootstrap } from "file:///%ROOT_URL%backend/src/main.ts";
>> "%API_RUNNER%" echo await bootstrap(3700);

echo Starting AssurMatch local stack...
echo.
echo API:    http://127.0.0.1:3700
echo Public: http://127.0.0.1:3701
echo Admin:  http://127.0.0.1:3702/login
echo Broker: http://127.0.0.1:3703/login
echo.

start "AssurMatch API 3700" cmd /k "cd /d "%ROOT%" && set "PATH=%PATH%" && set "NODE_ENV=test" && set "PORT=3700" && node --import tsx "%API_RUNNER%""

start "AssurMatch Public 3701" cmd /k "cd /d "%ROOT%apps\public" && set "PATH=%PATH%" && set "NEXT_PUBLIC_ASSURMATCH_API_URL=http://127.0.0.1:3700" && npx next dev --hostname 127.0.0.1 --port 3701"

start "AssurMatch Admin 3702" cmd /k "cd /d "%ROOT%apps\admin" && set "PATH=%PATH%" && set "NEXT_PUBLIC_ASSURMATCH_API_URL=http://127.0.0.1:3700" && npx next dev --hostname 127.0.0.1 --port 3702"

start "AssurMatch Broker 3703" cmd /k "cd /d "%ROOT%apps\broker" && set "PATH=%PATH%" && set "NEXT_PUBLIC_ASSURMATCH_API_URL=http://127.0.0.1:3700" && npx next dev --hostname 127.0.0.1 --port 3703"

echo Launched. Wait until each window says ready, then open:
echo   Public: http://127.0.0.1:3701
echo   Admin:  http://127.0.0.1:3702/login
echo   Broker: http://127.0.0.1:3703/login
echo.
echo Use stop-local.bat to stop the local stack.

endlocal
