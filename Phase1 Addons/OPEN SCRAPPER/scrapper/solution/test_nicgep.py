import urllib.parse
from bs4 import BeautifulSoup

def scrape_nicgep_html(html):
    soup = BeautifulSoup(html, "html.parser")
    data = {}
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td", recursive=False)
        for i in range(len(tds) - 1):
            classes = tds[i].get("class", [])
            if "td_caption" in classes:
                label = tds[i].get_text(separator=" ", strip=True).replace(":", "")
                if not label: continue
                for j in range(i+1, len(tds)):
                    nclasses = tds[j].get("class", [])
                    if "td_field" in nclasses:
                        val = tds[j].get_text(separator=" ", strip=True)
                        data[label] = val
                        break
    return data

with open("sample.html", "r") as f:
    html = f.read()
print(scrape_nicgep_html(html))
