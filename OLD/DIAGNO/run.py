import os
import sys

# Add the current directory to sys.path to ensure imports work correctly
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
sys.path.append(BASE_DIR)

from controller.playwright_controller import main

if __name__ == "__main__":
    print("🚀 Starting DIAGNO Scraper...")
    try:
        main()
    except KeyboardInterrupt:
        print("\n🛑 Scraper stopped by user.")
    except Exception as e:
        print(f"\n❌ Scraper failed with error: {e}")
        import traceback
        traceback.print_exc()
