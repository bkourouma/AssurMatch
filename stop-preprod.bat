@echo off
setlocal

set "ROOT=%~dp0"

echo Stopping AssurMatch preproduction app listeners on ports 3700-3703...
for %%P in (3700 3701 3702 3703) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P" ^| findstr LISTENING') do (
    taskkill /PID %%A /F >nul 2>nul
  )
)

echo Closing matching AssurMatch preproduction command windows...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and ($_.CommandLine -like '*AssurMatch Preprod*' -or $_.CommandLine -like '*assurmatch-preprod-api-3700.mjs*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

where docker >nul 2>nul
if not errorlevel 1 (
  echo Stopping Docker services...
  docker compose stop postgres redis minio mailpit
)

echo Preproduction local stack stopped.

endlocal
