@echo off
cd /d "%~dp0"
start "מערכת הצעות מחיר - שרת" /min powershell -NoProfile -ExecutionPolicy Bypass -File "serve.ps1"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080/"
