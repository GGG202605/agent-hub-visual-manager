@echo off
REM AgentHub Visual Manager v0.2 dev server launcher (ASCII only)
cd /d "%~dp0"

if not exist node_modules (
  echo node_modules not found, running locked npm ci first...
  call npm ci --ignore-scripts --no-audit --no-fund
  if errorlevel 1 (
    echo npm ci failed. Check network and retry.
    pause
    exit /b 1
  )
)

echo Starting dev server... Browser will open automatically.
echo Press Ctrl+C in this window to stop the server.
call npm run dev -- --open

pause
