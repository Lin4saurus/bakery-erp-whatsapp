@echo off
rem Aplica una actualizacion ya bajada y revisada por el ERP (D112). La lanza el servidor justo antes de cerrarse,
rem copiada a actualizaciones\aplicar.bat (fuera de instalacion\, que se reemplaza):
rem   aplicar.bat "<carpeta del ERP>" "<carpeta con la version nueva>" <pid del servidor>
rem No toca la base (database\prisma\*.db), el .env, los respaldos ni los registros.
setlocal
set "RAIZ=%~1"
set "NUEVA=%~2"
set "PID=%~3"
if not exist "%RAIZ%\logs" mkdir "%RAIZ%\logs"
set "LOG=%RAIZ%\logs\actualizacion.log"
>>"%LOG%" echo ==== %date% %time% aplicando "%NUEVA%"

rem 1. Esperar a que el servidor termine (hasta 30 s; si no, se cierra a la fuerza) y un respiro para que Windows
rem    suelte los archivos.
powershell -NoProfile -NonInteractive -Command "$p = Get-Process -Id %PID% -ErrorAction SilentlyContinue; if ($p -and -not $p.WaitForExit(30000)) { Stop-Process -Id %PID% -Force -ErrorAction SilentlyContinue; 'El servidor no se cerro a tiempo: se cerro a la fuerza.' }" >>"%LOG%" 2>&1
ping -n 3 127.0.0.1 >nul

rem 2. Copiar. robocopy devuelve 8 o mas si fallo.
set "RC=/NFL /NDL /NJH /NJS /NP /R:5 /W:2"
robocopy "%NUEVA%\backend" "%RAIZ%\backend" /MIR %RC% >>"%LOG%"
if errorlevel 8 goto fallo
robocopy "%NUEVA%\frontend" "%RAIZ%\frontend" /MIR %RC% >>"%LOG%"
if errorlevel 8 goto fallo
robocopy "%NUEVA%\instalacion" "%RAIZ%\instalacion" /MIR %RC% >>"%LOG%"
if errorlevel 8 goto fallo
robocopy "%NUEVA%\database" "%RAIZ%\database" /E /XF *.db *.db-journal *.db-wal *.db-shm %RC% >>"%LOG%"
if errorlevel 8 goto fallo
if not exist "%NUEVA%\node_modules" goto sinDependencias
robocopy "%NUEVA%\node_modules" "%RAIZ%\node_modules" /MIR %RC% >>"%LOG%"
if errorlevel 8 goto fallo
:sinDependencias
if not exist "%NUEVA%\node\node.exe" goto sinNode
robocopy "%NUEVA%\node" "%RAIZ%\node" /MIR %RC% >>"%LOG%"
if errorlevel 8 goto fallo
:sinNode
rem Archivos sueltos de la raiz (package.json, dependencias.json, LEEME...), nunca el .env.
robocopy "%NUEVA%" "%RAIZ%" /LEV:1 /XF .env %RC% >>"%LOG%"
if errorlevel 8 goto fallo
>>"%LOG%" echo Archivos copiados.

rem 3. El cliente de Prisma sale del schema: se regenera por si la version nueva lo cambio (sin internet).
rem    Despues, las migraciones de la base (si la version nueva trae alguna).
rem    Prisma va a su propio registro y sin su chequeo de versiones (deja un proceso en segundo plano que se queda
rem    con el archivo de registro abierto).
cd /d "%RAIZ%"
set CHECKPOINT_DISABLE=1
set PRISMA_HIDE_UPDATE_MESSAGE=1
set "LOGP=%RAIZ%\logs\actualizacion-prisma.log"
"%RAIZ%\node\node.exe" node_modules\prisma\build\index.js generate >"%LOGP%" 2>&1
if errorlevel 1 (>>"%LOG%" echo ERROR al regenerar el cliente de Prisma: ver actualizacion-prisma.log) else (>>"%LOG%" echo Cliente de Prisma al dia.)
"%RAIZ%\node\node.exe" node_modules\prisma\build\index.js migrate deploy >>"%LOGP%" 2>&1
if errorlevel 1 (>>"%LOG%" echo ERROR al aplicar las migraciones: ver actualizacion-prisma.log) else (>>"%LOG%" echo Migraciones al dia.)
goto arrancar

:fallo
>>"%LOG%" echo ERROR copiando archivos: el ERP puede quedar a medias; el respaldo de antes de actualizar esta en backups.

rem 4. Volver a prender el ERP y limpiar lo bajado.
:arrancar
start "" wscript "%RAIZ%\instalacion\iniciar.vbs" /servidor
rmdir /s /q "%RAIZ%\actualizaciones\nueva" 2>nul
del /q "%RAIZ%\actualizaciones\*.zip" 2>nul
>>"%LOG%" echo ==== %date% %time% listo
