@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
 echo Install Node.js LTS from https://nodejs.org then retry.
 pause
 exit /b 1
)
node "%~dp0install.mjs" %*
set RESULT=%ERRORLEVEL%
pause
exit /b %RESULT%
