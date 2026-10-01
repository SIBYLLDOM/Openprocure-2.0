"""
ocr_pdf.py — OCR fallback for scanned PDFs with no text layer.

Used by docPrep.controller.js's extractDocText() when pdf-parse comes back
near-empty (government NIT/tender PDFs are frequently scanned images, not
digitally authored — see 2026_SMSMC_571079_1 for a case where 42 pages
yielded 41 chars of real text).

Renders each page to an image via PyMuPDF (no poppler needed) and OCRs it
with the Tesseract binary already installed on this machine
(C:\\Program Files\\Tesseract-OCR\\tesseract.exe — not on PATH, so the path
is set explicitly below).

Usage: python ocr_pdf.py <pdf_path> [max_pages]
Prints extracted text to stdout (UTF-8), one form-feed (\\f) between pages.
"""
import sys
import io

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

TESSERACT_CMD = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
DPI = 200          # good balance of OCR accuracy vs. speed for A4 scans
MAX_PAGES_DEFAULT = 200  # safety cap. Was 60, raised after a real 114-page
                          # scanned bid document got silently truncated at
                          # page 60 — annexures can be anywhere in a large
                          # tender document, not just the first section.


def main():
    if len(sys.argv) < 2:
        print("Usage: python ocr_pdf.py <pdf_path> [max_pages]", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else MAX_PAGES_DEFAULT

    import fitz  # PyMuPDF
    import pytesseract
    from PIL import Image

    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

    doc = fitz.open(pdf_path)
    n_pages = min(doc.page_count, max_pages)
    if doc.page_count > max_pages:
        print(f"[ocr_pdf] {doc.page_count} pages, capping OCR at {max_pages}", file=sys.stderr)

    zoom = DPI / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    texts = []
    for i in range(n_pages):
        page = doc.load_page(i)
        pix = page.get_pixmap(matrix=matrix, colorspace=fitz.csGRAY)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        page_text = pytesseract.image_to_string(img)
        texts.append(page_text)
        print(f"[ocr_pdf] page {i + 1}/{n_pages}: {len(page_text.strip())} chars", file=sys.stderr)

    doc.close()
    print("\f".join(texts))


if __name__ == "__main__":
    main()
