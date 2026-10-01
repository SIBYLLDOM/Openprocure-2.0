@echo off
cd /d "%~dp0"
call ..\venv\Scripts\activate.bat
python cppp_states_endo_scraper.py
pause
