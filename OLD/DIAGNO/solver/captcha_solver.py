"""
High-Accuracy Alphanumeric CAPTCHA Solver
Uses ensemble OCR + confusion-aware voting
"""

import io
import traceback
import cv2
import numpy as np
from PIL import Image, ImageOps, ImageFilter
import pytesseract
from collections import Counter

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# Characters that commonly get confused
CONFUSION_MAP = {
    "S": ["5"],
    "5": ["S"],
    "O": ["0"],
    "0": ["O"],
    "I": ["1"],
    "1": ["I"],
    "Z": ["2"],
    "2": ["Z"],
    "B": ["8"],
    "8": ["B"]
}

# ---------------- IMAGE PREPROCESSING ----------------
def clean_image_pil(img_pil: Image.Image) -> Image.Image:
    try:
        img = img_pil.convert("L")
        img = img.resize((img.width * 4, img.height * 4), Image.Resampling.LANCZOS)
        img = ImageOps.autocontrast(img, cutoff=2)
        img = img.filter(ImageFilter.MedianFilter(size=3))

        arr = np.array(img)

        arr = cv2.adaptiveThreshold(
            arr, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31, 7
        )

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        arr = cv2.morphologyEx(arr, cv2.MORPH_OPEN, kernel)
        arr = cv2.dilate(arr, kernel, iterations=1)

        img = Image.fromarray(arr)
        img = ImageOps.expand(img, border=25, fill=255)
        return img

    except Exception:
        traceback.print_exc()
        return img_pil.convert("L")


# ---------------- OCR WITH MULTI PASS ----------------
def ocr_pass(img, psm):
    cfg = f"--psm {psm} --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    text = pytesseract.image_to_string(img, config=cfg)
    return "".join(c for c in text if c.isalnum())


# ---------------- CONFUSION-AWARE VOTING ----------------
def smart_vote(results):
    """
    Vote per-character across OCR results
    """
    if not results:
        return ""

    max_len = max(len(r) for r in results)
    final = ""

    for i in range(max_len):
        chars = []
        for r in results:
            if i < len(r):
                chars.append(r[i])

        if not chars:
            continue

        count = Counter(chars)

        # If clear winner → pick it
        char, freq = count.most_common(1)[0]

        # If confusion pair present → choose most stable
        if char in CONFUSION_MAP:
            for alt in CONFUSION_MAP[char]:
                if count[alt] >= freq:
                    char = alt

        final += char

    return final


# ---------------- MAIN OCR SOLVER ----------------
def tesseract_solve(img):
    results = []

    for psm in [6, 7, 8, 10]:
        try:
            txt = ocr_pass(img, psm)
            if 4 <= len(txt) <= 6:
                results.append(txt)
        except:
            pass

    final_text = smart_vote(results)

    if 4 <= len(final_text) <= 6:
        confidence = min(0.9, 0.5 + 0.1 * len(results))
        return final_text, confidence

    return "", 0.0


# ---------------- ENTRY POINT ----------------
def ensemble_solve(img_pil):
    if not isinstance(img_pil, Image.Image):
        try:
            img_pil = Image.open(io.BytesIO(img_pil))
        except:
            return "", 0.0

    cleaned = clean_image_pil(img_pil)
    return tesseract_solve(cleaned)
