' Abre el ERP de Dulzura. Si el servidor no esta prendido, lo prende sin ventana y espera a que responda.
' Con /servidor (acceso de Inicio de Windows) solo prende el servidor, sin abrir el ERP.
Option Explicit
Dim sh, fso, carpeta, url, abrir, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://localhost:3000"
abrir = True
If WScript.Arguments.Count > 0 Then
  If LCase(WScript.Arguments(0)) = "/servidor" Then abrir = False
End If

If Not EstaPrendido() Then
  sh.Run "cmd /c """ & carpeta & "\servidor.bat""", 0, False
  For i = 1 To 450
    WScript.Sleep 200
    If EstaPrendido() Then Exit For
  Next
  If Not EstaPrendido() Then
    MsgBox "El ERP no pudo arrancar." & vbCrLf & "Revisa el archivo logs\erp.log en la carpeta del ERP.", vbExclamation, "Dulzura ERP"
    WScript.Quit 1
  End If
End If

If abrir Then AbrirVentana

Function EstaPrendido()
  Dim h
  EstaPrendido = False
  On Error Resume Next
  Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  h.setTimeouts 1000, 1000, 1000, 1000
  h.Open "GET", "http://127.0.0.1:3000/api/salud", False
  h.Send
  If Err.Number = 0 Then EstaPrendido = (h.Status = 200)
  On Error GoTo 0
End Function

' Edge en modo aplicacion: una ventana propia, sin pestanas ni barra de direcciones. Si no hay Edge, el navegador de siempre.
Sub AbrirVentana()
  Dim edge
  edge = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
  If Not fso.FileExists(edge) Then edge = sh.ExpandEnvironmentStrings("%ProgramW6432%") & "\Microsoft\Edge\Application\msedge.exe"
  If Not fso.FileExists(edge) Then edge = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe"
  If fso.FileExists(edge) Then
    sh.Run """" & edge & """ --app=" & url, 1, False
  Else
    sh.Run url, 1, False
  End If
End Sub
