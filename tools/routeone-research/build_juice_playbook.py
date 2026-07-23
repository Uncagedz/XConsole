import html
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

try:
    from ftfy import fix_text
except Exception:  # pragma: no cover
    def fix_text(value):
        return value


ROOT = Path(os.environ.get("ROUTEONE_ROOT", Path.cwd() / "data" / "routeone"))
OUTPUT_DIR = Path(os.environ.get("ROUTEONE_OUTPUT_DIR", ROOT / "generated"))
INDEX_PATH = ROOT / "_enhanced_pdf_extraction_index.json"
CATALOG_PATH = ROOT / "routeone_full_catalog.json"
TMP_DIR = ROOT / "_juice_playbook_build"
FRONT_PDF = TMP_DIR / "_front.pdf"
OUT = OUTPUT_DIR / "RouteOne Finance Manager Desking and Finance Playbook.pdf"
DESKTOP_OUT = OUT
DATA_OUT = ROOT / "_juice_playbook_extracted_facts.json"
TODAY = date.today()


STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
}


GOOD_TITLE_WORDS = {
    "rate": 18, "rates": 18, "program": 15, "guideline": 15, "guidelines": 15,
    "guide": 12, "reference": 12, "funding": 14, "checklist": 14, "lease": 13,
    "retail": 11, "business": 11, "commercial": 11, "fleet": 10, "title": 9,
    "residual": 12, "matrix": 10, "policy": 7, "bulletin": 8, "lien": 8,
    "aftermarket": 7, "ancillary": 7, "gap": 7, "cpo": 7, "credit": 7,
}

BAD_TITLE_WORDS = {
    "training": 14, "welcome": 10, "privacy": 16, "application": 8,
    "form": 5, "agreement": 6, "authorization": 8, "notice": 5,
    "voucher": 8, "flyer": 8, "contest": 10, "survey": 12,
}

NOISE_BITS = [
    "all rights reserved", "for dealer use only", "not for distribution", "copyright",
    "privacy policy", "printed name", "signature", "sign here", "initials",
    "notary", "witness", "applicant name", "buyer name", "lessee name",
    "borrower signature", "dealer signature", "applicant signature", "date signed",
    "i/we certify", "i certify", "i agree", "hereby", "undersigned", "shall be",
    "this form", "this agreement", "form number", "rev.", "revision", "page ",
    "approved in all states", "dealer in-house", "administrator phone",
    "customer signature", "consumer signature", "mailing address", "zip code",
    "email address", "phone number", "fax number", "please print",
    "approved universal warranty", "approved portfolio", "product permitted",
    "fee prohibited", "missing purchase not required", "administrator phone",
    "not insurance product disclosure", "approved routeone", "approved dealertrack",
    "minimum warranty", "3 months / 3,000 miles", "missing pages", "please send",
    "be shared", "duplicated", "coverage |", "meets or exceeds the duration",
    "version:", "........", "electronic records as is", "without any warranty",
    "i understand that i am not required to purchase", "dealer and/or others may profit",
    "positive experience", "new customers", "affordable and reliable transportation",
    "cruiser - job time", "residencedown paymenttime",
    "affidavit of dealer", "attached to this affidavit", "regarding delivery of title",
]

JUNK_LINE_RE = re.compile(
    r"^(?:document|title|page|field|bundle(?:d)? product|approved portfolio|approved routeone|approved dealertrack|gap\s+gap-|vsc\s+|aprnc\s|ra-)\b",
    re.I,
)

SKIP_SOURCES = {"Regulatory", "RouteOne Marketing", "FCA Mastercard"}


SECTION_KEYWORDS = {
    "hard": [
        "minimum fico", "min fico", "fico", "credit score", "bureau score",
        "minimum amount", "maximum amount", "amount financed", "minimum term",
        "maximum term", "terms up to", "max term", "ltv", "advance",
        "front-end", "total ltv", "mileage", "odometer", "model year",
        "days to first payment", "first payment", "dealer acquisition fee",
    ],
    "rate": [
        "buy rate", "final buy rate", "rate mark", "markup", "mark-up",
        "participation", "dealer participation", "reserve", "flat fee",
        "flat paid", "charge back", "chargeback", "dfi", "promo apr",
        "subvented", "autopay", "automatic payment",
    ],
    "lease": [
        "lease", "smartlease", "money factor", "mf", "residual", "mileage",
        "security deposit", "msd", "multiple security", "acquisition fee",
        "disposition fee", "cap cost", "capitalized cost", "cap reduction",
        "excess wear", "lease agreement",
    ],
    "backend": [
        "gap", "service contract", "vsc", "warranty", "maintenance",
        "ancillary", "aftermarket", "optional product", "backend",
        "back-end", "approved products", "not permitted", "not eligible",
        "cannot exceed", "product limit", "tire", "wheel", "key",
    ],
    "business": [
        "business", "commercial", "fleet", "llc", "corporation",
        "partnership", "sole proprietor", "guaranty", "guarantee",
        "personal guaranty", "pg", "ein", "w-9", "beneficial owner",
        "secretary of state", "operating agreement", "articles",
        "livery", "rental", "rideshare", "farm", "ranch",
    ],
    "funding": [
        "funding", "fund", "contract package", "funding checklist",
        "documents required", "required documents", "stip", "proof of income",
        "proof of residence", "poi", "por", "ssa-89", "driver license",
        "id", "insurance", "deductible", "missing", "will not fund",
        "returned", "re-contract", "incorrect", "vin", "odometer",
    ],
    "title": [
        "title", "lienholder", "lien holder", "loss payee", "elt",
        "electronic lien", "registration", "agreement to furnish insurance",
        "deductible", "trade title", "payoff", "out-of-state", "dmv",
    ],
}


