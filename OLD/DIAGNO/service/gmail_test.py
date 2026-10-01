import imaplib

EMAIL = "stevejerald632@gmail.com"
APP_PASSWORD = "fxhz rchr vupl urdu"

mail = imaplib.IMAP4_SSL("imap.gmail.com")
mail.login(EMAIL, APP_PASSWORD)
mail.select("inbox")

status, messages = mail.search(None, "ALL")
print("Total emails:", len(messages[0].split()))

mail.logout()
