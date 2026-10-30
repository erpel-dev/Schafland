@echo off
rem Startet Schafland unter Windows im Vollbild mit Microsoft Edge. Beenden mit Alt+F4.
rem Voraussetzung: Python 3 (https://www.python.org, bei der Installation "Add to PATH" ankreuzen).
cd /d "%~dp0"
start "" /min python server.py "%~dp0..\dist" 8080
timeout /t 2 /nobreak >nul
start "" msedge --kiosk "http://localhost:8080/" --edge-kiosk-type=fullscreen --no-first-run --user-data-dir="%LOCALAPPDATA%\schafland-kiosk"
