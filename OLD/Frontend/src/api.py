"""
tender_api.py — FastAPI wrapper around step4-gpt.py logic
Run with: uvicorn tender_api:app --port 5163 --reload

Endpoints:
  POST /analyze   — Upload documents, get evaluation + product suggestions + deviation table
  GET  /health    — Health check

Supported upload formats (all auto-converted to PDF before GPT processing):
  .pdf  — used directly
  .xlsx / .xls  — converted via openpyxl → reportlab
  .csv          — converted via csv → reportlab
  .docx / .doc  — converted via python-docx → reportlab
"""

import os
import re
import csv
import json
import time
import shutil
import smtplib
import tempfile
import traceback
import subprocess
from email.mime.multipart import MIMEMultipart
from email.mime.text        import MIMEText

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional

from openai import OpenAI, RateLimitError
from dotenv import load_dotenv

load_dotenv()

# ── File-to-PDF Conversion ────────────────────────────────────────────────────

def _libreoffice_convert(src_path: str, out_dir: str) -> str | None:
    """
    Try LibreOffice headless conversion (handles xlsx, xls, doc, docx, csv).
    Returns path to the produced PDF, or None if LibreOffice is not available.
    """
    try:
        result = subprocess.run(
            ["libreoffice", "--headless", "--convert-to", "pdf",
             "--outdir", out_dir, src_path],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0:
            base = os.path.splitext(os.path.basename(src_path))[0]
            pdf_path = os.path.join(out_dir, base + ".pdf")
            if os.path.exists(pdf_path):
                print(f"[CONVERT] LibreOffice → {os.path.basename(pdf_path)}")
                return pdf_path
    except FileNotFoundError:
        pass  # LibreOffice not installed — fall through to Python fallback
    except Exception as e:
        print(f"[WARN] LibreOffice conversion failed: {e}")
    return None


def _csv_to_pdf(src_path: str, out_dir: str) -> str:
    """Convert CSV → PDF using reportlab with a clean table layout."""
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm

    with open(src_path, "r", encoding="utf-8", errors="replace") as f:
        rows = list(csv.reader(f))

    if not rows:
        rows = [["(empty file)"]]

    base     = os.path.splitext(os.path.basename(src_path))[0]
    pdf_path = os.path.join(out_dir, base + ".pdf")

    doc    = SimpleDocTemplate(pdf_path, pagesize=landscape(A4),
                                leftMargin=1*cm, rightMargin=1*cm,
                                topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    story  = [Paragraph(f"<b>{base}</b>", styles["Title"]), Spacer(1, 12)]

    # Chunk into pages of 50 rows to avoid memory issues on huge CSVs
    CHUNK = 50
    for chunk_start in range(0, len(rows), CHUNK):
        chunk = rows[chunk_start:chunk_start + CHUNK]
        # Wrap long cell text
        wrapped = [
            [Paragraph(str(cell) if cell else "", styles["Normal"]) for cell in row]
            for row in chunk
        ]
        col_count = max(len(r) for r in wrapped)
        page_w    = landscape(A4)[0] - 2 * cm
        col_w     = page_w / col_count if col_count else page_w

        t = Table(wrapped, colWidths=[col_w] * col_count, repeatRows=1 if chunk_start == 0 else 0)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a6496")),
            ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",   (0, 0), (-1, -1), 7),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f2f2")]),
            ("GRID",       (0, 0), (-1, -1), 0.4, colors.grey),
            ("VALIGN",     (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t)
        story.append(Spacer(1, 6))

    doc.build(story)
    print(f"[CONVERT] CSV → {os.path.basename(pdf_path)}")
    return pdf_path


def _excel_to_pdf(src_path: str, out_dir: str) -> str:
    """Convert XLSX/XLS → PDF using openpyxl + reportlab (one table per sheet)."""
    import openpyxl
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm

    wb     = openpyxl.load_workbook(src_path, read_only=True, data_only=True)
    base   = os.path.splitext(os.path.basename(src_path))[0]
    pdf_path = os.path.join(out_dir, base + ".pdf")

    doc    = SimpleDocTemplate(pdf_path, pagesize=landscape(A4),
                                leftMargin=1*cm, rightMargin=1*cm,
                                topMargin=1.5*cm, bottomMargin=1.5*cm)
    styles = getSampleStyleSheet()
    story  = []

    for sheet_idx, sheet in enumerate(wb.worksheets):
        if sheet_idx > 0:
            story.append(PageBreak())

        story.append(Paragraph(f"<b>Sheet: {sheet.title}</b>", styles["Heading2"]))
        story.append(Spacer(1, 8))

        raw_rows = []
        for row in sheet.iter_rows(values_only=True):
            if any(cell is not None for cell in row):
                raw_rows.append([str(c) if c is not None else "" for c in row])

        if not raw_rows:
            story.append(Paragraph("(empty sheet)", styles["Normal"]))
            continue

        CHUNK = 50
        for chunk_start in range(0, len(raw_rows), CHUNK):
            chunk = raw_rows[chunk_start:chunk_start + CHUNK]
            wrapped = [
                [Paragraph(cell, styles["Normal"]) for cell in row]
                for row in chunk
            ]
            col_count = max(len(r) for r in wrapped)
            page_w    = landscape(A4)[0] - 2 * cm
            col_w     = page_w / col_count if col_count else page_w

            t = Table(wrapped, colWidths=[col_w] * col_count, repeatRows=1 if chunk_start == 0 else 0)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a6496")),
                ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
                ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE",   (0, 0), (-1, -1), 7),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f2f2")]),
                ("GRID",       (0, 0), (-1, -1), 0.4, colors.grey),
                ("VALIGN",     (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(t)
            story.append(Spacer(1, 6))

    wb.close()
    doc.build(story)
    print(f"[CONVERT] Excel → {os.path.basename(pdf_path)}")
    return pdf_path


def _docx_to_pdf(src_path: str, out_dir: str) -> str:
    """Convert DOCX → PDF using python-docx + reportlab (preserves paragraphs + tables)."""
    import docx
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.enums import TA_LEFT

    document = docx.Document(src_path)
    base     = os.path.splitext(os.path.basename(src_path))[0]
    pdf_path = os.path.join(out_dir, base + ".pdf")

    doc    = SimpleDocTemplate(pdf_path, pagesize=A4,
                                leftMargin=2*cm, rightMargin=2*cm,
                                topMargin=2*cm,  bottomMargin=2*cm)
    styles = getSampleStyleSheet()

    # Extra styles for heading levels
    h1_style = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=14, spaceAfter=8)
    h2_style = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12, spaceAfter=6)
    body_style = ParagraphStyle("body", parent=styles["Normal"], fontSize=9,
                                 leading=13, spaceAfter=4)

    story = []

    for block in document.element.body:
        tag = block.tag.split("}")[-1]  # strip namespace

        if tag == "p":
            para = docx.text.paragraph.Paragraph(block, document)
            text = para.text.strip()
            if not text:
                story.append(Spacer(1, 4))
                continue
            style_name = para.style.name if para.style else ""
            if "Heading 1" in style_name:
                story.append(Paragraph(text, h1_style))
            elif "Heading 2" in style_name:
                story.append(Paragraph(text, h2_style))
            else:
                story.append(Paragraph(text, body_style))

        elif tag == "tbl":
            tbl  = docx.table.Table(block, document)
            data = []
            for row in tbl.rows:
                data.append([Paragraph(cell.text.strip(), body_style) for cell in row.cells])

            if data:
                col_count = max(len(r) for r in data)
                page_w    = A4[0] - 4 * cm
                col_w     = page_w / col_count if col_count else page_w
                t = Table(data, colWidths=[col_w] * col_count, repeatRows=1)
                t.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a6496")),
                    ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
                    ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE",   (0, 0), (-1, -1), 8),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f2f2")]),
                    ("GRID",       (0, 0), (-1, -1), 0.4, colors.grey),
                    ("VALIGN",     (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]))
                story.append(t)
                story.append(Spacer(1, 8))

    if not story:
        story.append(Paragraph("(empty document)", styles["Normal"]))

    doc.build(story)
    print(f"[CONVERT] DOCX → {os.path.basename(pdf_path)}")
    return pdf_path


