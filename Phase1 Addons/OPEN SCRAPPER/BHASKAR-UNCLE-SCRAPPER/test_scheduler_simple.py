#!/usr/bin/env python3
"""
Simple test for the scheduler configuration
"""

import run

def test_config():
    """Test scheduler configuration"""
    print("🤖 Multi-Scraper Scheduler Configuration")
    print("=" * 50)
    
    print(f"Total scrapers: {len(run.SCRAPERS)}")
    print("\nScrapers configured:")
    for key, scraper in run.SCRAPERS.items():
        print(f"  - {scraper['name']} ({scraper['type']}) -> {scraper['file']}")
    
    print(f"\nScheduled time: 3:20 AM daily")
    
    print(f"\nCurrent time should trigger run: {run.should_run_now()}")
    
    print("\n✅ Configuration test completed!")
    print("\nTo run the scheduler:")
    print("  python run.py")
    print("\nThe scheduler will run continuously and check every 30 seconds")
    print("for the scheduled time: 3:20 AM daily")

if __name__ == "__main__":
    test_config()
