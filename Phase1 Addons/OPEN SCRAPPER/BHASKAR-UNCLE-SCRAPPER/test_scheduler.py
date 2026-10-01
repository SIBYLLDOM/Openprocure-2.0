#!/usr/bin/env python3
"""
Quick test for the scheduler logic
"""

import run
from datetime import datetime, timedelta

def test_scheduler_times():
    """Test that scheduler correctly identifies scheduled times"""
    print("Testing scheduler logic...")
    print("=" * 50)
    
    # Test current time
    now = datetime.now()
    print(f"Current time: {now.strftime('%H:%M:%S')}")
    print(f"Should run now: {run.should_run_now()}")
    
    # Test all scheduled times
    scheduled_times = [4, 10, 16, 22]
    print(f"\nScheduled times: {[f'{h:02d}:00' for h in scheduled_times]}")
    
    # Test each scheduled hour
    for hour in scheduled_times:
        # Create a datetime for the scheduled time
        test_time = now.replace(hour=hour, minute=0, second=0)
        
        # Temporarily override the datetime.now function
        original_now = datetime.now
        datetime.now = lambda: test_time
        
        should_run = run.should_run_now()
        print(f"{hour:02d}:00 - Should run: {should_run}")
        
        # Restore original function
        datetime.now = original_now
    
    # Test non-scheduled times
    print("\nTesting non-scheduled times:")
    for hour in [0, 6, 12, 18, 23]:
        test_time = now.replace(hour=hour, minute=0, second=0)
        datetime.now = lambda: test_time
        should_run = run.should_run_now()
        print(f"{hour:02d}:00 - Should run: {should_run}")
        datetime.now = original_now
    
    print("\n✅ Scheduler test completed!")

if __name__ == "__main__":
    test_scheduler_times()