# Supported conversions
CONVERTIBLE_EXTS = {".xlsx", ".xls", ".csv", ".docx", ".doc"}


def convert_to_pdf(src_path: str, out_dir: str) -> str:
    """
    Convert any supported file to PDF.
    Strategy:
      1. Try LibreOffice headless (best quality, handles all formats)
      2. Fall back to Python-native conversion (reportlab-based)
    Returns the path to the PDF file.
    Raises ValueError for unsupported formats.
    """
    ext = os.path.splitext(src_path)[1].lower()

    if ext == ".pdf":
        return src_path  # already a PDF

    if ext not in CONVERTIBLE_EXTS:
        raise ValueError(f"Unsupported file format for conversion: {ext}")

    # Try LibreOffice first (best fidelity)
    pdf_path = _libreoffice_convert(src_path, out_dir)
    if pdf_path:
        return pdf_path

    # Python fallback
    print(f"[CONVERT] LibreOffice unavailable — using Python fallback for {ext}")
    if ext in (".xlsx", ".xls"):
        return _excel_to_pdf(src_path, out_dir)
    elif ext == ".csv":
        return _csv_to_pdf(src_path, out_dir)
    elif ext in (".docx", ".doc"):
        return _docx_to_pdf(src_path, out_dir)

    raise ValueError(f"No converter available for: {ext}")

# ── Email Config ────────────────────────────────────────────────────────────────────

