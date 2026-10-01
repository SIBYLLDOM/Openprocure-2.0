@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
python run_endo_perfect_category.py
pause
