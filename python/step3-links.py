#step3-links.py
import os
import re
import time
from pypdf import PdfReader
import requests
from bs4 import BeautifulSoup
import json
from playwright.sync_api import sync_playwright

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(BASE_DIR, "PDF")
DOWNLOADS_DIR = os.path.join(BASE_DIR, "DOWNLOADS")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# ── Config ────────────────────────────────────────────────────────────────────

IGNORE_PATTERNS = [
    "https://admin.gem.gov.in/apis/v1/gtc/pdfByDate",
    "https://assets-bg.gem.gov.in/resources/upload/shared_doc/",
]

DOWNLOADABLE_EXTENSIONS = [".pdf", ".docx", ".doc", ".xlsx", ".xls", ".zip", ".png", ".jpg", ".jpeg"]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def should_ignore(url):
    return any(pattern in url for pattern in IGNORE_PATTERNS)


def is_catalogue_url(url):
    return "bidplus.gem.gov.in/bidding/bid/showCatalogue/" in url


def is_downloadable_url(url):
    """
    Check if URL contains a downloadable file extension.
    Checks BOTH the path and query string to catch URLs like:
    ?fileDownloadPath=.../file.pdf
    """
    full_url_lower = url.lower()
    for ext in DOWNLOADABLE_EXTENSIONS:
        if ext in full_url_lower:
            return True
    return False


def get_filename_from_url(url):
    """
    Extract filename from URL — handles both normal paths and
    query param paths like ?fileDownloadPath=.../filename.pdf
    """
    query_match = re.search(r'[?&][^=]+=.+/([^/&]+\.\w+)', url)
    if query_match:
        return query_match.group(1)

    path = url.split("?")[0]
    filename = os.path.basename(path)
    if not filename or "." not in filename:
        filename = "downloaded_file"
    return filename


# ── File Downloader ───────────────────────────────────────────────────────────

def download_file(url):
    filename = get_filename_from_url(url)
    save_path = os.path.join(DOWNLOADS_DIR, filename)

    if os.path.exists(save_path) and os.path.getsize(save_path) > 500:
        print(f"     ⚠️  Already downloaded: {filename}")
        return save_path

    # ── Strategy 1: Plain requests (fast) ────────────────────────────────────
    try:
        print(f"     ⬇️  Trying direct download: {filename}")
        resp = requests.get(url, headers=HEADERS, timeout=60, stream=True)
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "")
        content = b"".join(resp.iter_content(chunk_size=8192))

        if len(content) > 500 and "text/html" not in content_type:
            with open(save_path, "wb") as f:
                f.write(content)
            size_kb = len(content) / 1024
            print(f"     ✅ Saved via requests: {save_path} ({size_kb:.1f} KB)")
            return save_path
        else:
            print(f"     ⚠️  Requests returned HTML or empty — switching to browser...")

    except Exception as e:
        print(f"     ⚠️  Requests failed ({e}) — switching to browser...")

    # ── Strategy 2: Playwright browser ───────────────────────────────────────
    try:
        print(f"     🌐 Opening browser for download...")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=HEADERS["User-Agent"],
                accept_downloads=True,
            )
            page = context.new_page()

            downloaded_bytes = None

            def handle_response(response):
                nonlocal downloaded_bytes
                try:
                    ct = response.headers.get("content-type", "")
                    cl = int(response.headers.get("content-length", 0))
                    if "text/html" not in ct and (cl > 500 or any(ext in response.url.lower() for ext in DOWNLOADABLE_EXTENSIONS)):
                        print(f"     📡 Intercepted response: {response.url}")
                        downloaded_bytes = response.body()
                except Exception:
                    pass

            page.on("response", handle_response)

            try:
                page.goto(url, timeout=30000, wait_until="domcontentloaded")
            except Exception as e:
                print(f"     ⚠️  Initial load warning: {e}")

            print("     ⏳ Waiting 6 seconds for page to fully load...")
            time.sleep(6)

            if downloaded_bytes and len(downloaded_bytes) > 500:
                with open(save_path, "wb") as f:
                    f.write(downloaded_bytes)
                size_kb = len(downloaded_bytes) / 1024
                print(f"     ✅ Saved via response interception: {save_path} ({size_kb:.1f} KB)")
                browser.close()
                return save_path

            # Try finding a direct download link on the page
            print("     🔎 Looking for download link on page...")
            links = page.query_selector_all("a")
            file_href = None
            for link in links:
                href = link.get_attribute("href") or ""
                if any(ext in href.lower() for ext in DOWNLOADABLE_EXTENSIONS):
                    if href.startswith("/"):
                        href = "https://" + url.split("/")[2] + href
                    file_href = href
                    break

            if file_href:
                print(f"     📎 Found download link: {file_href}")
                file_resp = page.request.get(file_href)
                if file_resp.ok:
                    file_bytes = file_resp.body()
                    if len(file_bytes) > 500:
                        with open(save_path, "wb") as f:
                            f.write(file_bytes)
                        size_kb = len(file_bytes) / 1024
                        print(f"     ✅ Saved via session request: {save_path} ({size_kb:.1f} KB)")
                        browser.close()
                        return save_path

            # Reload and retry
            print("     🔄 Reloading page and retrying...")
            try:
                page.reload(timeout=30000, wait_until="domcontentloaded")
            except Exception:
                pass
            time.sleep(5)

            if downloaded_bytes and len(downloaded_bytes) > 500:
                with open(save_path, "wb") as f:
                    f.write(downloaded_bytes)
                size_kb = len(downloaded_bytes) / 1024
                print(f"     ✅ Saved after reload: {save_path} ({size_kb:.1f} KB)")
                browser.close()
                return save_path

            # Final fallback: session cookie request
            print("     🍪 Trying session request with browser cookies...")
            try:
                resp = page.request.get(url)
                if resp.ok:
                    ct = resp.headers.get("content-type", "")
                    file_bytes = resp.body()
                    if "text/html" not in ct and len(file_bytes) > 500:
                        with open(save_path, "wb") as f:
                            f.write(file_bytes)
                        size_kb = len(file_bytes) / 1024
                        print(f"     ✅ Saved via cookie session: {save_path} ({size_kb:.1f} KB)")
                        browser.close()
                        return save_path
            except Exception as e:
                print(f"     ⚠️  Session request failed: {e}")

            browser.close()

    except Exception as e:
        print(f"     ❌ Browser download failed: {e}")

    print(f"     ❌ All strategies failed for: {url}")
    return None