SMTP_HOST     = "smtp.gmail.com"
SMTP_PORT     = 587
SMTP_USER     = os.getenv("SMTP_USER", "openprocure.ai@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "grsv wvcq kbxv fbia")


def send_result_email(to_email: str, result: dict) -> None:
    """
    Send a formatted HTML email with the analysis summary to `to_email`.
    Runs in a fire-and-forget fashion — any failure is only logged, never raised.
    """
    try:
        relevant = result.get("relevant", False)
        subject  = (
            "Tender Analysis — Product Suggestions Ready"
            if relevant else
            "Tender Analysis — Tender Not Relevant"
        )

        # ── Build HTML body ───────────────────────────────────────────────────────
        if not relevant:
            reason = result.get("reason", "No reason provided.")
            body_html = f"""
            <h2 style='color:#c0392b;'>⚠️ Tender Not Relevant</h2>
            <p><b>Reason:</b> {reason}</p>
            """
        else:
            dept     = result.get("dept") or "N/A"
            category = result.get("item_category") or "N/A"
            n_items  = result.get("no_of_items", 0)
            products = result.get("suggested_products", [])
            devs     = result.get("deviation_tables", {})

            # Product rows
            product_rows = ""
            for p in products:
                pct   = round((p.get("relevancy_score") or 0) * 100)
                color = (
                    "#27ae60" if pct >= 85
                    else "#f39c12" if pct >= 65
                    else "#c0392b"
                )
                product_rows += f"""
                <tr>
                  <td style='padding:6px 10px;border-bottom:1px solid #eee;'>
                    <b>{p.get('item','')}</b>
                  </td>
                  <td style='padding:6px 10px;border-bottom:1px solid #eee;'>
                    {p.get('tender_item_name','')}
                  </td>
                  <td style='padding:6px 10px;border-bottom:1px solid #eee;
                             color:{color};font-weight:700;'>
                    {p.get('product_name','')}
                  </td>
                  <td style='padding:6px 10px;border-bottom:1px solid #eee;
                             font-family:monospace;'>
                    {p.get('product_code','')}
                  </td>
                  <td style='padding:6px 10px;border-bottom:1px solid #eee;
                             color:{color};font-weight:700;'>
                    {pct}%
                  </td>
                </tr>
                """

            # Deviation summary per item
            dev_sections = ""
            for item_key, rows in devs.items():
                complied  = sum(1 for r in rows if r.get("status") == "Complied")
                deviating = sum(1 for r in rows if r.get("status") == "Deviation")
                na        = len(rows) - complied - deviating
                dev_rows  = ""
                for r in rows:
                    status = r.get("status", "")
                    sc = (
                        "#27ae60" if status == "Complied"
                        else "#c0392b" if status == "Deviation"
                        else "#7f8c8d"
                    )
                    dev_rows += f"""
                    <tr>
                      <td style='padding:5px 8px;border-bottom:1px solid #f0f0f0;
                                 font-size:12px;'>{r.get('specification','')}</td>
                      <td style='padding:5px 8px;border-bottom:1px solid #f0f0f0;
                                 font-size:12px;'>{r.get('tender_requirement','')}</td>
                      <td style='padding:5px 8px;border-bottom:1px solid #f0f0f0;
                                 font-size:12px;'>{r.get('product_offered','')}</td>
                      <td style='padding:5px 8px;border-bottom:1px solid #f0f0f0;
                                 font-size:12px;color:{sc};font-weight:700;'>
                        {status}
                      </td>
                    </tr>
                    """

                dev_sections += f"""
                <h4 style='margin:16px 0 4px;color:#2c3e50;'>{item_key}</h4>
                <p style='font-size:13px;margin:0 0 8px;'>
                  ✅ Complied: <b>{complied}</b> &nbsp;
                  ❌ Deviation: <b>{deviating}</b> &nbsp;
                  ➖ N/A: <b>{na}</b>
                </p>
                <table width='100%' cellspacing='0' style='border-collapse:collapse;
                       font-size:12px;margin-bottom:16px;'>
                  <thead><tr style='background:#f0f4ff;'>
                    <th style='padding:6px 8px;text-align:left;'>Specification</th>
                    <th style='padding:6px 8px;text-align:left;'>Tender Requirement</th>
                    <th style='padding:6px 8px;text-align:left;'>Product Offered</th>
                    <th style='padding:6px 8px;text-align:left;'>Status</th>
                  </tr></thead>
                  <tbody>{dev_rows}</tbody>
                </table>
                """

            body_html = f"""
            <h2 style='color:#1a6496;'>✅ Tender Relevant — Analysis Complete</h2>
            <table style='margin-bottom:16px;'>
              <tr><td style='color:#555;padding-right:16px;'>Department</td>
                  <td><b>{dept}</b></td></tr>
              <tr><td style='color:#555;padding-right:16px;'>Category</td>
                  <td><b>{category}</b></td></tr>
              <tr><td style='color:#555;padding-right:16px;'>Items Found</td>
                  <td><b>{n_items}</b></td></tr>
            </table>

            <h3 style='color:#2c3e50;border-bottom:2px solid #1a6496;
                       padding-bottom:6px;'>Suggested Products</h3>
            <table width='100%' cellspacing='0'
                   style='border-collapse:collapse;margin-bottom:24px;'>
              <thead><tr style='background:#1a6496;color:#fff;'>
                <th style='padding:8px 10px;text-align:left;'>Item</th>
                <th style='padding:8px 10px;text-align:left;'>Tender Item</th>
                <th style='padding:8px 10px;text-align:left;'>Suggested Product</th>
                <th style='padding:8px 10px;text-align:left;'>Code</th>
                <th style='padding:8px 10px;text-align:left;'>Match</th>
              </tr></thead>
              <tbody>{product_rows}</tbody>
            </table>

            <h3 style='color:#2c3e50;border-bottom:2px solid #1a6496;
                       padding-bottom:6px;'>Deviation Tables</h3>
            {dev_sections if dev_sections else '<p style="color:#555;">No deviation data generated.</p>'}
            """

        # ── Compose MIME message ─────────────────────────────────────────────────────
        html_full = f"""
        <!DOCTYPE html>
        <html><body style='font-family:Arial,sans-serif;color:#222;
                           max-width:900px;margin:0 auto;padding:24px;'>
          <div style='background:#1a6496;color:#fff;padding:16px 24px;
                      border-radius:8px 8px 0 0;'>
            <h1 style='margin:0;font-size:22px;'>🔬 Meril Tender Analysis</h1>
            <p style='margin:4px 0 0;opacity:.85;font-size:14px;'>
              Powered by OpenProcure AI — openprocure.ai
            </p>
          </div>
          <div style='border:1px solid #ddd;border-top:none;
                      padding:24px;border-radius:0 0 8px 8px;'>
            {body_html}
          </div>
          <p style='color:#aaa;font-size:11px;margin-top:12px;'>
            This email was auto-generated. Please do not reply.
          </p>
        </body></html>
        """

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"OpenProcure AI <{SMTP_USER}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html_full, "html"))

        # ── Send via Gmail SMTP ──────────────────────────────────────────────────────
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to_email, msg.as_string())

        print(f"[EMAIL] Sent result to {to_email}")

    except Exception as e:
        print(f"[WARN] Email send failed: {e}")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Tender Analysis API",
    description="Upload tender documents → GPT evaluates relevancy, matches products, generates deviation table.",
    version="1.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow the Vite dev server (localhost:5173) and production frontend origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",       # Vite dev server
        "http://localhost:3000",       # CRA / other local
        "https://openprocure.ai",      # production frontend
        "https://www.openprocure.ai",
        "https://post-tender.openprocure.ai",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── OpenAI Client ─────────────────────────────────────────────────────────────

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

