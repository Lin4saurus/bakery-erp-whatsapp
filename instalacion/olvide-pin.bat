@echo off
chcp 65001 >nul
rem Borra el PIN olvidado (lo mismo que `npm run pin`). Los datos no se tocan.
cd /d "%~dp0.."
title Olvide mi PIN - Dulzura ERP
set "NODE=%CD%\node\node.exe"
if not exist "%NODE%" set "NODE=node"
echo.
echo  Esto borra tu PIN. Al abrir el ERP te pedira crear uno nuevo. Tus ventas y clientes no se tocan.
echo.
choice /c SN /m " Borrar el PIN"
if errorlevel 2 exit /b 0
"%NODE%" node_modules\tsx\dist\cli.mjs backend\src\pin.ts
rem Las sesiones abiertas viven en el servidor: se reinicia para que pida el PIN nuevo.
call "%~dp0detener.bat" /silencio
start "" wscript "%~dp0iniciar.vbs"
echo.
pause
