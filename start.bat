@echo off
rem Double-click to preview the price page on this computer.
cd /d "%~dp0"
title Price Page Server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\server.ps1" -Port 8001
pause
