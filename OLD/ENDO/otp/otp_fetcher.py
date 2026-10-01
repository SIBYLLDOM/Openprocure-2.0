import imaplib
import email
import re
import time
from html import unescape
from email.utils import parsedate_to_datetime

EMAIL = "bhaskar.merillife@gmail.com"
APP_PASSWORD = "wawy viua skru btgh"
IMAP_SERVER = "imap.gmail.com"


def extract_text_from_msg(msg):
    text = ""

    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype in ("text/plain", "text/html"):
                payload = part.get_payload(decode=True)
                if payload:
                    text += payload.decode(errors="ignore")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            text += payload.decode(errors="ignore")

    return unescape(text)


def fetch_latest_otp(trigger_time, timeout=120, poll_interval=5):
    """
    Fetch the latest OTP mail from noreply@gem.gov.in
    received AFTER trigger_time
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

        # Check newest mails first
        for num in messages[0].split()[::-1]:
            _, data = mail.fetch(num, "(RFC822)")
            msg = email.message_from_bytes(data[0][1])

            sender = (msg.get("From") or "").lower()
            if "noreply@gem.gov.in" not in sender:
                continue

            # Ensure OTP is fresh
            msg_time = parsedate_to_datetime(msg.get("Date"))
            if msg_time.timestamp() < trigger_time:
                continue

            body = extract_text_from_msg(msg)

            # ✅ Robust OTP regex (GeM emails vary slightly)
            match = re.search(r"\b(\d{6})\b", body)
            if match:
                otp = match.group(1)

                # Mark mail as read (optional but recommended)
                mail.store(num, "+FLAGS", "\\Seen")

                mail.logout()
                return otp

        time.sleep(poll_interval)

    mail.logout()
    raise TimeoutError("❌ Fresh GeM OTP not received")
