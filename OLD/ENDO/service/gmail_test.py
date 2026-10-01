import imaplib

EMAIL = "bhaskar.merillife@gmail.com"
APP_PASSWORD = "wawy viua skru btgh"

mail = imaplib.IMAP4_SSL("imap.gmail.com")
mail.login(EMAIL, APP_PASSWORD)
mail.select("inbox")

status, messages = mail.search(None, "ALL")
print("Total emails:", len(messages[0].split()))

mail.logout()
