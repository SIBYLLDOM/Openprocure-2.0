"""
render_pdf_pages.py — renders every page of a PDF to a PNG image.

Used by docPrep.controller.js's Claude-based OCR fallback: Claude reads each
page image directly (far better than Tesseract at messy scans, watermarks,
tables, and non-English text — see ocr_pdf.py's docstring for the case that
motivated this), so this script's only job is producing the page images;
the actual transcription happens in Node via callClaudeCLI.

Usage: python render_pdf_pages.py <pdf_path> <output_dir> [max_pages] [start_page] [end_page] [dpi] [format]
start_page/end_page are 1-indexed and inclusive — pass them to render just a
handful of pages (e.g. the one page a specific annexure lives on) instead of
the whole document. dpi overrides the default 200; format is "png" (default)
or "jpg". The doc-prep vision extraction path uses a lower dpi + jpg to keep
the base64 payload under Ollama's request-body-size limit ("http: request
body too large" was seen sending 3 full 200-DPI PNG pages in one call).
Prints one image path per line to stdout, in page order.
"""
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

DPI = 200
MAX_PAGES_DEFAULT = 200


def main():
    if len(sys.argv) < 3:
        print("Usage: python render_pdf_pages.py <pdf_path> <output_dir> [max_pages] [start_page] [end_page] [dpi] [format]", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    out_dir = sys.argv[2]
    max_pages = int(sys.argv[3]) if len(sys.argv) > 3 else MAX_PAGES_DEFAULT
    start_page = int(sys.argv[4]) if len(sys.argv) > 4 else 1
    end_page = int(sys.argv[5]) if len(sys.argv) > 5 else None
    dpi = int(sys.argv[6]) if len(sys.argv) > 6 else DPI
    fmt = sys.argv[7] if len(sys.argv) > 7 else 'png'

    import fitz  # PyMuPDF

    os.makedirs(out_dir, exist_ok=True)

    doc = fitz.open(pdf_path)
    last_page = min(end_page, doc.page_count) if end_page else min(doc.page_count, max_pages)
    first_page = max(1, start_page)
    if doc.page_count > max_pages and not end_page:
        print(f"[render_pdf_pages] {doc.page_count} pages, capping at {max_pages}", file=sys.stderr)

    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    for i in range(first_page - 1, last_page):
        page = doc.load_page(i)
        pix = page.get_pixmap(matrix=matrix, colorspace=fitz.csRGB)
        out_path = os.path.join(out_dir, f"page_{i + 1:04d}.{fmt}")
        if fmt == 'jpg':
            pix.save(out_path, jpg_quality=70)
        else:
            pix.save(out_path)
        print(out_path)

    doc.close()


if __name__ == "__main__":
    main()
