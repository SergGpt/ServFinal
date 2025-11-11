@echo off
title RAGE:MP AutoRestart
:loop
echo [START] Запуск RAGE:MP сервера...
ragemp-server.exe
echo [RESTART] Сервер завершился. Перезапуск через 5 секунд...
timeout /t 5 /nobreak >nul
goto loop
