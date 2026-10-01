r"""
kar_captcha_solver.py

Solves captcha images using an Ollama vision model (Tesseract OCR proved
inconsistent/inaccurate in testing, so this now relies on Ollama only).

Drop numbered captcha images (1.png, 2.png, 3.png, ...) into this script's
folder and run it with no arguments - it solves each one and prints the
result to the terminal.

Usage:
    python kar_captcha_solver.py
    python kar_captcha_solver.py --model gemma4:31b-cloud
    python kar_captcha_solver.py path\to\single_captcha.png
"""

import argparse
import base64
import string
import sys
from pathlib import Path

import requests

OLLAMA_HOST = "http://localhost:11434"
DEFAULT_MODEL = "gemma4:31b-cloud"  # vision-capable model available on this machine

CAPTCHA_ALPHABET = string.ascii_uppercase + string.digits

SCRIPT_DIR = Path(__file__).resolve().parent


def solve_with_ollama(image_path: Path, model: str = DEFAULT_MODEL) -> str:
    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode("utf-8")

    prompt = (
        "This image is a captcha containing a short sequence of uppercase "
        "letters and digits. Read the characters exactly as shown, ignoring "
        "any background lines/noise. Reply with ONLY the characters, no "
        "spaces, no punctuation, no explanation."
    )

    response = requests.post(
        f"{OLLAMA_HOST}/api/generate",
        json={
            "model": model,
            "prompt": prompt,
            "images": [image_b64],
            "stream": False,
        },
        timeout=120,
    )
    response.raise_for_status()
    raw = response.json().get("response", "")
    return "".join(ch for ch in raw.upper() if ch in CAPTCHA_ALPHABET)


def find_captcha_images() -> list[Path]:
    images = []
    for path in sorted(SCRIPT_DIR.glob("*.png")):
        if path.stem.isdigit():
            images.append(path)
    images.sort(key=lambda p: int(p.stem))
    return images


def main():
    parser = argparse.ArgumentParser(description="Solve captcha images using Ollama.")
    parser.add_argument("image", nargs="?", help="Path to a single captcha image (optional)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Ollama vision model to use")
    args = parser.parse_args()

    if args.image:
        targets = [Path(args.image)]
        if not targets[0].exists():
            print(f"Error: image not found: {targets[0]}", file=sys.stderr)
            sys.exit(1)
    else:
        targets = find_captcha_images()
        if not targets:
            print(f"No numbered captcha images (1.png, 2.png, ...) found in {SCRIPT_DIR}", file=sys.stderr)
            sys.exit(1)

    for image_path in targets:
        try:
            result = solve_with_ollama(image_path, model=args.model)
            print(f"{image_path.name}: {result}")
        except Exception as e:
            print(f"{image_path.name}: FAILED ({e})")


if __name__ == "__main__":
    main()
