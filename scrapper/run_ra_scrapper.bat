@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
echo.
echo =====================================================
echo   GeM RA Scrapper - Running with %*
echo   Press Ctrl+C to stop at any time
echo =====================================================
echo.
python ra_scrapper.py %*
pause
