@echo off
cd /d "%~dp0"
call ..\venv\Scripts\activate.bat
python cppp_state_organ_open_scrapper.py
pause
