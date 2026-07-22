@echo off
REM AgentHub Visual Manager - zero-prompt managed product launcher (ASCII only)
cd /d "%~dp0"

if "%~1"=="" (
  node scripts\product-launcher.mjs start
) else (
  node scripts\product-launcher.mjs start --workspace "%~1"
)

if errorlevel 1 (
  echo.
  echo AgentHub failed to start. Copy the JSON receipt above for diagnosis.
  pause
  exit /b 1
)

exit /b 0
