@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  Pharmacy POS -- Web Version Setup
echo ============================================================
echo.

rem ── Check for Node.js ───────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in your PATH.
  echo.
  echo  Download it from: https://nodejs.org  (use the LTS version)
  echo  After installing, close this window and run setup.bat again.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  Node.js found: %NODE_VER%

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found. Re-install Node.js from https://nodejs.org
  pause
  exit /b 1
)

rem ── Create lib folder ───────────────────────────────────────
if not exist lib mkdir lib

rem ── Download libraries (curl first, PowerShell fallback) ────
echo.
echo Downloading sql.js (SQLite in WebAssembly)...

where curl >nul 2>&1
if not errorlevel 1 (
  curl -fsSL "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js"   -o "lib\sql-wasm.js"   || goto :download_fail
  curl -fsSL "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.wasm" -o "lib\sql-wasm.wasm" || goto :download_fail
  echo Downloading bcrypt.js...
  curl -fsSL "https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js" -o "lib\bcrypt.min.js" || goto :download_fail
) else (
  echo  (curl not found, using PowerShell fallback)
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js'   -OutFile 'lib\sql-wasm.js'"   2>&1 || goto :download_fail
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.wasm' -OutFile 'lib\sql-wasm.wasm'" 2>&1 || goto :download_fail
  echo Downloading bcrypt.js...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js'  -OutFile 'lib\bcrypt.min.js'"  2>&1 || goto :download_fail
)

echo  Libraries downloaded OK.

rem ── Clover bridge setup ─────────────────────────────────────
echo.
echo Setting up Clover Local Pay bridge...
if not exist clover-local-pay (
  echo  WARNING: clover-local-pay folder not found -- skipping.
  goto :skip_clover
)

cd clover-local-pay

if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo.
    echo   *** ACTION REQUIRED ***
    echo   Edit clover-local-pay\.env and set your Clover device IP address.
    echo   (Open Network Pay Display on your Clover terminal -- IP shown on screen.)
    echo.
  )
)

echo  Running npm install in clover-local-pay...
call npm install --silent
if errorlevel 1 (
  echo.
  echo   WARNING: npm install failed in clover-local-pay.
  echo   Clover bridge may not work, but the POS will still open.
  echo.
)
cd ..

:skip_clover

rem ── Done ────────────────────────────────────────────────────
echo.
echo ============================================================
echo  Setup complete!
echo.
echo  TO START THE POS:
echo    Double-click  start.bat
echo.
echo  Or manually:
echo    Terminal 1: cd clover-local-pay ^&^& node server.js
echo    Terminal 2: npx serve -p 8082
echo    Browser:    http://localhost:8082
echo ============================================================
echo.
pause
exit /b 0

:download_fail
echo.
echo ERROR: Could not download library files.
echo.
echo  Possible causes:
echo    - No internet connection
echo    - A firewall or antivirus is blocking the download
echo    - The CDN is temporarily unavailable
echo.
echo  Try again, or manually download these files and place them in the lib\ folder:
echo    https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js
echo    https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.wasm
echo    https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js
echo.
pause
exit /b 1
