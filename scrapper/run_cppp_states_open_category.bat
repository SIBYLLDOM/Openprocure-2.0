@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
python run_cppp_states_open_category.py
pause
