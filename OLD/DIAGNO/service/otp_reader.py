import imaplib
import email
import re
import time
from html import unescape

EMAIL = "stevejerald632@gmail.com"
APP_PASSWORD = "fxhz rchr vupl urdu"
IMAP_SERVER = "imap.gmail.com"
OTP_SENDER = "noreply@gem.gov.in"


def extract_text(msg):
    text = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() in ("text/plain", "text/html"):
                payload = part.get_payload(decode=True)
                if payload:
                    text += payload.decode(errors="ignore")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            text += payload.decode(errors="ignore")
    return unescape(text)


def fetch_latest_otp(timeout=120, poll_interval=5):
    """
    Fetch the LATEST OTP mail from noreply@gem.gov.in.
    DOES NOT rely on UNSEEN or timestamp.
    """
    mail = imaplib.IMAP4_SSL(IMAP_SERVER)
    mail.login(EMAIL, APP_PASSWORD)
    mail.select("inbox")

    start = time.time()

    while time.time() - start < timeout:
        status, messages = mail.search(None, "ALL")
        if status != "OK":
            time.sleep(poll_interval)
            continue

        # newest first
        for num in messages[0].split()[::-1]:
            _, data = mail.fetch(num, "(RFC822)")
            msg = email.message_from_bytes(data[0][1])

            sender = (msg.get("From") or "").lower()
            if OTP_SENDER not in sender:
                continue

            body = extract_text(msg)

            # STRICT OTP: exactly 6 digits
            match = re.search(r"\b(\d{6})\b", body)
            if match:
                otp = match.group(1)
                print(f"✅ OTP FOUND: {otp}")

                # Mark for deletion (delete ONLY after login success)
                return otp, num

        time.sleep(poll_interval)

    mail.logout()
    raise TimeoutError("❌ OTP not received")
