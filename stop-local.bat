@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-app\stop-local.ps1"
exit /b %ERRORLEVEL%
