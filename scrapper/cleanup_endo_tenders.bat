@echo off
cd /d "%~dp0"
call venv\Scripts\activate.bat
echo.
echo =====================================================
echo   Endo Tender Cleanup - dry run by default
echo   Marks irrelevant tenders as not-relevant (nothing is deleted)
echo   Run with --yes to apply: cleanup_endo_tenders.bat --yes
echo =====================================================
echo.
python cleanup_endo_tenders.py %*
pause
