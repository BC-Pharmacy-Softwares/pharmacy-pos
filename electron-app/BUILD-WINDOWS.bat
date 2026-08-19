@echo off
echo ========================================
echo  Pharmacy POS — Windows Installer Build
echo ========================================
echo.

:: Check Node is installed
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Download from https://nodejs.org and install, then run this again.
  pause
  exit /b 1
)

echo [1/4] Installing app dependencies...
call npm install
if errorlevel 1 (
  echo ERROR: npm install failed.
  pause
  exit /b 1
)

echo.
echo [2/4] Installing Clover bridge dependencies (bundled into the app)...
pushd ..\clover-local-pay
call npm install
if errorlevel 1 (
  echo ERROR: Clover bridge npm install failed.
  popd
  pause
  exit /b 1
)
popd

echo.
echo [3/4] Building Windows installer...
call npm run build
if errorlevel 1 (
  echo ERROR: Build failed.
  pause
  exit /b 1
)

echo.
echo [4/4] Done!
echo.
echo Installer is in:  electron-app\dist\
echo File to share:    Pharmacy POS Setup ^<version^>.exe  (see the dist folder)
echo.
pause
