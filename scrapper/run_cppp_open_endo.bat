@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
python run_cppp_open_category.py --dept endo
pause
