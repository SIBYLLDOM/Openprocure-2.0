@echo off
cd /d "%~dp0"
call ..\venv\Scripts\activate.bat
python cppp_gem_scraper.py
pause