FIELD_QUERIES = [
    ("Min FICO / score", ["minimum fico", "min fico", "minimum credit score", "credit bureau risk score", "fico score", "fico"]),
    ("Amount financed", ["minimum amount financed", "maximum amount financed", "amount financed", "minimum amount", "maximum amount"]),
    ("Terms", ["maximum term", "minimum term", "terms up to", "up to 84", "up to 75", "up to 72", "model year terms"]),
    ("Advance / LTV", ["maximum advance", "max advance", "total ltv", "maximum total ltv", "front-end advance", "loan-to-value", "ltv"]),
    ("Mileage / age", ["maximum odometer", "mileage", "odometer", "model year", "vehicle age", "less than 100,000"]),
    ("Dealer participation", ["dealer participation", "maximum dealer participation", "rate mark", "mark-up cap", "markup", "max dfi", "dfi", "reserve", "flat paid"]),
    ("Rate rules", ["buy rate", "final buy rate", "rates are returned", "rate guaranteed", "state statutory limits", "promo apr", "subvented"]),
    ("Fees / first payment", ["dealer acquisition fee", "acquisition fee", "processing fee", "first payment", "days to first payment", "deferred down"]),
    ("Backend / GAP", ["gap", "back-end products", "backend", "service contract", "vsc", "warranty", "ancillary", "aftermarket", "optional products"]),
]


def parse_date(value):
    if not value:
        return None
    value = str(value).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m.%d.%Y", "%m.%d.%y", "%m-%d-%Y", "%m-%d-%y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    return None


def clean_part(value):
    value = "" if value is None else str(value)
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:150].strip() or "Untitled"


def normalize(value):
    value = fix_text(str(value or ""))
    replacements = {
        "\x00": " ", "\u2022": "-", "\u25aa": "-", "\u25cf": "-", "\u00a0": " ",
        "\u2013": "-", "\u2014": "-", "\u2212": "-", "\u2265": ">=", "\u2264": "<=",
        "\u00d8": "-", "\u00ae": "", "\u2122": "", "\u2019": "'", "\u201c": '"', "\u201d": '"',
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n\s+", "\n", value)
    return value.strip()


def clean_line(line):
    line = normalize(line)
    line = re.sub(r"^-+\s*", "", line)
    line = re.sub(r"\s+", " ", line).strip(" -:\t")
    line = re.sub(r"\bU\.S\. Bank N\.A\. Page \d+ of \d+.*$", "", line).strip()
    return line


def esc(value):
    return html.escape(str(value or ""))


def p(text, style):
    return Paragraph(esc(text), style)


def p_lines(lines, style):
    return Paragraph("<br/>".join(esc(line) for line in lines if line), style)


def clip(text, limit=190):
    text = clean_line(text)
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].strip(" ,;:-")
    return cut or text


def full_text(text):
    return clean_line(text)


def short_text(text, limit=170):
    text = clean_line(text)
    if len(text) <= limit:
        return text
    for mark in [". ", "; ", " - ", ", "]:
        idx = text.rfind(mark, 0, limit)
        if idx >= 80:
            return text[: idx + (1 if mark == ". " else 0)].strip(" ,;:-")
    return text[:limit].rsplit(" ", 1)[0].strip(" ,;:-")


def join_items(items):
    clean = []
    for item in items:
        item = full_text(item).strip(" ;")
        if item.endswith("."):
            item = item[:-1]
        if item:
            clean.append(item)
    return "; ".join(clean)


def key_for(text):
    return re.sub(r"[^a-z0-9]+", "", text.lower())[:115]


