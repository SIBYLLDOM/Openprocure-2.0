from flask import Flask, request
import threading

app = Flask(__name__)
latest_sms_otp = None

@app.route("/sms", methods=["POST"])
def receive_sms():
    global latest_sms_otp
    data = request.json
    message = data.get("message", "")
    
    import re
    match = re.search(r"\b\d{6}\b", message)
    if match:
        latest_sms_otp = match.group()
        print("📩 SMS OTP received:", latest_sms_otp)
    
    return {"status": "ok"}

def run_server():
    app.run(host="0.0.0.0", port=5005)

def get_sms_otp(timeout=60):
    import time
    start = time.time()
    while time.time() - start < timeout:
        if latest_sms_otp:
            return latest_sms_otp
        time.sleep(2)
    return None