# ── Catalogue Fetching & Parsing ──────────────────────────────────────────────

def fetch_html_browser(url):
    """
    Fetch catalogue page HTML.
    Strategy 1: plain requests with curl-like headers (fast, works for GEM catalogue).
    Strategy 2: Playwright browser fallback if requests fails or returns no table.
    """
    # ── Strategy 1: plain requests (mimics curl) ──────────────────────────────
    try:
        print(f"     🌐 Fetching catalogue via requests...")
        curl_headers = {
            "User-Agent": HEADERS["User-Agent"],
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        }
        resp = requests.get(url, headers=curl_headers, timeout=30)
        resp.raise_for_status()
        resp.encoding = "utf-8"
        html = resp.text

        # If the spec table is present, return it directly
        if "table-bordered" in html and "<tbody" in html:
            print(f"     ✅ Got HTML via requests ({len(html):,} chars)")
            return html
        else:
            print(f"     ⚠️  Requests returned HTML but no table found — trying browser...")

    except Exception as e:
        print(f"     ⚠️  Requests failed: {e} — trying browser...")

    # ── Strategy 2: Playwright browser fallback ───────────────────────────────
    print(f"     🌐 Fetching catalogue via browser...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=HEADERS["User-Agent"])
        page = context.new_page()
        try:
            page.goto(url, timeout=30000, wait_until="networkidle")
        except Exception as e:
            print(f"     ⚠️  Page load warning: {e}")
        time.sleep(3)
        html = page.content()
        browser.close()
    return html


def parse_spec_table(html):
    soup = BeautifulSoup(html, "html.parser")

    table = soup.find("table", class_="table-bordered")
    if not table:
        raise Exception("Spec table not found")

    tbody = table.find("tbody")
    rows = tbody.find_all("tr")

    print(f"     🔍 Total rows found: {len(rows)}")

    data = []
    current_category = None

    for tr in rows:
        tds = tr.find_all("td")
        if not tds:
            continue

        texts = [td.get_text(" ", strip=True) for td in tds]

        # CASE 1: Rowspan-based category cell
        if tds[0].has_attr("rowspan"):
            current_category = texts[0]
            texts = texts[1:]

        # CASE 2: Category + Spec + Value in same row (3 cols)
        elif len(texts) == 3:
            current_category = texts[0]
            data.append({
                "category": current_category,
                "specification": texts[1],
                "allowed_values": texts[2],
            })
            continue

        # CASE 3: Category-only row
        elif len(texts) == 1:
            current_category = texts[0]
            continue

        # CASE 4: Spec + Value row (uses current_category from rowspan)
        if len(texts) >= 2 and current_category:
            data.append({
                "category": current_category,
                "specification": texts[0],
                "allowed_values": texts[1],
            })

    return data


def process_catalogue_url(url):
    try:
        html = fetch_html_browser(url)
        specs = parse_spec_table(html)
        if specs:
            print(f"     ✅ Extracted {len(specs)} specification(s):")
            for spec in specs:
                print(f"        [{spec['category']}] {spec['specification']} → {spec['allowed_values']}")
        else:
            print("     ⚠️  No specifications found in table.")
        return specs
    except Exception as e:
        print(f"     ❌ Failed to process catalogue: {e}")
        return []


# ── PDF Link Extraction ───────────────────────────────────────────────────────

def extract_links_from_pdf(pdf_path):
    reader = PdfReader(pdf_path)
    all_links = []

    print(f"\n📄 PDF: {os.path.basename(pdf_path)}")
    print(f"📑 Total pages: {len(reader.pages)}\n")

    for page_num, page in enumerate(reader.pages, start=1):
        page_links = []

        # Method 1: Annotation-based embedded links (clickable)
        if "/Annots" in page:
            annotations = page["/Annots"]
            for annot in annotations:
                obj = annot.get_object()
                if obj.get("/Subtype") == "/Link":
                    if "/A" in obj:
                        action = obj["/A"]
                        if action.get("/S") == "/URI":
                            uri = action.get("/URI", "")
                            if uri and not should_ignore(uri):
                                page_links.append({"type": "url", "value": uri, "page": page_num})
                    if "/Dest" in obj:
                        page_links.append({"type": "internal_dest", "value": str(obj["/Dest"]), "page": page_num})

        # Method 2: Plain text URL extraction via regex
        text = page.extract_text() or ""
        for url in re.findall(r'(https?://[^\s\)\]\,\"\'<>]+|www\.[^\s\)\]\,\"\'<>]+)', text):
            url = url.rstrip(".")
            if not should_ignore(url):
                page_links.append({"type": "text_url", "value": url, "page": page_num})

        if page_links:
            print(f"  📌 Page {page_num}: {len(page_links)} link(s) found")
            for link in page_links:
                print(f"     [{link['type']}] {link['value']}")
            all_links.extend(page_links)

    return all_links


# ── Main ──────────────────────────────────────────────────────────────────────

def main(specific_pdf=None):
    """
    Extract links and download ATC files.
    specific_pdf: if provided, only process that PDF file.
                  Otherwise process all PDFs in PDF_DIR.
    """
    if specific_pdf:
        if not os.path.exists(specific_pdf):
            print(f"❌ PDF not found: {specific_pdf}")
            return
        pdf_files = [os.path.basename(specific_pdf)]
        pdf_dir   = os.path.dirname(specific_pdf)
    else:
        pdf_files = [f for f in os.listdir(PDF_DIR) if f.endswith(".pdf")]
        pdf_dir   = PDF_DIR

    if not pdf_files:
        print("❌ No PDFs found in PDF folder.")
        return

    for pdf_file in pdf_files:
        pdf_path = os.path.join(pdf_dir, pdf_file)
        links = extract_links_from_pdf(pdf_path)

        print(f"\n{'='*60}")

        url_links = [l for l in links if l["type"] in ("url", "text_url")]
        internal  = [l for l in links if l["type"] == "internal_dest"]

        print(f"✅ Total links : {len(links)}")
        print(f"   🔗 External  : {len(url_links)}")
        print(f"   📎 Internal  : {len(internal)}")

        # ── Classify URLs into 3 buckets ──────────────────────────────────────
        catalogue_links = [l for l in url_links if is_catalogue_url(l["value"])]
        file_links      = [l for l in url_links if not is_catalogue_url(l["value"]) and is_downloadable_url(l["value"])]
        other_links     = [l for l in url_links if not is_catalogue_url(l["value"]) and not is_downloadable_url(l["value"])]

        # ── 1. Other plain links ──────────────────────────────────────────────
        if other_links:
            print(f"\n📋 Other URLs ({len(other_links)}):")
            for i, l in enumerate(other_links, 1):
                print(f"   {i}. [Page {l['page']}] {l['value']}")

        # ── 2. Catalogue links → scrape specs ─────────────────────────────────
        if catalogue_links:
            print(f"\n🛒 Catalogue URLs ({len(catalogue_links)}) — fetching specs...")
            all_catalogue_data = {}
            for l in catalogue_links:
                print(f"\n  🔗 [Page {l['page']}] {l['value']}")
                specs = process_catalogue_url(l["value"])
                all_catalogue_data[l["value"]] = specs

            out_path = os.path.join(BASE_DIR, "catalogue_specs.json")
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(all_catalogue_data, f, indent=2, ensure_ascii=False)
            print(f"\n💾 Catalogue specs saved: {out_path}")

        # ── 3. File links → download ──────────────────────────────────────────
        if file_links:
            print(f"\n📥 Downloadable Files ({len(file_links)}) — downloading...")
            for l in file_links:
                print(f"\n  🔗 [Page {l['page']}] {l['value']}")
                download_file(l["value"])

        print(f"\n{'='*60}")
        print(f"📁 Downloads saved to: {DOWNLOADS_DIR}")


if __name__ == "__main__":
    main()