@echo off
chcp 65001 >nul
rem Enciende o apaga lo de WhatsApp en el ERP (D109), lo mismo que `npm run whatsapp`:
rem   whatsapp.bat encender   /   whatsapp.bat apagar   /   whatsapp.bat (solo muestra como esta)
cd /d "%~dp0.."
set "NODE=%CD%\node\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" node_modules\tsx\dist\cli.mjs backend\src\whatsapp.ts %1
echo Recarga el ERP para ver el cambio.
pause
