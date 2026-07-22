@echo off
REM AgentHub local service launcher (ASCII only)
REM Usage: double-click, then enter the real project folder that contains .agent-hub
cd /d "%~dp0"

set /p WORKSPACE=Enter workspace folder (contains .agent-hub):
if "%WORKSPACE%"=="" (
  echo No workspace given. Exit.
  pause
  exit /b 1
)

echo Starting local service on http://127.0.0.1:8787 ...
echo Workspace: %WORKSPACE%
echo Press Ctrl+C to stop.
node server\server.mjs --workspace "%WORKSPACE%" --port 8787

pause