MODEL_NAME    = "gpt-4o-mini"
MAX_PRODUCTS  = 50
BATCH_SIZE    = 10

# ── Product File Registry (same as step4-gpt.py) ─────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PRODUCT_FILES = {
    "analyzer": [
        "./products/analyzer/3-Part_Hematology_Analyzer.json",
        "./products/analyzer/5-Part_Hematology_Analyzer.json",
        "./products/analyzer/Automated_Electrochemiluminescence_Immunoassay_(e-CLIA)_Analyzer.json",
        "./products/analyzer/Electrolyte_Analyzer.json",
        "./products/analyzer/ELISA_Plate_Washer.json",
        "./products/analyzer/Fluorescence_Immunoassay_Analyzer.json",
        "./products/analyzer/Fully_Automated_Biochemistry_Analyzer.json",
        "./products/analyzer/HPLC_HbA1c_Analyzer.json",
        "./products/analyzer/Misc.json",
        "./products/analyzer/Semi_Automated_Biochemistry_Analyzer.json",
        "./products/analyzer/Semi_Automated_ELISA_Plate_Reader.json",
        "./products/analyzer/Semi_Automated_Specific_Protein_Analyzer.json",
    ],
    "endo": [
        "./products/endo/Biosurgicals.json",
        "./products/endo/Clutch.json",
        "./products/endo/Energy_Device.json",
        "./products/endo/Glue.json",
        "./products/endo/IUDs.json",
        "./products/endo/Kit.json",
        "./products/endo/Mesh.json",
        "./products/endo/Others.json",
        "./products/endo/Stapler.json",
        "./products/endo/Suture.json",
    ],
    "reagents": [
        "./products/reagents/3_Part_Hematology_Reagents.json",
        "./products/reagents/BS120_200.json",
        "./products/reagents/CelQuant_3i_Reagents.json",
        "./products/reagents/CelQuant_3_Aspire_Reagents.json",
        "./products/reagents/CelQuant_5+_Reagents.json",
        "./products/reagents/ClotQuant2_4Reagents.json",
        "./products/reagents/ER.json",
        "./products/reagents/FDR.json",
        "./products/reagents/FloQuantReagents.json",
        "./products/reagents/FSR-Jumbo.json",
        "./products/reagents/FSR.json",
        "./products/reagents/GluQuantA1cReagents.json",
        "./products/reagents/Hematology.json",
        "./products/reagents/PRV.json",
        "./products/reagents/QuantilyteReagents.json",
        "./products/reagents/SAA.json",
        "./products/reagents/TIA.json",
    ],
    "systempacks": [
        "./products/systempacks/AQ_100___200SystemPacks.json",
        "./products/systempacks/AQ_400SystemPacks.json",
    ],
    "rapid_elisa": [
        "./products/rapid_elisa.json",
    ],
}

CATEGORY_TO_FOLDER = {
    "endo.json":        "endo",
    "analyser.json":    "analyzer",
    "reagents.json":    "reagents",
    "system_packs.json":"systempacks",
    "rapid_elisa.json": "rapid_elisa",
}

SUPPORTED_PDF_EXTS       = {".pdf"}
TEXT_EXTRACTABLE_EXTS    = {".xlsx", ".xls", ".csv", ".txt", ".json"}

# ── Prompts (identical to step4-gpt.py) ──────────────────────────────────────

SYSTEM_PROMPT = """You are a Tender Evaluation Specialist at Meril Life Sciences Pvt Ltd.
Your task is to determine whether the attached tender documents are relevant to Meril's product portfolio.
You are given:
* Bid Document (Complete Tender Details)
* ATC (Additional Terms and Conditions added by Buyer) - CRITICAL SOURCE FOR TECHNICAL SPECIFICATIONS
* Technical Specifications

CRITICAL: The ATC files contain the GOLDEN SPECIFICATIONS that are the PRIMARY source of truth.
You MUST:
1. Carefully review ALL ATC files for technical specifications
2. Extract EVERY technical requirement mentioned (dimensions, materials, performance specs, certifications, etc.)
3. If ATC specs differ from bid document, ATC takes precedence
4. Include ALL extracted specifications in the "technical_specifications" field

Company Product Categories

IMPORTANT RULES FOR JSON OUTPUT FIELDS:
- "item_main_category" MUST be EXACTLY one of these 5 values only:
    endo.json | rapid_elisa.json | system_packs.json | reagents.json | analyser.json
- "type" MUST be copied EXACTLY as listed below — same spelling, same spaces, same capitalisation.
- Do NOT put anything else in these fields.

Department: Endo → item_main_category = "endo.json"
  Types: Biosurgicals, Clutch, Energy Device, Glue, IUDs, Kit, Mesh, Others, Stapler, Suture

Department: Diagno:

  → item_main_category = "rapid_elisa.json"
    Types: Elisa, Rapids

  → item_main_category = "system_packs.json"
    Types: AQ 100 / 200SystemPacks, AQ 400SystemPacks, Type

  → item_main_category = "reagents.json"
    Types: 3 Part Hematology Reagents, AirQuantBSReagents, AirQuantERReagents,
           AirQuantHematologyReagents, CalibratorControl, CelQuant 3 Aspire Reagents,
           CelQuant 3i Reagents, CelQuant 5 plus Reagents, ClotQuant2/4Reagents,
           FloQuantReagents, FluidStableReagents, FluidStableReagentsJumboPacks,
           FreezeDriedReagents, GluQuantA1cReagents, ProvisoNephelometry,
           QuantilyteReagents, TurbidimetryImmunoAssay

  → item_main_category = "analyser.json"
    Types: 3-Part Hematology Analyzer, 5-Part Hematology Analyzer,
           Automated Electrochemiluminescence Immunoassay (e-CLIA) Analyzer,
           ELISA Plate Washer, Electrolyte Analyzer, Fluorescence Immunoassay Analyzer,
           Fully Automated Biochemistry Analyzer, HPLC HbA1c Analyzer,
           Semi Automated Biochemistry Analyzer, Semi Automated ELISA Plate Reader,
           Semi Automated Specific Protein Analyzer

Decision Rules
1. Check if ANY tender item clearly matches the product categories above.
2. If no clear match, return:
[
  {
    "relevant": "No",
    "reason": "<one sentence explaining what the tender is about and why it does not match Meril's categories>"
  }
]

3. If relevant, return structured JSON WITH EXTRACTED TECHNICAL SPECIFICATIONS.

CRITICAL RULE FOR MULTI-SPECIFICATION ITEMS:
If a single tender item contains MULTIPLE distinct sub-specifications, treat EACH sub-specification
as a SEPARATE item entry. Each sub-item must have a unique key like "item_1", "item_2", etc.

If relevant, return:
[
  { "relevant": "Yes" },
  { "no_of_items": <total number of item entries> },
  {
    "item_<N>": "<specific tender item or sub-item name>",
    "item_category": "<Item Category from bid document>",
    "tender_item_name": "<full original tender item name>",
    "dept": "Endo or Diagno",
    "item_main_category": "<endo.json / rapid_elisa.json / system_packs.json / reagents.json / analyser.json>",
    "type": "<exact matched category name>",
    "technical_specifications": {
      "<spec_name>": "<extracted requirement>",
      "...": "..."
    }
  }
]

Extract ALL technical specifications including:
- Dimensions, sizes, materials
- Performance specs (throughput, accuracy, range, etc.)
- System requirements (automation level, features)
- Certifications and standards
- Warranty and service requirements
- Display, connectivity, data management features
- Power requirements
- Any other technical parameters

Strict Output Rules
* Output ONLY valid JSON. No explanation. No comments. No extra text."""


