#!/usr/bin/env python3
"""
Multi-Scraper Scheduler and Runner
==================================
Runs all 5 scrapers simultaneously at scheduled times:
- 4:00 AM
- 10:00 AM  
- 4:00 PM
- 10:00 PM

Each scraper runs in its own browser instance to avoid conflicts.
Scrapers included:
1. AIIMS (async)
2. BHEL (async)
3. Coal (async)
4. HLL (async)
5. IOCL (sync)

The scheduler runs continuously and checks every minute for scheduled run times.
"""

import asyncio
import logging
import signal
import sys
import time
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
import threading
import subprocess
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# Global flag for graceful shutdown
shutdown_flag = threading.Event()

# Scheduled run times (24-hour format)
SCHEDULED_TIMES = [3]  # 3:10 AM only

# Scraper configurations
SCRAPERS = {
    "aiims": {
        "file": "scrapper/aiims-scraper.py",
        "type": "async",
        "name": "AIIMS New Delhi"
    },
    "bhel": {
        "file": "scrapper/bhel-scraper.py", 
        "type": "async",
        "name": "BHEL"
    },
    "coal": {
        "file": "scrapper/coal-scraper.py",
        "type": "async", 
        "name": "Coal Ministry"
    },
    "hll": {
        "file": "scrapper/hll-scraper.py",
        "type": "async",
        "name": "HLL Lifecare"
    },
    "iocl": {
        "file": "scrapper/iocl-scraper.py",
        "type": "sync",
        "name": "IOCL"
    }
}

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    log.info("Received shutdown signal, stopping scheduler...")
    shutdown_flag.set()

def should_run_now():
    """Check if current time matches any scheduled time"""
    now = datetime.now()
    current_hour = now.hour
    current_minute = now.minute
    
    # Check if current hour is in scheduled times
    if current_hour in SCHEDULED_TIMES:
        # Run at 3:20 AM specifically (minute 20-22 to account for slight delays)
        if current_minute >= 20 and current_minute <= 22:
            return True
    
    return False

def run_scraper_sync(scraper_config):
    """Run a scraper in a separate process to avoid conflicts"""
    scraper_name = scraper_config["name"]
    scraper_file = scraper_config["file"]
    
    log.info(f"Starting {scraper_name} scraper...")
    
    try:
        # Run the scraper in a subprocess
        result = subprocess.run(
            [sys.executable, scraper_file],
            cwd=os.path.dirname(os.path.abspath(__file__)),
            capture_output=True,
            text=True,
            timeout=3600  # 1 hour timeout per scraper
        )
        
        if result.returncode == 0:
            log.info(f"✅ {scraper_name} completed successfully")
            if result.stdout:
                log.info(f"{scraper_name} output: {result.stdout[:500]}...")
        else:
            log.error(f"❌ {scraper_name} failed with return code {result.returncode}")
            if result.stderr:
                log.error(f"{scraper_name} error: {result.stderr[:500]}...")
                
    except subprocess.TimeoutExpired:
        log.error(f"⏰ {scraper_name} timed out after 1 hour")
    except Exception as e:
        log.error(f"💥 {scraper_name} crashed: {e}")

async def run_async_scrapers():
    """Run all async scrapers concurrently"""
    async_scrapers = [s for s in SCRAPERS.values() if s["type"] == "async"]
    
    log.info(f"Running {len(async_scrapers)} async scrapers concurrently...")
    
    # Create tasks for all async scrapers
    tasks = []
    for scraper in async_scrapers:
        task = asyncio.create_task(
            asyncio.to_thread(run_scraper_sync, scraper)
        )
        tasks.append(task)
    
    # Wait for all async scrapers to complete
    try:
        await asyncio.gather(*tasks, return_exceptions=True)
        log.info("All async scrapers completed")
    except Exception as e:
        log.error(f"Error in async scrapers: {e}")

def run_sync_scrapers():
    """Run sync scrapers in thread pool"""
    sync_scrapers = [s for s in SCRAPERS.values() if s["type"] == "sync"]
    
    if not sync_scrapers:
        return
    
    log.info(f"Running {len(sync_scrapers)} sync scrapers in thread pool...")
    
    with ThreadPoolExecutor(max_workers=len(sync_scrapers)) as executor:
        futures = []
        for scraper in sync_scrapers:
            future = executor.submit(run_scraper_sync, scraper)
            futures.append(future)
        
        # Wait for all sync scrapers to complete
        for future in futures:
            try:
                future.result()
            except Exception as e:
                log.error(f"Error in sync scraper: {e}")

async def run_all_scrapers():
    """Run all scrapers (async + sync) concurrently"""
    log.info("🚀 Starting scheduled scraper run...")
    start_time = datetime.now()
    
    # Run async scrapers concurrently
    async_task = asyncio.create_task(run_async_scrapers())
    
    # Run sync scrapers in thread pool
    sync_thread = threading.Thread(target=run_sync_scrapers)
    sync_thread.start()
    
    # Wait for async scrapers to complete
    await async_task
    
    # Wait for sync scrapers to complete
    sync_thread.join()
    
    end_time = datetime.now()
    duration = end_time - start_time
    log.info(f"✅ All scrapers completed in {duration}")

def scheduler_loop():
    """Main scheduler loop - runs continuously"""
    log.info("📅 Scheduler started. Scheduled time: 3:20 AM daily")
    log.info("Press Ctrl+C to stop gracefully")
    
    last_run_hour = -1
    
    while not shutdown_flag.is_set():
        try:
            now = datetime.now()
            current_hour = now.hour
            
            # Check if we should run now (and haven't already run this hour)
            if should_run_now() and current_hour != last_run_hour:
                log.info(f"⏰ Scheduled time reached: {now.strftime('%H:%M')}")
                
                # Run all scrapers
                asyncio.run(run_all_scrapers())
                
                # Update last run hour
                last_run_hour = current_hour
                
                # Wait a bit to avoid multiple runs in the same hour
                time.sleep(300)  # 5 minutes
                
            else:
                # Sleep for 30 seconds and check again
                time.sleep(30)
                
        except KeyboardInterrupt:
            log.info("Keyboard interrupt received")
            break
        except Exception as e:
            log.error(f"Scheduler error: {e}")
            time.sleep(60)  # Wait 1 minute before retrying
    
    log.info("Scheduler stopped")

def main():
    """Main entry point"""
    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    log.info("=" * 60)
    log.info("🤖 Multi-Scraper Scheduler Starting...")
    log.info("=" * 60)
    log.info(f"Scrapers configured: {len(SCRAPERS)}")
    for key, scraper in SCRAPERS.items():
        log.info(f"  - {scraper['name']} ({scraper['type']})")
    log.info(f"Scheduled time: 3:20 AM daily")
    log.info("=" * 60)
    
    # Start the scheduler loop
    scheduler_loop()

if __name__ == "__main__":
    main()
