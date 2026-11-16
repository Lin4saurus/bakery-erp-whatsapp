@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Instalar Dulzura ERP

echo.
echo  ==========================================
echo    Dulzura Pasteleria - instalacion del ERP
echo  ==========================================
echo.

rem El paquete trae su propio Node.js y sus componentes: no hace falta instalar nada ni tener internet (D110).
set "NODE=%CD%\node\node.exe"
if not exist "%NODE%" goto incompleto
if not exist "node_modules\tsx\dist\cli.mjs" goto incompleto
if not exist "frontend\dist\index.html" goto incompleto

rem Si el ERP ya estaba prendido (al actualizar), se apaga para poder reemplazar sus archivos.
call "%~dp0detener.bat" /silencio

if not exist ".env" copy ".env.example" ".env" >nul

if not exist "database\prisma\dulzura.db" goto sinRespaldo
echo [1/3] Respaldo de los datos antes de actualizar...
"%NODE%" node_modules\tsx\dist\cli.mjs backend\src\backup.ts
if errorlevel 1 goto error
:sinRespaldo

echo [2/3] Preparando la base de datos...
"%NODE%" node_modules\prisma\build\index.js migrate deploy
if errorlevel 1 goto error

echo [3/3] Creando el acceso directo "Dulzura ERP" en el escritorio...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0crear-accesos.ps1"
if errorlevel 1 goto error

echo.
echo  Listo. Se abre el ERP; desde ahora se entra con el icono "Dulzura ERP" del escritorio.
echo.
start "" wscript "%~dp0iniciar.vbs"
timeout /t 8 >nul
exit /b 0

:incompleto
echo  Faltan archivos del ERP en %CD%.
echo  Vuelve a abrir el instalador DulzuraERP_Instalador.exe que te mandaron.
pause
exit /b 1

:error
echo.
echo  Algo fallo (mira el mensaje de arriba). Sacale una foto a esta ventana y mandasela a quien te instalo el ERP.
pause
exit /b 1
