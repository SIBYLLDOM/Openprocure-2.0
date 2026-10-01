#!/usr/bin/env python3
"""
split_360_products.py — one-time conversion script.

Splits the flat keyword/360_keywords.json catalogue (13 top-level entries,
some of which bundle multiple SKUs under a "products" array) into individual
per-type product JSON files under products/<category>/<Type>.json, mirroring
the folder-per-department / file-per-type convention used by Endo and Diagno
in TenderSystem/NewSystem/step4-gpt.py's PRODUCT_FILES dict.

Grouped entries (e.g. the MIDOR Povidone Iodine range, the "Upcoming
Antiseptic Range") are flattened: each item in their "products" array becomes
its own product object, merged with the parent's shared context (series_name,
shared_technical_specifications, brand, sub_brand, availability_status).

The "Upcoming Antiseptic Range" entry additionally mixes three unrelated
product_category values (Antiseptic Solution, Incise Drapes, Clipper &
Blades) in one products array — those are routed to three different target
files by product_category rather than kept together.

The "Clinical Reference" entry (WHO handwash steps) is not a sellable
product and is skipped entirely.

Run once: python split_360_products.py
"""
import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE_DIR, "keyword", "360_keywords.json")
OUT_ROOT = os.path.join(BASE_DIR, "products")

# (segment, type) -> (folder, filename)
DIRECT_MAP = {
    ("Surgical Apparel", "Surgical Gown"):                       ("apparel", "Surgical_Gown.json"),
    ("Surgical Apparel", "Surgical Cap"):                        ("apparel", "Surgical_Cap.json"),
    ("Surgical Apparel", "Surgical Mask"):                       ("apparel", "Surgical_Mask.json"),
    ("Surgical Apparel", "Surgery-Specific Kits"):                ("apparel", "Surgery_Specific_Kit.json"),
    ("Surgical Drapes", "Orthopedic Surgical Drape"):             ("drapes", "Orthopedic_Surgical_Drape.json"),
    ("Surgical Drapes", "Cardiology / Angiography Surgical Drape"): ("drapes", "Cardiology_Angiography_Surgical_Drape.json"),
    ("Surgical Drapes", "ENT / Eye / Dental Surgical Drape"):     ("drapes", "ENT_Eye_Dental_Surgical_Drape.json"),
    ("Surgical Drapes", "Gynecology Surgical Drape"):             ("drapes", "Gynecology_Surgical_Drape.json"),
    ("Surgical Drapes", "Surgical Drape Sheet"):                  ("drapes", "Surgical_Drape_Sheet.json"),
    ("Surgical Drapes", "Upcoming Drapes"):                       ("drapes", "Upcoming_Drapes.json"),
    ("Disinfection & Sterilization", "Surface and Equipment Disinfectant"): ("disinfection", "Surface_and_Equipment_Disinfectant.json"),
    ("Disinfection & Sterilization", "Upcoming Disinfectant Range"): ("disinfection", "Upcoming_Disinfectant_Range.json"),
    ("Hand Hygiene", "Alcohol Based Hand Rub"):                   ("hand_hygiene", "Alcohol_Based_Hand_Rub.json"),
    ("Hand Hygiene", "Antiseptic Surgical Hand Scrub"):           ("hand_hygiene", "Antiseptic_Surgical_Hand_Scrub.json"),
    ("Skin Preparation", "Surgical Skin Preparation Solution"):   ("skin_prep", "Surgical_Skin_Preparation_Solution.json"),
    ("Skin Preparation", "Povidone Iodine Antiseptic"):           ("skin_prep", "Povidone_Iodine_Antiseptic.json"),
}

# Sub-routing for the "Upcoming Antiseptic Range" bundle, keyed by each
# product's own product_category field.
UPCOMING_ANTISEPTIC_SUBMAP = {
    "Antiseptic Solution":                    ("hand_hygiene", "Upcoming_CHG_Antiseptic_Solution.json"),
    "Alcohol-based Antiseptic with Emollients": ("skin_prep", "Upcoming_Skin_Antiseptic.json"),
    "Alcohol-based Antiseptic":               ("skin_prep", "Upcoming_Skin_Antiseptic.json"),
    "Alcohol-based Antiseptic (Tinted)":      ("skin_prep", "Upcoming_Skin_Antiseptic.json"),
    "Incise Drapes":                          ("drapes", "Incise_Drape.json"),
    "Clipper & Blades":                       ("accessories", "Surgical_Clipper_and_Blades.json"),
}

SHARED_CONTEXT_KEYS = [
    "category", "segment", "type", "series_name", "brand", "sub_brand",
    "solution_family", "availability_status", "shared_technical_specifications",
]


def bucket_add(buckets, folder, filename, product):
    buckets.setdefault((folder, filename), []).append(product)


def main():
    with open(SRC, "r", encoding="utf-8") as f:
        entries = json.load(f)

    buckets = {}  # (folder, filename) -> [products]
    skipped = []

    for entry in entries:
        segment = entry.get("segment")
        etype = entry.get("type")

        if etype == "Clinical Reference":
            skipped.append(entry.get("reference_name", "Clinical Reference"))
            continue

        shared_context = {k: entry[k] for k in SHARED_CONTEXT_KEYS if k in entry}

        if etype == "Upcoming Antiseptic Range":
            for product in entry.get("products", []):
                cat = product.get("product_category")
                target = UPCOMING_ANTISEPTIC_SUBMAP.get(cat)
                if not target:
                    skipped.append(f"(unmapped product_category={cat!r}) {product.get('instrument_name')}")
                    continue
                folder, filename = target
                merged = {**shared_context, **product}
                bucket_add(buckets, folder, filename, merged)
            continue

        target = DIRECT_MAP.get((segment, etype))
        if not target:
            skipped.append(f"(unmapped segment/type={segment!r}/{etype!r}) {entry.get('instrument_name') or entry.get('series_name')}")
            continue
        folder, filename = target

        if "products" in entry:
            # Grouped entry (e.g. MIDOR range) — flatten each sub-product,
            # merged with the parent's shared context.
            for product in entry["products"]:
                merged = {**shared_context, **product}
                bucket_add(buckets, folder, filename, merged)
        elif "pipeline" in entry:
            # "Upcoming Drapes" — no per-SKU specs yet, keep the pipeline
            # structure as-is inside a single placeholder product entry.
            merged = {**shared_context, "pipeline": entry["pipeline"],
                      "instrument_name": entry.get("series_name", "Upcoming Drapes")}
            bucket_add(buckets, folder, filename, merged)
        else:
            # Standalone single-SKU entry — the whole entry minus the
            # shared_context keys (already at top level) is the product.
            product = {k: v for k, v in entry.items() if k not in ("shared_technical_specifications",)}
            bucket_add(buckets, folder, filename, product)

    written = []
    for (folder, filename), products in buckets.items():
        out_dir = os.path.join(OUT_ROOT, folder)
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, filename)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(products, f, indent=2, ensure_ascii=False)
        written.append((os.path.relpath(out_path, BASE_DIR), len(products)))

    print(f"Wrote {len(written)} product file(s):")
    for path, count in sorted(written):
        print(f"  {path:65s} {count} product(s)")

    if skipped:
        print(f"\nSkipped {len(skipped)} entr(ies):")
        for s in skipped:
            print(f"  - {s}")


if __name__ == "__main__":
    main()
