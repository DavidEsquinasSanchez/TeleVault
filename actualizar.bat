@echo off
setlocal EnableExtensions
title TeleVault - Actualizador Oficial
color 0b
cd /d "%~dp0"

echo ========================================================
echo   TeleVault - Busqueda y Aplicacion de Actualizaciones
echo ========================================================
echo.

set "PY=%~dp0.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

"%PY%" backend\updater.py

echo.
pause
