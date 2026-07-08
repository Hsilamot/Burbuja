@echo off
setlocal
cd /d %~dp0
title Burbuja Discord Bot

if not exist .env.local (
    echo [ERROR] No existe el archivo .env.local
    echo Copia .env.example como .env.local y completa sus valores.
    echo.
    pause
    exit /b 1
)

echo Iniciando Burbuja...
echo.
node --env-file=.env.local app.js
set BOT_EXIT_CODE=%ERRORLEVEL%

echo.
echo Burbuja termino con codigo %BOT_EXIT_CODE%.
echo La ventana permanecera abierta para que puedas revisar los mensajes.
pause
exit /b %BOT_EXIT_CODE%