BATCH_MATCH_DEVIATION_PROMPT = """You are a Product Matching & Compliance Analyst at Meril Life Sciences Pvt Ltd.

You will receive a BATCH of tender items. For EACH item you must:
1. Pick the SINGLE best matching product from the provided product list.
2. Run a full deviation analysis comparing tender technical specifications vs product specs.

PRODUCT MATCHING RULES:
- Return exactly ONE product per tender item — the closest match.
- Choose based on material, size, type, needle, and description.
- If the tender asks for "Polyglyconate", map it to "Polyglycolic Acid" product.
- If no strong match, return closest available with low relevancy_score.
- Include the COMPLETE product_specs object from the product JSON.

DEVIATION ANALYSIS RULES:
- "Complied"      : Product meets or exceeds tender requirement.
- "Deviation"     : Product does not meet requirement — explain the gap.
- "Not Specified" : Spec not available in product database.
- Analyze ALL tender specifications thoroughly.

OUTPUT FORMAT — return a JSON object keyed by item_key:

{
  "<item_key>": {
    "item_category": "<item_category>",
    "tender_item_name": "<tender_item_name>",
    "selected_file": "<product file used>",
    "product_code": "<exact product code>",
    "product_name": "<product name>",
    "product_specs": <complete product specification object>,
    "relevancy_score": <float 0.0-1.0>,
    "deviation_table": [
      {
        "specification": "<spec name>",
        "tender_requirement": "<exact requirement>",
        "product_offered": "<value from product specs or 'Not specified'>",
        "status": "Complied | Deviation | Not Specified",
        "reason": "<detailed explanation>",
        "remarks": "<additional notes or empty string>"
      }
    ]
  }
}

STRICT RULES:
- Output ONLY valid JSON. No explanation. No extra text. No markdown fences.
- Every item in the batch MUST have an entry in the output.
- deviation_table must be an array (can be empty [] if no technical_specifications).
- Be accurate and thorough."""


# ── File Helpers ──────────────────────────────────────────────────────────────

def extract_text_from_file(filepath: str) -> str | None:
    ext = os.path.splitext(filepath)[1].lower()
    filename = os.path.basename(filepath)
    try:
        if ext == ".pdf":
            try:
                import pypdfium2 as pdfium
                pdf = pdfium.PdfDocument(filepath)
                text = ""
                for page in pdf:
                    tp = page.get_textpage()
                    text += tp.get_text_range() + "\n"
                    tp.close(); page.close()
                pdf.close()
                return text or None
            except Exception as e:
                print(f"[WARN] PDF text extract failed for {filename}: {e}")
                return None

        elif ext in (".xlsx", ".xls"):
            import openpyxl
            wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
            lines = []
            for sheet in wb.worksheets:
                lines.append(f"[Sheet: {sheet.title}]")
                for row in sheet.iter_rows(values_only=True):
                    if any(c is not None for c in row):
                        lines.append("\t".join("" if c is None else str(c) for c in row))
            wb.close()
            return "\n".join(lines)

        elif ext == ".csv":
            import csv
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                return "\n".join("\t".join(row) for row in csv.reader(f))

        elif ext in (".txt", ".json"):
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                return f.read()

    except Exception as e:
        print(f"[WARN] Could not extract text from {filename}: {e}")
    return None


def upload_file_to_openai(filepath: str, mime_type: str = "application/pdf"):
    filename = os.path.basename(filepath)
    with open(filepath, "rb") as f:
        response = client.files.create(file=(filename, f, mime_type), purpose="assistants")
    print(f"[UPLOAD] {filename} → {response.id}")
    return response


def cleanup_openai_files(file_ids: list):
    for fid in file_ids:
        try:
            client.files.delete(fid)
            print(f"[CLEANUP] Deleted OpenAI file: {fid}")
        except Exception as e:
            print(f"[WARN] Could not delete {fid}: {e}")


