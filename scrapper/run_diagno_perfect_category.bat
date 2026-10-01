@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
python run_diagno_perfect_category.py
pause
