import csv
import os
import re
from pathlib import Path

import pdfplumber
from pypdf import PdfReader


PDF = Path(
    os.environ.get(
        "ROUTEONE_QUESTIONNAIRE_TEMPLATE",
        Path.cwd() / "data" / "routeone" / "Auto_Lender_Program_Questionnaire_Fillable.pdf",
    )
)
OUT = Path(
    os.environ.get(
        "ROUTEONE_FIELD_MAP",
        Path.cwd() / "outputs" / "routeone" / "questionnaire_field_map.csv",
    )
)


def group_lines(words, tol=3):
    lines = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        if not lines or abs(lines[-1]["top"] - word["top"]) > tol:
            lines.append(
                {
                    "top": word["top"],
                    "bottom": word["bottom"],
                    "x0": word["x0"],
                    "x1": word["x1"],
                    "text": word["text"],
                }
            )
        else:
            line = lines[-1]
            line["bottom"] = max(line["bottom"], word["bottom"])
            line["x0"] = min(line["x0"], word["x0"])
            line["x1"] = max(line["x1"], word["x1"])
            line["text"] += " " + word["text"]
    return lines


def is_noise_label(text):
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return True
    if text in {"Yes No Case-by-case Not applicable", "Experian Equifax TransUnion Multiple"}:
        return True
    if text.startswith("AUTO LENDER PROGRAM QUESTIONNAIRE"):
        return True
    if text.startswith("Do not include customer personal information"):
        return True
    if re.fullmatch(r"\d+", text):
        return True
    return False


def label_for_field(lines, x0, x1, top):
    candidates = []
    for line in lines:
        if line["bottom"] <= top + 1 and top - line["bottom"] < 80:
            overlap = max(0, min(x1, line["x1"]) - max(x0, line["x0"]))
            if overlap > 0 or line["x0"] < x0 + 6:
                text = re.sub(r"\s+", " ", line["text"]).strip()
                if not is_noise_label(text):
                    candidates.append((top - line["bottom"], text))
    if not candidates:
        return ""
    candidates.sort(key=lambda row: row[0])
    return candidates[0][1]


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(str(PDF))
    widgets = []
    for page_index, page in enumerate(reader.pages):
        for annot in page.get("/Annots") or []:
            obj = annot.get_object()
            name = str(obj.get("/T"))
            field_type = str(obj.get("/FT"))
            rect = [float(value) for value in obj.get("/Rect")]
            widgets.append({"page": page_index + 1, "name": name, "type": field_type, "rect": rect})

    rows = []
    with pdfplumber.open(str(PDF)) as pdf:
        for widget in widgets:
            page = pdf.pages[widget["page"] - 1]
            height = page.height
            x0, y0, x1, y1 = widget["rect"]
            top = height - y1
            bottom = height - y0
            label = ""
            if widget["type"] == "/Tx":
                lines = group_lines(page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False))
                label = label_for_field(lines, x0, x1, top)
            rows.append(
                {
                    "page": widget["page"],
                    "name": widget["name"],
                    "type": widget["type"],
                    "x0": round(x0, 2),
                    "top": round(top, 2),
                    "x1": round(x1, 2),
                    "bottom": round(bottom, 2),
                    "label": label,
                }
            )

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["page", "name", "type", "x0", "top", "x1", "bottom", "label"])
        writer.writeheader()
        writer.writerows(rows)
    print(OUT)
    print(len(rows))


if __name__ == "__main__":
    main()
