import time
from datetime import datetime
from playwright.sync_api import sync_playwright

# ---------------- CONFIGURATION ----------------
URL = "https://tariff-involve-gadgets-edges.trycloudflare.com/"

PRICE_SELECTOR = "span#sp_l1price"
INPUT_SELECTOR = "input.priceInput"
SAVE_BUTTON_SELECTOR = "input#saveParticipate"

CHECK_INTERVAL = 5
WAIT_AFTER_CHANGE = 3
BID_PERCENTAGE = 0.9


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        print("🚀 Opening bidding page...")
        page.goto(URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_selector(PRICE_SELECTOR)

        My_last_price = None
        My_last_bid = None

        while True:
            try:
                l1_text = page.inner_text(PRICE_SELECTOR)
                l1_price = float(l1_text.replace(",", "").strip())
                now = datetime.now().strftime("%H:%M:%S")

                print(f"[{now}] 💰 L1 Price: {l1_price}")

                # -------- First observation --------
                if My_last_price is None:
                    My_last_price = l1_price
                    print(f"📝 Observing price: {My_last_price}")
                    time.sleep(CHECK_INTERVAL)
                    continue

                # -------- No competitor change --------
                if l1_price == My_last_price:
                    print("⏸️ No competitor activity. Waiting...")
                    time.sleep(CHECK_INTERVAL)
                    continue

                # -------- Competitor changed price --------
                print(f"🔄 Competitor bid detected ({My_last_price} → {l1_price})")
                time.sleep(WAIT_AFTER_CHANGE)

                # Calculate bid
                new_bid = round(l1_price * BID_PERCENTAGE, 2)

                # Place bid only if better
                if My_last_bid is None or new_bid < My_last_bid:
                    print(f"✍️ Placing bid: {new_bid}")
                    page.fill(INPUT_SELECTOR, "")
                    page.type(INPUT_SELECTOR, str(new_bid), delay=80)
                    page.click(SAVE_BUTTON_SELECTOR)

                    print("✅ Bid submitted")

                    # 🔥 CRITICAL FIX
                    # Reset tracking so we don't react to our own bid
                    My_last_price = None
                    My_last_bid = None

                    print("🔄 Reset state after bid. Waiting for competitor...")
                else:
                    My_last_price = l1_price

                time.sleep(CHECK_INTERVAL)

            except Exception as e:
                print(f"⚠️ Error: {e}")
                time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    main()
