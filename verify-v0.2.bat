@echo off
REM AgentHub Visual Manager v0.2 verify script (ASCII only)
cd /d "%~dp0"

echo ================ ENV ================> verify-log.txt
call node --version >> verify-log.txt 2>&1
call npm --version >> verify-log.txt 2>&1

echo [1/3] npm ci --ignore-scripts ...
echo ================ NPM CI ================>> verify-log.txt
call npm ci --ignore-scripts --no-audit --no-fund >> verify-log.txt 2>&1
set "install_exit_code=%errorlevel%"
echo install_exit_code=%install_exit_code% >> verify-log.txt
if not "%install_exit_code%"=="0" goto :failed

echo [2/3] npm run build ...
echo ================ BUILD ================>> verify-log.txt
call npm run build >> verify-log.txt 2>&1
set "build_exit_code=%errorlevel%"
echo build_exit_code=%build_exit_code% >> verify-log.txt
if not "%build_exit_code%"=="0" goto :failed

echo [3/3] npm test ...
echo ================ TEST ================>> verify-log.txt
call npm test >> verify-log.txt 2>&1
set "test_exit_code=%errorlevel%"
echo test_exit_code=%test_exit_code% >> verify-log.txt
if not "%test_exit_code%"=="0" goto :failed

:success
echo ================ DONE ================>> verify-log.txt
echo Done. Results saved to verify-log.txt
pause
exit /b 0

:failed
echo ================ FAILED ================>> verify-log.txt
echo Verification failed. See verify-log.txt
pause
exit /b 1