def raw_logical_lines(text):
    raw_lines = [clean_line(x) for x in text.splitlines()]
    raw_lines = [x for x in raw_lines if x and not x.startswith("--- PAGE") and not x.startswith("--- EXTRACTED")]
    out = []
    current = ""

    def starts_new(line):
        if not current:
            return True
        if line.startswith(("-", "*")):
            return True
        if re.match(r"^[A-Z][A-Z0-9 /&().,'-]{8,}$", line) and len(line) < 95:
            return True
        if re.match(r"^[A-Z][A-Za-z /&-]{2,35}:\s", line):
            return True
        return False

    def joinable(prev, line):
        if not prev or not line:
            return False
        if starts_new(line):
            return False
        if prev.endswith((".", "!", "?", ")", "]")):
            return False
        if len(prev) + len(line) > 520:
            return False
        low_prev = prev.lower()
        if re.search(r"\b(?:and|or|of|to|with|for|if|in|on|the|a|an|by|than|include|including|from|must|will|is|are)$", low_prev):
            return True
        if line[:1].islower():
            return True
        if prev.endswith((",", ";", ":", "-", "/")):
            return True
        return len(prev) < 75 and len(line) < 180

    for line in raw_lines:
        if not current:
            current = line
            continue
        if joinable(current, line):
            current = f"{current} {line}"
        else:
            out.append(current)
            current = line
    if current:
        out.append(current)
    return out


def load_catalog():
    raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    by_bank = defaultdict(list)
    for source in raw.get("sources", []):
        bank = clean_part(source.get("source") or "")
        for item in source.get("items", []):
            eff = parse_date(item.get("effectiveDate"))
            exp = parse_date(item.get("expirationDate"))
            by_bank[bank].append(
                {
                    "file_id": str(item.get("fileId") or ""),
                    "title": normalize(item.get("title") or ""),
                    "description": normalize(item.get("description") or ""),
                    "product_type": normalize(item.get("productType") or ""),
                    "section": normalize(item.get("sectionKind") or ""),
                    "effective": eff,
                    "expiration": exp,
                    "current": exp is None or exp >= TODAY,
                }
            )
    return by_bank


def load_records():
    rows = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    catalog_rows = load_catalog()
    catalog_by_id = {str(row.get("file_id") or ""): row for row in catalog_rows if row.get("file_id")}
    by_bank = defaultdict(list)
    for row in rows:
        if row.get("error") or not row.get("text"):
            continue
        text_path = ROOT / row["text"]
        if not text_path.exists():
            continue
        m = re.search(r"\[([^\]]+)\]\.pdf$", row.get("pdf", ""))
        row = dict(row)
        row["file_id"] = m.group(1) if m else ""
        row["text_path"] = text_path
        row["pdf_name"] = normalize(Path(row.get("pdf", "")).stem)
        catalog_meta = catalog_by_id.get(row["file_id"], {})
        if catalog_meta:
            row["section"] = normalize(catalog_meta.get("sectionKind") or row.get("section") or "")
            row["endpointType"] = normalize(catalog_meta.get("endpointType") or row.get("endpointType") or "")
            row["title"] = normalize(catalog_meta.get("title") or row.get("title") or row["pdf_name"])
            row["description"] = normalize(catalog_meta.get("description") or row.get("description") or "")
            row["productType"] = normalize(catalog_meta.get("productType") or row.get("productType") or "")
            row["current"] = catalog_meta.get("current", row.get("current", True))
            row["effective"] = catalog_meta.get("effective")
            row["expiration"] = catalog_meta.get("expiration")
        by_bank[row["bank"]].append(row)
    return by_bank


def attach_meta(records, catalog_rows):
    by_id = {row["file_id"]: row for row in catalog_rows if row.get("file_id")}
    out = []
    for row in records:
        meta = by_id.get(row.get("file_id"), {})
        merged = dict(row)
        merged.update({f"catalog_{k}": v for k, v in meta.items()})
        merged["current"] = meta.get("current", True)
        merged["effective"] = meta.get("effective")
        merged["expiration"] = meta.get("expiration")
        merged["title"] = meta.get("title") or row.get("pdf_name", "")
        merged["section"] = meta.get("section") or ""
        out.append(merged)
    return out


def is_expired_program_doc(row):
    title = (row.get("title") or "").lower()
    section = (row.get("section") or "").lower()
    exp = row.get("expiration")
    if not exp or exp >= TODAY:
        return False
    if section == "rate sheet":
        return True
    return any(word in title for word in ["rate", "rates", "program", "residual", "lease pricing"])


