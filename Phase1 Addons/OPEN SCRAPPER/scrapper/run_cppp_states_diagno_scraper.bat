@echo off
cd /d "%~dp0"
call ..\venv\Scripts\activate.bat
python cppp_states_diagno_scraper.py
pause