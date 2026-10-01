import re

def parse_value_latest(text, label):
    # Current Regex in Controller
    pattern = rf"\b{re.escape(label)}\b\D*?([\d,]+(?:\.\d+)?(?:[ \t]+[a-zA-Z]+)?)"
    match = re.search(pattern, text, re.IGNORECASE)
    return match.group(1).strip() if match else "N/A"

test_cases = [
    ("Final Rating 4.46\nDelivery", "Final Rating", "4.46"),
    ("Total 111.57", "Total", "111.57"),
    ("All\n138", "All", "138"),
    ("Pending\n\n 55.71 L", "Pending", "55.71 L"),
    ("Charges 5.5 lakh\nNext", "Charges", "5.5 lakh"),
    ("Random Label - 45", "Random Label", "45"),
    ("Bad Format", "Missing", "N/A"),
    ("All Incidents 200", "All", "200"),
    ("Pending Incidents - 5", "Pending", "5"),
    ("Overall Score 100", "All", "N/A"), # Should NOT match "Overall" -> "All"
    ("Label with text in between: value is 99", "Label", "99"),
]

print(f"{'Label':<15} | {'Input Text':<30} | {'Extracted':<15} | {'Expected':<10}")
print("-" * 80)

for text, label, expected in test_cases:
    res = parse_value_latest(text, label)
    disp_text = text.replace("\n", "\\n")
    print(f"{label:<15} | {disp_text:<30} | {res:<15} | {expected:<10}")
