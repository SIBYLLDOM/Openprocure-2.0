@echo off
cd /d "%~dp0"
call ..\venv\Scripts\activate.bat
python cppp_states_scraper.py
pause
N