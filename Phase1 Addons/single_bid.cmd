@echo off

:START

echo ======================================
echo Single Bid STARTED
echo %date% %time%
echo ======================================
echo.

REM Go to project folder
cd /d "C:\Users\Administrator\Desktop\Automated Tasks\tender_scrapper"

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Go to project folder
cd /d "C:\Users\Administrator\Desktop\Automated Tasks\tender_scrapper\scrapper"

REM Run scraper
python single_bid_api.py

echo.
echo ======================================
echo Single Bid FINISHED
echo %date% %time%
echo ======================================

REM Wait before restart (prevents crash loop)
timeout /t 10 /nobreak > nul

goto START