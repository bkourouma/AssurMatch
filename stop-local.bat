@echo off
setlocal

echo Stopping AssurMatch local stack on ports 3700, 3701, 3702, 3703...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = '%~dp0'.TrimEnd('\'); " ^
  "$ports = 3700,3701,3702,3703; " ^
  "$owners = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne 0 } | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "foreach ($owner in $owners) { Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue }; " ^
  "$launched = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like \"*$root*\" -and ($_.CommandLine -like '*assurmatch-local-api-3700.mjs*' -or $_.CommandLine -like '*--port 3701*' -or $_.CommandLine -like '*--port 3702*' -or $_.CommandLine -like '*--port 3703*' -or $_.CommandLine -like '*m.bootstrap(3700)*') } | Select-Object -ExpandProperty ProcessId -Unique; " ^
  "foreach ($processId in $launched) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }; " ^
  "Start-Sleep -Milliseconds 500; " ^
  "$remaining = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }; " ^
  "if ($remaining) { Write-Host 'Some listeners are still active:'; $remaining | Format-Table LocalAddress,LocalPort,State,OwningProcess } else { Write-Host 'Stopped.' }"

endlocal
