import subprocess
import threading
import queue
import time
from datetime import datetime

# ============================================
# CONFIG
# ============================================

MAX_PARALLEL = 6
RESTART_DELAY = 10  # seconds after full cycle

VENV_PYTHON = r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\venv\Scripts\python.exe"

SCRAPERS = [
    ("Assam", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\assam_scrapper.py"),
    ("Bihar", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\bihar_scraper.py"),
    ("Goa", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\goa_scraper.py"),
    ("Haryana", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\haryana_scrapper.py"),
    ("Jammu & Kashmir", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\jammundkashmir_scraper.py"),
    ("Kerala", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\kerala_scrapper.py"),
    ("Madhya Pradesh", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\madhyapradesh_scrapper.py"),
    ("Maharashtra", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\maharastra_scraper.py"),
    ("Odisha", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\odisha_scraper.py"),
    ("Punjab", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\punjab_scrapper.py"),
    ("Rajasthan", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\rajasthan_scraper.py"),
    ("Tamil Nadu", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\tamilnadu_scrapper.py"),
    ("Tripura", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\tripura_scrapper.py"),
    ("Uttar Pradesh", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\uttarprad_scrapper.py"),
    ("Uttarakhand", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\uttarkhand_scrapper.py"),
    ("West Bengal", r"C:\Users\Administrator\Desktop\Automated Tasks\Phase1 Addons\OPEN SCRAPPER\scrapper\westbengal_scrapper.py"),
]

# ============================================
# WORKER FUNCTION
# ============================================

def run_scraper(state_name, script_path):
    start_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print(f"\n====================================================")
    print(f"STARTED : {state_name}")
    print(f"TIME    : {start_time}")
    print(f"SCRIPT  : {script_path}")
    print(f"====================================================")

    try:
        process = subprocess.Popen(
            [VENV_PYTHON, script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        for line in process.stdout:
            print(f"[{state_name}] {line.strip()}")

        process.wait()

        end_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        print(f"\nCOMPLETED : {state_name}")
        print(f"EXIT CODE : {process.returncode}")
        print(f"ENDED AT  : {end_time}")
        print("====================================================")

    except Exception as e:
        print(f"\nERROR in {state_name}")
        print(str(e))
        print("====================================================")


# ============================================
# THREAD WORKER
# ============================================

def worker(task_queue):
    while True:
        item = task_queue.get()

        if item is None:
            break

        state_name, script_path = item

        run_scraper(state_name, script_path)

        task_queue.task_done()


# ============================================
# MAIN LOOP
# ============================================

while True:

    print("\n\n#############################################")
    print("STARTING NEW FULL SCRAPER CYCLE")
    print(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("#############################################\n")

    task_queue = queue.Queue()

    threads = []

    # Start only 2 workers
    for _ in range(MAX_PARALLEL):
        t = threading.Thread(target=worker, args=(task_queue,))
        t.start()
        threads.append(t)

    # Add all scrapers to queue
    for scraper in SCRAPERS:
        task_queue.put(scraper)

    # Wait until all tasks complete
    task_queue.join()

    # Stop workers
    for _ in range(MAX_PARALLEL):
        task_queue.put(None)

    for t in threads:
        t.join()

    print("\n#############################################")
    print("ALL SCRAPERS COMPLETED")
    print(f"WAITING {RESTART_DELAY} SECONDS FOR NEXT CYCLE")
    print("#############################################\n")

    time.sleep(RESTART_DELAY)