@echo off
rem Debug start (2026-10-22): runs VibingWrapper with Electron logging on and saves everything it prints,
rem including errors that kill it before its own debug.log starts, to %APPDATA%\vibing-wrapper\startup.log.
rem When the program exits, the folder with the log opens. Send startup.log and debug.log.
set ELECTRON_ENABLE_LOGGING=1
set "LOGDIR=%APPDATA%\vibing-wrapper"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
echo VibingWrapper debug start %DATE% %TIME% > "%LOGDIR%\startup.log"
echo folder: %~dp0 >> "%LOGDIR%\startup.log"
echo.
echo VibingWrapper is starting with logging on. Keep this window open.
echo If it closes by itself or never shows, send these files to the developer:
echo   %LOGDIR%\startup.log
echo   %LOGDIR%\debug.log
echo.
"%~dp0VibingWrapper.exe" >> "%LOGDIR%\startup.log" 2>&1
echo exit code %ERRORLEVEL% >> "%LOGDIR%\startup.log"
explorer /select,"%LOGDIR%\startup.log"
