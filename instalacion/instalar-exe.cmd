@echo off
chcp 65001 >nul
rem Lo que corre DulzuraERP_Instalador.exe (D110): copia el ERP a C:\DulzuraERP y lo instala.
rem Si ya hay una base de datos ahi, NO se reemplaza: sirve igual para instalar la primera vez y para actualizar.
title Instalar Dulzura ERP
set "DESTINO=C:\DulzuraERP"
rem IExpress corre esto con el cmd de 32 bits: el tar de Windows se busca por Sysnative.
set "TAR=%SystemRoot%\System32\tar.exe"
if exist "%SystemRoot%\Sysnative\tar.exe" set "TAR=%SystemRoot%\Sysnative\tar.exe"
echo.
echo  Copiando el ERP a %DESTINO% ...
if exist "%DESTINO%\instalacion\detener.bat" call "%DESTINO%\instalacion\detener.bat" /silencio
if exist "%DESTINO%\database\prisma\dulzura.db" (
  "%TAR%" -x -f "%~dp0DulzuraERP.zip" -C C:\ --exclude "DulzuraERP/database/prisma/dulzura.db"
) else (
  "%TAR%" -x -f "%~dp0DulzuraERP.zip" -C C:\
)
if errorlevel 1 goto error
call "%DESTINO%\instalacion\instalar.bat"
exit /b %errorlevel%

:error
echo.
echo  No se pudo copiar el ERP a %DESTINO%. Sacale una foto a esta ventana y mandasela a quien te instalo el ERP.
pause
exit /b 1
