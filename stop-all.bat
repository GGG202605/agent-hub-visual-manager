@echo off
REM AgentHub Visual Manager - stop the launcher-owned local service (ASCII only)
cd /d "%~dp0"

node scripts\product-launcher.mjs stop
if errorlevel 1 (
  echo.
  echo AgentHub failed to stop. Copy the JSON receipt above for diagnosis.
  pause
  exit /b 1
)

exit /b 0