def doc_score(row):
    title = (row.get("title") or row.get("pdf_name") or "").lower()
    section = (row.get("section") or "").lower()
    score = 0
    if section == "rate sheet":
        score += 35
    for word, weight in GOOD_TITLE_WORDS.items():
        if word in title:
            score += weight
    for word, weight in BAD_TITLE_WORDS.items():
        if word in title:
            score -= weight
    if "funding checklist" in title:
        score += 22
    if "program guidelines" in title or "program guide" in title:
        score += 24
    if "dealer reference guide" in title or "reference guide" in title:
        score += 18
    if "agreement to furnish insurance" in title:
        score += 4
    if row.get("current", True):
        score += 8
    if is_expired_program_doc(row):
        score -= 80
    if "marketing" in title or "training" in title:
        score -= 18
    return score


def read_doc_text(row):
    try:
        return normalize(row["text_path"].read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return ""


def useful_records(records):
    rows = []
    for row in records:
        if is_expired_program_doc(row):
            continue
        score = doc_score(row)
        if score < -25:
            continue
        row = dict(row)
        row["doc_score"] = score
        rows.append(row)
    rows.sort(key=lambda r: (r.get("doc_score", 0), r.get("effective") or date(1900, 1, 1), r.get("text_chars", 0)), reverse=True)
    return rows


def candidate_lines(records):
    lines = []
    for row in useful_records(records):
        text = read_doc_text(row)
        if not text:
            continue
        for line in raw_logical_lines(text):
            line = clean_line(line)
            low = line.lower()
            if not line or len(line) < 10 or len(line) > 520:
                continue
            if line.startswith("--- PAGE") or line.startswith("--- EXTRACTED"):
                continue
            if JUNK_LINE_RE.search(line):
                continue
            if "not stated" in low or "verify callback" in low:
                continue
            if any(bit in low for bit in NOISE_BITS):
                continue
            if "fico score $" in low:
                continue
            if "ltvfico" in low or "advance maximum total ltvfico" in low:
                continue
            if re.search(r"\.{3,}", line):
                continue
            if re.search(r"_{3,}", line):
                continue
            if re.search(r"\.\d{4,}", line):
                continue
            if re.search(r"\b[A-Z]{2,5}-[A-Z0-9]{2,}(?:-[A-Z0-9]{2,})+\b", line) and any(x in low for x in ["approved", "denied", "missing", "product"]):
                continue
            if sum(ch.isalpha() for ch in line) < 7:
                continue
            lines.append({"line": line, "low": low, "doc_score": row.get("doc_score", 0), "title": row.get("title", ""), "title_low": (row.get("title", "") or "").lower()})
    return lines


def contains_keyword(low, keyword):
    keyword = keyword.lower()
    if re.fullmatch(r"[a-z0-9-]+", keyword):
        return re.search(rf"(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])", low) is not None
    return keyword in low


def rank_lines(lines, keywords, max_items=5, require_number=False, allow_negative=True, limit=185, title_any=None, title_none=None):
    scored = []
    seen = set()
    title_any = [x.lower() for x in (title_any or [])]
    title_none = [x.lower() for x in (title_none or [])]
    for item in lines:
        low = item["low"]
        title_low = item.get("title_low", "")
        if title_any and not any(contains_keyword(title_low, x) for x in title_any):
            continue
        if title_none and any(contains_keyword(title_low, x) for x in title_none):
            continue
        if not any(contains_keyword(low, kw) for kw in keywords):
            continue
        if not allow_negative and any(x in low for x in ["not permitted", "not eligible", "will not", "cannot"]):
            continue
        has_number = bool(re.search(r"[$%]|\b\d{2,3}\b|\b\d{1,2}/\d{1,2}/\d{2,4}\b", item["line"]))
        if require_number and not has_number:
            continue
        score = item.get("doc_score", 0) / 7
        score += sum(5 for kw in keywords if contains_keyword(low, kw))
        if has_number:
            score += 5
        if any(x in low for x in ["maximum", "minimum", "required", "must", "eligible", "not permitted", "not eligible", "cannot exceed", "will not fund"]):
            score += 4
        if any(x in low for x in ["fee", "cap", "ltv", "fico", "term", "advance", "residual", "funding checklist"]):
            score += 3
        if any(x in low for x in ["please", "thank", "contact your", "customer may", "account", "membership"]):
            score -= 3
        if any(x in low for x in ["rider", "addendum", "portfolio", "approved ", "denied "]):
            score -= 4
        key = key_for(item["line"])
        if not key or key in seen:
            continue
        seen.add(key)
        scored.append((score, full_text(item["line"])))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [line for _, line in scored[:max_items]]


def first_fact(lines, keywords, require_number=False):
    found = rank_lines(lines, keywords, max_items=1, require_number=require_number, limit=210)
    return found[0] if found else ""


def preferred_fact(label, lines, keywords):
    label_low = label.lower()
    filtered = lines
    if "dealer participation" in label_low:
        filtered = [x for x in lines if "security deposit" not in x["low"]]
    if "fees" in label_low:
        filtered = [x for x in lines if "front-end advance" not in x["low"] and "total ltv" not in x["low"]]
    if "terms" in label_low:
        preferred = rank_lines(filtered, ["12-84 months", "terms up to", "months available", "model year terms"], max_items=1, require_number=True, limit=210)
        if preferred:
            return preferred[0]
    return first_fact(filtered, keywords, require_number=label not in {"Backend / GAP", "Rate rules"})


def program_date(catalog_rows):
    dates = [row.get("effective") for row in catalog_rows if row.get("current", True) and row.get("effective")]
    return max(dates).strftime("%m/%d/%Y") if dates else ""


def detect_states(lines, catalog_rows):
    blob = " ".join(" ".join(str(row.get(k) or "") for k in ("title", "description", "product_type", "section")) for row in catalog_rows if row.get("current", True))
    blob += " " + " ".join(item["line"] for item in lines[:150])
    low = blob.lower()
    if "nationwide" in low or "national" in low:
        if "except" not in low:
            return "National"
    hits = []
    for abbr, name in STATE_NAMES.items():
        if re.search(rf"\b{abbr.lower()}\b", low) or re.search(rf"\b{name.lower()}\b", low):
            hits.append(abbr)
    hits = sorted(set(hits))
    if len(hits) > 18:
        return "Multi-state / national"
    return ", ".join(hits[:24])


def detect_lanes(lines, catalog_rows):
    blob = " ".join(row.get("title", "") + " " + row.get("description", "") for row in catalog_rows)
    low = blob.lower()
    lanes = []
    if any(word in low for word in ["retail", "installment", "auto finance", "franchise program", "consumer", "prime program", "loan program"]):
        lanes.append("Retail")
    if any(word in low for word in ["lease rate", "lease rates", "smartlease", "lease program", "lease guide", "lease guidelines", "lease checklist", "lease funding", "residual value", "residual guide", "dynamic lease", "retail and lease products"]):
        lanes.append("Lease")
    if any(word in low for word in ["business lending", "business retail", "commercial lending", "commercial credit", "small business", "comtrac", "business lease"]):
        lanes.append("Business/Commercial")
    if any(word in low for word in ["fleet", "livery", "rental", "rideshare", "ride share"]):
        lanes.append("Fleet")
    if any(word in low for word in ["cpo", "certified pre-owned", "certified pre owned"]):
        lanes.append("CPO")
    if any(word in low for word in ["motorcycle", "powersport", "rv", "marine"]):
        lanes.append("Powersport/RV/Marine")
    return ", ".join(lanes[:6])


def extract_contacts(lines):
    blob = "\n".join(item["line"] for item in lines)
    phones = re.findall(r"(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}", blob)
    emails = re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", blob, re.I)
    bits = []
    for item in phones[:3] + emails[:3]:
        item = clean_line(item)
        if item not in bits:
            bits.append(item)
    return ", ".join(bits[:4])


def doc_summary(records):
    usable = useful_records(records)
    rate_docs = sum(1 for r in usable if (r.get("section") or "").lower() == "rate sheet")
    funding_docs = sum(1 for r in usable if "funding" in (r.get("title") or "").lower() or "checklist" in (r.get("title") or "").lower())
    guide_docs = sum(1 for r in usable if any(w in (r.get("title") or "").lower() for w in ["guide", "guideline", "program", "reference", "policy"]))
    ocr_pages = sum(len(r.get("ocr_pages", [])) for r in records)
    return f"{len(usable)} usable PDFs reviewed: {rate_docs} rate/program sheets, {funding_docs} funding/checklist docs, {guide_docs} guides/policies, {ocr_pages} OCR pages"


def build_profile(bank, records, catalog_rows):
    lines = candidate_lines(records)
    funding_title_words = ["funding", "checklist"]
    title_title_words = ["title", "titling", "lien", "insurance", "funding", "checklist", "guide"]
    business_title_words = ["business", "commercial", "fleet", "small business", "comtrac", "farm", "ranch"]
    lease_title_words = [
        "lease rate", "lease rates", "smartlease", "lease program", "lease guide",
        "lease guidelines", "lease checklist", "lease funding", "residual",
        "dynamic lease", "lease reference", "retail and lease products",
    ]
    backend_title_bad = ["gap-", "vsc-", "tire", "wheel", "key", "paint", "dent", "theft", "product form"]

    fields = []
    for label, keywords in FIELD_QUERIES:
        value = preferred_fact(label, lines, keywords)
        if value:
            out_label = label
            if label == "Min FICO / score" and not re.search(r"\b[3-8]\d{2}\b", value):
                out_label = "Credit profile"
            fields.append((out_label, value))

    rate = rank_lines(lines, SECTION_KEYWORDS["rate"], max_items=5, require_number=False)
    retail_hard = rank_lines(lines, SECTION_KEYWORDS["hard"], max_items=7, require_number=True)
    lease = rank_lines(lines, SECTION_KEYWORDS["lease"], max_items=7, require_number=False, title_any=lease_title_words, title_none=["lease agreement", "notice", "co-signer", "cosigner", "guaranty form"])
    backend = rank_lines(lines, SECTION_KEYWORDS["backend"], max_items=6, require_number=False, title_none=backend_title_bad)
    business = rank_lines(lines, SECTION_KEYWORDS["business"], max_items=6, require_number=False, title_any=business_title_words)
    funding = rank_lines(lines, SECTION_KEYWORDS["funding"], max_items=8, require_number=False, title_any=funding_title_words, title_none=backend_title_bad)
    if not funding:
        funding = rank_lines(lines, ["funding", "contract package", "required documents", "will not fund", "missing stip"], max_items=4, require_number=False, title_any=["guide", "program", "reference"], title_none=backend_title_bad)
    title = rank_lines(lines, SECTION_KEYWORDS["title"], max_items=6, require_number=False, title_any=title_title_words, title_none=backend_title_bad)

    lanes = detect_lanes(lines, catalog_rows)
    states = detect_states(lines, catalog_rows)
    contacts = extract_contacts(lines)

    use_for = []
    if retail_hard or fields:
        use_for.append("Retail or consumer structures that match the hard rules and numbers shown on the desking page.")
    if lease:
        use_for.append("Lease structures only when the current lease extract supports the term, mileage, residual, fees, and cap-cost treatment.")
    if business:
        use_for.append("Business or commercial structures when entity name, signer authority, ownership, EIN/W-9, and guaranty rules are clean.")
    if "Powersport/RV/Marine" in lanes:
        use_for.append("Specialty collateral only inside that program's published collateral/rate/funding rules.")
    if not use_for and fields:
        use_for.append("Deals that match the hard rules shown below; this lender publishes limited static program detail.")

    avoid = [
        "Do not stretch past published LTV/advance, term, mileage, score, or backend caps.",
        "Do not deliver with unresolved funding stips, title/lienholder mismatch, expired insurance, wrong VIN, wrong mileage, or unsupported products.",
    ]
    if any("not permitted" in x.lower() or "not eligible" in x.lower() for x in backend + business + funding):
        avoid.append("Watch the explicit 'not permitted/not eligible' rules; those are usually funding cuts or re-contract triggers.")
    if any("trust" in x.lower() and "not" in x.lower() for x in business + retail_hard):
        avoid.append("Trust/entity deals need exact lender permission before contracting.")

    desk_notes = []
    if fields:
        desk_notes.append("Structure from the hard rules first, then add backend only if the deal still fits total advance/LTV.")
    if funding:
        desk_notes.append("Treat funding checklist items as delivery controls; missing signatures, insurance, title, and stips slow funding more than rate errors.")
    if rate:
        desk_notes.append("Use participation/markup rules from the current approval; promotional or subvented deals often reduce or remove markup.")
    if lease:
        desk_notes.append("For leases, lock term, mileage, residual source, money factor, acq/dispo/security deposit, and cap reductions before quote leaves the desk.")
    if business:
        desk_notes.append("For business/commercial, match entity names across app, contract, title, insurance, and guaranty paperwork.")

    return {
        "bank": bank,
        "program_date": program_date(catalog_rows),
        "states": states,
        "lanes": lanes,
        "contacts": contacts,
        "doc_summary": doc_summary(records),
        "use_for": use_for[:4],
        "avoid": avoid[:4],
        "fields": fields[:9],
        "retail_hard": retail_hard[:7],
        "rate": rate[:5],
        "lease": lease[:7],
        "backend": backend[:6],
        "business": business[:6],
        "funding": funding[:8],
        "title": title[:6],
        "desk_notes": desk_notes[:5],
    }


def styles():
    base = getSampleStyleSheet()
    return {
        "cover": ParagraphStyle("Cover", parent=base["Title"], fontName="Helvetica-Bold", fontSize=28, leading=32, alignment=TA_CENTER, textColor=colors.HexColor("#17324D")),
        "cover_sub": ParagraphStyle("CoverSub", parent=base["Normal"], fontName="Helvetica", fontSize=11, leading=14, alignment=TA_CENTER, textColor=colors.HexColor("#334155")),
        "h1": ParagraphStyle("H1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=20, textColor=colors.HexColor("#17324D"), spaceAfter=8),
        "bank": ParagraphStyle("Bank", parent=base["Title"], fontName="Helvetica-Bold", fontSize=19, leading=22, alignment=TA_CENTER, textColor=colors.HexColor("#17324D"), spaceAfter=2),
        "page_label": ParagraphStyle("PageLabel", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=10.5, leading=12.5, alignment=TA_CENTER, textColor=colors.HexColor("#1F4E79"), spaceAfter=4),
        "meta": ParagraphStyle("Meta", parent=base["Normal"], fontName="Helvetica", fontSize=8.6, leading=10.5, alignment=TA_CENTER, textColor=colors.HexColor("#334155"), spaceAfter=5),
        "section": ParagraphStyle("Section", parent=base["Heading3"], fontName="Helvetica-Bold", fontSize=9.8, leading=11.3, textColor=colors.white, backColor=colors.HexColor("#1F4E79"), spaceBefore=6, spaceAfter=3, leftIndent=4),
        "body": ParagraphStyle("Body", parent=base["Normal"], fontName="Helvetica", fontSize=8.5, leading=10.3, alignment=TA_LEFT, textColor=colors.HexColor("#111827")),
        "small": ParagraphStyle("Small", parent=base["Normal"], fontName="Helvetica", fontSize=8.0, leading=9.6, alignment=TA_LEFT, textColor=colors.HexColor("#111827")),
        "th": ParagraphStyle("TH", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.8, leading=9.0, textColor=colors.white, alignment=TA_CENTER),
        "td": ParagraphStyle("TD", parent=base["Normal"], fontName="Helvetica", fontSize=7.8, leading=9.2, alignment=TA_LEFT, textColor=colors.HexColor("#111827")),
        "td_bold": ParagraphStyle("TDBold", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.8, leading=9.2, alignment=TA_LEFT, textColor=colors.HexColor("#111827")),
    }


def table(headers, rows, widths, st, repeat=True):
    data = [[p(h, st["th"]) for h in headers]]
    for row in rows:
        data.append([p(str(cell), st["td"]) for cell in row])
    t = Table(data, colWidths=widths, repeatRows=1 if repeat else 0)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17324D")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#A8B0BB")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F7FA")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def bullet_block(story, title, lines, st):
    clean = []
    seen = set()
    for line in lines:
        line = full_text(line)
        key = key_for(line)
        if not line or key in seen:
            continue
        seen.add(key)
        clean.append("- " + line)
    if not clean:
        return
    story.append(p(title, st["section"]))
    story.append(p_lines(clean, st["body"]))


def facts_table(story, title, pairs, st, width=5.15 * inch):
    rows = [(label, full_text(value)) for label, value in pairs if value]
    if not rows:
        return
    story.append(p(title, st["section"]))
    story.append(table(["Item", "Published Rule / Useful Extract"], rows, [1.35 * inch, width - 1.35 * inch], st))


def build_front(profiles):
    st = styles()
    doc = BaseDocTemplate(str(FRONT_PDF), pagesize=landscape(letter), leftMargin=0.35 * inch, rightMargin=0.35 * inch, topMargin=0.32 * inch, bottomMargin=0.32 * inch)
    width, height = landscape(letter)
    frame = Frame(doc.leftMargin, doc.bottomMargin, width - doc.leftMargin - doc.rightMargin, height - doc.topMargin - doc.bottomMargin)
    doc.addPageTemplates([PageTemplate(id="front", frames=[frame])])
    story = [
        Spacer(1, 1.0 * inch),
        p("ROUTEONE DESKING AND FINANCE PLAYBOOK", st["cover"]),
        Spacer(1, 0.12 * inch),
        p("Two-section lender sheets: Page 1 for desking. Page 2 for finance, funding, stips, products, title, and insurance.", st["cover_sub"]),
        Spacer(1, 0.08 * inch),
        p("Use this as a desk guide: hard limits first, funding controls second, exceptions through the lender approval screen.", st["cover_sub"]),
        PageBreak(),
        p("How To Read This", st["h1"]),
        p_lines([
            "- The guide keeps only facts that help structure, contract, or fund a deal.",
            "- Generic legal form language, marketing text, repeated product form titles, signature blocks, and stale rate programs were removed.",
            "- Missing template fields were not printed. If a lender does not publish a fixed static rule, the guide does not invent one.",
            "- Final lender approval still controls buy rate, stipulations, participation, exceptions, and deal-specific conditions.",
        ], st["body"]),
        Spacer(1, 0.12 * inch),
        p("At A Glance - Bank Fit", st["h1"]),
    ]

    rows = []
    for prof in profiles:
        hard = "; ".join(f"{label}: {value}" for label, value in prof["fields"][:2])
        rows.append([prof["bank"], prof.get("lanes") or "", prof.get("states") or "", short_text(hard, 150), short_text(join_items(prof.get("use_for", [])[:2]), 150)])
    for chunk_start in range(0, len(rows), 12):
        if chunk_start:
            story.append(PageBreak())
            story.append(p("At A Glance - Bank Fit", st["h1"]))
        story.append(table(["Bank", "Program Lanes", "States", "Hard Rules Found", "Best Use"], rows[chunk_start:chunk_start + 12], [1.45 * inch, 1.35 * inch, 1.15 * inch, 3.15 * inch, 3.1 * inch], st))
    doc.build(story)


def add_bank_header(story, profile, page_label, st):
    meta_bits = []
    if profile.get("program_date"):
        meta_bits.append(f"Program date {profile['program_date']}")
    if profile.get("states"):
        meta_bits.append(f"States {profile['states']}")
    if profile.get("lanes"):
        meta_bits.append(f"Lanes {profile['lanes']}")
    story.append(p(profile["bank"].upper(), st["bank"]))
    story.append(p(page_label, st["page_label"]))
    if meta_bits:
        story.append(p(" | ".join(meta_bits), st["meta"]))
    if profile.get("contacts"):
        story.append(p(f"Useful contact data found: {profile['contacts']}", st["meta"]))


def build_bank_pdf(profile):
    st = styles()
    out = TMP_DIR / f"{clean_part(profile['bank'])}.pdf"
    doc = BaseDocTemplate(str(out), pagesize=landscape(letter), leftMargin=0.48 * inch, rightMargin=0.48 * inch, topMargin=0.33 * inch, bottomMargin=0.33 * inch)
    width, height = landscape(letter)
    frame_w = width - doc.leftMargin - doc.rightMargin
    frame_h = height - doc.topMargin - doc.bottomMargin
    doc.addPageTemplates([PageTemplate(id="bank", frames=[Frame(doc.leftMargin, doc.bottomMargin, frame_w, frame_h, id="main")])])

    story = []
    add_bank_header(story, profile, "PAGE 1 - DESKING: retail, lease, rate, reserve, business/commercial structure", st)
    facts_table(
        story,
        "Desk Fit",
        [
            ("Use this lender for", join_items(profile.get("use_for", []))),
            ("Do not force", join_items(profile.get("avoid", [])[:2])),
        ],
        st,
        width=frame_w,
    )
    facts_table(story, "Hard Rules / Numbers", profile.get("fields", [])[:9], st, width=frame_w)
    bullet_block(story, "Retail / Structure", profile.get("retail_hard", [])[:6], st)
    bullet_block(story, "Rate / Reserve", profile.get("rate", [])[:5], st)
    bullet_block(story, "Lease", profile.get("lease", [])[:6], st)
    bullet_block(story, "Business / Commercial", profile.get("business", [])[:6], st)

    story.append(PageBreak())
    add_bank_header(story, profile, "PAGE 2 - FINANCE: products, funding, stips, title, insurance, deal controls", st)
    bullet_block(story, "Accepted Products / Backend Limits", profile.get("backend", [])[:7], st)
    bullet_block(story, "Funding Package / Stipulations", profile.get("funding", [])[:8], st)
    bullet_block(story, "Title / Insurance / Lienholder", profile.get("title", [])[:7], st)
    bullet_block(story, "Finance Manager Controls", profile.get("desk_notes", []) + profile.get("avoid", [])[2:], st)

    doc.build(story)
    return out


def merge(bank_paths):
    writer = PdfWriter()
    front = PdfReader(str(FRONT_PDF))
    for page in front.pages:
        writer.add_page(page)
    writer.add_outline_item("Start Here / At A Glance", 0)
    for bank, path in bank_paths:
        start = len(writer.pages)
        reader = PdfReader(str(path))
        for page in reader.pages:
            writer.add_page(page)
        writer.add_outline_item(bank, start)
    with OUT.open("wb") as handle:
        writer.write(handle)
    if DESKTOP_OUT.resolve() != OUT.resolve():
        DESKTOP_OUT.write_bytes(OUT.read_bytes())


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    catalog = load_catalog()
    raw_records = load_records()
    profiles = []
    for bank in sorted(raw_records):
        if bank in SKIP_SOURCES:
            continue
        records = attach_meta(raw_records[bank], catalog.get(bank, []))
        profile = extract = build_profile(bank, records, catalog.get(bank, []))
        if not any([extract["fields"], extract["retail_hard"], extract["rate"], extract["lease"], extract["backend"], extract["business"], extract["funding"], extract["title"]]):
            continue
        profiles.append(extract)
        print(f"extracted {bank}: {len(extract['fields'])} hard facts")
    DATA_OUT.write_text(json.dumps(profiles, indent=2), encoding="utf-8")
    build_front(profiles)
    paths = []
    for profile in profiles:
        path = build_bank_pdf(profile)
        paths.append((profile["bank"], path))
        print(f"built juice section {profile['bank']}")
    merge(paths)
    print(OUT)
    print(DESKTOP_OUT)


if __name__ == "__main__":
    main()
