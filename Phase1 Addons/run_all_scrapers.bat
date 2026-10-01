@echo off

cd C:\Users\Administrator\Desktop\FinalScrapper

call venv\Scripts\activate

python scrapper\run_diagno_perfect_category.py
python scrapper\run_diagno.py
python scrapper\run_diagno_part_two.py
python scrapper\run_analyser.py
python scrapper\run_endo_perfect_category.py
python scrapper\run_endo.py
python scrapper\run_endo_part_two.py
python scrapper\single_bid_api.py

deactivate