# ── GPT: Evaluate Tender ──────────────────────────────────────────────────────

def evaluate_tender(bid_doc_path: str, atc_paths: list) -> str:
    uploaded_file_ids = []
    MAX_TOTAL_SIZE = 30 * 1024 * 1024  # 30 MB

    try:
        bid_file = upload_file_to_openai(bid_doc_path)
        uploaded_file_ids.append(bid_file.id)

        atc_pdf_ids    = []
        atc_text_blocks = []
        current_size   = os.path.getsize(bid_doc_path)

        for atc_path in atc_paths:
            ext       = os.path.splitext(atc_path)[1].lower()
            file_size = os.path.getsize(atc_path)

            if ext in SUPPORTED_PDF_EXTS:
                if current_size + file_size < MAX_TOTAL_SIZE:
                    atc_file = upload_file_to_openai(atc_path)
                    uploaded_file_ids.append(atc_file.id)
                    atc_pdf_ids.append((atc_path, atc_file.id))
                    current_size += file_size
                else:
                    text = extract_text_from_file(atc_path)
                    if text:
                        atc_text_blocks.append((os.path.basename(atc_path), text))
            elif ext in TEXT_EXTRACTABLE_EXTS:
                text = extract_text_from_file(atc_path)
                if text:
                    atc_text_blocks.append((os.path.basename(atc_path), text))

        # Build message content
        doc_list = f"1. Bid Document: {os.path.basename(bid_doc_path)}\n"
        idx = 2
        for ap, _ in atc_pdf_ids:
            doc_list += f"{idx}. ATC (PDF): {os.path.basename(ap)}\n"; idx += 1
        for fname, _ in atc_text_blocks:
            doc_list += f"{idx}. ATC (text): {fname}\n"; idx += 1

        content = [
            {
                "type": "text",
                "text": (
                    "Attached documents for evaluation:\n" + doc_list +
                    "\nCRITICAL: ATC files are the PRIMARY source of technical specifications. "
                    "Extract ALL specs from ATC files. Return structured JSON response."
                ),
            },
            {"type": "file", "file": {"file_id": bid_file.id}},
        ]

        for _, atc_id in atc_pdf_ids:
            content.append({"type": "file", "file": {"file_id": atc_id}})

        for fname, text in atc_text_blocks:
            if len(text) > 80_000:
                text = text[:80_000] + "\n... [truncated]"
            content.append({
                "type": "text",
                "text": f"\n--- ATC FILE: {fname} ---\n{text}\n--- END {fname} ---",
            })

        # GPT call with retry
        for attempt in range(1, 4):
            try:
                print(f"[GPT] Evaluation attempt {attempt}/3...")
                response = client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user",   "content": content},
                    ],
                    temperature=0,
                    timeout=120,
                )
                return response.choices[0].message.content.strip()
            except RateLimitError as e:
                wait = 15 * attempt
                print(f"[RATE LIMIT] Waiting {wait}s... ({e})")
                time.sleep(wait)
            except Exception as e:
                print(f"[ERROR] Attempt {attempt} failed: {e}")
                if attempt < 3:
                    time.sleep(10)
                else:
                    raise

        raise RuntimeError("GPT evaluation failed after 3 attempts.")

    finally:
        cleanup_openai_files(uploaded_file_ids)


# ── GPT: Product File Picker ──────────────────────────────────────────────────

def gpt_pick_product_file(item_key, item_name, tender_item_name, dept, category_type, available_files):
    files_list = "\n".join(f"  - {f}" for f in available_files)
    user_text = f"""Tender Item:
  Key              : {item_key}
  Name             : {item_name}
  Full Tender Name : {tender_item_name}
  Department       : {dept}
  Category Type    : {category_type}

Available product files:
{files_list}

Return ONLY valid JSON:
{{"selected_file": "<exact file path>", "reason": "<one line>"}}"""

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": "You are a Product File Selector. Output ONLY valid JSON."},
            {"role": "user",   "content": user_text},
        ],
        temperature=0,
    )
    raw   = response.choices[0].message.content.strip()
    clean = re.sub(r"```(?:json)?|```", "", raw).strip()
    try:
        result = json.loads(clean)
        return result.get("selected_file", "")
    except Exception:
        return None


def load_products_from_file(file_path: str):
    abs_path = os.path.normpath(os.path.join(BASE_DIR, file_path.lstrip("./")))
    if not os.path.exists(abs_path):
        print(f"[WARN] Product file not found: {abs_path}")
        return None
    with open(abs_path, "r", encoding="utf-8") as f:
        return json.load(f)


# ── GPT: Suture Pre-filter ────────────────────────────────────────────────────

def prefilter_sutures(item_obj, products):
    tender_name = item_obj.get("tender_item_name", "")
    specs       = item_obj.get("technical_specifications", {})

    user_text = f"""Tender Item: {tender_name}
Specs: {json.dumps(specs)}

Extract requested suture MATERIAL and SIZE.
MATERIAL must match exactly one of: "Plain Catgut","Chromic Catgut","Polyamide (Nylon)","Polypropylene",
"Polyglactin 910 (Vicryl)","Polyglycolic Acid (PGA)","Poliglecaprone 25 (Monocryl)","Polydioxanone (PDS)",
"Polyester","Silk","Linen" — or null.
NOTE: "Polyglyconate" → map to "Polyglycolic Acid (PGA)".
SIZE: standard USP format ("1","0","2-0","3-0") or null.

Return ONLY: {{"requested_material": "...", "requested_size": "..."}}"""

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": "Extract suture specs. Output only valid JSON."},
                {"role": "user",   "content": user_text},
            ],
            temperature=0,
            timeout=30,
        )
        raw    = response.choices[0].message.content.strip()
        clean  = re.sub(r"```(?:json)?|```", "", raw).strip()
        result = json.loads(clean)

        req_material = result.get("requested_material")
        req_size     = result.get("requested_size")
        filtered     = products

        if req_material:
            mat_f = [p for p in filtered if p.get("normalized_attributes", {}).get("suture_material") == req_material]
            if mat_f:
                filtered = mat_f

        if req_size:
            alt = req_size.replace("-", "/") if "-" in req_size else req_size.replace("/", "-")
            size_f = [p for p in filtered if p.get("normalized_attributes", {}).get("USP_suture_size_equivalent") in (req_size, alt)]
            if size_f:
                filtered = size_f

        return filtered if filtered else products
    except Exception:
        return products


