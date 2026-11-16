# Crea el acceso directo "Dulzura ERP" en el escritorio (prende el servidor si hace falta y abre el ERP)
# y otro en Inicio de Windows que solo prende el servidor al encender la PC, sin abrir ventanas.
$ErrorActionPreference = 'Stop'
$carpeta = $PSScriptRoot
$icono = Join-Path $carpeta 'dulzura.ico'
$vbs = Join-Path $carpeta 'iniciar.vbs'
$ws = New-Object -ComObject WScript.Shell

function Crear($ruta, $argumentos, $descripcion) {
  $a = $ws.CreateShortcut($ruta)
  $a.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $a.Arguments = "`"$vbs`" $argumentos"
  $a.WorkingDirectory = $carpeta
  $a.IconLocation = "$icono,0"
  $a.Description = $descripcion
  $a.Save()
}

Crear (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Dulzura ERP.lnk') '' 'Abre el ERP de Dulzura Pasteleria'
Crear (Join-Path ([Environment]::GetFolderPath('Startup')) 'Dulzura ERP (servidor).lnk') '/servidor' 'Prende el ERP al encender la PC'
