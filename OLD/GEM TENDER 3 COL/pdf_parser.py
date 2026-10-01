import os
import json
import pdfplumber

import re

def is_hindi(text):
    """Checks if a string contains Hindi (Devanagari) characters."""
    return any('\u0900' <= char <= '\u097F' for char in text)

def clean_gem_text(text):
    """
    Cleans GeM specific artifacts and removes all Hindi (Devanagari) characters.
    Preserves English slashes and colons (important for Bid Numbers).
    """
    if not text:
        return ""
    
    # Remove (cid:N) artifacts
    text = re.sub(r'\(cid:\d+\)', '', text)
    
    # Remove all Devanagari characters (Hindi)
    # Range: \u0900 to \u097F
    text = re.sub(r'[\u0900-\u097F]+', '', text)
    
    # After removing Hindi, we might have leading/trailing slashes like "/Bid Number"
    # or empty parts like " / "
    text = text.replace('/', ' / ') # Ensure space for splitting
    parts = text.split(' / ')
    
    cleaned_parts = []
    for p in parts:
        p = p.strip()
        if p:
            cleaned_parts.append(p)
    
    # Rejoin with / only if it looks like it belongs (e.g. GEM/2026)
    # Actually, just joining with a space or keeping the first English label is safer
    # But for Bid Numbers we want the full string.
    
    # If it's a "Bid Number: GEM 2026..." it's usually one part now.
    result = " ".join(cleaned_parts)
    
    # Clean up multiple spaces and common GeM noise
    result = re.sub(r'\s+', ' ', result)
    result = result.strip(' /: ')
    
    return result

def extract_pdf_data(pdf_path):
    """
    Extracts text and tables from a GeM tender PDF and returns a structured dictionary.
    Focuses on English content and key-value mapping.
    """
    results = {
        "bid_details": {},
        "consignees": [],
        "full_text_english": ""
    }
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            all_text_cleaned = []
            
            for page in pdf.pages:
                # Process tables for structured data
                tables = page.extract_tables()
                for table in tables:
                    if not table:
                        continue
                    
                    for row in table:
                        # Clean the whole row
                        cleaned_row = [clean_gem_text(str(cell or "")) for cell in row]
                        
                        # Filter out empty cells
                        cleaned_row = [c for c in cleaned_row if c]
                        
                        if len(cleaned_row) == 2:
                            key, val = cleaned_row
                            if len(key) < 100:
                                results["bid_details"][key] = val
                        elif len(cleaned_row) == 1:
                            # Might be a "Key: Value" pair in one cell
                            cell = cleaned_row[0]
                            if ":" in cell:
                                parts = cell.split(":", 1)
                                k = parts[0].strip()
                                v = parts[1].strip()
                                if len(k) < 100 and v:
                                    results["bid_details"][k] = v
                        
                        # Consignee table extraction logic
                        if len(cleaned_row) >= 4 and "Reporting Officer" in cleaned_row[1]:
                            continue # Header
                        elif len(cleaned_row) >= 4 and cleaned_row[0].isdigit():
                            results["consignees"].append({
                                "sn": cleaned_row[0],
                                "officer": cleaned_row[1],
                                "address": cleaned_row[2],
                                "quantity": cleaned_row[3],
                                "delivery_days": cleaned_row[4] if len(cleaned_row) > 4 else ""
                            })
                            
                # Extract and clean raw text
                text = page.extract_text()
                if text:
                    for line in text.split('\n'):
                        cleaned = clean_gem_text(line)
                        if cleaned:
                            all_text_cleaned.append(cleaned)
            
            results["full_text_english"] = "\n".join(all_text_cleaned)
            
            # Specific GeM Field Fixes
            if "Bid Number" not in results["bid_details"]:
                # Look for Bid Number GEM/2026/B/7170959
                match = re.search(r"Bid Number\s*([A-Z0-9/]+)", results["full_text_english"])
                if match:
                    results["bid_details"]["Bid Number"] = match.group(1)

    except Exception as e:
        print(f"Error parsing PDF {pdf_path}: {e}")
        return None
        
    return results

def save_to_json(data, json_path):
    """Saves the extracted data to a JSON file."""
    try:
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        # Sort keys for cleaner JSON
        if "bid_details" in data:
            data["bid_details"] = dict(sorted(data["bid_details"].items()))
            
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving JSON {json_path}: {e}")
        return False
