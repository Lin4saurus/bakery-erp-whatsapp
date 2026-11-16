@echo off
rem Apaga el ERP (el servidor que escucha en el puerto 3000). Con /silencio no muestra mensajes ni espera.
setlocal
set APAGADO=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"127\.0\.0\.1:3000 .*LISTENING"') do (
  taskkill /pid %%p /f >nul 2>nul
  set APAGADO=1
)
if /i "%~1"=="/silencio" exit /b 0
if "%APAGADO%"=="1" (echo El ERP se apago.) else (echo El ERP no estaba prendido.)
pause
