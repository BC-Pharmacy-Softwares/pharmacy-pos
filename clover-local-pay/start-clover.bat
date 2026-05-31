@echo off
title Clover Local Pay
color 0A

echo ============================================
echo   Clover Local Pay - Network Pay Display
echo ============================================
echo.

:: ── Find node.exe ─────────────────────────────────────────────
set NODE_EXE=

:: Try PATH first
where node >nul 2>&1
if not errorlevel 1 (
  set NODE_EXE=node
  goto :node_found
)

:: Common install locations (handles Admin vs regular user PATH differences)
for %%P in (
  "%ProgramFiles%\nodejs\node.exe"
  "%ProgramFiles(x86)%\nodejs\node.exe"
  "%APPDATA%\nvm\current\node.exe"
  "%LOCALAPPDATA%\Programs\nodejs\node.exe"
) do (
  if exist %%P (
    set NODE_EXE=%%P
    goto :node_found
  )
)

echo ERROR: Node.js not found.
echo.
echo  Download from: https://nodejs.org  (LTS version)
echo  After installing, close this window and try again.
echo.
pause
exit /b 1

:node_found
echo Node.js found: %NODE_EXE%

:: ── Check .env file ───────────────────────────────────────────
if not exist "%~dp0.env" (
  echo.
  echo ERROR: .env file not found.
  echo.
  echo  1. In this folder, copy  .env.example  to  .env
  echo  2. Open .env in Notepad
  echo  3. Set CLOVER_DEVICE_IP to the IP shown on your Clover screen
  echo.
  pause
  exit /b 1
)

:: ── Install dependencies if missing ───────────────────────────
if not exist "%~dp0node_modules" (
  echo node_modules missing - running npm install...
  echo.
  pushd "%~dp0"
  call npm install
  popd
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
  echo.
)

:: ── Start service ─────────────────────────────────────────────
echo Starting Clover service...
echo Keep this window open while using the POS.
echo Close this window to stop the service.
echo.

pushd "%~dp0"
%NODE_EXE% server.js
popd

echo.
echo Clover service stopped.
pause