# ── GPT: Batch Match + Deviation ─────────────────────────────────────────────

def process_items_batch(batch: list) -> dict:
    if not batch:
        return {}

    shared_products    = {}
    batch_items_payload = {}

    for item_key, item_obj, selected_file, products in batch:
        if selected_file not in shared_products:
            shared_products[selected_file] = products
        batch_items_payload[item_key] = {
            "item_name":               item_obj.get(item_key, ""),
            "item_category":           item_obj.get("item_category", ""),
            "tender_item_name":        item_obj.get("tender_item_name", ""),
            "dept":                    item_obj.get("dept", ""),
            "item_main_category":      item_obj.get("item_main_category", ""),
            "type":                    item_obj.get("type", ""),
            "technical_specifications":item_obj.get("technical_specifications", {}),
            "product_file":            selected_file,
        }

    user_text = f"""Process this BATCH of tender items.
For EACH: (1) pick best matching product from its product_file, (2) run deviation analysis.

SHARED PRODUCT LISTS (keyed by file path):
{json.dumps(shared_products, indent=2, ensure_ascii=False)}

TENDER ITEMS BATCH:
{json.dumps(batch_items_payload, indent=2, ensure_ascii=False)}

Return JSON object keyed by item_key. Follow system prompt exactly."""

    for attempt in range(1, 4):
        try:
            print(f"[GPT] Batch call attempt {attempt}/3 ({len(batch)} items)...")
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": BATCH_MATCH_DEVIATION_PROMPT},
                    {"role": "user",   "content": user_text},
                ],
                temperature=0,
                timeout=180,
            )
            raw   = response.choices[0].message.content.strip()
            clean = re.sub(r"```(?:json)?|```", "", raw).strip()
            result = json.loads(clean)
            if isinstance(result, dict):
                return result
            return {}
        except RateLimitError as e:
            wait = 15 * attempt
            print(f"[RATE LIMIT] Waiting {wait}s...")
            time.sleep(wait)
        except Exception as e:
            print(f"[ERROR] Batch attempt {attempt} failed: {e}")
            if attempt < 3:
                time.sleep(10)
            else:
                return {}

    return {}


def process_all_items(item_entries: list):
    all_suggestions = []
    all_deviations  = {}

    resolved = []
    for item_obj in item_entries:
        item_key = next((k for k in item_obj if k.startswith("item_")), None)
        if not item_key:
            continue

        json_file  = item_obj.get("item_main_category")
        folder_key = CATEGORY_TO_FOLDER.get(json_file)
        if not folder_key:
            continue

        available_files = PRODUCT_FILES.get(folder_key, [])
        if not available_files:
            continue

        selected_file = gpt_pick_product_file(
            item_key,
            item_obj.get(item_key, ""),
            item_obj.get("tender_item_name", ""),
            item_obj.get("dept", ""),
            item_obj.get("type", ""),
            available_files,
        )

        if not selected_file or selected_file not in available_files:
            selected_file = available_files[0]

        products = load_products_from_file(selected_file)
        if not products:
            continue

        if "Suture.json" in selected_file:
            products = prefilter_sutures(item_obj, products)

        if isinstance(products, list) and len(products) > MAX_PRODUCTS:
            products = products[:MAX_PRODUCTS]

        resolved.append((item_key, item_obj, selected_file, products))

    # Batch processing
    batches = [resolved[i:i + BATCH_SIZE] for i in range(0, len(resolved), BATCH_SIZE)]
    print(f"[INFO] Processing {len(resolved)} item(s) in {len(batches)} batch(es)...")

    for batch_num, batch in enumerate(batches, 1):
        print(f"[BATCH] {batch_num}/{len(batches)} — {len(batch)} item(s)")
        batch_results = process_items_batch(batch)

        for item_key, item_obj, selected_file, _ in batch:
            item_result = batch_results.get(item_key)
            if not item_result:
                continue

            all_suggestions.append({
                "item":             item_key,
                "item_category":    item_result.get("item_category",    item_obj.get("item_category", "")),
                "tender_item_name": item_result.get("tender_item_name", item_obj.get("tender_item_name", "")),
                "selected_file":    item_result.get("selected_file",    selected_file),
                "product_code":     item_result.get("product_code",     ""),
                "product_name":     item_result.get("product_name",     ""),
                "product_specs":    item_result.get("product_specs",    {}),
                "relevancy_score":  item_result.get("relevancy_score",  0.0),
            })

            deviation_table = item_result.get("deviation_table", [])
            if deviation_table:
                all_deviations[item_key] = deviation_table

    return all_suggestions, all_deviations


def parse_json_response(raw: str):
    clean = re.sub(r"```(?:json)?|```", "", raw).strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError as e:
        print(f"[WARN] JSON parse error: {e}")
        return {"raw_response": raw}


# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/analyze")
async def analyze(
    files: List[UploadFile] = File(...),
    email: Optional[str]    = Form(None),
):
    """
    Upload tender documents.
    Supported formats: PDF, XLSX, XLS, CSV, DOCX, DOC
    All non-PDF files are automatically converted to PDF before processing.

    The FIRST file is treated as the main Bid Document.
    All remaining files are treated as ATC / supporting documents.

    Returns:
    {
      "relevant": true | false,
      "reason": "...",                    // only when not relevant
      "dept": "Endo/Diagno",
      "item_category": "...",
      "no_of_items": N,
      "conversion_log": [...],            // which files were converted and how
      "evaluation": [...],                // raw GPT evaluation array
      "suggested_products": [...],
      "deviation_tables": { "item_1": [...], ... }
    }
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")

    ACCEPTED_EXTS = {".pdf", ".xlsx", ".xls", ".csv", ".docx", ".doc"}

    # Validate extensions up front
    for upload in files:
        ext = os.path.splitext(upload.filename)[1].lower()
        if ext not in ACCEPTED_EXTS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unsupported file type '{ext}' for '{upload.filename}'. "
                    f"Accepted: {', '.join(sorted(ACCEPTED_EXTS))}"
                ),
            )

    tmp_dir = tempfile.mkdtemp(prefix="tender_api_")
    try:
        # ── Save all uploads ──────────────────────────────────────────────────
        saved_paths = []
        for upload in files:
            dest = os.path.join(tmp_dir, upload.filename)
            with open(dest, "wb") as f:
                shutil.copyfileobj(upload.file, f)
            saved_paths.append(dest)
            print(f"[UPLOAD] Saved: {upload.filename} ({os.path.getsize(dest)} bytes)")

        # ── Convert non-PDF files to PDF ──────────────────────────────────────
        converted_paths = []
        conversion_log  = []

        for path in saved_paths:
            ext      = os.path.splitext(path)[1].lower()
            filename = os.path.basename(path)

            if ext == ".pdf":
                converted_paths.append(path)
                conversion_log.append({"file": filename, "action": "used as-is (PDF)"})

            elif ext in CONVERTIBLE_EXTS:
                try:
                    pdf_path = convert_to_pdf(path, tmp_dir)
                    converted_paths.append(pdf_path)
                    conversion_log.append({
                        "file":   filename,
                        "action": "converted to PDF",
                        "pdf":    os.path.basename(pdf_path),
                    })
                    print(f"[CONVERT] {filename} → {os.path.basename(pdf_path)}")
                except Exception as conv_err:
                    conversion_log.append({
                        "file":   filename,
                        "action": "conversion failed — skipped",
                        "error":  str(conv_err),
                    })
                    print(f"[WARN] Could not convert {filename}: {conv_err}")
            else:
                conversion_log.append({"file": filename, "action": "unsupported format — skipped"})

        if not converted_paths:
            raise HTTPException(status_code=400, detail="No processable files after conversion.")

        bid_doc_path = converted_paths[0]
        atc_paths    = converted_paths[1:]

        print(f"[INFO] Bid doc : {os.path.basename(bid_doc_path)}")
        print(f"[INFO] ATC files: {[os.path.basename(p) for p in atc_paths]}")

        # ── Step 1: GPT Evaluation ────────────────────────────────────────────
        print("[STEP 1] Evaluating tender...")
        raw_evaluation = evaluate_tender(bid_doc_path, atc_paths)
        evaluation     = parse_json_response(raw_evaluation)

        if not isinstance(evaluation, list) or not evaluation:
            return JSONResponse(status_code=200, content={
                "relevant":       False,
                "reason":         "Could not parse GPT evaluation response.",
                "conversion_log": conversion_log,
                "raw":            raw_evaluation,
            })

        if evaluation[0].get("relevant") != "Yes":
            return JSONResponse(status_code=200, content={
                "relevant":       False,
                "reason":         evaluation[0].get("reason", "No reason provided."),
                "conversion_log": conversion_log,
                "evaluation":     evaluation,
            })

        # ── Step 2: Extract metadata ──────────────────────────────────────────
        no_items     = evaluation[1].get("no_of_items", 0) if len(evaluation) > 1 else 0
        item_entries = evaluation[2:]

        raw_depts      = []
        raw_categories = []
        for item in item_entries:
            if any(k.startswith("item_") for k in item):
                raw_depts.append(item.get("dept", ""))
                raw_categories.append(
                    item.get("item_main_category", "") or item.get("item_category", "")
                )

        cleaned_depts = []
        for d in raw_depts:
            d = d.strip()
            if d.lower() in ("endo", "endo.json"):
                cleaned_depts.append("Endo")
            elif d.lower() in ("diagno", "diagno.json"):
                cleaned_depts.append("Diagno")
            else:
                cleaned_depts.append(d)

        dept_value     = "/".join(dict.fromkeys(cleaned_depts)) or None
        category_value = (
            "/".join(dict.fromkeys([c.strip() for c in raw_categories if c.strip()])) or None
        )

        print(f"[INFO] Relevant — {no_items} item(s) | Dept: {dept_value} | Category: {category_value}")

        # ── Step 3: Product matching + deviation analysis ─────────────────────
        print("[STEP 2] Running product matching & deviation analysis...")
        all_suggestions, all_deviations = process_all_items(item_entries)

        # ── Final response ────────────────────────────────────────────────────────────
        result_payload = {
            "relevant":           True,
            "dept":               dept_value,
            "item_category":      category_value,
            "no_of_items":        no_items,
            "conversion_log":     conversion_log,
            "evaluation":         evaluation,
            "suggested_products": all_suggestions,
            "deviation_tables":   all_deviations,
        }

        # ── Send email (non-blocking: failure never breaks the response) ────────
        if email:
            send_result_email(email, result_payload)

        return JSONResponse(status_code=200, content=result_payload)

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        print(f"[CLEANUP] Removed temp dir: {tmp_dir}")