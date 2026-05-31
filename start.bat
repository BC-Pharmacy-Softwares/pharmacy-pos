@echo off
setlocal enabledelayedexpansion
title Pharmacy POS

rem ── Sanity checks ───────────────────────────────────────────
if not exist lib\sql-wasm.js (
  echo Library files missing. Running setup first...
  call setup.bat
  if errorlevel 1 exit /b 1
)

where npx >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js / npx not found.
  echo Install Node.js from https://nodejs.org then run setup.bat
  pause
  exit /b 1
)

rem ── Start Clover bridge in background (optional) ────────────
if exist clover-local-pay\server.js (
  if exist clover-local-pay\node_modules (
    echo Starting Clover bridge...
    start "Clover Bridge" /min cmd /c "cd clover-local-pay && node server.js"
    timeout /t 2 /nobreak >nul
  )
)

rem ── Start web server ────────────────────────────────────────
echo Starting Pharmacy POS on http://localhost:8082 ...
echo (Close this window to stop the server)
echo.

rem Open browser after a short delay
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:8082"

rem Start serve (blocking — keep this window open)
npx --yes serve -p 8082 -s .
