@echo off
rem Arranca el servidor del ERP (sin ventana: lo llama iniciar.vbs). El registro queda en logs\erp.log.
cd /d "%~dp0.."
rem El puerto 3000 tambien esta en iniciar.vbs y detener.bat.
set PORT=3000
rem Node.js del paquete (D110); en una copia de desarrollo, el de la PC.
set "NODE=%CD%\node\node.exe"
if not exist "%NODE%" set "NODE=node"
if not exist logs mkdir logs
for %%A in (logs\erp.log) do if %%~zA GTR 5000000 move /y logs\erp.log logs\erp-anterior.log >nul
echo ---- %date% %time% ---->> logs\erp.log
"%NODE%" node_modules\tsx\dist\cli.mjs backend\src\server.ts >> logs\erp.log 2>&1
