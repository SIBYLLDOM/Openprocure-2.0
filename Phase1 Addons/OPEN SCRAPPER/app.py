import os
import sys
import random
import subprocess
import threading
import time
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('scrapper_batch.log'),
        logging.StreamHandler()
    ]
)

class ScrapperBatchManager:
    def __init__(self, scrapper_directory="scrapper", batch_size=5):
        self.scrapper_directory = Path(scrapper_directory)
        self.batch_size = batch_size
        self.running_processes = {}
        self.available_scrappers = []
        self.running = True
        self.lock = threading.Lock()
        
        # Load all available scrappers
        self.load_scrappers()
        
    def load_scrappers(self):
        """Load all Python scrapper files from the directory"""
        try:
            python_files = list(self.scrapper_directory.glob("*.py"))
            self.available_scrappers = [f for f in python_files if f.name != "__init__.py"]
            logging.info(f"Found {len(self.available_scrappers)} scrappers: {[f.name for f in self.available_scrappers]}")
        except Exception as e:
            logging.error(f"Error loading scrappers: {e}")
            self.available_scrappers = []
    
    def get_random_scrappers(self, count):
        """Get random scrappers from available list"""
        with self.lock:
            if len(self.available_scrappers) < count:
                selected = self.available_scrappers.copy()
                self.available_scrappers.clear()
            else:
                selected = random.sample(self.available_scrappers, count)
                for scrapper in selected:
                    self.available_scrappers.remove(scrapper)
            return selected
    
    def return_scrapper(self, scrapper_path):
        """Return a scrapper back to available pool"""
        with self.lock:
            if scrapper_path not in self.available_scrappers:
                self.available_scrappers.append(scrapper_path)
                logging.info(f"Returned {scrapper_path.name} to available pool")
    
    def run_scrapper(self, scrapper_path):
        """Run a single scrapper in a subprocess"""
        try:
            logging.info(f"Starting scrapper: {scrapper_path.name}")
            
            # Run the scrapper as a subprocess
            process = subprocess.Popen(
                [sys.executable, str(scrapper_path)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=str(self.scrapper_directory.parent)
            )
            
            # Wait for process to complete
            stdout, stderr = process.communicate()
            
            if process.returncode == 0:
                logging.info(f"Scrapper {scrapper_path.name} completed successfully")
            else:
                logging.error(f"Scrapper {scrapper_path.name} failed with return code {process.returncode}")
                if stderr:
                    logging.error(f"Error output: {stderr}")
            
            # Return the scrapper to available pool
            self.return_scrapper(scrapper_path)
            
        except Exception as e:
            logging.error(f"Error running scrapper {scrapper_path.name}: {e}")
            self.return_scrapper(scrapper_path)
    
    def start_batch(self):
        """Start initial batch of scrappers"""
        scrappers_to_run = self.get_random_scrappers(self.batch_size)
        
        if not scrappers_to_run:
            logging.warning("No scrappers available to run")
            return
        
        logging.info(f"Starting batch with {len(scrappers_to_run)} scrappers")
        
        for scrapper in scrappers_to_run:
            thread = threading.Thread(target=self.run_scrapper, args=(scrapper,))
            thread.daemon = True
            thread.start()
            self.running_processes[scrapper.name] = thread
    
    def monitor_and_maintain_batch(self):
        """Monitor running scrappers and maintain batch size"""
        while self.running:
            # Check completed threads and start new scrappers
            completed_scrappers = []
            
            for scrapper_name, thread in list(self.running_processes.items()):
                if not thread.is_alive():
                    completed_scrappers.append(scrapper_name)
            
            # Remove completed threads
            for scrapper_name in completed_scrappers:
                del self.running_processes[scrapper_name]
                logging.info(f"Scrapper {scrapper_name} finished, removing from active batch")
            
            # Start new scrappers to maintain batch size
            current_batch_size = len(self.running_processes)
            if current_batch_size < self.batch_size:
                needed = self.batch_size - current_batch_size
                new_scrappers = self.get_random_scrappers(needed)
                
                for scrapper in new_scrappers:
                    thread = threading.Thread(target=self.run_scrapper, args=(scrapper,))
                    thread.daemon = True
                    thread.start()
                    self.running_processes[scrapper.name] = thread
                    logging.info(f"Started new scrapper {scrapper.name} to maintain batch")
            
            # Sleep before next check
            time.sleep(10)
    
    def start(self):
        """Start the batch manager"""
        logging.info("Starting Scrapper Batch Manager")
        
        # Start initial batch
        self.start_batch()
        
        # Start monitoring thread
        monitor_thread = threading.Thread(target=self.monitor_and_maintain_batch)
        monitor_thread.daemon = True
        monitor_thread.start()
        
        try:
            # Keep the main thread alive
            while self.running:
                time.sleep(1)
                
                # Print status every 60 seconds
                if int(time.time()) % 60 == 0:
                    logging.info(f"Status: {len(self.running_processes)} scrappers running, {len(self.available_scrappers)} available")
                    
        except KeyboardInterrupt:
            logging.info("Received interrupt signal, shutting down...")
            self.stop()
    
    def stop(self):
        """Stop the batch manager"""
        self.running = False
        logging.info("Scrapper Batch Manager stopped")

def main():
    """Main function to run the scrapper batch system"""
    # Change to the script directory to ensure relative paths work
    script_dir = Path(__file__).parent
    os.chdir(script_dir)
    
    # Create and start batch manager
    batch_manager = ScrapperBatchManager(
        scrapper_directory="scrapper",
        batch_size=5
    )
    
    batch_manager.start()

if __name__ == "__main__":
    main()
