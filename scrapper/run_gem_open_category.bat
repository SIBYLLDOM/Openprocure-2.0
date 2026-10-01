@echo off

cd /d "%~dp0"

echo =========================== > scheduler_log.txt
echo Started: %date% %time% >> scheduler_log.txt

REM This copy is for manual double-click runs, so show the browser.
REM The scheduled task runs a separate .bat (Gem Scrappers copy) that
REM does NOT set this var, so it stays headless for unattended runs.
set SCRAPER_HEADED=1

call venv\Scripts\activate.bat >> scheduler_log.txt 2>&1

python run_gem_open_category.py >> scheduler_log.txt 2>&1

echo Exit Code: %ERRORLEVEL% >> scheduler_log.txt

pause
