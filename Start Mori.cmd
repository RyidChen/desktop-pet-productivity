@echo off
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
if exist "%~dp0dist\Mori Focus\Mori.exe" (
  start "" "%~dp0dist\Mori Focus\Mori.exe"
) else if exist "%~dp0node_modules\electron\dist\electron.exe" (
  start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
) else (
  echo Please run npm install first.
  pause
)
