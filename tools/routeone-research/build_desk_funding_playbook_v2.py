import html
import sys
import csv
import json
import os
import re
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepInFrame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

sys.path.insert(0, str(Path(__file__).resolve().parent))
ROOT = Path(os.environ.get("ROUTEONE_ROOT", Path.cwd() / "data" / "routeone"))
TOOLS_DIR = Path(os.environ.get("ROUTEONE_TOOLS_DIR", ROOT / "_tools"))
if TOOLS_DIR.exists():
    sys.path.insert(0, str(TOOLS_DIR))
try:
    import build_visual_quick_reference as visual
except Exception:
    print(
        "Could not import build_visual_quick_reference; set ROUTEONE_TOOLS_DIR "
        "to the directory containing it."
    )
    raise


OUTPUT_DIR = Path(os.environ.get("ROUTEONE_OUTPUT_DIR", ROOT / "generated"))
DATA = ROOT / "_juice_playbook_extracted_facts.json"
OUT = OUTPUT_DIR / "RouteOne Desk Funding Playbook - Specific.pdf"
DESKTOP_OUT = OUT
MATRIX_CSV = OUTPUT_DIR / "RouteOne Bank Question Matrix.csv"
DESKTOP_MATRIX_CSV = MATRIX_CSV
LINE_BY_LINE_PATH = ROOT / "_line_by_line_verified_detail.csv"

CALL_LENDER_PREFIX = "CALL LENDER FOR EXACT RULE (NO FORMAL LIMIT PUBLISHED)"
CALLBACK_SLOT = "?"
CALLBACK_QUESTION_PREFIX = "CALL LENDER FOR EXACT"
CALLBACK_LINE = ""
MISSING_QUESTION_PLACEHOLDER = "?"
BLANK_FIELD_MARKER = ""
INCLUDE_PREP_PAGES = False
PASS1_LIMIT = 160
PASS2_LIMIT = 150
CARD_MAX_ITEMS = 6
CARD_BODY_FONT = 14.0


DOC_QUALIFIERS = [
    "Required",
    "Wet Signature Required",
    "Electronic Signature Accepted",
    "Original Required",
    "Copy Accepted",
    "Upload Format",
]

PACKAGE_DOCS = [
    ("Retail Installment Contract", ["retail installment", "retail installment contract", "ric"]),
    ("Lease Agreement", ["lease agreement", "lease"]),
    ("Credit Application", ["credit application", "credit app", "credit application"]),
    ("Buyer's Order", ["buyer's order", "buyers order", "buy order"]),
    ("Menu", ["menu", "menu sheet"]),
    ("Privacy Notice", ["privacy notice", "privacy"]),
    ("OFAC", ["ofac"]),
    ("Red Flags", ["red flags", "red-flag"]),
    ("Risk-Based Pricing Notice", ["risk-based pricing", "risk based pricing", "rbn notice"]),
    ("SSA-89", ["ssa-89", "ssa89"]),
    ("Odometer Statement", ["odometer statement", "odometer disclosure"]),
    ("Power of Attorney", ["power of attorney", "poa"]),
    ("Title Application", ["title application"]),
    ("Insurance", ["insurance", "insurance binder", "insurance application"]),
    ("Agreement to Furnish Insurance", ["agreement to furnish insurance", "agree to furnish insurance", "atfi", "atpi"]),
    ("Trade Title", ["trade title"]),
    ("Trade Registration", ["trade registration"]),
    ("Payoff Authorization", ["payoff authorization", "payoff auth"]),
    ("Lien Release", ["lien release"]),
    ("Business Resolution", ["business resolution"]),
    ("Guaranty", ["guaranty", "guarantor"]),
    ("EIN Letter", ["ein letter", "tax id", "employer identification"]),
]

PACKAGE_DOC_SHORT = {
    "Retail Installment Contract": "RIC",
    "Lease Agreement": "Lease agrmt",
    "Credit Application": "Credit app",
    "Buyer's Order": "Buyer's order",
    "Risk-Based Pricing Notice": "Risk-based notice",
    "Odometer Statement": "Odometer",
    "Power of Attorney": "POA",
    "Title Application": "Title app",
    "Agreement to Furnish Insurance": "ATFI",
    "Trade Registration": "Trade reg",
    "Payoff Authorization": "Payoff auth",
    "Business Resolution": "Business res",
}

PACKAGE_DOC_REQUIREMENT_FIELDS = [
    f"{name} {suffix}"
    for name, _ in PACKAGE_DOCS
    for suffix in DOC_QUALIFIERS
]
FUNDING_PACKAGE_REQUIREMENTS = PACKAGE_DOC_REQUIREMENT_FIELDS

POI_STIP_DOCS = [
    ("Paystub", ["paystub", "pay stub", "pay-stub"]),
    ("Payroll Portal", ["payroll portal", "payroll center"]),
    ("W-2", ["w-2", "w2"]),
    ("Bank Statements", ["bank statements", "bank statement"]),
    ("Offer Letter", ["offer letter"]),
    ("CPA Letter", ["cpa letter"]),
    ("Tax Returns", ["tax return", "tax returns"]),
    ("Employer Letter", ["employer letter"]),
    ("Pension Letter", ["pension letter"]),
    ("Disability Letter", ["disability letter"]),
]

POR_STIP_DOCS = [
    ("Utility Bill", ["utility bill", "utility statements"]),
    ("Lease", ["lease", "rent agreement"]),
    ("Mortgage Statement", ["mortgage statement", "mortgage letter"]),
    ("Bank Statement", ["bank statement", "statement of account"]),
    ("Cell Phone Bill", ["cell phone bill", "cell bill", "wireless bill"]),
    ("Internet Bill", ["internet bill", "cable bill", "internet statement"]),
    ("Credit Card Statement", ["credit card statement"]),
    ("Insurance Statement", ["insurance statement", "proof of insurance"]),
]

CORRECTION_NO_RECONTRACT_FIELDS = [
    "Can Incorrect APR Be Corrected Without Recontracting",
    "Can Incorrect Payment Be Corrected Without Recontracting",
    "Can Incorrect Term Be Corrected Without Recontracting",
    "Can Incorrect Amount Financed Be Corrected Without Recontracting",
    "Can Incorrect VIN Be Corrected Without Recontracting",
    "Can Incorrect Mileage Be Corrected Without Recontracting",
    "Can Incorrect Color Be Corrected Without Recontracting",
    "Can Incorrect Trim Be Corrected Without Recontracting",
    "Can Incorrect Buyer Address Be Corrected Without Recontracting",
    "Can Incorrect Buyer Name Be Corrected Without Recontracting",
    "Can Missing Middle Initial Be Corrected Without Recontracting",
    "Can Wrong Dealer Fee Be Corrected Without Recontracting",
    "Can Wrong Taxes Be Corrected Without Recontracting",
    "Can Wrong Title Fee Be Corrected Without Recontracting",
    "Can Wrong Registration Be Corrected Without Recontracting",
    "Can Missing Signatures Be Corrected Without Recontracting",
    "Can Wrong Product / Backend Be Corrected Without Recontracting",
    "Can Wrong GAP Be Corrected Without Recontracting",
    "Can Wrong Warranty Be Corrected Without Recontracting",
]

CORRECTION_YN_FIELDS = [
    "Can Incorrect APR Be Corrected Without Recontracting",
    "Can Incorrect Payment Be Corrected Without Recontracting",
    "Can Incorrect Term Be Corrected Without Recontracting",
    "Can Incorrect Amount Financed Be Corrected Without Recontracting",
    "Can Incorrect VIN Be Corrected Without Recontracting",
    "Can Incorrect Mileage Be Corrected Without Recontracting",
    "Can Incorrect Color Be Corrected Without Recontracting",
    "Can Incorrect Trim Be Corrected Without Recontracting",
    "Can Incorrect Buyer Address Be Corrected Without Recontracting",
    "Can Incorrect Buyer Name Be Corrected Without Recontracting",
    "Can Missing Middle Initial Be Corrected Without Recontracting",
    "Can Wrong Dealer Fee Be Corrected Without Recontracting",
    "Can Wrong Taxes Be Corrected Without Recontracting",
    "Can Wrong Title Fee Be Corrected Without Recontracting",
    "Can Wrong Registration Be Corrected Without Recontracting",
    "Can Missing Signatures Be Corrected Without Recontracting",
    "Can Wrong Product / Backend Be Corrected Without Recontracting",
    "Can Wrong GAP Be Corrected Without Recontracting",
    "Can Wrong Warranty Be Corrected Without Recontracting",
]

POI_POR_DOCS = {
    "POI": POI_STIP_DOCS,
    "POR": POR_STIP_DOCS,
}


NAVY = colors.HexColor("#12263A")
BLUE = colors.HexColor("#1F5C8B")
TEAL = colors.HexColor("#0F766E")
GREEN = colors.HexColor("#E4F4EA")
CYAN = colors.HexColor("#DFF1FA")
AMBER = colors.HexColor("#FFF3C4")
RED = colors.HexColor("#FAD7D7")
GRAY = colors.HexColor("#F5F7FA")
DARK = colors.HexColor("#111827")
LINE = colors.HexColor("#A7B0BB")
PURPLE = colors.HexColor("#EEF2FF")
juice = visual.juice


RATES_ONLY_SECTIONS = {"rate sheet", "rate", "rate sheet & reference", "residual value guide"}
RATES_TITLE_HINTS = {
    "rate sheet",
    "rates",
    "rate",
    "guideline",
    "guidelines",
    "program",
    "program guide",
    "reference guide",
    "bulletin",
    "residual",
    "matrix",
    "retail guidelines",
    "lease rates",
    "lease pricing",
    "residual guide",
    "pricing specials",
}
FORM_TITLE_NOISE = {
    "form -",
    "agreement",
    "checklist",
    "deed",
    "indemnity",
    "waiver",
    "assignment",
    "law",
    "notice",
    "fca",
    "ssa-89",
    "reference release",
    "lease worksheet",
    "credit card agreement",
    "dealer agreement",
    "ach signup",
    "dealer setup",
    "amendment",
    "funding checklist",
    "special circumstances",
    "credit application",
    "agreement to furnish",
    "indemnity agreement",
}
FORM_FILE_PREFIXES = {
    "form",
    "assignment",
    "deed",
    "waiver",
    "application",
    "agreement",
}


def looks_like_form_name(text):
    if not text:
        return False
    low = str(text).strip().lower()
    if any(low.startswith(prefix) for prefix in FORM_FILE_PREFIXES):
        return True
    if re.search(r"^\d{3}\s+form\b", low):
        return True
    return any(f"{bit} -" in low for bit in FORM_TITLE_NOISE)


def is_rate_doc(row):
    section = (row.get("section") or row.get("sectionKind") or "").lower().strip()
    endpoint = (row.get("endpointType") or "").lower().strip()
    title = (row.get("title") or row.get("pdf_name") or row.get("pdf") or "").lower()
    pdf_name = str(row.get("pdf_name") or row.get("pdf") or "").lower()
    if endpoint:
        if endpoint == "form":
            return False
        if endpoint == "rate":
            return True
    if section:
        if section == "form":
            return False
        if section in RATES_ONLY_SECTIONS:
            return True
    if looks_like_form_name(pdf_name) or looks_like_form_name(title):
        return False
    if re.search(r"\bform\b", title):
        return False
    if re.search(r"^\d{3}\s+rate\s+sheet", title) or re.search(r"^\d{3}\s+rate", title):
        return True
    if re.search(r"^001\s+residual", title):
        return True
    if any(bit in title for bit in FORM_TITLE_NOISE):
        return False
    return any(bit in title for bit in RATES_TITLE_HINTS)


def _safe_effective(row):
    eff = row.get("effective")
    if isinstance(eff, date):
        return eff
    return date(1900, 1, 1)


def select_rate_records(rows):
    selected = [row for row in rows if is_rate_doc(row)]
    if not selected:
        return []
    current = [row for row in selected if row.get("current", True)]
    if current:
        selected = current
    return sorted(
        selected,
        key=lambda row: (_safe_effective(row), row.get("doc_score", 0)),
        reverse=True,
    )


def esc(text):
    return html.escape(str(text or ""), quote=False)


def clean(text):
    text = visual.clean_rule(str(text or ""))
    low = text.lower().strip()
    if (
        not low
        or "no collections/repo/thin-file credit policy was published in this downloaded lender set" in low
        or "do not quote" in low
        or "downloaded routeone set has no" in low
        or "title/lien instruction was not published" in low
        or "downloaded docs" in low
        and "has no" in low
        or "no separate" in low
        or "lane shown, but downloaded docs" in low
        or "approval-only unless hard rule" in low
        or "not shown in this bank's downloaded" in low
        or "no extra stop/watch exception was published" in low
    ):
        return ""
    text = text.replace("veh ", "vehicle ")
    text = text.replace("veh.", "vehicle")
    text = re.sub(r"\bveh\b", "vehicle", text, flags=re.I)
    text = re.sub(r"\bpkg\b", "package", text, flags=re.I)
    text = re.sub(r"\bDL\b", "driver license", text)
    text = re.sub(r"\bBK\b", "bankruptcy", text)
    text = re.sub(r"\bFICO\s*>=", "FICO >=", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip(" -;:,")
    text = re.sub(
        r"No open bankruptcy or unpaid Chase charge[- ]offs\s*[-;]\s*bankruptcy must be discharged",
        "No open bankruptcy or unpaid Chase charge-offs; bankruptcy must be discharged",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"Multiple repos OK except prior Westlake/Wilshire repos not accepted",
        "Multiple repos OK except prior Westlake/Wilshire/Western Funding repo not accepted",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"bankruptcy accepted if dismissed\s*/\s*open bankruptcy must be pre-approved",
        "Dismissed bankruptcy accepted; open bankruptcy needs pre-approval",
        text,
        flags=re.I,
    )
    if re.search(r"\b(?:LTV|advance|max|maximum|front[- ]?end|total)\b.*\b00%", text, flags=re.I):
        return ""
    if re.search(r"^Title/lien:\s*use approval, lienholder setup", text, flags=re.I):
        return ""
    replacements = {
        "Do not quote backend from this sheet; downloaded RouteOne set has no product cap/grid":
            "Backend: quote only from approval/product grid; no cap grid in downloaded docs",
        "No backend/product cap grid was published in this downloaded lender set":
            "Backend: approval/product grid controls; no published cap grid in downloaded docs",
        "Funding checklist was not published in this downloaded RouteOne set":
            "Funding: standard contract/title/insurance package controls",
        "No retail/advance grid was published in this downloaded lender set":
            "Retail limits: approval controls; no separate published advance grid",
        "No lease grid was published in this downloaded lender set":
            "Lease: approval/program controls; no separate lease grid",
        "No business/commercial guide was published in this downloaded lender set":
            "Business: approval/entity docs control; no separate commercial guide",
    }
    return replacements.get(text, text)


def squeeze(text, limit=PASS1_LIMIT):
    text = clean(text)
    text = re.sub(r"\bDownloaded RouteOne set\b", "downloaded docs", text, flags=re.I)
    text = text.replace("vehicle Service", "Vehicle service")
    if len(text) <= limit:
        return text
    parts = visual.split_clauses(text)
    if parts:
        kept = []
        for part in parts:
            trial = "; ".join(kept + [part])
            if len(trial) <= limit:
                kept.append(part)
            elif kept:
                break
        if kept:
            return "; ".join(kept)
    cut = text[:limit].rstrip(" ,;:")
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:")


def unique(items, limit=7):
    out = []
    seen = set()
    for item in items or []:
        if is_callback_marker(item):
            item = clean(item)
        else:
            item = squeeze(item)
        if not item:
            continue
        key = re.sub(r"[^a-z0-9]+", "", item.lower())[:90]
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= limit:
            break
    return out


def is_callback_marker(value):
    return isinstance(value, str) and ("CALL LENDER FOR EXACT" in value or "CALL LENDER FOR EXACT VALUE" in value)


VAGUE_ANSWER_PATTERNS = [
    r"^N/?A$",
    r"^not published$",
    r"^see lender routeone/approval rules$",
    r"^program specific$",
    r"as\s+published",
    r"where\s+allowed",
    r"where\s+applicable",
    r"as\s+applicable",
    r"subject to approval",
    r"subject to contract",
    r"state\s+rules\s+control",
    r"depends\s+on\s+program",
    r"according\s+to\s+routeone\s+approval",
    r"if\s+stated",
    r"must\s+be\s+confirmed",
    r"approval\s*(?:/?)\s*only",
    r"match\s+published\s+program",
    r"published\s+in\s+current\s+rate\s*sheet",
    r"approval\s+sheet\s+controls",
    r"stated\s+in\s+bank",
    r"use\s+the\s+standard\s+stips",
    r"no separate\s+\w+\s+(?:grid|rule|table)\s+in\s+this\s+document",
    r"required\s+when",
    r"required/used\s+when",
    r"required\s+where",
    r"when\s+listed",
    r"as\s+stated\s+in",
    r"depending\s+on\s+(?:credit|vehicle|program|approval|underwriting)",
    r"published\s+in\s+rate",
    r"subject\s+to\s+(?:underwriting|approval|program)",
    r"per\s+lender",
    r"per\s+rate",
    r"program\s+guidance",
    r"approval\s*[-/]?\s*stips",
    r"if\s+listed",
    r"as\s+needed",
    r"as\s+approved",
    r"as\s+stated\s+in\s+the\s+program",
    r"contact\s+analyst\s+for",
    r"approved\s+in\s+policy",
]


def is_vague_answer(value):
    if not isinstance(value, str):
        return True
    low = value.strip()
    if not low:
        return True
    if is_callback_marker(low):
        return False
    low_l = low.lower()
    for marker in VAGUE_ANSWER_PATTERNS:
        if re.search(marker, low_l, re.I):
            return True
    if low_l in {"y", "n"}:
        return False
    if low_l in {"required", "not required", "required if stated", "see docs", "listed", "may be required"}:
        return True
    if re.search(r"\brequired\s+when\s", low_l, flags=re.I):
        return True
    if low_l.startswith("published in") or low_l.startswith("per lender") or low_l.startswith("if program"):
        return True
    if len(re.sub(r"[a-z0-9%$,./-]", "", low_l)) >= len(low_l) * 0.55:
        return True
    return False


def pick_answer(field, value):
    if is_vague_answer(value):
        return ""
    return squeeze(value)


def callback_item(field, short_label=None, slot=CALLBACK_SLOT):
    label = short_label or SHORT_FIELD_LABELS.get(field, field)
    return f"{label}: {slot or MISSING_QUESTION_PLACEHOLDER}"


def field_callback(field):
    label = SHORT_FIELD_LABELS.get(field, field)
    return f"{label}: {MISSING_QUESTION_PLACEHOLDER}"


def compact_question(field):
    question = question_for_field(field)
    question = re.sub(r"^What is the exact\s+", "", question, flags=re.I)
    question = re.sub(r"^What is the\s+", "", question, flags=re.I)
    question = re.sub(r"^What is\s+", "", question, flags=re.I)
    question = re.sub(r"^What are the exact\s+", "", question, flags=re.I)
    question = re.sub(r"^What are the\s+", "", question, flags=re.I)
    question = question.strip()
    if question and question[0].islower():
        question = question[0].upper() + question[1:]
    return question


def question_for_field(field):
    if field in QUESTION_TEXT_OVERRIDES:
        return QUESTION_TEXT_OVERRIDES[field]
    return f"What is the exact {field.lower()}?"


def styles():
    base = getSampleStyleSheet()
    return {
        "cover": ParagraphStyle("Cover", parent=base["Title"], fontName="Helvetica-Bold", fontSize=26, leading=30, alignment=TA_CENTER, textColor=NAVY),
        "subtitle": ParagraphStyle("Subtitle", parent=base["Normal"], fontName="Helvetica", fontSize=13.0, leading=15.2, alignment=TA_CENTER, textColor=colors.HexColor("#334155")),
        "bank": ParagraphStyle("Bank", parent=base["Title"], fontName="Helvetica-Bold", fontSize=18.0, leading=20.5, alignment=TA_CENTER, textColor=NAVY, spaceAfter=1),
        "meta": ParagraphStyle("Meta", parent=base["Normal"], fontName="Helvetica", fontSize=11.2, leading=13.0, alignment=TA_CENTER, textColor=colors.HexColor("#334155")),
        "band": ParagraphStyle("Band", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=13.8, leading=15.4, alignment=TA_CENTER, textColor=colors.white),
        "section": ParagraphStyle("Section", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=12.0, leading=13.8, alignment=TA_CENTER, textColor=colors.white),
        "body": ParagraphStyle("Body", parent=base["Normal"], fontName="Helvetica", fontSize=CARD_BODY_FONT, leading=14.4, alignment=TA_LEFT, textColor=DARK),
        "small": ParagraphStyle("Small", parent=base["Normal"], fontName="Helvetica", fontSize=11.4, leading=13.2, alignment=TA_LEFT, textColor=DARK),
        "label": ParagraphStyle("Label", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=11.2, leading=13.0, alignment=TA_LEFT, textColor=NAVY),
        "chip": ParagraphStyle("Chip", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=11.0, leading=12.5, alignment=TA_CENTER, textColor=NAVY),
    }


def para(text, style):
    return Paragraph(esc(text), style)


def bullet_block(items, style, width, height, limit=CARD_MAX_ITEMS):
    items = unique(items, limit=limit)
    if not items:
        items = ["?"]
    text = "<br/>".join("- " + esc(item) for item in items)
    block = Paragraph(text, style)
    return KeepInFrame(width, height, [block], mode="shrink", hAlign="LEFT", vAlign="TOP")


def card(title, items, st, width, height, title_bg=BLUE, body_bg=colors.white, max_items=7):
    body_height = max(height - 0.24 * inch, 0.30 * inch)
    body = bullet_block(unique(items, max_items), st["body"], width - 0.12 * inch, body_height, limit=max_items)
    table = Table(
        [[para(title.upper(), st["section"])], [body]],
        colWidths=[width],
        rowHeights=[0.24 * inch, body_height],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), title_bg),
        ("BACKGROUND", (0, 1), (-1, 1), body_bg),
        ("BOX", (0, 0), (-1, -1), 0.55, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table


def band(text, st, width, bg=BLUE):
    table = Table([[para(text, st["band"])]], colWidths=[width], rowHeights=[0.27 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.4, bg),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return table


def row(cards, widths):
    table = Table([cards], colWidths=widths)
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table


def short_contact_line(profile, product_contact=None):
    if not product_contact:
        return ""
    items = product_contact.get("contacts") or []
    picks = []
    for prefix in ["Funding:", "Dealer/Underwriting:", "Title/Payoff:", "Collections/Servicing:", "Named Reps:"]:
        for item in items:
            if item.startswith(prefix):
                picks.append(prefix + " " + compact_contact_text(item.split(":", 1)[1]))
                break
    if picks:
        return " | ".join(picks)
    if profile.get("contacts"):
        values = [x.strip() for x in profile["contacts"].split(",") if x.strip()]
        if values:
            return "Contacts (check RouteOne profile): " + squeeze(", ".join(values), 110)
    return " | ".join(picks[:2])


def header(profile, st, page_label, product_contact=None):
    meta = []
    if profile.get("program_date"):
        meta.append("Program " + profile["program_date"])
    if profile.get("states"):
        meta.append("States " + visual.states_short(profile))
    contact_line = short_contact_line(profile, product_contact)
    if contact_line:
        meta.append(contact_line)
    elif profile.get("contacts"):
        meta.append("Contacts " + squeeze(profile["contacts"], 140))
    lanes = " | ".join(visual.lane_chips(profile))
    return [
        para(profile["bank"].upper(), st["bank"]),
        para(page_label + "   |   " + lanes, st["meta"]),
        para("   |   ".join(meta), st["meta"]),
        Spacer(1, 0.05 * inch),
    ]


def profile_data(
    profile,
    funding_overrides,
    section_overrides,
    product_contact_overrides,
    credit_exception_overrides,
    verified_by_bank=None,
    rate_rows=None,
    all_rows=None,
):
    rate_rows = list(rate_rows or [])
    all_rows = list(all_rows or [])
    has_rates = bool(rate_rows)
    available_doc_kinds = sorted({
        (row.get("section") or row.get("sectionKind") or "form").strip() for row in all_rows if (row.get("section") or row.get("sectionKind"))
    })
    available_doc_count = len(all_rows)
    rate_titles = []
    if has_rates:
        for row in rate_rows:
            title = (row.get("title") or row.get("pdf_name") or "").strip()
            if title:
                rate_titles.append(clean(title))
    form_only_kinds = [x for x in available_doc_kinds if x.lower() in {"form", "rate", ""}]
    section_override = section_overrides.get(profile["bank"], {}) if has_rates else {}
    funding_override = funding_overrides.get(profile["bank"])
    product_contact = product_contact_overrides.get(profile["bank"], {})
    credit_extra = credit_exception_overrides.get(profile["bank"], [])
    verified = verified_by_bank.get(profile["bank"], {}) if verified_by_bank else {}
    content = (
        visual.profile_content(profile, funding_override=funding_override, section_override=section_override)
        if has_rates else
        {
            "credit": [],
            "retail": [],
            "rate": [],
            "lease": [],
            "business": [],
            "backend": [],
            "funding": [],
            "title": [],
            "red": [],
            "money": [],
            "stips": [],
        }
    )
    if has_rates:
        for section, values in verified.items():
            if section in content and values:
                content[section] = unique((content.get(section) or []) + values, 10)
    # Strict rates-only mode: when no rate documents are available in this pull,
    # don't blend fallback form-driven facts into the two-page playbook.
    if credit_extra:
        content["credit"] = unique(credit_extra + (content.get("credit") or []), 7)
        credit_stops = [
            x for x in credit_extra
            if any(bit in x.lower() for bit in ["not accepted", "not eligible", "no ", "must be discharged", "stop", "avoid", "past", "prior"])
        ]
        content["red"] = unique(credit_stops + (content.get("red") or []), 7)
    else:
        content["credit"] = unique(content.get("credit"), 7)
    if has_rates:
        hard = visual.clean_card_items(section_override.get("hard"), "hard", max_items=7)
    else:
        hard = []
    hard = hard or visual.clean_card_items(profile.get("retail_hard") or [], "hard", max_items=7)
    hard = hard or []
    business = unique(content.get("business"), 6)
    backend = unique(content.get("backend"), 7)
    stips = unique(content.get("stips") or content.get("funding"), 8)
    title = unique(content.get("title"), 6)
    red = unique(content.get("red"), 7)
    money = unique(content.get("money"), 6)
    front_products = unique(product_contact.get("front_products"), 7)
    back_products = unique(product_contact.get("back_products") or backend, 8)
    contact_items = unique(product_contact.get("contacts"), 6)
    return content, unique(hard, 7), business, backend, stips, title, red, money, front_products, back_products, contact_items, product_contact


def contract_match_items(profile, content, red):
    fields = visual.field_dict(profile)
    out = ["Approval must match contract: lender, amount, term, APR/rate, first payment, VIN, mileage"]
    if fields.get("Advance / LTV"):
        out.append("Contract must stay inside approval/LTV: " + squeeze(fields.get("Advance / LTV"), 86))
    for item in red[:2]:
        out.append(item)
    return unique(out, 6)


def product_package_items(backend):
    out = []
    for item in backend:
        low = item.lower()
        if any(x in low for x in ["gap", "warranty", "service", "maintenance", "tire", "wheel", "backend", "ancillary", "accessor", "product"]):
            out.append(item)
    out.append("If product sold: include signed product contract/certificate and keep price inside approval")
    out.append("If product is not allowed or exceeds cap: cut it before contracting")
    return unique(out, 7)


PHONE_RE = re.compile(r"(?:\+?1[\s.-])?(?:\(\d{3}\)\s*|\d{3}[\s.-])\d{3}[\s.-]\d{4}")
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
NAME_RE = re.compile(r"^[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,2}$")

CONTACT_LABEL_RE = re.compile(r"^(?P<label>[^:]+):\s*(?P<rest>.*)$")
CONTACT_SEPARATOR_RE = re.compile(r"^(?P<label>.+?)\s*[-–—]\s*(?P<rest>.*)$")

CONTACT_ROLE_PATTERNS = {
    "Funding": [
        "funding", "booking", "bookings", "funding hotline", "funding fax", "funding email", "funding assistance",
        "funding team", "funding docs", "funding inquiries", "funding support", "funding phone", "funding department",
        "funding desk", "funding center", "loan approval center", "credit support center", "approval center",
    ],
    "Dealer/Underwriting": [
        "dealer support", "dealer services", "underwriting", "credit department", "credit phone",
        "credit admin", "loan officer", "loan officers", "originations", "dealer support services",
        "dealership hotline", "indirect dealership hotline", "dealer hotline", "support", "relationship manager",
        "dealer portal", "dealer account", "dealer account", "funder", "dealer representative", "underwriting support",
    ],
    "Title/Payoff": [
        "payoff", "title", "lien", "lienholder", "title inquiry", "title inquiries", "title holder",
        "trade title", "title release", "payoffs", "electronic lien", "out-of-state title", "out of state title",
        "titleholder", "lien agent", "lienholder name", "title documents", "title documents only",
    ],
    "Collections/Servicing": [
        "collection", "collections", "servicing", "customer account", "customer account inquiries",
        "post funding", "loan servicing", "customer account inquiries", "customer account", "account status",
        "payoff quote", "payoff quotes", "payoff request", "payment history", "past due",
    ],
}

CONTACT_ROLE_LABELS = {
    "Funding": [
        "funding", "booking", "booking and funding", "funding assistance",
        "funding hotline", "funding fax", "funding email", "funding docs", "funding phone", "funding team", "loan approval center",
        "funding center", "funding inbox", "funding checklist", "funding contact", "funding desk",
    ],
    "Dealer/Underwriting": [
        "dealer support", "credit", "underwriting", "loan officer", "loan officers", "dealer services",
        "originations", "originations support", "dealership hotline", "relationship manager", "sales support",
        "support", "dealer support services", "indirect dealership hotline", "dealer hotline", "dealer portal",
    ],
    "Title/Payoff": [
        "title", "payoff", "lien", "title/ payoff", "payoff and title", "title and payoff", "title release",
        "payoff quote", "title inquiry", "title inquiries", "payoff authorization", "title documents", "lienholder", "lienholder name",
    ],
    "Collections/Servicing": [
        "servicing", "collections", "customer account", "loan servicing", "payoff quote", "payoff quotes",
        "customer account inquiries", "account inquiries", "post funding", "payment history", "delinquency",
    ],
}

CONTACT_NAME_NOISE = {
    "indirect dealership hotline", "dealership hotline", "hotline", "funding hotline",
    "collections", "servicing", "lien", "title", "title holder", "titleholder",
    "dealer support", "dealer services", "underwriting", "credit department",
    "payoff", "general contact", "contact center", "support", "relationship manager",
}


# Keep personal contact overrides in local source documents or a private data
# layer. The public repository intentionally contains no employee email map.
KNOWN_CONTACT_NAMES = {}


def compact_contact_text(text, max_parts=2):
    text = clean(text)
    if not text:
        return ""
    label = ""
    rest = text
    if ":" in text:
        possible_label, possible_rest = text.split(":", 1)
        if 2 <= len(possible_label.strip()) <= 45:
            label = possible_label.strip()
            rest = possible_rest.strip()
    emails = []
    phones = []
    for email in EMAIL_RE.findall(rest):
        if email not in emails:
            emails.append(email)
    for phone in PHONE_RE.findall(rest):
        if phone not in phones:
            phones.append(phone)
    parts = (emails + phones)[:max_parts]
    if parts:
        body = " / ".join(parts)
        return f"{label}: {body}" if label else body
    return squeeze(text, 104)


CONTACT_NOISE = [
    "home phone", "work phone", "cell phone", "phone number", "supervisor", "landlord",
    "applicant", "buyer", "borrower", "dealer representative name", "customer signature",
    "authorized representative", "taxpayer", "irs", "ives", "consent to contact",
    "privacy statement", "privacy policy", "consent to", "social security", "signature", "attestation",
    "customer account", "lienholder", "title holder", "titleholder", "payoff", "collections", "servicing", "underwriting",
    "loan officer", "dealer support", "underwriting support", "relationship manager", "indirect dealership hotline", "funding hotline",
]


def is_contact_noise(text):
    low = text.lower()
    if (PHONE_RE.search(text) or EMAIL_RE.search(text)) and any(
        bit in low
        for bit in [
            "funding", "booking", "dealer", "underwriting", "credit", "originations",
            "title", "payoff", "lien", "collections", "servicing", "support",
        ]
    ):
        return False
    return any(bit in low for bit in CONTACT_NOISE)


def _normalize_role_label(text):
    if not text:
        return ""
    raw = re.sub(r"[^A-Za-z0-9 ]", " ", clean(text).lower())
    return re.sub(r"\s+", " ", raw).strip()


def detect_label_role(label):
    low = _normalize_role_label(label)
    if not low:
        return ""
    for role, terms in CONTACT_ROLE_LABELS.items():
        if any(term in low for term in terms):
            return role
    if low in {"hotline", "indirect dealership hotline", "dealer hotline", "customer hotline"}:
        return "Dealer/Underwriting"
    if low.startswith("payoff") or "payoff" in low:
        return "Title/Payoff"
    return ""


def detect_context_role(text, title=""):
    low = (text + " " + (title or "")).lower()
    for role, terms in CONTACT_ROLE_PATTERNS.items():
        if any(term in low for term in terms):
            return role
    if "general support" in low and "title" not in low and "payoff" not in low:
        return "Dealer/Underwriting"
    return ""


def detect_title_role(title=""):
    return detect_context_role(title or "", "")


def classify_contact_value(token, idx=0):
    low = token.lower()
    if any(x in low for x in ["title", "payoff", "lien", "elt", "trade title", "titleholder"]):
        return "Title/Payoff"
    if any(x in low for x in ["collections", "servicing", "customer account", "delinquency", "past due"]):
        return "Collections/Servicing"
    if any(x in low for x in ["indirect", "dealer", "underwriting", "credit", "loan officer", "underwriter", "origination"]):
        return "Dealer/Underwriting"
    if any(x in low for x in ["funding", "booking", "approval", "dealers", "contract"]):
        return "Funding"
    # For plain phone/email lists when no hint exists, first value defaults to funding,
    # then move to dealer/underwriting contact.
    if idx == 0:
        return "Funding"
    if idx == 1:
        return "Dealer/Underwriting"
    return "Funding"


def normalize_name_text(text):
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text.replace("\t", " ")).strip(" -,:")
    if not text:
        return ""
    text = text.replace(":", "").replace("(", "").replace(")", "").replace("/", " ")
    return " ".join(w for w in (part.strip() for part in text.split()) if w)[:45]


def build_name_from_email(email):
    if "@" not in email:
        return ""
    left = email.split("@", 1)[0].strip()
    if not left:
        return ""
    # Filter obvious role or no-name locals
    if re.fullmatch(r"[0-9]{4,}", left):
        return ""
    parts = re.split(r"[._-]+", left)
    parts = [p for p in parts if p and len(p) > 1 and p.lower() not in {"no", "team", "funding", "credit", "title", "support", "sales", "dealer"}]
    if len(parts) < 2:
        return ""
    words = []
    for p in parts[:3]:
        p = re.sub(r"[^A-Za-z]", "", p)
        if p:
            words.append(p[:1].upper() + p[1:].lower())
    candidate = " ".join(words)
    return candidate if valid_person_name(candidate) else ""


def extract_names_from_text(text):
    if not text:
        return []
    candidates = []
    explicit_patterns = [
        re.compile(
            r"\b(?:attn|attention|contact|contact\s*person|name|rep|representative)\s*[:\-]?\s*([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,2})\b",
            re.I,
        ),
        re.compile(
            r"\b(?:attn|attention|contact|contact\s*person|name|rep|representative)\s+is\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,2})\b",
            re.I,
        ),
        re.compile(
            r"\b([A-Z][A-Za-z'.-]+\s+[A-Z][A-Za-z'.-]+\s*)\s*(?:\(|\[)\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*(?:\)|\])",
            re.I,
        ),
    ]
    for rx in explicit_patterns[:2]:
        for match in rx.finditer(text):
            candidate = normalize_name_text(match.group(1))
            if valid_person_name(candidate) and candidate and candidate not in candidates:
                candidates.append(candidate)
    for match in explicit_patterns[2].finditer(text):
        candidate = normalize_name_text(match.group(1))
        if valid_person_name(candidate) and candidate and candidate not in candidates:
            candidates.append(candidate)
    if not candidates:
        # Capture "Last, First" forms only when the line looks intentionally labeled.
        explicit_name_with_comma = re.search(r"\b([A-Z][A-Za-z'.-]+),\s*([A-Z][A-Za-z'.-]+)\b", text)
        if explicit_name_with_comma:
            candidate = normalize_name_text(f"{explicit_name_with_comma.group(2)} {explicit_name_with_comma.group(1)}")
            if valid_person_name(candidate):
                candidates.append(candidate)
    # Remove duplicates while preserving order.
    return list(dict.fromkeys(candidates))


def valid_person_name(text):
    text = clean(text)
    if not NAME_RE.match(text):
        return False
    parts = text.split()
    for part in parts:
        if part.isupper() and len(part) <= 3:
            return False
        if part.isdigit():
            return False
    if len(parts) == 2 and all(len(part) <= 2 for part in parts):
        return False
    bad = {"Dealer Support", "Customer Support", "Funding Assistance", "Payoff Assistance", "Bank America", "Indirect Dealership Hotline"}
    bad_words = [
        "bank", "credit", "finance", "capital", "support", "dealer", "seller",
        "title", "form", "program", "administrator", "rights", "claims", "attn",
        "email", "online", "phone", "customer", "buyer", "borrower",
        "accounts", "insurance", "consumer", "funding", "contracts", "payoff",
        "lease", "lien", "underwriting", "servicing", "collections", "title", "department",
        "team", "support", "number", "hotline", "contact", "contact us", "direct", "indirect", "dealer",
        "applications", "resources", "hotline", "reminders",
        "sales", "support", "contact number", "payoffs", "titleholder", "title holder",
    ]
    return text not in bad and not any(x in text.lower() for x in bad_words)


def contact_value_from_window(lines, idx):
    window = " ".join(lines[max(0, idx - 2): idx + 3])
    phones = [clean(x) for x in PHONE_RE.findall(window) if not is_contact_noise(window)]
    emails = [
        clean(x) for x in EMAIL_RE.findall(window)
        if not is_contact_noise(window)
        and not any(bad in x.lower() for bad in ["privacy", "aftermarket.products", "noreply", "no-reply"])
    ]
    parts = []
    for value in emails + phones:
        if value and value not in parts:
            parts.append(value)
    return " / ".join(parts[:3])


def contact_name_from_window(lines, idx):
    for j in range(max(0, idx - 4), min(len(lines), idx + 1)):
        candidate = clean(lines[j])
        if is_contact_noise(candidate):
            continue
        names = extract_names_from_text(candidate)
        if names:
            region = ""
            if j < idx:
                mid = clean(lines[j + 1]) if j + 1 <= idx else ""
                if 0 < len(mid) <= 80 and not PHONE_RE.search(mid) and not EMAIL_RE.search(mid):
                    region = f" ({mid})"
            return names[0] + region
    return ""


def infer_role_from_neighbors(lines, idx, title):
    for step in range(0, 4):
        for j in (idx + step, idx - step):
            if j == idx or j < 0 or j >= len(lines):
                continue
            explicit = find_explicit_role(lines[j])
            if explicit:
                return explicit
    window = " ".join(lines[max(0, idx - 4): min(len(lines), idx + 5)])
    context_role = detect_context_role(window, title)
    if context_role:
        return context_role
    title_role = detect_title_role(title)
    if title_role:
        return title_role
    return ""


def compact_contact_item(role, value, name=""):
    label = f"{role}: " if role in {"Funding", "Dealer/Underwriting", "Title/Payoff", "Collections/Servicing", "General"} else ""
    value = clean(value)
    if not value:
        return ""
    if name and name.lower() not in value.lower():
        value = f"{name} - {value}"
    body = compact_contact_text(value)
    return f"{label}{body}" if label else body


def find_explicit_role(line):
    if not line:
        return ""
    m = CONTACT_LABEL_RE.match(line.strip())
    if m:
        role = detect_label_role(m.group("label"))
        if role:
            return role
    m = CONTACT_SEPARATOR_RE.match(line.strip())
    if m:
        role = detect_label_role(m.group("label"))
        if role:
            return role
    return ""


def add_contact(bucket, text, limit=5):
    text = compact_contact_text(text)
    if not text or is_contact_noise(text):
        return
    if text not in bucket:
        bucket.append(text)
    del bucket[limit:]


def add_known_named_contacts(bucket, value, limit=6):
    for email in EMAIL_RE.findall(value or ""):
        name = KNOWN_CONTACT_NAMES.get(email.lower())
        if name:
            add_contact(bucket, f"{name}: {email}", limit=limit)


def extract_contact_items(records, profile):
    rows = records
    buckets = {"Funding": [], "Dealer/Underwriting": [], "Title/Payoff": [], "Collections/Servicing": [], "Named Reps": [], "General": []}
    for row in rows:
        title = (row.get("title") or row.get("pdf_name") or "").lower()
        text = juice.read_doc_text(row)
        if not text:
            continue
        lines = [clean(x) for x in text.splitlines() if clean(x)]
        for i, line in enumerate(lines):
            low = line.lower()
            has_contact = PHONE_RE.search(line) or EMAIL_RE.search(line)
            has_context = any(
                x in low for x in [
                    "funding", "dealer support", "underwriting", "originations", "dealer services",
                    "relationship manager", "representative", "payoff", "payoffs", "title", "title inquiry",
                    "title assistance", "titleholder", "lien", "missing docs", "credit department", "credit", "loan officer",
                    "dealer support services", "collections", "servicing", "customer account", "underwriter", "contact us",
                    "indirect dealership hotline", "dealership hotline", "payoff quote", "payoff quotes", "title documents", "funding packages",
                    "dealer hotline", "loan approval", "approval center", "funding center", "funding desk", "contract package",
                ]
            )
            if not (has_contact or has_context):
                continue
            if is_contact_noise(line):
                continue
            value = contact_value_from_window(lines, i)
            if not value:
                continue
            name = contact_name_from_window(lines, i)
            add_known_named_contacts(buckets["Named Reps"], value)
            if name and (EMAIL_RE.search(value) or PHONE_RE.search(value)):
                add_contact(buckets["Named Reps"], f"{name}: {value}", limit=6)
            explicit_role = find_explicit_role(line)
            context = " ".join(lines[max(0, i - 2): i + 3]) + " " + title
            context_role = explicit_role or infer_role_from_neighbors(lines, i, title) or detect_context_role(context, title)
            if not context_role and has_context:
                context_role = "General"
            if context_role and context_role in {"Funding", "Dealer/Underwriting", "Title/Payoff", "Collections/Servicing"}:
                add_contact(buckets[context_role], f"{name}: {value}" if name else value)
            elif context_role in {"General"}:
                add_contact(buckets["General"], f"{name}: {value}" if name else value)
            elif has_contact:
                # Generic contact data without explicit section context is treated as funding support.
                add_contact(buckets["Funding"], f"{name}: {value}" if name else value)
            for email in EMAIL_RE.findall(value):
                name_hint = build_name_from_email(email)
                if name_hint and context_role in {"Funding", "Dealer/Underwriting", "Title/Payoff", "Collections/Servicing"}:
                    add_contact(buckets[context_role], f"{name_hint}: {value}", limit=6)
        text_low = text.lower()
        for email, name in KNOWN_CONTACT_NAMES.items():
            if email in text_low:
                add_contact(buckets["Named Reps"], f"{name}: {email}", limit=6)

    fallback = [x.strip() for x in (profile.get("contacts") or "").split(",") if x.strip()]
    for idx_fallback, value in enumerate(fallback):
        if not any(value in " ".join(v) for v in buckets.values()):
            role_hint = classify_contact_value(value, idx_fallback)
            if role_hint in buckets:
                add_contact(buckets[role_hint], value, limit=4)
            else:
                add_contact(buckets["General"], value, limit=4)

    items = []
    for label in ["Funding", "Dealer/Underwriting", "Title/Payoff", "Collections/Servicing", "Named Reps", "General"]:
        values = unique(buckets[label], 4 if label != "Named Reps" else 6)
        if values:
            for value in values:
                if value.startswith(label + ":"):
                    item = compact_contact_text(value)
                else:
                    item = f"{label}: {compact_contact_text(value)}"
                if item not in items:
                    items.append(item)
                if len(items) >= 6:
                    break
        if len(items) >= 6:
            break
    if not items:
        items = [
            "Funding: ?",
            "Dealer/Underwriting: ?",
            "Title/Payoff: ?",
            "Collections/Servicing: ?",
        ]
    return unique(items, 6)


FRONT_PRODUCT_PATTERNS = [
    ("Dealer-installed options / DIOs", ["dealer installed option", "dio", "ro/invoice", "r/o", "residualizable dio"]),
    ("Upfit / conversion / mobility equipment", ["upfit", "conversion", "mobility", "braun", "van conversion"]),
    ("Accessories / dealer adds", ["accessories", "dealer adds", "dealer add"]),
    ("Hard-add aftermarket value", ["hard-add", "hard add", "physically added", "customized options", "aftermarket valuation"]),
    ("Factory options / MSRP / Monroney", ["factory option", "manufacturer invoice", "monroney", "window sticker", "msrp"]),
]


BACK_PRODUCT_PATTERNS = [
    ("GAP", ["gap"]),
    ("VSC / ESC / service contract / warranty", ["service contract", "vsc", "esc", "warranty", "mechanical breakdown", "mechanical service"]),
    ("Maintenance", ["maintenance"]),
    ("Tire & wheel", ["tire", "wheel"]),
    ("Key replacement", ["key fob", "key replacement"]),
    ("Etch / theft / catalytic converter", ["etch", "theft", "catalytic"]),
    ("Paint/fabric/leather / appearance", ["paint", "fabric", "leather", "appearance"]),
    ("Paintless dent repair", ["paintless dent", "pdr"]),
    ("Nitrogen tire fill", ["nitrogen"]),
    ("Credit life / A&H / disability", ["credit life", "a&h", "accident", "disability"]),
    ("Vehicle replacement", ["vehicle replacement"]),
]


PRODUCT_DOC_WORDS = [
    "rate", "program", "guideline", "guide", "matrix", "aftermarket", "product",
    "backend", "back-end", "funding", "checklist", "contract verification", "lease",
    "retail", "bulletin", "policy",
]


def useful_product_doc(row):
    title = (row.get("title") or row.get("pdf_name") or "").lower()
    if any(x in title for x in ["privacy", "credit application", "arbitration", "notice to cosigner", "cosigner", "membership appl"]):
        return False
    return any(x in title for x in PRODUCT_DOC_WORDS)


def product_cap_fragment(line):
    line = clean(line)
    low = line.lower()
    m = re.search(r"(\$[\d,]+(?:\.\d{2})?)", line) if any(x in low for x in ["max", "cap", "limit", "allowance", "cannot exceed", "raised from", "up to"]) else None
    pct = re.search(r"(\d{1,3}%)", line) if any(x in low for x in ["max", "cap", "limit", "allowance", "cannot exceed", "up to", "ltv"]) else None
    bits = []
    if m:
        amount = int(re.sub(r"\D", "", m.group(1)) or "0")
        if amount >= 500 or "nitrogen" in low or "new york" in low:
            bits.append(m.group(1))
    if pct:
        bits.append(pct.group(1))
    if "not allowed" in line.lower() or "not permitted" in line.lower() or "not eligible" in line.lower() or "does not finance" in line.lower():
        bits.append("not allowed")
    return " / ".join(bits[:2])


def normalize_product_cap(label, cap):
    if label != "GAP" or not cap:
        return cap
    low = cap.lower()
    amounts = []
    for raw in re.findall(r"\$[\d,]+(?:\.\d{2})?", cap):
        amount = int(re.sub(r"\D", "", raw) or "0")
        if 500 <= amount <= 5000:
            amounts.append(amount)
    if amounts:
        return f"${max(amounts):,}"
    if "not allowed" in low or "not permitted" in low or "not eligible" in low:
        return "not allowed"
    return ""


def add_product(bucket, label, line, limit=8, include_cap=True):
    cap = product_cap_fragment(line) if include_cap else ""
    cap = normalize_product_cap(label, cap)
    item = label if not cap else f"{label}: {cap}"
    if item not in bucket:
        bucket.append(item)
    del bucket[limit:]


def prune_product_items(items):
    items = unique(items, 10)
    out = []
    gap_amounts = []
    gap_blocked = False
    gap_plain = False
    for item in items:
        low = item.lower().strip()
        if low == "gap" or low.startswith("gap:"):
            if "not allowed" in low or "not permitted" in low or "not eligible" in low:
                gap_blocked = True
            amounts = [
                int(re.sub(r"\D", "", raw) or "0")
                for raw in re.findall(r"\$[\d,]+(?:\.\d{2})?", item)
            ]
            gap_amounts.extend(amount for amount in amounts if 500 <= amount <= 5000)
            if not amounts and not gap_blocked:
                gap_plain = True
            continue
        if low in {"gap", "maintenance", "tire & wheel", "vsc / esc / service contract / warranty"}:
            prefix = low + ":"
            if any(other.lower().startswith(prefix) for other in items):
                continue
        out.append(item)
    gap_out = []
    if gap_amounts:
        gap_out.append(f"GAP: ${max(gap_amounts):,}")
    elif gap_plain:
        gap_out.append("GAP")
    if gap_blocked:
        gap_out.append("GAP: not allowed where excluded")
    return unique(gap_out + out, 10)


def extract_product_items(records, profile, backend_items):
    rows = juice.useful_records(records)
    front = []
    back = []
    front_control = False
    back_control = False
    for row in rows:
        if not useful_product_doc(row):
            continue
        text = juice.read_doc_text(row)
        if not text:
            continue
        raw_lines = []
        raw_lines.extend(juice.raw_logical_lines(text))
        raw_lines.extend(text.splitlines())
        for raw in raw_lines:
            line = clean(raw)
            if len(line) < 5:
                continue
            low = line.lower()
            if any(x in low for x in ["customer signature", "dealer signature", "printed name", "administrator phone", "approved routeone", "approved dealertrack"]):
                continue
            if "all aftermarket products sold listed" in low and "section 1" in low:
                add_product(back, "Aftermarket products: list outside vehicle section, product docs required", line)
                back_control = True
            if "aftermarket products document" in low or "ancillary contract" in low:
                add_product(back, "Product contract/certificate required when sold", line)
                back_control = True
            for label, patterns in FRONT_PRODUCT_PATTERNS:
                if any(p in low for p in patterns):
                    if any(x in low for x in ["service contract", "gap", "warranty", "maintenance", "tire", "wheel", "key fob", "paintless dent"]):
                        continue
                    add_product(front, label, line, include_cap=False)
                    front_control = True
                    break
            for label, patterns in BACK_PRODUCT_PATTERNS:
                if any(p in low for p in patterns):
                    if any(x in low for x in ["cap dfi cost", "security deposit", "est. monthly payment", "monthly payment"]):
                        continue
                    if label == "Credit life / A&H / disability" and not any(x in low for x in ["does not finance", "not allowed", "not permitted", "approved", "allowed"]):
                        continue
                    add_product(back, label, line)
                    back_control = True
                    break
    for item in backend_items:
        low = item.lower()
        for label, patterns in BACK_PRODUCT_PATTERNS:
            if any(p in low for p in patterns):
                add_product(back, label, item)
                break
        if "backend" in low or "ancillary" in low or "product" in low:
            add_product(back, item, item)

    if not front:
        front.append("Front products: ?")
    if not back:
        back.append("Back-end products: ?")
    return unique(front, 7), unique(prune_product_items(back), 8)


def build_product_contact_overrides(profiles, records_by_bank):
    profile_by_bank = {p["bank"]: p for p in profiles}
    overrides = {}
    for bank, records in records_by_bank.items():
        profile = profile_by_bank.get(bank)
        if not profile:
            continue
        source_records = select_rate_records(records)
        if not source_records:
            backend_seed = []
        else:
            backend_seed = visual.profile_content(profile).get("backend") or profile.get("backend") or []
        front, back = extract_product_items(source_records, profile, backend_seed)
        if not source_records:
            front = []
            back = []
        contacts = extract_contact_items(source_records, profile)
        overrides[bank] = {"front_products": front, "back_products": back, "contacts": contacts}
    return overrides


CREDIT_DOC_WORDS = [
    "rate", "program", "guideline", "guide", "reference", "policy", "matrix",
    "criteria", "first time buyer", "ftb", "predictable prime", "credit profile",
    "loan application", "application",
]


CREDIT_SKIP_TITLES = [
    "law 553", "retail installment", "lease agreement", "arbitration",
    "notice to cosigner", "notice to co-signer", "co-signer form", "cosigner form",
    "privacy", "ccpa", "ssa-89", "irs", "form8300", "form 8300",
    "adverse action", "fair credit compliance", "voluntary protection products policy",
    "off lease vehicle auction list", "agreement to provide insurance", "title",
    "third party guaranty", "membership appl",
]


CREDIT_LINE_NOISE = [
    "servicing and collection", "collection of personal information", "paperwork reduction",
    "debt collection message", "collection action on such account", "consent to contact",
    "attorneys' fees", "attorney fees", "late fees or collection costs",
    "bankruptcy case", "discharging the lessee", "dealer transactions",
    "vehicle remarketing", "repo "  # auction lists use repo as vehicle disposition.
]


def useful_credit_doc(row):
    title = (row.get("title") or row.get("pdf_name") or "").lower()
    if any(bit in title for bit in CREDIT_SKIP_TITLES):
        return False
    return any(bit in title for bit in CREDIT_DOC_WORDS)


def credit_line_noise(line):
    low = line.lower()
    if any(bit in low for bit in CREDIT_LINE_NOISE):
        if not any(force in low for force in [
            "repossessions in the past", "prior repos", "no repos in last",
            "reposessions not accepted", "repossessions not accepted",
            "multiple repose", "multiple repos",
        ]):
            return True
    if re.search(r"\b\d{4}\s+[A-Z0-9]{8,}\s+\d{4}\b", line) and "repo" in low:
        return True
    return False


def add_credit_fact(out, category, text, score=0):
    text = clean(text)
    if not text or credit_line_noise(text):
        return
    text = re.sub(r"\s+", " ", text).strip(" -;:")
    if len(text) > 118:
        text = squeeze(text, 118)
    if len(text) < 8:
        return
    out.append((category, text, score))


def credit_facts_from_line(line):
    line = clean(juice.clean_line(line))
    low = line.lower()
    out = []
    if not line or len(line) < 8 or credit_line_noise(line):
        return out

    for section, category, fact, score in visual.section_facts_from_line(line):
        if section == "credit":
            add_credit_fact(out, category, fact, score)

    if "aca also considers" in low or ("first time buyers" in low and "chapter 13" in low):
        bits = []
        if "no fico" in low:
            bits.append("No-FICO")
        if "first time buyer" in low or "first time buyers" in low:
            bits.append("FTB")
        if "chapter 13" in low:
            bits.append("Chapter 13")
        if "tax id" in low or "tax ids" in low:
            bits.append("Tax ID")
        if "open chapter 7" in low:
            bits.append("Open Chapter 7")
        if bits:
            add_credit_fact(out, "bankruptcy", "ACA considers: " + " / ".join(bits), 16)

    m = re.search(r"declared bankruptcy in the last\s+(\d+)\s+years?", line, re.I)
    if m:
        add_credit_fact(out, "bankruptcy", f"Application disclosure asks BK declared in last {m.group(1)} yrs", 14)

    m = re.search(r"(?:bankruptcy|bankruptcies|bk).*?(?:past|last)\s+(\d+)\s+(months?|mos?|years?|yrs?)", line, re.I)
    if m:
        unit = "mo" if m.group(2).lower().startswith(("month", "mo")) else "yrs"
        add_credit_fact(out, "bankruptcy", f"BK lookback shown: {m.group(1)} {unit}", 12)

    if "bankruptcy" in low and "must be discharged" in low:
        pass

    if "no major derogatory credit" in low and any(x in low for x in ["bankruptcy", "charge-off", "repossession"]):
        add_credit_fact(out, "derog", "No major derogatory credit: BK, charge-off, repo", 15)

    if re.search(r"<\s*3\s+trade lines", line, re.I) or re.search(r"<\s*4\s+trade lines", line, re.I):
        add_credit_fact(out, "depth", "Limited-file bucket: <3 or <4 tradelines tightens PTI/payment caps", 13)

    m = re.search(r"thin file.*?at least\s+(\d+)\s+trade lines?.*?(?:min(?:imum)?\s*)?(\d+)\s+months?", line, re.I)
    if m:
        add_credit_fact(out, "thin", f"Thin file defined: {m.group(1)} tradelines + {m.group(2)} mo credit history", 16)

    m = re.search(r"min good credit tradelines.*?(\d+)\s+(\d+)\s+(\d+)\s+(\d+).*?open.*?paid", line, re.I)
    if m:
        values = sorted({int(x) for x in m.groups()})
        add_credit_fact(out, "depth", f"Min good tradelines open/paid: {values[-1]}", 13)

    if "open auto" in low and "tradelines may be accepted" in low:
        add_credit_fact(out, "depth", "Open auto/powersport tradeline may be accepted; payoff/trade may be required before funding", 13)

    if "multiple repose" in low or "multiple repos" in low:
        if "westlake" in low or "wilshire" in low:
            add_credit_fact(out, "repo", "Multiple repos OK except prior Westlake/Wilshire/Western Funding repo not accepted", 16)
        else:
            add_credit_fact(out, "repo", "Multiple repos OK when approval terms allow", 12)

    if ("westlake" in low or "wilshire" in low or "western funding" in low) and "reposs" in low and "not accepted" in low:
        add_credit_fact(out, "repo", "Prior Westlake/Wilshire/Western Funding repo not accepted", 16)

    return out


def build_credit_exception_overrides(profiles, records_by_bank):
    profile_banks = {p["bank"] for p in profiles}
    overrides = {}
    for bank, records in records_by_bank.items():
        if bank not in profile_banks:
            continue
        scored = []
        for row in select_rate_records(records):
            if not useful_credit_doc(row):
                continue
            title_low = (row.get("title") or row.get("pdf_name") or "").lower()
            text = juice.read_doc_text(row)
            if not text:
                continue
            raw_lines = []
            raw_lines.extend(juice.raw_logical_lines(text))
            raw_lines.extend(text.splitlines())
            for line in raw_lines:
                for category, fact, score in credit_facts_from_line(line):
                    scored.append((category, fact, score + visual.section_bonus("credit", title_low, row)))
        facts = visual.choose_section_facts(scored, "credit", max_items=7) if scored else []
        if facts:
            overrides[bank] = unique(facts, 7)
    return overrides


def build_rate_funding_overrides(records_by_bank):
    overrides = {}
    for bank, records in records_by_bank.items():
        rows = select_rate_records(records)
        scored = []
        title_scored = []
        red_scored = []
        for row in rows:
            if not visual.funding_doc_relevant(row):
                continue
            title_low = (row.get("title") or "").lower()
            doc_bonus = row.get("doc_score", 0) / 8
            if any(bit in title_low for bit in ["funding", "checklist", "contract rate verification", "verification form"]):
                doc_bonus += 8
            if any(bit in title_low for bit in ["title", "titling", "lien", "insurance"]):
                doc_bonus += 5
            text = juice.read_doc_text(row)
            if not text:
                continue
            raw_lines = []
            raw_lines.extend(juice.raw_logical_lines(text))
            raw_lines.extend(text.splitlines())
            for line in raw_lines:
                for category, fact, score in visual.funding_facts_from_line(line):
                    total_score = score + doc_bonus
                    if category in {"title", "insurance"}:
                        title_scored.append((category, fact, total_score))
                    if category in {"deadline", "red"}:
                        red_scored.append((category, fact, total_score))
                    scored.append((category, fact, total_score))
        facts = visual.choose_funding_facts(
            scored,
            max_items=8,
            categories=["deadline", "stips", "core", "valuation", "product", "lease", "business", "identity", "insurance", "state", "red"],
        )
        title_facts = visual.choose_funding_facts(title_scored, max_items=5, categories=["insurance", "title", "state"])
        red_facts = visual.choose_funding_facts(red_scored, max_items=4, categories=["deadline", "red"])
        if facts or title_facts or red_facts:
            overrides[bank] = {"stips": facts, "title": title_facts, "red": red_facts}
    return overrides


def build_rate_section_overrides(records_by_bank):
    overrides = {}
    for bank, records in records_by_bank.items():
        rows = select_rate_records(records)
        scored = {section: [] for section in visual.SECTION_CATEGORY_ORDER}
        for row in rows:
            if not visual.section_doc_relevant(row):
                continue
            title_low = (row.get("title") or "").lower()
            text = juice.read_doc_text(row)
            if not text:
                continue
            raw_lines = []
            raw_lines.extend(juice.raw_logical_lines(text))
            raw_lines.extend(text.splitlines())
            for line in raw_lines:
                for section, category, fact, score in visual.section_facts_from_line(line):
                    total = score + visual.section_bonus(section, title_low, row)
                    scored[section].append((category, fact, total))
        chosen = {}
        for section, max_items in {
            "credit": 6,
            "retail": 6,
            "lease": 6,
            "business": 5,
            "backend": 6,
            "money": 6,
            "hard": 6,
        }.items():
            facts = visual.choose_section_facts(scored[section], section, max_items=max_items)
            if facts:
                chosen[section] = facts
        if chosen:
            overrides[bank] = chosen
    return overrides


QUESTION_FIELDS = {
    "Credit": [
        "Minimum FICO Score", "Tier 1 Score Range", "Tier 2 Score Range", "Tier 3 Score Range",
        "Tier 4 Score Range", "Lowest Score Ever Considered", "Maximum Number of Open Auto Loans",
        "Minimum Previous Auto Loan Amount ($)", "Minimum Previous Auto Payment ($)",
        "Minimum Previous Auto History (Months)", "Minimum Revolving Tradelines (#)",
        "Minimum Installment Tradelines (#)", "Minimum Total Tradelines (#)",
        "Maximum Credit Inquiries (Last 30 Days)", "Maximum Credit Inquiries (Last 90 Days)",
        "Maximum Credit Utilization (%)", "Minimum Oldest Tradeline (Months)",
        "Minimum Average Age of Credit (Months)",
    ],
    "Bankruptcy - Chapter 7": [
        "Open BK Allowed (Y/N)", "Minimum Months Since Filing", "Minimum Months Since Discharge",
        "Minimum Months Since Dismissal", "Maximum LTV After BK (%)",
        "Minimum Down Payment After BK (%)", "Maximum Term After BK",
        "Auto Loan Included Allowed (Y/N)",
    ],
    "Bankruptcy - Chapter 13": [
        "Open BK Allowed", "Trustee Approval Required", "Minimum Payments Made",
        "Minimum Months Since Discharge", "Minimum Months Since Dismissal",
        "Maximum LTV", "Minimum Down Payment",
    ],
    "Repossession": [
        "Open Repo Allowed", "Minimum Months Since Repo", "Minimum Months Since Voluntary Surrender",
        "Deficiency Balance Must Be Paid (Y/N)", "Multiple Repos Allowed (Y/N)",
        "Maximum Number of Repos", "Repo Included in BK Allowed",
    ],
    "Collections": [
        "Maximum Collection Amount ($)", "Maximum Number of Collections",
        "Medical Collections Excluded (Y/N)", "Maximum Judgment Amount",
        "Maximum Tax Lien Amount", "Child Support Balance Allowed ($)", "Wage Garnishment Allowed",
    ],
    "Employment": [
        "Minimum Monthly Income ($)", "Minimum Annual Income ($)", "Minimum Time on Job (Months)",
        "Minimum Time in Occupation (Months)", "Maximum Employment Gap (Months)",
        "Minimum Self-Employment Time (Years)", "Minimum Bank Statements (Months)",
        "Minimum Tax Returns (Years)",
    ],
    "Income": [
        "Maximum DTI (%)", "Maximum PTI (%)", "Maximum Payment Shock (%)",
        "Maximum Payment Shock ($)", "Overtime Averaging (Months)", "Bonus Averaging (Months)",
        "Commission Averaging (Months)",
    ],
    "Residence": [
        "Minimum Time at Residence", "Maximum Residence Moves (Last 24 Months)",
        "Minimum Utility Bill Age", "Minimum Lease Agreement Length",
    ],
    "Identity": [
        "Driver License Required (Y/N)", "Temporary License Accepted", "Foreign License Accepted",
        "No Driver License Accepted", "Passport Accepted", "State ID Accepted", "Military ID Accepted",
        "Consular ID Accepted", "Minimum Driver License Validity Remaining (Days)", "Minimum Visa Validity Remaining (Months)",
        "Minimum Passport Validity Remaining (Months)", "Identity Mismatch Process", "Fraud Review Triggers",
    ],
    "Immigration": [
        "ITIN Program Available", "Minimum Visa Remaining (Months)", "Minimum EAD Remaining (Months)",
        "Minimum OPT Remaining (Months)", "Minimum H-1B Remaining (Months)", "SSN Required",
    ],
    "Down Payment": [
        "Minimum Down Payment ($)", "Minimum Down Payment (%)", "Maximum Down Payment (%)",
        "Maximum Credit Card Down ($)", "Maximum Third Party Down ($)", "Maximum Gift Funds ($)",
    ],
    "Amount Financed": [
        "Minimum AF", "Maximum AF", "Minimum Loan Amount", "Maximum Loan Amount",
    ],
    "Terms": [
        "Minimum Term", "Maximum Term", "Maximum Term Over $50k", "Maximum Term Over $75k",
        "Maximum Term Over $100k", "Maximum Term by Mileage", "Maximum Term by Vehicle Age",
    ],
    "Vehicle": [
        "Maximum Vehicle Age", "Maximum Mileage", "Minimum Vehicle Value", "Maximum Vehicle Value",
        "Maximum MSRP", "Maximum Invoice", "Maximum Book Value", "Maximum Advance (%)",
        "Branded Title Allowed", "Rebuilt Title Allowed", "Salvage Title Allowed",
        "Total Loss Vehicle Allowed", "Lemon/Buyback Allowed", "Flood/Frame Damage Allowed",
    ],
    "LTV": [
        "Maximum Front-End LTV", "Maximum Total LTV", "Maximum Backend LTV", "Maximum GAP",
        "Maximum Warranty", "Maximum Accessories", "Maximum Dealer Adds",
        "Maximum Negative Equity ($)", "Maximum Negative Equity (%)",
    ],
    "Lease": [
        "Base Money Factor", "Maximum MF Markup", "Maximum Dealer Participation", "Acquisition Fee",
        "Maximum Acquisition Fee Markup", "Disposition Fee", "Security Deposit",
        "Maximum Security Deposits", "Residual Source", "Residual Adjustment per 1,000 Miles",
        "Residual Adjustment per Term", "Maximum Cap Cost", "Maximum CCR",
    ],
    "Business": [
        "Minimum Ownership (%)", "Owners Required to Sign (%)", "Owners Required to Guarantee (%)",
        "Minimum Time in Business", "Minimum Annual Revenue", "Minimum Business Bank Statements",
        "Minimum Business Tax Returns", "Minimum Business Credit Score",
    ],
    "Commercial": [
        "Maximum Fleet Size", "Maximum GVWR", "Maximum Units", "Maximum Exposure",
        "Maximum Upfit Amount", "Maximum Equipment Amount",
    ],
    "Backend": [
        "Maximum APR Markup", "Maximum Reserve (%)", "Maximum Reserve ($)", "Flat Amount ($)",
        "Maximum GAP ($)", "Maximum VSC ($)", "Maximum Backend ($)", "Maximum Backend (%)",
    ],
    "Insurance": [
        "Maximum Collision Deductible", "Maximum Comprehensive Deductible", "Minimum Liability Limits",
    ],
    "Funding": [
        "Maximum POI Age (Days)", "Maximum POR Age (Days)", "Maximum Insurance Binder Age (Days)",
        "Maximum Payoff Age (Days)", "Maximum Approval Age Before Funding (Days)",
        "Maximum Contract Age Before Funding (Days)", "Maximum Title Submission Time (Days)",
        "Funding Delivery Address",
        "Maximum Driver's License Age After Renewal",
        "Maximum Appraisal Age",
    ],
    "Funding Detail": [
        "Digital Funding", "Paper Funding",
        "Wet Signature Required", "Original Required", "Copy Accepted", "POR Trigger",
        "Autopay Document", "Funding Delivery Method",
        "Maximum Upload Size", "Accepted Upload Formats",
        "Hybrid Contract Accepted",
        "Electronic Funding",
        "Paper Document Acceptance",
    ],
    "Funding Timeline": [
        "Maximum Days from Contract to Funding",
        "Average Funding Time (Days)",
        "Average Funding Review Time (Hours)",
        "Funding Department Hours",
        "Same-day Funding Cutoff Time",
        "Weekend Funding Available",
        "Holiday Funding Available",
        "Time Zone for Funding Cutoff",
    ],
    "Stipulations": [
        "Maximum Driver's License Age After Renewal",
        "Maximum Bank Statement Age",
        "Maximum Paystub Age",
        "Maximum Tax Return Age",
        "Maximum Title Age",
        "Maximum Payoff Age (Days)",
    ],
    "Signatures": [
        "Initials Required",
        "Every Page Signed",
        "Digital Signatures Accepted",
        "DocuSign Accepted",
        "Adobe Sign Accepted",
        "RouteOne eContract Required",
        "Signature Mismatch Tolerance",
        "Power of Attorney Accepted",
        "Remote Signing Accepted",
        "Split Signing Accepted",
    ],
    "Funding Package": [
        "Retail Installment Contract", "Lease Agreement", "Credit Application", "Buyer's Order",
        "Menu", "Privacy Notice", "OFAC", "Red Flags", "Risk-Based Pricing Notice", "SSA-89",
        "Odometer Statement", "Power of Attorney", "Title Application", "Insurance",
        "Agreement to Furnish Insurance", "Trade Title", "Trade Registration", "Payoff Authorization",
        "Lien Release", "Business Resolution", "Guaranty", "EIN Letter",
        *FUNDING_PACKAGE_REQUIREMENTS,
    ],
    "Corrections & Recontracting": [
        *CORRECTION_NO_RECONTRACT_FIELDS,
    ],
    "Insurance Rules": [
        "Digital Insurance Accepted",
        "Insurance Binder Accepted",
        "Temporary Insurance Accepted",
        "Agreement to Furnish Insurance Accepted",
        "Maximum Deductible",
        "Required Liability Limits",
        "Commercial Insurance Required",
        "Named Insured Requirements",
        "Garaging Address Must Match",
        "Policy Effective Date Requirements",
        "Policy Expiration Minimum",
        "Maximum Collision Deductible",
        "Maximum Comprehensive Deductible",
        "Minimum Liability Limits",
    ],
    "Title Rules": [
        "ELT Required",
        "Paper Title Accepted",
        "Duplicate Title Accepted",
        "Lost Title Affidavit Accepted",
        "Electronic Title Required",
        "Out-of-State Title Accepted",
        "Canadian Title Accepted",
        "Salvage Title Accepted",
        "Rebuilt Title Accepted",
        "Open Title Accepted",
        "Dealer Reassignment Limit",
        "Title Age Limit",
    ],
    "Trade Rules": [
        "Payoff Verification Required",
        "Maximum Payoff Age",
        "Trade Title Required Before Funding",
        "Duplicate Trade Title Accepted",
        "Missing Title Procedure",
        "Electronic Payoff Accepted",
        "Lease Payoff Accepted",
        "Open Recall Restrictions",
        "Trade Inspection Required",
    ],
    "Identity Rules": [
        "Driver License Required (Y/N)",
        "No Driver License Accepted",
        "Passport Accepted",
        "State ID Accepted",
        "Temporary ID Accepted",
        "Foreign ID Accepted",
        "Military ID Accepted",
        "Consular ID Accepted",
        "Identity Mismatch Process",
        "Fraud Review Triggers",
    ],
    "POI Rules": [
        "Paystub Accepted",
        "Payroll Portal Accepted",
        "W-2 Accepted",
        "Bank Statements Accepted",
        "Offer Letter Accepted",
        "CPA Letter Accepted",
        "Tax Returns Accepted",
        "Employer Letter Accepted",
        "Pension Letter Accepted",
        "Disability Letter Accepted",
        "POI Maximum Age (Days)",
        "POI Number Required",
    ],
    "POR Rules": [
        "Utility Bill Accepted",
        "Lease Accepted",
        "Mortgage Statement Accepted",
        "Bank Statement Accepted (POR)",
        "Cell Phone Bill Accepted",
        "Internet Bill Accepted",
        "Credit Card Statement Accepted",
        "Insurance Statement Accepted",
        "POR Maximum Age (Days)",
        "POR Number Required",
    ],
    "eContract": [
        "eContract Available",
        "eContract Required",
        "Hybrid Contract",
        "Maximum Upload Size",
        "Accepted Upload Formats",
    ],
    "Deal Changes": [
        "Maximum Selling Price Change Without Reapproval",
        "Maximum Payment Change Without Reapproval",
        "Maximum Down Payment Change Without Reapproval",
        "Maximum Trade Value Change Without Reapproval",
        "Maximum Payoff Change Without Reapproval",
        "Maximum Backend Change Without Reapproval",
        "Maximum Amount Financed Change Without Reapproval",
        "Maximum APR Change Without Reapproval",
        "Maximum Term Change Without Reapproval",
    ],
    "Funding Exceptions": [
        "Who Can Override Funding Requirements",
        "Documents That Can Be Waived",
        "Corrections Without New Contract",
        "Corrections Requiring Resign",
        "Situations Requiring New Approval",
        "Can Fund Pending One Missing Stip",
        "Can Title Follow Later",
        "Can Payoff Follow Later",
        "Can Insurance Follow Later",
    ],
    "Repurchase Risk": [
        "Dealer Buyback Triggers",
        "Repurchase Demand Triggers",
        "Reserve Chargeback Triggers",
        "First-Payment Default Review Triggers",
        "Dealer Audit Triggers",
    ],
    "Funding Preferences": [
        "Fastest Funding Practices",
        "Top Reason Deals Sit In Funding",
        "Most Common New Finance Manager Mistake",
        "Documents Dealers Forget",
        "Most Common RouteOne Package Error",
        "What Usually Causes Immediate Review Escalation",
    ],
    "Dealer Performance": [
        "Average Funding Time (Days)", "Average Approval Time (Minutes)",
        "Average Manual Review Time (Hours)", "Maximum Recontract Window (Days)",
    ],
    "Hard Stop": [
        "Lowest Credit Score Ever", "Maximum LTV Ever", "Maximum Mileage Ever",
        "Maximum Vehicle Age", "Maximum Negative Equity", "Maximum DTI", "Maximum PTI",
        "Maximum Payment Shock", "Maximum APR Markup", "Maximum Term", "Maximum Amount Financed",
        "Maximum Backend", "Maximum Repo Count", "Maximum Bankruptcy Count",
        "Maximum Collections", "Maximum Charge-Off Amount", "Maximum Foreclosure Count",
        "Branded Title Allowed", "Rebuilt Title Allowed", "Total Loss Vehicle Allowed",
    ],
}


FIELD_TO_CATEGORY = {
    field: category
    for category, fields in QUESTION_FIELDS.items()
    for field in fields
}


def all_question_fields():
    out = []
    for fields in QUESTION_FIELDS.values():
        out.extend(fields)
    return out


NUMERIC_MAX_FIELDS = {
    "Maximum Term", "Maximum AF", "Maximum Amount Financed", "Maximum Loan Amount",
    "Maximum Advance (%)", "Maximum Front-End LTV", "Maximum Total LTV", "Maximum Backend LTV",
    "Maximum GAP", "Maximum GAP ($)", "Maximum Warranty", "Maximum VSC ($)",
    "Maximum Backend", "Maximum Backend ($)", "Maximum Backend (%)", "Maximum Accessories",
    "Maximum Dealer Adds", "Maximum Negative Equity ($)", "Maximum Negative Equity (%)",
    "Maximum Vehicle Age", "Maximum Mileage", "Maximum Mileage Ever", "Maximum LTV Ever",
    "Maximum DTI", "Maximum DTI (%)", "Maximum PTI", "Maximum PTI (%)",
    "Maximum APR Markup", "Maximum Reserve (%)", "Maximum Reserve ($)",
    "Maximum Collision Deductible", "Maximum Comprehensive Deductible", "Maximum Deductible",
    "Maximum Contract Age Before Funding (Days)", "Maximum Approval Age Before Funding (Days)",
    "Maximum POI Age (Days)", "Maximum POR Age (Days)", "POI Maximum Age (Days)", "POR Maximum Age (Days)",
    "Maximum Insurance Binder Age (Days)", "Maximum Payoff Age (Days)",
    "Maximum Title Submission Time (Days)", "Maximum GVWR", "Maximum Fleet Size",
    "Maximum Exposure", "Maximum Units", "Maximum Upfit Amount", "Maximum Equipment Amount",
}

NUMERIC_MIN_FIELDS = {
    "Minimum FICO Score", "Lowest Score Ever Considered", "Lowest Credit Score Ever",
    "Minimum AF", "Minimum Amount Financed", "Minimum Loan Amount", "Minimum Term",
    "Minimum Monthly Income ($)", "Minimum Annual Income ($)", "Minimum Down Payment ($)",
    "Minimum Down Payment (%)", "Minimum Vehicle Value", "Minimum Ownership (%)",
}


def numeric_values(value):
    nums = []
    for raw in re.findall(r"\d+(?:,\d{3})*(?:\.\d+)?", str(value or "")):
        try:
            nums.append(float(raw.replace(",", "")))
        except Exception:
            pass
    return nums


def add_answer(answers, field, value):
    value = squeeze(value, PASS2_LIMIT)
    if is_vague_answer(value):
        return
    if not value:
        return
    current = answers.get(field)
    if not current:
        answers[field] = value
        return
    current_nums = numeric_values(current)
    value_nums = numeric_values(value)
    if current_nums and value_nums:
        if field in NUMERIC_MAX_FIELDS:
            if max(value_nums) > max(current_nums):
                answers[field] = value
            return
        if field in NUMERIC_MIN_FIELDS:
            if min(value_nums) < min(current_nums):
                answers[field] = value
            return
    if value.lower() in current.lower():
        return
    if current.lower() in value.lower():
            answers[field] = value
            return
    if len(current) < 82:
        answers[field] = squeeze(current + " | " + value, PASS2_LIMIT)


def first_match(patterns, text, formatter=None, flags=re.I):
    for pat in patterns:
        m = re.search(pat, text, flags)
        if m:
            return formatter(m) if formatter else m.group(1)
    return ""


def all_numbers(patterns, text, flags=re.I, cast=int):
    nums = []
    for pat in patterns:
        for m in re.finditer(pat, text, flags):
            try:
                nums.append(cast(re.sub(r"[^\d.]", "", m.group(1))))
            except Exception:
                pass
    return nums


def best_money(patterns, text, mode="max"):
    vals = all_numbers(patterns, text, cast=int)
    if not vals:
        return ""
    value = max(vals) if mode == "max" else min(vals)
    return f"${value:,.0f}"


def best_percent(patterns, text, mode="max"):
    vals = all_numbers(patterns, text, cast=float)
    if not vals:
        return ""
    value = max(vals) if mode == "max" else min(vals)
    return f"{value:g}%"


def best_months(patterns, text, mode="max"):
    vals = all_numbers(patterns, text, cast=int)
    if not vals:
        return ""
    value = max(vals) if mode == "max" else min(vals)
    return f"{value} mo"


def normalize_verified_section(raw_section):
    section = (raw_section or "").lower()
    if "credit" in section:
        return "credit"
    if "retail" in section:
        return "retail"
    if "money" in section:
        return "money"
    if "lease" in section:
        return "lease"
    if "business" in section:
        return "business"
    if "product" in section:
        return "backend"
    if "funding" in section or "stip" in section:
        return "stips"
    if "title" in section or "insurance" in section:
        return "title"
    if "stop" in section or "watch" in section:
        return "red"
    return ""


def load_verified_lines_by_bank():
    if not LINE_BY_LINE_PATH.exists():
        return {}
    out = {}
    try:
        with LINE_BY_LINE_PATH.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                bank = (row.get("bank") or row.get("Bank") or "").strip()
                if not bank:
                    continue
                section = normalize_verified_section(row.get("section") or row.get("Section"))
                if not section:
                    continue
                value = clean(row.get("final_playbook_line") or row.get("Final Playbook Line") or "")
                if not value:
                    continue
                bucket = out.setdefault(bank, {})
                bucket.setdefault(section, []).append(value)
    except Exception:
        return {}
    return {bank: {key: unique(values, 9) for key, values in sections.items()} for bank, sections in out.items()}


def doc_blob(profile, records, content, groups):
    parts = []
    if records:
        for _, value in profile.get("fields", []):
            parts.append(value)
    for key in ["retail_hard", "rate", "backend", "funding", "title"]:
        value = profile.get(key)
        if isinstance(value, list):
            parts.extend(value)
        elif value:
            parts.append(value)
    for value in content.values():
        if isinstance(value, list):
            parts.extend(value)
    for value in groups:
        if isinstance(value, list):
            parts.extend(value)
    for row in records:
        title = (row.get("pdf_name") or row.get("title") or "").lower()
        if any(skip in title for skip in ["privacy", "ccpa", "adverse action", "fair credit compliance"]):
            continue
        text = juice.read_doc_text(row)
        if not text:
            continue
        parts.extend(juice.raw_logical_lines(text))
    cleaned = [clean(x) for x in parts if clean(x)]
    return "\n".join(cleaned)


FUNDING_ADDRESS_MARKERS = {
    "funding", "funding package", "mail to", "mailing", "send to", "address", "return to",
    "lien perfection", "title mailing", "title", "payoff", "attn", "attention", "lienholder",
    "loss payee", "delivery", "courier", "addressed to",
    "contract package", "funding checklist", "package to", "send via", "where to send", "payable to", "send by",
}

FUNDING_ADDRESS_PATTERNS = [
    r"\bP\.?\s*O\.?\s*Box\s*\d+[^\n]{0,90}(?:,\s*)?[A-Za-z][^,\n]{0,45},?\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?",
    r"\b(?:P\.?O\.?|PO)\s+Box\s+\d+[^\n]{0,90}(?:,?\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?",
    r"\bPO Box 9005,?\s*Smithtown,?\s*NY\s*11787\b",
    r"\b102 Motor Parkway,?\s*Hauppauge,?\s*NY\s*11788\b",
    r"\bP\.?O\.?\s*Box\s+9005\b.*?\bSmithtown\b.*?\bNY\b.*?\b11787\b",
    r"\b102 Motor Parkway\b.*?\bHauppauge\b.*?\bNY\b.*?\b11788\b",
    r"\b\d{1,5}\s+[A-Za-z0-9 .,'#/-]{4,90}(?:\b(st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|pl|place|pkwy|p\.?k\.?wy|hwy|highway|way)\b)[^\n]{0,60}(?:,\s*[A-Za-z]{2}\s+\d{5}(?:-\d{4})?)",
    r"\b\d{1,5}\s+[A-Za-z0-9 .,'#/-]{4,90}\b(?:,\s*)?(?:[A-Za-z]{2,12}\s+)?(?:[A-Z]{2})?\s+\d{5}(?:-\d{4})?\b",
]


def _normalize_address(value):
    addr = re.sub(r"\s+", " ", clean(value)).strip(" ;,:-")
    return re.sub(r"\s*,\s*", ", ", addr)


def extract_funding_addresses(text):
    lines = [clean(line) for line in text.splitlines() if clean(line)]
    if not lines:
        return []
    out = []
    joined = " ".join(lines).lower()
    if "teachers fcu" in joined:
        for pattern in [
            r"teachers fcu,?\s+po box 9005,?\s*smithtown,?\s*ny\s*11787",
            r"po box 9005,\s*smithtown,\s*ny\s*11787",
            r"102 motor parkway,?\s*hauppauge,?\s*ny\s*11788",
        ]:
            for m in re.finditer(pattern, joined, flags=re.I):
                candidate = _normalize_address(m.group(0))
                if candidate and candidate not in out:
                    out.append("Funding/lienholder address: " + candidate)
    for idx, line in enumerate(lines):
        low = line.lower()
        nearby = " ".join(lines[max(0, idx - 1): min(len(lines), idx + 3)])
        nearby_low = nearby.lower()
        if any(x in low for x in ["send funding packages to", "send retail payoff checks to", "mail payoff", "send payoff checks to"]):
            for step in (1, 2, 3, 4):
                if idx + step >= len(lines):
                    continue
                candidate = re.sub(r"\s+", " ", lines[idx + step]).strip(" -_")
                if not candidate:
                    continue
                if any(x in candidate.lower() for x in ["groovedocs", "must be", "empty", "uploaded", "documents", "to:", "funding", "payoff checks", "send", "returned"]):
                    continue
                if re.search(r"\b(?:P\.?\s*O\.?\s*Box|PO Box|po box|\d{5}|zip)\b", candidate, re.I):
                    addr = re.sub(r"\s+", " ", candidate).strip(" -;,")
                    if addr and addr not in out:
                        out.append(addr)
                        if "send retail payoff checks to" in low:
                            out.append(f"Payoff checks: {addr}")
                elif any(stype in candidate for stype in [",", " Street", " street", " Ave", " ave", " Rd", " rd", " Dr", " dr", " Ln", " ln", " Ct", " ct", " Blv", " blvd", " Pkwy", " pkwy", " Highway", " highway", " way", " WAY"]):
                    addr = re.sub(r"\s+", " ", candidate).strip(" -;,")
                    if addr and addr not in out:
                        out.append(addr)
                        if "send retail payoff checks to" in low:
                            out.append(f"Payoff checks: {addr}")
        if not any(marker in low for marker in FUNDING_ADDRESS_MARKERS):
            continue
        if "phone" in low or "fax" in low or "email" in low:
            continue
        for pattern in FUNDING_ADDRESS_PATTERNS:
            m = re.search(pattern, line, re.I)
            if m:
                addr = re.sub(r"\s+", " ", m.group(0)).strip(" ;,")
                if addr and addr not in out:
                    out.append(addr)
            m = re.search(pattern, nearby, re.I)
            if m:
                addr = re.sub(r"\s+", " ", m.group(0)).strip(" ;,")
                if addr and addr not in out:
                    out.append(addr)
        if "send" in low and "to" in low:
            for step in (1, 2, 3):
                if idx + step >= len(lines):
                    continue
                candidate = re.sub(r"\s+", " ", lines[idx + step]).strip(" -_")
                if not candidate or any(x in candidate.lower() for x in ["payoff", "groovedocs", "grace period", "do not", "empty applications"]):
                    continue
                if any(stype in candidate for stype in [",", "St", "Street", "street", "PO", "PO Box", "POBox", "po box", "Avenue", "Ave", "Road", "Rd", "Drive", "Dr", "Lane", "Ln", "Circle", "Ct", "Way", "Plaza", "Pky", "PKY", "Highway", "Hwy", "St"]):
                    out.append(f"{line}: {candidate}")
                elif len(candidate.split()) >= 4 and any(ch.isdigit() for ch in candidate):
                    out.append(f"{line}: {candidate}")
        if ":" in line:
            head, _ = line.split(":", 1)
            if "address" in head.lower():
                addr = re.sub(r"\s+", " ", head).strip(" -:;")
                if 18 <= len(addr) <= 120 and addr not in out:
                    out.append(addr)
        if "or  " in line and len(nearby) > 40 and any(x in nearby for x in ["street", "avenue", "blvd", "dr", "rd", "ave"]):
            maybe = line
            # Keep plain address lines when they appear in structured context.
            if maybe and maybe not in out:
                out.append(maybe)
        if ("lienholder codes" in low or "lienholder code" in low) and ("address for dmv" in nearby_low or "address for" in nearby_low) and idx + 1 < len(lines):
            candidate = re.sub(r"\s+", " ", lines[idx + 1]).strip(" -_;")
            if candidate and any(x in candidate for x in ["PO Box", "po box", "P O Box", "Motor Parkway", "Motor", "Hauppauge", "Smithtown"]):
                if candidate not in out:
                    out.append(candidate)
            if idx + 2 < len(lines):
                candidate2 = re.sub(r"\s+", " ", lines[idx + 2]).strip(" -_;")
                if candidate2 and any(x in candidate2 for x in ["PO Box", "po box", "P O Box", "Motor Parkway", "Hauppauge", "Smithtown"]):
                    if candidate2 not in out:
                        out.append(candidate2)
            for step in range(1, 6):
                if idx + step >= len(lines):
                    continue
                snippet = re.sub(r"\s+", " ", lines[idx + step]).strip(" -_;")
                if re.search(r"\bPO Box 9005\b.*Smithtown\b.*\bNY\b.*\b11787\b", snippet, re.I) or re.search(r"\b102 Motor Parkway\b.*\bHauppauge\b.*\bNY\b.*\b11788\b", snippet, re.I):
                    if snippet not in out:
                        out.append(snippet)
    return out[:6]


TITLE_BRAND_FIELDS = [
    "Branded Title Allowed",
    "Rebuilt Title Allowed",
    "Salvage Title Allowed",
    "Total Loss Vehicle Allowed",
    "Lemon/Buyback Allowed",
    "Flood/Frame Damage Allowed",
]

TITLE_BRAND_TERMS = {
    "Branded Title Allowed": ["branded title", "branded titled", "branded titles", "title brand"],
    "Rebuilt Title Allowed": ["rebuilt", "reconstructed"],
    "Salvage Title Allowed": ["salvage", "salvaged"],
    "Total Loss Vehicle Allowed": ["total loss", "totaled"],
    "Lemon/Buyback Allowed": ["lemon", "manufacturer buyback", "manufacturer or oem buyback", "oem buyback", "dealer buyback", "buyback"],
    "Flood/Frame Damage Allowed": ["flood", "water damage", "water damaged", "frame damage", "frame damaged", "structural damage", "structural or frame"],
}

TITLE_BRAND_NEGATIVE_BITS = [
    " no ", " not eligible", " ineligible", " not accepted", " not allowed",
    " does not finance", " do not finance", " will not finance", " cannot finance",
    " excluded vehicle", " excluded vehicles",
]

TITLE_BRAND_GAP_NOISE = [
    "gap amount", "gap waiver", "gap insurance", "protected balance",
    "primary insurance company", "insurance settlement", "theft loss",
    "waive the gap", "service contract", "optional product",
]


def _brand_line_parts(text):
    parts = []
    for raw in text.splitlines():
        line = clean(raw)
        if not line:
            continue
        chunks = re.split(r"\s+-\s+|;\s+|\.\s+", line)
        parts.append(line)
        parts.extend(clean(chunk) for chunk in chunks if clean(chunk))
    out = []
    seen = set()
    for part in parts:
        key = re.sub(r"[^a-z0-9]+", "", part.lower())[:120]
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(part)
        if len(out) >= 4000:
            break
    return out


def _brand_negative(line):
    low = f" {line.lower()} "
    return any(bit in low for bit in TITLE_BRAND_NEGATIVE_BITS)


def _brand_gap_noise(line):
    low = line.lower()
    if "no total loss" in low or "totaled vehicles" in low:
        return False
    return any(bit in low for bit in TITLE_BRAND_GAP_NOISE)


def _brand_reason(line, limit=78):
    reason = clean(line)
    reason = re.sub(r"^(?:ineligible|excluded) vehicles?(?: include but not limited to)?[:\s-]*", "", reason, flags=re.I)
    reason = re.sub(r"^examples of ineligible vehicles include[:\s-]*", "", reason, flags=re.I)
    reason = re.sub(r"\bvehicles?\b", "cars", reason, flags=re.I)
    reason = squeeze(reason, limit)
    return reason[:1].lower() + reason[1:] if reason else ""


def _brand_reason_for_field(field, line, review=False):
    low = line.lower()
    if review and field == "Lemon/Buyback Allowed":
        return "contact analyst for eligibility"
    if field == "Branded Title Allowed" and "branded" in low:
        return "branded titled cars excluded"
    if field == "Rebuilt Title Allowed":
        return "no rebuilt title" if "rebuilt" in low else _brand_reason(line)
    if field == "Salvage Title Allowed":
        return "salvage titles/cars ineligible" if "salvage" in low else _brand_reason(line)
    if field == "Total Loss Vehicle Allowed":
        if "no total loss" in low:
            return "no total loss"
        if "totaled" in low:
            return "totaled cars ineligible"
    if field == "Lemon/Buyback Allowed":
        if "lemon" in low or "buyback" in low:
            return "no lemon/manufacturer buyback"
    if field == "Flood/Frame Damage Allowed":
        if "structural or frame" in low or "frame damage" in low or "frame damaged" in low:
            return "no structural/frame damage"
        if "flood" in low or "water damage" in low or "water damaged" in low:
            return "no flood/water damage"
    return _brand_reason(line)


def add_title_brand_answers(answers, text):
    negative_context = 0
    for line in _brand_line_parts(text):
        if _brand_gap_noise(line):
            continue
        low = line.lower()
        if "excluded vehicles" in low or "ineligible vehicles" in low or "examples of ineligible" in low:
            negative_context = 6
        has_brand_term = any(any(term in low for term in terms) for terms in TITLE_BRAND_TERMS.values())
        negative = _brand_negative(line) or (negative_context > 0 and has_brand_term)
        review = "eligibility" in low and ("contact" in low or "analyst" in low)
        for field, terms in TITLE_BRAND_TERMS.items():
            if not any(term in low for term in terms):
                continue
            if review and field == "Lemon/Buyback Allowed":
                add_answer(answers, field, "Review - " + _brand_reason_for_field(field, line, review=True))
            elif negative:
                add_answer(answers, field, "N - " + _brand_reason_for_field(field, line))
            elif review:
                add_answer(answers, field, "Review - " + _brand_reason(line, 72))
        if negative_context > 0:
            negative_context -= 1


NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "fifteen": 15,
    "thirty": 30,
    "forty-five": 45,
    "forty five": 45,
    "sixty": 60,
    "ninety": 90,
}

POI_FIELD_BY_NAME = {
    "Paystub": "Paystub Accepted",
    "Payroll Portal": "Payroll Portal Accepted",
    "W-2": "W-2 Accepted",
    "Bank Statements": "Bank Statements Accepted",
    "Offer Letter": "Offer Letter Accepted",
    "CPA Letter": "CPA Letter Accepted",
    "Tax Returns": "Tax Returns Accepted",
    "Employer Letter": "Employer Letter Accepted",
    "Pension Letter": "Pension Letter Accepted",
    "Disability Letter": "Disability Letter Accepted",
}

POR_FIELD_BY_NAME = {
    "Utility Bill": "Utility Bill Accepted",
    "Lease": "Lease Accepted",
    "Mortgage Statement": "Mortgage Statement Accepted",
    "Bank Statement": "Bank Statement Accepted (POR)",
    "Cell Phone Bill": "Cell Phone Bill Accepted",
    "Internet Bill": "Internet Bill Accepted",
    "Credit Card Statement": "Credit Card Statement Accepted",
    "Insurance Statement": "Insurance Statement Accepted",
}

NEGATIVE_RULE_BITS = [
    "not accepted", "not acceptable", "not allowed", "not eligible", "not permitted",
    "not sufficient", "cannot accept", "cannot be accepted", "will not accept",
    "do not accept", "does not accept", "do not finance", "does not finance",
    "will not finance", "ineligible", "excluded", "prohibited", "no copies",
    "no temporary", "no temp", "no foreign", "no open", "must not",
]

POSITIVE_RULE_BITS = [
    "accepted", "acceptable", "allowed", "eligible", "required", "must", "include",
    "send", "provide", "completed", "signed", "copy", "copies", "upload", "binder",
    "agreement", "statement", "letter", "document", "documents",
]


def number_from_token(token):
    token = clean(token).lower()
    if not token:
        return None
    if token.isdigit():
        return int(token)
    token = token.replace("-", " ")
    return NUMBER_WORDS.get(token)


def compact_reason(line, limit=82):
    line = clean(line)
    line = re.sub(r"^(?:required documents?|documents required|funding package|stipulations?)[:\s-]*", "", line, flags=re.I)
    line = re.sub(r"^(?:o\s+)?examples?[:\s-]*", "", line, flags=re.I)
    return squeeze(line, limit)


def answer_from_line(line):
    reason = compact_reason(line)
    low = f" {line.lower()} "
    if any(bit in low for bit in NEGATIVE_RULE_BITS):
        return "N - " + reason
    if any(bit in low for bit in POSITIVE_RULE_BITS):
        return "Y - " + reason
    return reason


def line_list(text):
    raw = []
    for chunk in re.split(r"[\r\n]+", text or ""):
        line = clean(chunk)
        if not line:
            continue
        raw.append(line)
        for part in visual.split_clauses(line):
            part = clean(part)
            if part and part != line:
                raw.append(part)
    out = []
    seen = set()
    for line in raw:
        key = re.sub(r"[^a-z0-9]+", "", line.lower())[:140]
        if key and key not in seen:
            seen.add(key)
            out.append(line)
    return out


def has_any(low, terms):
    return any(term in low for term in terms)


def has_context_term(low, term):
    if re.fullmatch(r"[a-z]{2,4}", term or ""):
        return re.search(rf"\b{re.escape(term)}\b", low) is not None
    return term in low


def is_context_line(low, context_terms):
    return not context_terms or any(has_context_term(low, term) for term in context_terms)


def add_line_answer(answers, field, line):
    add_answer(answers, field, answer_from_line(line))


def extract_days_from_line(line):
    number = r"(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|thirty|forty[- ]five|sixty|ninety)"
    patterns = [
        rf"(?:dated\s+)?within\s+{number}\s+days?",
        rf"no\s+older\s+than\s+{number}\s+days?",
        rf"not\s+older\s+than\s+{number}\s+days?",
        rf"less\s+than\s+{number}\s+days?\s+old",
        rf"{number}\s+days?\s+old\s+or\s+less",
    ]
    for pat in patterns:
        m = re.search(pat, line, re.I)
        if m:
            return number_from_token(m.group(1))
    return None


def extract_doc_count_from_line(line):
    number = r"(\d{1,2}|one|two|three|four|five|six)"
    patterns = [
        rf"\b{number}\s+(?:most\s+recent\s+)?(?:pay\s*stubs?|paystubs?|statements?|bank\s+statements?|utility\s+bills?|documents?|docs?)\b",
        rf"\b(?:last|most\s+recent)\s+{number}\s+(?:pay\s*stubs?|paystubs?|statements?|bank\s+statements?|utility\s+bills?|documents?|docs?)\b",
    ]
    for pat in patterns:
        m = re.search(pat, line, re.I)
        if m:
            return number_from_token(m.group(1))
    if re.search(r"\btwo\s+most\s+recent\b", line, re.I):
        return 2
    return None


def add_age_and_count(answers, prefix, line):
    days = extract_days_from_line(line)
    if days:
        add_answer(answers, f"{prefix} Maximum Age (Days)", f"{days} days")
        add_answer(answers, f"Maximum {prefix} Age (Days)", f"{days} days")
        if prefix == "POR":
            add_answer(answers, "Minimum Utility Bill Age", f"{days} days")
    count = extract_doc_count_from_line(line)
    if count:
        add_answer(answers, f"{prefix} Number Required", str(count))


def extract_stip_doc_rules(answers, text):
    lines = line_list(text)
    poi_context = ["proof of income", "poi", "income verification", "income stip", "income for", "pay stub pay date", "paystub pay date", "paystub dated", "pay stub dated", "w-2", "w2", "1099", "self-employed", "tax return", "payroll portal"]
    por_context = ["proof of residence", "proof of residency", "por", "residence", "residency", "address", "utility", "mortgage", "rent agreement", "landlord", "cell phone", "internet", "credit card statement"]
    for line in lines:
        low = line.lower()
        if is_context_line(low, poi_context):
            add_age_and_count(answers, "POI", line)
            for label, terms in POI_STIP_DOCS:
                if has_any(low, terms):
                    add_line_answer(answers, POI_FIELD_BY_NAME[label], line)
        if is_context_line(low, por_context):
            add_age_and_count(answers, "POR", line)
            for label, terms in POR_STIP_DOCS:
                if has_any(low, terms):
                    if label == "Lease" and has_any(low, ["smartlease", "motor vehicle lease", "vehicle lease", "leased vehicle", "lease license", "lessee", "lessor", "lease trust", "municipal lease"]):
                        continue
                    if label == "Lease" and not (
                        has_any(low, ["proof of residence", "proof of residency", "residence", "residency", "rent", "landlord"])
                        or re.search(r"\bpor\b", low)
                    ):
                        continue
                    add_line_answer(answers, POR_FIELD_BY_NAME[label], line)
        if "bank statements are not sufficient" in low:
            if "poi" in low or "income" in low:
                add_answer(answers, "Bank Statements Accepted", "N - " + compact_reason(line))
            if "por" in low or "residence" in low:
                add_answer(answers, "Bank Statement Accepted (POR)", "N - " + compact_reason(line))


def extract_identity_rules(answers, text):
    lines = line_list(text)
    mapping = [
        ("Driver License Required (Y/N)", ["driver license", "driver's license", "drivers license", "dl copy"]),
        ("No Driver License Accepted", ["no driver license", "no driver's license", "without driver license"]),
        ("Passport Accepted", ["passport"]),
        ("State ID Accepted", ["state id", "state identification", "government issued id", "government-issued id", "govt id"]),
        ("Temporary ID Accepted", ["temporary id", "temp id", "temporary license", "temp license"]),
        ("Temporary License Accepted", ["temporary license", "temp license"]),
        ("Foreign ID Accepted", ["foreign id", "international id", "foreign identification"]),
        ("Foreign License Accepted", ["foreign license", "international license", "international dl"]),
        ("Military ID Accepted", ["military id"]),
        ("Consular ID Accepted", ["consular id", "matricula"]),
    ]
    for line in lines:
        low = line.lower()
        if not has_any(low, ["id", "license", "passport", "fraud", "red flag", "ofac", "ssa-89", "identity", "mismatch", "social security"]):
            continue
        for field, terms in mapping:
            if has_any(low, terms):
                if field == "Driver License Required (Y/N)" and not has_any(low, ["required", "must", "copy", "valid", "license"]):
                    continue
                add_line_answer(answers, field, line)
        if has_any(low, ["does not match", "mismatch", "name differs", "address differs", "signature mismatch"]):
            add_answer(answers, "Identity Mismatch Process", compact_reason(line))
        if has_any(low, ["fraud", "red flag", "ofac", "ssa-89", "id alert", "identity alert", "credit freeze"]):
            add_answer(answers, "Fraud Review Triggers", compact_reason(line))
            if "ssa-89" in low:
                add_answer(answers, "SSA-89", "Y - " + compact_reason(line))


def extract_insurance_rules(answers, text):
    lines = line_list(text)
    for line in lines:
        low = line.lower()
        if not has_any(low, ["insurance", "binder", "deductible", "loss payee", "garaging", "agreement to furnish", "agreement to provide", "liability", "policy"]):
            continue
        if has_any(low, ["digital insurance", "electronic proof", "online proof", "app proof", "mobile proof"]):
            add_line_answer(answers, "Digital Insurance Accepted", line)
        if "binder" in low:
            add_line_answer(answers, "Insurance Binder Accepted", line)
        if has_any(low, ["temporary insurance", "temp insurance", "temporary binder"]):
            add_line_answer(answers, "Temporary Insurance Accepted", line)
        if has_any(low, ["agreement to furnish", "agreement to provide", "atfi", "atpi"]):
            add_line_answer(answers, "Agreement to Furnish Insurance Accepted", line)
            add_line_answer(answers, "Agreement to Furnish Insurance", line)
        if "commercial insurance" in low:
            add_line_answer(answers, "Commercial Insurance Required", line)
        if has_any(low, ["named insured", "loss payee", "additional insured"]):
            add_answer(answers, "Named Insured Requirements", compact_reason(line))
        if "garaging" in low and "match" in low:
            add_answer(answers, "Garaging Address Must Match", compact_reason(line))
        if "effective date" in low:
            add_answer(answers, "Policy Effective Date Requirements", compact_reason(line))
        if "expiration" in low or "expires" in low:
            add_answer(answers, "Policy Expiration Minimum", compact_reason(line))
        days = extract_days_from_line(line)
        if days and "binder" in low:
            add_answer(answers, "Maximum Insurance Binder Age (Days)", f"{days} days")
    ded = best_money([
        r"deductibles?\s+(?:not\s+to\s+exceed|cannot\s+exceed|may\s+not\s+exceed|maximum|max)\s*(\$?[\d,]+)",
        r"(?:maximum|max)\s*(?:collision|comp(?:rehensive)?|insurance)?\s*deductible\s*(?:of|is|:)?\s*(\$?[\d,]+)",
        r"(\$[\d,]+)\s+(?:maximum|max)\s+deductible",
    ], text)
    if ded:
        add_answer(answers, "Maximum Deductible", ded)
        add_answer(answers, "Maximum Collision Deductible", ded)
        add_answer(answers, "Maximum Comprehensive Deductible", ded)
    liab = first_match([
        r"(?:liability|minimum liability).*?(\d{2,3}/\d{2,3}/\d{2,3})",
        r"(?:liability|minimum liability).*?(\d{2,3},\d{3}/\d{2,3},\d{3})",
    ], text)
    if liab:
        add_answer(answers, "Required Liability Limits", liab)
        add_answer(answers, "Minimum Liability Limits", liab)


def extract_title_rules(answers, text):
    lines = line_list(text)
    mapping = [
        ("ELT Required", ["elt", "electronic lien and title"]),
        ("Electronic Title Required", ["electronic title", "electronic lien", "elt"]),
        ("Paper Title Accepted", ["paper title", "original title"]),
        ("Duplicate Title Accepted", ["duplicate title"]),
        ("Lost Title Affidavit Accepted", ["lost title", "title affidavit"]),
        ("Out-of-State Title Accepted", ["out-of-state title", "out of state title"]),
        ("Canadian Title Accepted", ["canadian title", "canada title"]),
        ("Salvage Title Accepted", ["salvage"]),
        ("Rebuilt Title Accepted", ["rebuilt", "reconstructed"]),
        ("Open Title Accepted", ["open title"]),
    ]
    for line in lines:
        low = line.lower()
        if not has_any(low, ["title", "lien", "elt", "registration", "salvage", "rebuilt", "reconstructed", "canadian", "dealer reassignment", "payoff"]):
            continue
        for field, terms in mapping:
            if has_any(low, terms):
                add_line_answer(answers, field, line)
        if "dealer reassignment" in low or "reassignment" in low:
            add_answer(answers, "Dealer Reassignment Limit", compact_reason(line))
        if "title" in low and "within" in low:
            days = extract_days_from_line(line)
            if days:
                add_answer(answers, "Maximum Title Submission Time (Days)", f"{days} days")
                add_answer(answers, "Title Age Limit", f"{days} days")
        if "payoff" in low and has_any(low, ["verify", "verification", "good through", "valid through"]):
            add_answer(answers, "Payoff Verification Required", compact_reason(line))
            days = extract_days_from_line(line)
            if days:
                add_answer(answers, "Maximum Payoff Age (Days)", f"{days} days")
                add_answer(answers, "Maximum Payoff Age", f"{days} days")
    for source, target in [
        ("Rebuilt Title Allowed", "Rebuilt Title Accepted"),
        ("Salvage Title Allowed", "Salvage Title Accepted"),
        ("Total Loss Vehicle Allowed", "Total Loss Vehicle Allowed"),
    ]:
        if answers.get(source):
            add_answer(answers, target, answers[source])


def package_doc_terms(name, terms):
    if name == "Lease Agreement":
        return ["lease agreement", "motor vehicle lease", "lease contract"]
    if name == "Menu":
        return ["menu", "menu sheet", "menu disclosure"]
    if name == "Insurance":
        return ["proof of insurance", "insurance binder", "insurance card", "full coverage insurance", "agreement to furnish insurance"]
    return terms


def package_line_relevant(line, name, terms):
    low = line.lower()
    if not has_any(low, package_doc_terms(name, terms)):
        return False
    if has_any(low, ["customer signature", "printed name", "sample", "privacy policy", "not required to purchase"]):
        return False
    return has_any(low, [
        "required", "must", "include", "send", "provide", "copy", "original", "signed", "completed",
        "funding", "package", "upload", "fax", "stip", "contract", "title", "insurance", "guaranty",
        "business", "lease", "retail",
    ])


def add_package_doc_rules(answers, text):
    lines = line_list(text)
    upload_formats = []
    for fmt in re.findall(r"\b(PDF|JPE?G|PNG|TIFF?|TIF)\b", text, flags=re.I):
        norm = fmt.upper().replace("JPG", "JPEG")
        if norm not in upload_formats:
            upload_formats.append(norm)
    if upload_formats:
        add_answer(answers, "Accepted Upload Formats", ", ".join(upload_formats))
    for line in lines:
        low = line.lower()
        if "econtract" in low or "e-contract" in low:
            add_answer(answers, "eContract Available", "Y - " + compact_reason(line))
            if "required" in low or "must" in low:
                add_answer(answers, "eContract Required", "Y - " + compact_reason(line))
                add_answer(answers, "RouteOne eContract Required", "Y - " + compact_reason(line))
        if has_any(low, ["digital signature", "electronic signature", "e-sign", "esign", "docusign", "adobe sign"]):
            add_answer(answers, "Digital Signatures Accepted", "Y - " + compact_reason(line))
            if "docusign" in low:
                add_answer(answers, "DocuSign Accepted", "Y - " + compact_reason(line))
            if "adobe sign" in low:
                add_answer(answers, "Adobe Sign Accepted", "Y - " + compact_reason(line))
        if "no copies" in low:
            add_answer(answers, "Copy Accepted", "N - " + compact_reason(line))
        if "original" in low and has_any(low, ["contract", "lease", "credit app", "application"]):
            add_answer(answers, "Original Required", "Y - " + compact_reason(line))
        if "wet" in low and "signature" in low:
            add_answer(answers, "Wet Signature Required", "Y - " + compact_reason(line))
        for name, terms in PACKAGE_DOCS:
            if not package_line_relevant(line, name, terms):
                continue
            value = answer_from_line(line)
            add_answer(answers, name, value)
            add_answer(answers, f"{name} Required", value)
            if has_any(low, ["wet signature", "wet-signed", "ink signature", "original signed"]):
                add_answer(answers, f"{name} Wet Signature Required", "Y - " + compact_reason(line))
            if has_any(low, ["electronic signature", "digital signature", "e-sign", "esign", "docusign", "adobe sign", "econtract", "e-contract"]):
                add_answer(answers, f"{name} Electronic Signature Accepted", "Y - " + compact_reason(line))
            if "original" in low:
                add_answer(answers, f"{name} Original Required", "Y - " + compact_reason(line))
            if has_any(low, ["copy", "copies", "upload", "uploaded", "scan", "scanned", "fax"]):
                copy_value = "N - " + compact_reason(line) if "no copies" in low else "Y - " + compact_reason(line)
                add_answer(answers, f"{name} Copy Accepted", copy_value)
            if upload_formats and has_any(low, ["upload", "uploaded", "file", "format", "pdf", "jpeg", "jpg", "tif", "tiff"]):
                add_answer(answers, f"{name} Upload Format", ", ".join(upload_formats))


CORRECTION_FIELD_TERMS = {
    "Can Incorrect APR Be Corrected Without Recontracting": ["apr", "rate"],
    "Can Incorrect Payment Be Corrected Without Recontracting": ["payment"],
    "Can Incorrect Term Be Corrected Without Recontracting": ["term"],
    "Can Incorrect Amount Financed Be Corrected Without Recontracting": ["amount financed", "finance charge", "cash price"],
    "Can Incorrect VIN Be Corrected Without Recontracting": ["vin"],
    "Can Incorrect Mileage Be Corrected Without Recontracting": ["mileage", "odometer"],
    "Can Incorrect Color Be Corrected Without Recontracting": ["color"],
    "Can Incorrect Trim Be Corrected Without Recontracting": ["trim"],
    "Can Incorrect Buyer Address Be Corrected Without Recontracting": ["address"],
    "Can Incorrect Buyer Name Be Corrected Without Recontracting": ["buyer name", "customer name", "borrower name", "lessee name"],
    "Can Missing Middle Initial Be Corrected Without Recontracting": ["middle initial"],
    "Can Wrong Dealer Fee Be Corrected Without Recontracting": ["dealer fee"],
    "Can Wrong Taxes Be Corrected Without Recontracting": ["tax", "taxes"],
    "Can Wrong Title Fee Be Corrected Without Recontracting": ["title fee"],
    "Can Wrong Registration Be Corrected Without Recontracting": ["registration"],
    "Can Missing Signatures Be Corrected Without Recontracting": ["signature", "signatures", "missing signature"],
    "Can Wrong Product / Backend Be Corrected Without Recontracting": ["product", "backend", "aftermarket", "ancillary"],
    "Can Wrong GAP Be Corrected Without Recontracting": ["gap"],
    "Can Wrong Warranty Be Corrected Without Recontracting": ["warranty", "service contract", "vsc"],
}


def extract_correction_rules(answers, text):
    lines = line_list(text)
    for line in lines:
        low = line.lower()
        if "rates are good" in low or "provided no changes" in low:
            continue
        if not (
            has_any(low, ["correction", "incorrect", "wrong", "error", "mistake", "recontract", "re-contract", "resign", "re-sign", "missing signature", "missing signatures"])
            or re.search(r"\binitialed\b.*\b(?:change|changes|correction|error)\b", low)
        ):
            continue
        if has_any(low, ["recontract", "re-contract", "new contract", "resign", "re-sign", "must resign", "must re-sign"]):
            general = "N - " + compact_reason(line)
            add_answer(answers, "Corrections Requiring Resign", compact_reason(line))
        elif has_any(low, ["initial", "initialed", "correction form", "can correct", "may correct"]):
            general = "Y - " + compact_reason(line)
            add_answer(answers, "Corrections Without New Contract", compact_reason(line))
        else:
            general = compact_reason(line)
        for field, terms in CORRECTION_FIELD_TERMS.items():
            if has_any(low, terms):
                add_answer(answers, field, general)
        if has_any(low, ["new approval", "reapproval", "re-approval"]):
            add_answer(answers, "Situations Requiring New Approval", compact_reason(line))


def extract_question_answers(profile, records, content, hard, business, backend, stips, title, red, money, front_products, back_products):
    text = doc_blob(profile, records, content, [hard, business, backend, stips, title, red, money, front_products, back_products])
    low = text.lower()
    answers = {}

    score_vals = all_numbers([
        r"(?:minimum|min)\s+(?:fico|credit score|cb score|bureau score|credit bureau risk score)\D{0,30}([3-8]\d{2})",
        r"\bFICO\s*(?:>=|>|greater than)\s*([3-8]\d{2})",
        r"\b([3-8]\d{2})\+\s+FICO",
        r"Min FICO:\s*([3-8]\d{2})",
        r"Predictable Prime score\s*([3-8]\d{2})",
    ], text)
    if score_vals:
        add_answer(answers, "Minimum FICO Score", str(min(score_vals)))
        add_answer(answers, "Lowest Score Ever Considered", str(min(score_vals)))
        add_answer(answers, "Lowest Credit Score Ever", str(min(score_vals)))
    if "no fico" in low:
        add_answer(answers, "Lowest Score Ever Considered", "No FICO considered where program allows")
        add_answer(answers, "Lowest Credit Score Ever", "No FICO considered where program allows")

    m = re.search(r"Min FICO:\s*([0-9\s]+)", text, re.I)
    if m:
        scores = [int(x) for x in re.findall(r"\d{1,3}", m.group(1)) if int(x) <= 850]
        for idx, score in enumerate(scores[:4], 1):
            add_answer(answers, f"Tier {idx} Score Range", f"{score}+")

    if "open auto" in low:
        value = first_match([r"Max Open Autos?:\s*(\d+)"], text)
        if value:
            add_answer(answers, "Maximum Number of Open Auto Loans", value)
    if "min 1 paid auto" in low or "min 1 paid auto" in low.replace("minimum", "min"):
        add_answer(answers, "Minimum Previous Auto History (Months)", "1 paid auto or strong tradeline")
    if "paid auto" in low:
        add_answer(answers, "Minimum Installment Tradelines (#)", "Paid auto tradeline where required")
    af_min = first_match([r"minimum amount financed\s*(?:of|:)?\s*\$?([\d,]+)", r"min(?:imum)? amount financed\s*:?\s*\$?([\d,]+)"], text)
    if af_min:
        add_answer(answers, "Minimum AF", f"${af_min}")
        add_answer(answers, "Minimum Amount Financed", f"${af_min}")
    af_max = first_match([r"maximum amount financed\s*(?:of|:)?\s*\$?([\d,]+)", r"max(?:imum)? amount financed\s*:?\s*\$?([\d,]+)"], text)
    if af_max:
        add_answer(answers, "Maximum AF", f"${af_max}")
        add_answer(answers, "Maximum Amount Financed", f"${af_max}")
    min_term = first_match([r"minimum term\s*(?:of|:)?\s*(\d+)\s*months?", r"minimum contract term\s*(?:of|:)?\s*(\d+)\s*months?"], text)
    if min_term:
        add_answer(answers, "Minimum Term", f"{min_term} months")
    max_term = first_match([r"maximum term\s*(?:of|:)?\s*(\d+)\s*months?", r"max(?:imum)? term\s*(?:of|:)?\s*(\d+)\s*months?"], text)
    if max_term:
        add_answer(answers, "Maximum Term", f"{max_term} months")
    coll_count = first_match([r"max(?:imum)? collections\s*(?:allowed)?\s*(?:of|:)?\s*(\d+)", r"maximum number of collections\s*:?\s*(\d+)"], text)
    if coll_count:
        add_answer(answers, "Maximum Number of Collections", coll_count)
    coll_amount = first_match([r"maximum (?:collections?|collections balance)\s*(?:amount|balance)?\s*(?:of|:)?\s*\$?([\d,]+)", r"collections? .*?\$?([\d,]+)\s*(?:max|maximum|hard)"], text)
    if coll_amount:
        add_answer(answers, "Maximum Collection Amount ($)", f"${coll_amount}")
    repo_count = first_match([r"maximum repos?(?:\s+allowed)?\s*(?:of|:)?\s*(\d+)", r"max(?:imum)? number of repos?\s*:?\s*(\d+)"], text)
    if repo_count:
        add_answer(answers, "Maximum Repo Count", repo_count)
    repo_months = first_match([r"minimum months since (?:repo|repossession)\s*(?:is)?\s*:?\s*(\d+)", r"repos(?:s)?\s+must be\s+at\s+least\s+(\d+)\s*months?"], text)
    if repo_months:
        add_answer(answers, "Minimum Months Since Repo", f">{repo_months} mo")
    tl_vals = all_numbers([
        r"(\d+)\s+satisfactory trade lines",
        r"at least\s+(\d+)\s+trade lines",
        r"Min Good Credit Tradelines.*?(\d+)",
    ], text)
    if tl_vals:
        add_answer(answers, "Minimum Total Tradelines (#)", str(max(tl_vals)))
        add_answer(answers, "Minimum Revolving Tradelines (#)", str(max(tl_vals)) if "revolving" in low else "")
    thin = first_match([r"thin file.*?at least\s+(\d+)\s+trade lines?.*?(\d+)\s+months?"], text, lambda m: f"{m.group(1)} tradelines + {m.group(2)} mo history")
    if thin:
        add_answer(answers, "Minimum Total Tradelines (#)", thin)
        add_answer(answers, "Minimum Oldest Tradeline (Months)", re.search(r"(\d+)\s+mo", thin).group(1) + " mo")

    if "open chapter 7" in low or "open bankruptcies accepted" in low or "open must be pre-approved" in low:
        add_answer(answers, "Open BK Allowed (Y/N)", "Y - only if pre-approved/program allows" if "pre-approved" in low else "Y")
        add_answer(answers, "Open BK Allowed", "Y - only if pre-approved/program allows" if "pre-approved" in low else "Y")
    if "no open bankruptcy" in low or "open bk" in low and "avoid" in low:
        add_answer(answers, "Open BK Allowed (Y/N)", "N")
        add_answer(answers, "Open BK Allowed", "N")
    if "chapter 13" in low:
        add_answer(answers, "Open BK Allowed", "Y - Chapter 13 considered where program allows")
    if "discharged bankruptcies accepted" in low or "discharged bankruptcy accepted" in low:
        add_answer(answers, "Minimum Months Since Discharge", "Discharged BK accepted")
    if "bankruptcy must be discharged" in low:
        add_answer(answers, "Minimum Months Since Discharge", "Must be discharged")
    m = re.search(r"dismissed bankruptcies in the past\s+(\d+)\s+months?", text, re.I)
    if m:
        add_answer(answers, "Minimum Months Since Dismissal", f">{m.group(1)} mo")
    m = re.search(r"declared bankruptcy in the last\s+(\d+)\s+years?", text, re.I)
    if m:
        add_answer(answers, "Minimum Months Since Filing", f"disclose/lookback {int(m.group(1)) * 12} mo")
    if "auto loan included" in low and "bankruptcy" in low:
        add_answer(answers, "Auto Loan Included Allowed (Y/N)", "See BK approval terms")

    if "repossession" in low or "repos" in low or "repo " in low:
        if "multiple repos ok" in low or "multiple repose - ok" in low:
            add_answer(answers, "Multiple Repos Allowed (Y/N)", "Y - except prior Westlake/Wilshire/Western Funding repo")
        if "prior repos" in low and ("avoid" in low or "not accepted" in low):
            add_answer(answers, "Open Repo Allowed", "N / avoid")
        m = re.search(r"repossessions?\s+in\s+the\s+past\s+(\d+)\s+month", text, re.I)
        if m:
            add_answer(answers, "Minimum Months Since Repo", f">{m.group(1)} mo")
        m = re.search(r"no\s+repos?\s+in\s+last\s+(\d+)\s+years?", text, re.I)
        if m:
            add_answer(answers, "Minimum Months Since Repo", f">{int(m.group(1)) * 12} mo")
            add_answer(answers, "Maximum Repo Count", "0 inside lookback")
    if "child support" in low:
        add_answer(answers, "Child Support Balance Allowed ($)", "Unpaid child/family support is avoid/stop")
    if "collection" in low and "medical" in low:
        add_answer(answers, "Medical Collections Excluded (Y/N)", "See approval/grid")

    income_money = best_money([r"Min(?:imum)? Income\s*(\$[\d,]+)", r"minimum monthly income\s*(\$[\d,]+)"], text, mode="min")
    if income_money:
        add_answer(answers, "Minimum Monthly Income ($)", income_money)
    dti = best_percent([r"DTI\s*(?:up to|max(?:imum)?)\s*(\d+(?:\.\d+)?)%", r"Max\s+(\d+(?:\.\d+)?)%\s+DTI"], text)
    if dti:
        add_answer(answers, "Maximum DTI (%)", dti)
        add_answer(answers, "Maximum DTI", dti)
    pti = best_percent([r"PTI\s*(?:up to|max(?:imum)?)\s*(\d+(?:\.\d+)?)%", r"Max\s+(\d+(?:\.\d+)?)%\s+PTI"], text)
    if pti:
        add_answer(answers, "Maximum PTI (%)", pti)
        add_answer(answers, "Maximum PTI", pti)
    if "self-employed" in low:
        add_answer(answers, "Minimum Self-Employment Time (Years)", "Self-employed considered where program allows")
    m = re.search(r"(\d+)\s+months?\s+(?:bank statements?|statements?)", text, re.I)
    if m:
        add_answer(answers, "Minimum Bank Statements (Months)", f"{m.group(1)} mo")
    m = re.search(r"(\d+)\s+years?\s+(?:tax returns?|returns?)", text, re.I)
    if m:
        add_answer(answers, "Minimum Tax Returns (Years)", f"{m.group(1)} yr")

    por = best_months([r"POR:.*?dated within\s+(\d+)\s+days?", r"proof of residence.*?within\s+(\d+)\s+days?"], text)
    if por:
        add_answer(answers, "Maximum POR Age (Days)", por.replace(" mo", " days"))
        add_answer(answers, "Minimum Utility Bill Age", por.replace(" mo", " days"))
    poi = best_months([r"POI:.*?dated within\s+(\d+)\s+days?", r"paystub.*?within\s+(\d+)\s+days?"], text)
    if poi:
        add_answer(answers, "Maximum POI Age (Days)", poi.replace(" mo", " days"))

    if "valid government issued id" in low or "valid govt id" in low:
        add_answer(answers, "State ID Accepted", "Y - valid government ID")
    if "driver license" in low or "driver's license" in low:
        add_answer(answers, "Driver License Required (Y/N)", "Y when required by title/ID stip")
    if "international dl" in low or "foreign license" in low:
        add_answer(answers, "Foreign License Accepted", "N" if "no international" in low else "See ID stip")
    if "passport" in low:
        add_answer(answers, "Passport Accepted", "Published in ID/funding forms")
    if "military id" in low:
        add_answer(answers, "Military ID Accepted", "Published in ID/funding forms")
    if "tax id" in low or "itin" in low:
        add_answer(answers, "ITIN Program Available", "Y where program allows" if "tax id" in low else "See approval")
    if "valid ssn" in low or "must have valid social security" in low:
        add_answer(answers, "SSN Required", "Y")

    down_pct = best_percent([r"(\d+(?:\.\d+)?)%\s+cash down", r"minimum down payment.*?(\d+(?:\.\d+)?)%"], text, mode="min")
    if down_pct:
        add_answer(answers, "Minimum Down Payment (%)", down_pct)
    down_amt = best_money([r"minimum down payment.*?(\$[\d,]+)", r"cash down.*?(\$[\d,]+)"], text, mode="min")
    if down_amt:
        add_answer(answers, "Minimum Down Payment ($)", down_amt)

    min_af = best_money([r"Minimum Amount Financed\s*(?:=|-|:)?\s*(\$[\d,]+)", r"Min(?:imum)?\s+amt financed\s*(\$[\d,]+)"], text, mode="min")
    max_af = best_money([r"Max(?:imum)?\s+(?:amount financed|amt financed|loan amount)\s*(?:=|-|:)?\s*(\$[\d,]+)", r"Max\s+(\$[\d,]+)\s+amount"], text)
    if min_af:
        add_answer(answers, "Minimum AF", min_af)
        add_answer(answers, "Minimum Loan Amount", min_af)
    if max_af:
        add_answer(answers, "Maximum AF", max_af)
        add_answer(answers, "Maximum Loan Amount", max_af)
        add_answer(answers, "Maximum Amount Financed", max_af)

    terms = all_numbers([r"Max(?:imum)?\s+(?:term|terms).*?(\d{2,3})\s*(?:mo|months?)", r"Up to\s+(\d{2,3})\s*(?:mo|months?)", r"(\d{2,3})\s*month terms"], text)
    if terms:
        add_answer(answers, "Maximum Term", f"{max(terms)} mo")
        add_answer(answers, "Maximum Term", f"{max(terms)} mo")
    min_terms = all_numbers([r"Min(?:imum)?\s+(?:term|terms).*?(\d{2,3})\s*(?:mo|months?)"], text)
    if min_terms:
        add_answer(answers, "Minimum Term", f"{min(min_terms)} mo")

    mileage_vals = all_numbers([r"Max(?:imum)?\s+(?:used\s+)?mileage.*?([\d,]{2,7})", r"mileage\s*<\s*([\d,]{2,7})", r"<=\s*([\d,]{2,7})\s*mileage"], text)
    mileage_vals = [x for x in mileage_vals if x >= 1000]
    if mileage_vals:
        add_answer(answers, "Maximum Mileage", f"{max(mileage_vals):,}")
        add_answer(answers, "Maximum Mileage Ever", f"{max(mileage_vals):,}")
        add_answer(answers, "Maximum Term by Mileage", f"See mileage cap: {max(mileage_vals):,}")
    age_vals = all_numbers([r"Max(?:imum)?\s+vehicle age\s*(\d+)\s+years?", r"<=\s*(\d+)\s+model years?", r"collateral age\s*<=\s*(\d+)\s+years?"], text)
    if age_vals:
        add_answer(answers, "Maximum Vehicle Age", f"{max(age_vals)} yrs")
        add_answer(answers, "Maximum Term by Vehicle Age", f"See age cap: {max(age_vals)} yrs")
    min_value = best_money([r"vehicles? valued at less than\s+(\$[\d,]+)", r"minimum vehicle value\s*(\$[\d,]+)"], text, mode="min")
    if min_value:
        add_answer(answers, "Minimum Vehicle Value", min_value)
    add_title_brand_answers(answers, text)
    extract_stip_doc_rules(answers, text)
    extract_identity_rules(answers, text)
    extract_insurance_rules(answers, text)
    extract_title_rules(answers, text)
    add_package_doc_rules(answers, text)
    extract_correction_rules(answers, text)

    max_adv = best_percent([r"Max(?:imum)?\s+(?:all[- ]?in\s+)?(?:advance|LTV).*?(\d{2,3}(?:\.\d+)?)%", r"up to\s+(\d{2,3}(?:\.\d+)?)%\s+(?:advance|ltv)"], text)
    if max_adv:
        add_answer(answers, "Maximum Advance (%)", max_adv)
        add_answer(answers, "Maximum Total LTV", max_adv)
        add_answer(answers, "Maximum LTV Ever", max_adv)
    fe_ltv = best_percent([r"front[- ]?end.*?(?:advance|LTV).*?(\d{2,3}(?:\.\d+)?)%"], text)
    if fe_ltv:
        add_answer(answers, "Maximum Front-End LTV", fe_ltv)
    backend_pct = best_percent([r"Backend cap.*?(\d{1,2}(?:\.\d+)?)%", r"Max Backend Products?.*?(\d{1,2}(?:\.\d+)?)%"], text)
    if backend_pct:
        add_answer(answers, "Maximum Backend (%)", backend_pct)
        add_answer(answers, "Maximum Backend", backend_pct)
    gap_amt = best_money([r"GAP.*?(?:max|maximum|up to|raised from [^\\n]+ to)\s*(\$[\d,]+)", r"maximum GAP allowance is\s*(\$[\d,]+)"], text)
    if gap_amt:
        add_answer(answers, "Maximum GAP", gap_amt)
        add_answer(answers, "Maximum GAP ($)", gap_amt)
    vsc_amt = best_money([r"(?:VSC|service contract|warranty).*?(?:max|greater of|up to)\s*(\$[\d,]+)"], text)
    if vsc_amt:
        add_answer(answers, "Maximum Warranty", vsc_amt)
        add_answer(answers, "Maximum VSC ($)", vsc_amt)
    acc_amt = best_money([r"Accessories.*?(?:cap|cannot exceed|limit).*?(\$[\d,]+)", r"dealer adds.*?(?:cap|cannot exceed|limit).*?(\$[\d,]+)"], text)
    if acc_amt:
        add_answer(answers, "Maximum Accessories", acc_amt)
        add_answer(answers, "Maximum Dealer Adds", acc_amt)
    neg = best_money([r"negative equity.*?(?:max|maximum|up to)\s*(\$[\d,]+)"], text)
    if neg:
        add_answer(answers, "Maximum Negative Equity ($)", neg)
        add_answer(answers, "Maximum Negative Equity", neg)

    mf = first_match([r"(?:money factor|MF)\s*(?:=|:)?\s*(0\.\d{4,6})"], text)
    if mf:
        add_answer(answers, "Base Money Factor", mf)
    mf_markup = best_percent([r"MF.*?markup.*?(\d+(?:\.\d+)?)%", r"money factor.*?markup.*?(\d+(?:\.\d+)?)%"], text)
    if mf_markup:
        add_answer(answers, "Maximum MF Markup", mf_markup)
    acq = best_money([r"acquisition fee.*?(?:up to|maximum|:)\s*(\$[\d,]+)", r"Dealer Acquisition Fee:\s*Up to\s*(\$[\d,]+)"], text)
    if acq:
        add_answer(answers, "Acquisition Fee", acq)
    dispo = best_money([r"disposition fee.*?(?:up to|maximum|:)\s*(\$[\d,]+)"], text)
    if dispo:
        add_answer(answers, "Disposition Fee", dispo)
    if "security deposit waived" in low:
        add_answer(answers, "Security Deposit", "Waived in published tier/rate rule")
    residual_source = first_match([r"(ALG|Automotive Lease Guide|J\.?D\.?\s*Power|NADA|Black Book|KBB)"], text)
    if residual_source and "lease" in low:
        add_answer(answers, "Residual Source", residual_source)
    cap_cost = best_percent([r"net cap cost.*?(\d{2,3}(?:\.\d+)?)%\s+of\s+MSRP", r"cap cost.*?(\d{2,3}(?:\.\d+)?)%"], text)
    if cap_cost:
        add_answer(answers, "Maximum Cap Cost", cap_cost)

    if "business resolution" in low:
        add_answer(answers, "Business Resolution", "Required when business/entity deal")
    if "guarant" in low:
        add_answer(answers, "Guaranty", "Required when approval/entity structure calls for it")
        add_answer(answers, "Owners Required to Guarantee (%)", "See approval/guaranty docs")
    owner_pct = best_percent([r"(\d{1,3})%\s+ownership", r"own(?:er)?s?.*?(\d{1,3})%"], text)
    if owner_pct:
        add_answer(answers, "Minimum Ownership (%)", owner_pct)
    if "ein" in low or "tax id" in low:
        add_answer(answers, "EIN Letter", "Required/accepted for business identity when listed")
    if "gvwr" in low:
        gvwr = first_match([r"GVWR.*?([\d,]+)"], text)
        gvwr_num = int(re.sub(r"\D", "", gvwr) or "0")
        if gvwr and gvwr_num >= 1000:
            add_answer(answers, "Maximum GVWR", gvwr)

    apr_markup = best_percent([r"APR cannot exceed\s*(\d+(?:\.\d+)?)%\s+over", r"markup cap\s*(\d+(?:\.\d+)?)%"], text)
    if apr_markup:
        add_answer(answers, "Maximum APR Markup", apr_markup)
    reserve = best_percent([r"reserve up to\s*(\d+(?:\.\d+)?)%", r"dealer reserve.*?(\d+(?:\.\d+)?)%"], text)
    if reserve:
        add_answer(answers, "Maximum Reserve (%)", reserve)
    flat = best_money([r"(\$[\d,]+)\s+flat", r"flat amount.*?(\$[\d,]+)"], text)
    if flat:
        add_answer(answers, "Flat Amount ($)", flat)

    ded = best_money([r"Max(?:imum)?\s*\$?([\d,]+)\s+deductible", r"deductible.*?max(?:imum)?\s*(\$[\d,]+)"], text)
    if ded:
        add_answer(answers, "Maximum Collision Deductible", ded)
        add_answer(answers, "Maximum Comprehensive Deductible", ded)
    if "full coverage" in low:
        add_answer(answers, "Insurance", "Full coverage required")
    liab = first_match([r"liability.*?(\d{2,3}/\d{2,3}/\d{2,3})", r"full coverage\s*\((\d{3,4}/\d{3,4})\)"], text)
    if liab:
        add_answer(answers, "Minimum Liability Limits", liab)
    binder_max = best_money([
        r"insurance binder.*?(?:max|maximum)\s*(\$[\d,]+)",
        r"insurance binder.*?(\$[\d,]+)\s+max",
    ], text)
    if binder_max:
        add_answer(answers, "Maximum Collision Deductible", binder_max)
        add_answer(answers, "Maximum Comprehensive Deductible", binder_max)

    m = re.search(r"contracts? not received within\s+(\d+)\s+days? of the contract date", text, re.I)
    if m:
        add_answer(answers, "Maximum Contract Age Before Funding (Days)", f"{m.group(1)} days")
    m = re.search(
        r"contracts? must be received for funding no later than\s+(\d+)\s+days?\s+and funded within\s+(\d+)\s+days?",
        text,
        re.I,
    )
    if m:
        add_answer(answers, "Maximum Contract Age Before Funding (Days)", f"Received <= {m.group(1)} days")
        add_answer(answers, "Maximum Approval Age Before Funding (Days)", f"Funded <= {m.group(2)} days")
    m = re.search(r"all purchase info due within\s+(\d+)\s+days?", text, re.I)
    if m:
        add_answer(answers, "Maximum Approval Age Before Funding (Days)", f"{m.group(1)} days")
    if "approval stips must be included" in low or "approval notification" in low:
        add_answer(answers, "Maximum Approval Age Before Funding (Days)", "Approval/stips must be current at funding")
    if "re-contract" in low or "recontract" in low:
        add_answer(answers, "Maximum Recontract Window (Days)", "Errors may require re-contract")
    m = re.search(r"flat(?:s)?\s+(?:cancel|cancellation).*?within\s+(\d+)\s+days?", text, re.I)
    if m:
        add_answer(answers, "Maximum Recontract Window (Days)", f"Flat cancel window {m.group(1)} days")

    if "econtract" in low or "e-contract" in low:
        add_answer(answers, "eContract Available", "Y")
        if "expedited funding" in low:
            add_answer(answers, "Digital Funding", "eContract for expedited funding")
        if "must econtract" in low or "econtract required" in low or "e-contract required" in low:
            add_answer(answers, "eContract Required", "Y")
    for addr in extract_funding_addresses(text):
        add_answer(answers, "Funding Delivery Address", addr)
    if "original signed contract" in low or "original contract" in low:
        add_answer(answers, "Original Required", "Original signed contract required where paper package is used")
        add_answer(answers, "Wet Signature Required", "Y for paper/original package")
    if "no copies" in low:
        add_answer(answers, "Copy Accepted", "N for paper contract/credit app where stated")
    if "not e-contracting via routeone nor dealertrack" in low or "not e-contracting via routeone" in low:
        add_answer(answers, "Paper Funding", "Send original signed package when not e-contracting")
        add_answer(answers, "Funding Delivery Method", "Original paper package if not RouteOne/Dealertrack e-contract")
    if "proof of residence" in low and "license does not match" in low:
        add_answer(answers, "POR Trigger", "POR required if driver license address does not match")
    if "voided check" in low or "automatic payment" in low or "autopay" in low:
        add_answer(answers, "Autopay Document", "Voided check/bank statement required when autopay is used")
    if any(x in low for x in ["send to", "mail to", "address:", "funding package", "where to send", "return to"]):
        addr = first_match([
            r"(?:send to|mail to|return to|address:?)\s*([0-9]{1,5}[^\\n]{0,120}(?:st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|pl|place)[^\\n]{0,60}(?:[A-Z]{2}\s+\d{5}(?:-\d{4})?)?)",
        ], text, lambda m: re.sub(r"\s+", " ", m.group(1).strip()))
        if addr:
            add_answer(answers, "Funding Delivery Address", addr)

    return answers


def build_question_matrix(
    profiles,
    funding_overrides,
    section_overrides,
    product_contact_overrides,
    credit_exception_overrides,
    verified_by_bank,
    rate_records_by_bank,
    all_records_by_bank,
):
    records_by_bank = rate_records_by_bank
    matrix = {}
    for profile in profiles:
        bank = profile["bank"]
        rate_rows = select_rate_records(records_by_bank.get(bank, []))
        content, hard, business, backend, stips, title, red, money, front_products, back_products, contact_items, product_contact = profile_data(
            profile,
            funding_overrides,
            section_overrides,
            product_contact_overrides,
            credit_exception_overrides,
            verified_by_bank,
            rate_rows=rate_rows,
            all_rows=all_records_by_bank.get(bank, []),
        )
        answers = extract_question_answers(
            profile,
            rate_rows,
            content,
            hard,
            business,
            backend,
            stips,
            title,
            red,
            money,
            front_products,
            back_products,
        )
        matrix[bank] = answers
    return matrix


def write_question_matrix_csv(profiles, matrix):
    rows = [["Bank", "Category", "Field", "Answer"]]
    for profile in profiles:
        bank = profile["bank"]
        answers = matrix.get(bank, {})
        seen = set()
        for category, fields in QUESTION_FIELDS.items():
            for field in fields:
                if field in seen:
                    continue
                seen.add(field)
                raw_answer = answers.get(field, "")
                answer = pick_answer(field, raw_answer) if raw_answer else ""
                if not answer:
                    answer = MISSING_QUESTION_PLACEHOLDER
                rows.append([bank, category, field, answer])
    for path in [MATRIX_CSV, DESKTOP_MATRIX_CSV]:
        with path.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerows(rows)


SHORT_FIELD_LABELS = {
    "Minimum FICO Score": "Min FICO",
    "Lowest Score Ever Considered": "Lowest score",
    "Lowest Credit Score Ever": "Lowest score",
    "Minimum Total Tradelines (#)": "Min trades",
    "Minimum Revolving Tradelines (#)": "Min revolving",
    "Minimum Installment Tradelines (#)": "Min installment",
    "Maximum Number of Open Auto Loans": "Open autos",
    "Open BK Allowed (Y/N)": "Open BK",
    "Open BK Allowed": "Open BK",
    "Minimum Months Since Discharge": "BK discharge",
    "Minimum Months Since Dismissal": "BK dismissal",
    "Open Repo Allowed": "Open repo",
    "Minimum Months Since Repo": "Repo age",
    "Multiple Repos Allowed (Y/N)": "Multiple repos",
    "Maximum Collection Amount ($)": "Collections",
    "Maximum Number of Collections": "Collection count",
    "Medical Collections Excluded (Y/N)": "Medical collections",
    "Minimum Monthly Income ($)": "Min income",
    "Maximum DTI (%)": "Max DTI",
    "Maximum DTI": "Max DTI",
    "Maximum PTI (%)": "Max PTI",
    "Maximum PTI": "Max PTI",
    "Minimum Self-Employment Time (Years)": "Self-employed",
    "Driver License Required (Y/N)": "Driver license",
    "ITIN Program Available": "ITIN",
    "SSN Required": "SSN",
    "Minimum AF": "Min AF",
    "Maximum AF": "Max AF",
    "Maximum Amount Financed": "Max AF",
    "Minimum Term": "Min term",
    "Maximum Term": "Max term",
    "Maximum Advance (%)": "Max advance",
    "Maximum Front-End LTV": "Front LTV",
    "Maximum Total LTV": "Total LTV",
    "Maximum Backend LTV": "Backend LTV",
    "Maximum Negative Equity ($)": "Neg equity",
    "Maximum Negative Equity": "Neg equity",
    "Maximum Vehicle Age": "Vehicle age",
    "Maximum Mileage": "Mileage",
    "Branded Title Allowed": "Branded title",
    "Rebuilt Title Allowed": "Rebuilt title",
    "Salvage Title Allowed": "Salvage title",
    "Total Loss Vehicle Allowed": "Total loss",
    "Lemon/Buyback Allowed": "Lemon/buyback",
    "Flood/Frame Damage Allowed": "Flood/frame",
    "Base Money Factor": "Base MF",
    "Maximum MF Markup": "MF markup",
    "Maximum Dealer Participation": "Participation",
    "Acquisition Fee": "Acq fee",
    "Disposition Fee": "Dispo fee",
    "Residual Source": "Residual source",
    "Maximum Cap Cost": "Max cap",
    "Maximum CCR": "Max CCR",
    "Maximum APR Markup": "APR markup",
    "Maximum Reserve (%)": "Reserve",
    "Flat Amount ($)": "Flat",
    "Maximum GAP ($)": "GAP",
    "Maximum VSC ($)": "VSC",
    "Maximum Backend ($)": "Backend $",
    "Maximum Backend (%)": "Backend %",
    "Maximum Accessories": "Accessories",
    "Minimum Ownership (%)": "Ownership",
    "Owners Required to Sign (%)": "Owners sign",
    "Owners Required to Guarantee (%)": "Owners guarantee",
    "Minimum Time in Business": "Time in business",
    "Minimum Annual Revenue": "Revenue",
    "Maximum GVWR": "GVWR",
    "Maximum Fleet Size": "Fleet size",
    "Maximum Exposure": "Exposure",
    "Maximum POI Age (Days)": "POI age",
    "Maximum POR Age (Days)": "POR age",
    "Maximum Insurance Binder Age (Days)": "Binder age",
    "Maximum Payoff Age (Days)": "Payoff age",
    "Maximum Approval Age Before Funding (Days)": "Approval age",
    "Maximum Contract Age Before Funding (Days)": "Contract age",
    "Maximum Title Submission Time (Days)": "Title timing",
    "Maximum Collision Deductible": "Collision ded",
    "Maximum Comprehensive Deductible": "Comp ded",
    "Minimum Liability Limits": "Liability",
    "eContract Available": "eContract",
    "eContract Required": "eContract req",
    "Digital Funding": "Digital funding",
    "Paper Funding": "Paper pkg",
    "Wet Signature Required": "Wet signature",
    "Original Required": "Original docs",
    "Copy Accepted": "Copies",
    "POR Trigger": "POR trigger",
    "Autopay Document": "Autopay doc",
    "Funding Delivery Method": "Delivery",
    "Maximum Days from Contract to Funding": "Contract to fund",
    "Average Funding Time (Days)": "Avg funding time",
    "Average Funding Review Time (Hours)": "Avg review time",
    "Funding Department Hours": "Funding hours",
    "Same-day Funding Cutoff Time": "Same-day cutoff",
    "Weekend Funding Available": "Weekend funding",
    "Holiday Funding Available": "Holiday funding",
    "Time Zone for Funding Cutoff": "Funding timezone",
    "Maximum Bank Statement Age": "Bank statement age",
    "Maximum Paystub Age": "Paystub age",
    "Maximum Tax Return Age": "Tax return age",
    "Maximum Appraisal Age": "Appraisal age",
    "Maximum Title Age": "Title age",
    "Maximum Driver's License Age After Renewal": "License age",
    "Maximum Payoff Age": "Payoff age",
    "Initials Required": "Initials",
    "Every Page Signed": "All pages signed",
    "Digital Signatures Accepted": "Digital sign",
    "DocuSign Accepted": "DocuSign",
    "Adobe Sign Accepted": "Adobe Sign",
    "RouteOne eContract Required": "RouteOne eContract",
    "Signature Mismatch Tolerance": "Sig tolerance",
    "Power of Attorney Accepted": "POA accepted",
    "Remote Signing Accepted": "Remote sign",
    "Split Signing Accepted": "Split signing",
    "Maximum Upload Size": "Upload size",
    "Accepted Upload Formats": "Upload formats",
    "Hybrid Contract Accepted": "Hybrid contract",
    "Electronic Funding": "Electronic fund",
    "Paper Document Acceptance": "Paper docs",
    "POI Number Required": "POI count",
    "POR Number Required": "POR count",
    "Paystub Accepted": "Paystub",
    "Payroll Portal Accepted": "Payroll portal",
    "W-2 Accepted": "W-2",
    "Bank Statements Accepted": "Bank statements",
    "Offer Letter Accepted": "Offer letter",
    "CPA Letter Accepted": "CPA letter",
    "Tax Returns Accepted": "Tax returns",
    "Employer Letter Accepted": "Employer letter",
    "Pension Letter Accepted": "Pension letter",
    "Disability Letter Accepted": "Disability letter",
    "POI Maximum Age (Days)": "POI max age",
    "POR Maximum Age (Days)": "POR max age",
    "Utility Bill Accepted": "Utility bill",
    "Lease Accepted": "Lease accepted",
    "Mortgage Statement Accepted": "Mortgage statement",
    "Bank Statement Accepted (POR)": "POR bank stmt",
    "Cell Phone Bill Accepted": "Cell phone",
    "Internet Bill Accepted": "Internet bill",
    "Credit Card Statement Accepted": "Card statement",
    "Insurance Statement Accepted": "Insurance statement",
    "Can Fund Pending One Missing Stip": "Pending missing stip",
    "Can Title Follow Later": "Title follow later",
    "Can Payoff Follow Later": "Payoff follow later",
    "Can Insurance Follow Later": "Insurance follow later",
    "Who Can Override Funding Requirements": "Override team",
    "Documents That Can Be Waived": "Waivable docs",
    "Corrections Without New Contract": "Corrections no re-approval",
    "Corrections Requiring Resign": "Corrections need resign",
    "Situations Requiring New Approval": "Need new approval",
    "Retail Installment Contract Required": "RIC required",
    "Lease Agreement Required": "Lease req",
    "Credit Application Required": "Application req",
    "Buyer's Order Required": "Buyer's order req",
    "Menu Required": "Menu req",
    "Privacy Notice Required": "Privacy req",
    "OFAC Required": "OFAC req",
    "Red Flags Required": "Red flags req",
    "Risk-Based Pricing Notice Required": "RBN notice req",
    "SSA-89 Required": "SSA-89 req",
    "Odometer Statement Required": "Odometer req",
    "Title Application Required": "Title app req",
    "Insurance Required": "Insurance req",
    "Agreement to Furnish Insurance Required": "ATF insurance req",
    "Trade Title Required": "Trade title req",
    "Trade Registration Required": "Trade registration req",
    "Payoff Authorization Required": "Payoff auth req",
    "Lien Release Required": "Lien release req",
    "Business Resolution Required": "Business resolution req",
    "Guaranty Required": "Guaranty req",
    "EIN Letter Required": "EIN req",
    "Digital Insurance Accepted": "Digital insurance",
    "Insurance Binder Accepted": "Binder accepted",
    "Temporary Insurance Accepted": "Temp insurance",
    "Named Insured Requirements": "Named insured req",
    "Policy Effective Date Requirements": "Policy effective req",
    "Policy Expiration Minimum": "Policy expiration",
    "ELT Required": "ELT required",
    "Paper Title Accepted": "Paper title",
    "Duplicate Title Accepted": "Duplicate title",
    "Lost Title Affidavit Accepted": "Lost title affidavit",
    "Electronic Title Required": "Electronic title",
    "Out-of-State Title Accepted": "Out-of-state title",
    "Canadian Title Accepted": "Canadian title",
    "Rebuilt Title Accepted": "Rebuilt title",
    "Open Title Accepted": "Open title",
    "Dealer Reassignment Limit": "Dealer reassignment",
    "Title Age Limit": "Title age limit",
    "Payoff Verification Required": "Payoff verification",
    "Trade Title Required Before Funding": "Trade title before fund",
    "Duplicate Trade Title Accepted": "Duplicate trade title",
    "Missing Title Procedure": "Missing title procedure",
    "Electronic Payoff Accepted": "Electronic payoff",
    "Lease Payoff Accepted": "Lease payoff",
    "Open Recall Restrictions": "Open recall",
    "Trade Inspection Required": "Trade inspection",
    "No Driver License Accepted": "No license",
    "Temporary ID Accepted": "Temporary ID",
    "Foreign ID Accepted": "Foreign ID",
    "Identity Mismatch Process": "ID mismatch process",
    "Fraud Review Triggers": "Fraud triggers",
    "Maximum Selling Price Change Without Reapproval": "Sell price change",
    "Maximum Payment Change Without Reapproval": "Payment change",
    "Maximum Down Payment Change Without Reapproval": "Down payment change",
    "Maximum Trade Value Change Without Reapproval": "Trade value change",
    "Maximum Payoff Change Without Reapproval": "Payoff change",
    "Maximum Backend Change Without Reapproval": "Backend change",
    "Maximum Amount Financed Change Without Reapproval": "AF change",
    "Maximum APR Change Without Reapproval": "APR change",
    "Maximum Term Change Without Reapproval": "Term change",
    "Dealer Buyback Triggers": "Dealer buyback",
    "Repurchase Demand Triggers": "Repurchase demand",
    "Reserve Chargeback Triggers": "Chargeback triggers",
    "First-Payment Default Review Triggers": "FPD review",
    "Dealer Audit Triggers": "Audit triggers",
    "Fastest Funding Practices": "Fastest funding tips",
    "Top Reason Deals Sit In Funding": "Funding stall reasons",
    "Most Common New Finance Manager Mistake": "Common newbie miss",
    "What Usually Causes Immediate Review Escalation": "Review escalation",
}

for _field in CORRECTION_NO_RECONTRACT_FIELDS:
    _label = _field.replace("Can ", "").replace(" Be Corrected Without Recontracting", "")
    SHORT_FIELD_LABELS.setdefault(_field, _label)

for _doc_name, _ in PACKAGE_DOCS:
    SHORT_FIELD_LABELS.setdefault(f"{_doc_name} Required", f"{PACKAGE_DOC_SHORT.get(_doc_name, _doc_name)} req")
    SHORT_FIELD_LABELS.setdefault(f"{_doc_name} Wet Signature Required", f"{PACKAGE_DOC_SHORT.get(_doc_name, _doc_name)} wet")
    SHORT_FIELD_LABELS.setdefault(f"{_doc_name} Electronic Signature Accepted", f"{PACKAGE_DOC_SHORT.get(_doc_name, _doc_name)} e-sign")
    SHORT_FIELD_LABELS.setdefault(f"{_doc_name} Original Required", f"{PACKAGE_DOC_SHORT.get(_doc_name, _doc_name)} original")
    SHORT_FIELD_LABELS.setdefault(f"{_doc_name} Copy Accepted", f"{PACKAGE_DOC_SHORT.get(_doc_name, _doc_name)} copy")
    SHORT_FIELD_LABELS.setdefault(f"{_doc_name} Upload Format", f"{PACKAGE_DOC_SHORT.get(_doc_name, _doc_name)} upload")


def question_items(answers, fields, limit=6, include_missing=False, max_missing=2, value_limit=84):
    out = []
    answered = set()
    for field in fields:
        value = pick_answer(field, answers.get(field, ""))
        if value:
            answered.add(field)
            out.append(f"{SHORT_FIELD_LABELS.get(field, field)}: {squeeze(value, value_limit)}")
            if len(out) >= limit:
                break
    if include_missing and max_missing:
        missing = 0
        for field in fields:
            if field in answered:
                continue
            if missing >= max_missing or len(out) >= limit:
                break
            out.append(field_callback(field))
            missing += 1
    out = out[:limit]
    return out


QUESTION_TEXT_OVERRIDES = {
    "Minimum FICO Score": "What is the minimum FICO score?",
    "Tier 1 Score Range": "What is the Tier 1 score range?",
    "Tier 2 Score Range": "What is the Tier 2 score range?",
    "Tier 3 Score Range": "What is the Tier 3 score range?",
    "Tier 4 Score Range": "What is the Tier 4 score range?",
    "Lowest Score Ever Considered": "What is the lowest score ever considered?",
    "Lowest Credit Score Ever": "What is the lowest credit score ever considered?",
    "Minimum Previous Auto Loan Amount ($)": "What is the minimum previous auto loan amount?",
    "Minimum Previous Auto Payment ($)": "What is the minimum prior auto payment?",
    "Minimum Previous Auto History (Months)": "What is the minimum previous auto history (months)?",
    "Minimum Total Tradelines (#)": "What is the minimum total tradelines?",
    "Minimum Revolving Tradelines (#)": "What is the minimum revolving tradelines?",
    "Minimum Installment Tradelines (#)": "What is the minimum installment tradelines?",
    "Maximum Number of Open Auto Loans": "What is the maximum number of open auto loans?",
    "Maximum Credit Inquiries (Last 30 Days)": "Max number of credit inquiries in last 30 days?",
    "Maximum Credit Inquiries (Last 90 Days)": "Max number of credit inquiries in last 90 days?",
    "Open BK Allowed (Y/N)": "Is open Chapter 7 bankruptcy allowed?",
    "Open BK Allowed": "Is open bankruptcy allowed in any form?",
    "Minimum Months Since Filing": "If bankrupt, minimum months since filing?",
    "Minimum Months Since Discharge": "If bankrupt, minimum months since discharge?",
    "Minimum Months Since Dismissal": "If dismissed bankruptcy, minimum months since dismissal?",
    "Maximum LTV After BK (%)": "What is the max LTV after bankruptcy?",
    "Minimum Down Payment After BK (%)": "Minimum down payment after bankruptcy?",
    "Maximum Term After BK": "Maximum term after bankruptcy?",
    "Auto Loan Included Allowed (Y/N)": "Can existing auto loan be included in this file?",
    "Chapter 13": "Is Chapter 13 ever approved?",
    "Trustee Approval Required": "Does Chapter 13 require trustee approval?",
    "Minimum Payments Made": "Minimum Chapter 13 payments made required?",
    "Minimum Down Payment": "What is the minimum down payment?",
    "Repo Included in BK Allowed": "Can repo be included when bankruptcy exists?",
    "Open Repo Allowed": "Is open repo allowed?",
    "Minimum Months Since Repo": "Minimum months since last repo?",
    "Minimum Months Since Voluntary Surrender": "Minimum months since voluntary surrender?",
    "Deficiency Balance Must Be Paid (Y/N)": "Must deficiency balance be paid?",
    "Multiple Repos Allowed (Y/N)": "Are multiple repos allowed?",
    "Maximum Number of Repos": "Maximum number of repos?",
    "Maximum Collection Amount ($)": "Maximum collections amount?",
    "Maximum Number of Collections": "Maximum number of collection items?",
    "Medical Collections Excluded (Y/N)": "Are medical collections excluded?",
    "Maximum Judgment Amount": "Maximum judgment amount?",
    "Maximum Tax Lien Amount": "Maximum tax lien amount?",
    "Child Support Balance Allowed ($)": "Max allowed child support balance?",
    "Wage Garnishment Allowed": "Is wage garnishment allowed?",
    "Minimum Monthly Income ($)": "Minimum monthly income?",
    "Minimum Annual Income ($)": "Minimum annual income?",
    "Minimum Time on Job (Months)": "Minimum time on current job?",
    "Minimum Time in Occupation (Months)": "Minimum time in current occupation?",
    "Maximum Employment Gap (Months)": "Maximum employment gap?",
    "Minimum Self-Employment Time (Years)": "Minimum self-employment history?",
    "Minimum Bank Statements (Months)": "Minimum business/consumer bank statement months required?",
    "Minimum Tax Returns (Years)": "Minimum tax returns required?",
    "Maximum DTI (%)": "Maximum DTI?",
    "Maximum PTI (%)": "Maximum PTI?",
    "Maximum Payment Shock (%)": "Maximum payment shock (%)?",
    "Maximum Payment Shock ($)": "Maximum payment shock ($)?",
    "Overtime Averaging (Months)": "Overtime averaging period (months)?",
    "Bonus Averaging (Months)": "Bonus averaging period (months)?",
    "Commission Averaging (Months)": "Commission averaging period (months)?",
    "Minimum Driver License Validity Remaining (Days)": "Minimum driver license validity remaining (days)?",
    "Temporary License Accepted": "Are temporary licenses accepted?",
    "Foreign License Accepted": "Are foreign licenses accepted?",
    "Passport Accepted": "Is passport accepted as ID?",
    "Military ID Accepted": "Is military ID accepted?",
    "Consular ID Accepted": "Is consular ID accepted?",
    "Minimum Visa Validity Remaining (Months)": "Minimum visa validity remaining (months)?",
    "Minimum EAD Remaining (Months)": "Minimum EAD remaining (months)?",
    "Minimum OPT Remaining (Months)": "Minimum OPT remaining (months)?",
    "Minimum H-1B Remaining (Months)": "Minimum H-1B remaining (months)?",
    "SSN Required": "Is SSN required?",
    "Minimum Down Payment ($)": "Minimum down payment amount?",
    "Minimum Down Payment (%)": "Minimum down payment percent?",
    "Maximum Down Payment (%)": "Maximum down payment percent?",
    "Minimum Credit Card Down ($)": "Maximum credit card down allowed?",
    "Maximum Credit Card Down ($)": "Maximum credit card down?",
    "Maximum Third Party Down ($)": "Maximum third-party down amount?",
    "Maximum Gift Funds ($)": "Maximum gift funds allowed?",
    "Minimum AF": "Minimum amount financed?",
    "Maximum AF": "Maximum amount financed?",
    "Maximum Amount Financed": "Maximum amount financed?",
    "Minimum Term": "Minimum term?",
    "Maximum Term": "Maximum term?",
    "Maximum Term by Mileage": "Max term by mileage?",
    "Maximum Term by Vehicle Age": "Max term by vehicle age?",
    "Maximum Term Over $50k": "Max term over $50k?",
    "Maximum Term Over $75k": "Max term over $75k?",
    "Maximum Term Over $100k": "Max term over $100k?",
    "Minimum Vehicle Value": "Minimum vehicle value?",
    "Maximum Vehicle Value": "Maximum vehicle value?",
    "Maximum MSRP": "Maximum MSRP?",
    "Maximum Invoice": "Maximum invoice?",
    "Maximum Book Value": "Maximum book value?",
    "Maximum Advance (%)": "Max advance percentage?",
    "Branded Title Allowed": "Branded title allowed?",
    "Rebuilt Title Allowed": "Rebuilt title allowed?",
    "Salvage Title Allowed": "Salvage title allowed?",
    "Total Loss Vehicle Allowed": "Total loss vehicles allowed?",
    "Lemon/Buyback Allowed": "Lemon/manufacturer buyback allowed?",
    "Flood/Frame Damage Allowed": "Flood/frame/structural damage allowed?",
    "Maximum Front-End LTV": "Max front-end LTV?",
    "Maximum Total LTV": "Max total LTV?",
    "Maximum Backend LTV": "Max backend LTV?",
    "Maximum GAP": "Max GAP?",
    "Maximum Warranty": "Max warranty amount?",
    "Maximum Accessories": "Max accessories amount?",
    "Maximum Dealer Adds": "Max dealer adds amount?",
    "Maximum Negative Equity ($)": "Max negative equity ($)?",
    "Maximum Negative Equity (%)": "Max negative equity (% of vehicle)?",
    "Base Money Factor": "Base money factor?",
    "Maximum MF Markup": "Maximum MF markup?",
    "Residual Source": "Residual source source?",
    "Residual Adjustment per 1,000 Miles": "Residual adjustment per 1,000 miles?",
    "Residual Adjustment per Term": "Residual adjustment per term?",
    "Acquisition Fee": "Acquisition fee amount?",
    "Maximum Acquisition Fee Markup": "Max acquisition fee markup?",
    "Disposition Fee": "Disposition fee?",
    "Security Deposit": "Security deposit requirement?",
    "Maximum Security Deposits": "Max security deposits?",
    "Maximum Cap Cost": "Maximum cap cost?",
    "Maximum CCR": "Maximum CCR?",
    "Maximum GAP": "Maximum GAP amount?",
    "Allowed Products": "What front-end products are allowed?",
    "Not Allowed Products": "What products are not allowed?",
    "Approved Providers": "Which providers are approved?",
    "Maximum Product Limits": "Maximum product limits by type?",
    "Chargeback Rules": "What are chargeback rules?",
    "Maximum APR Markup": "Maximum APR markup?",
    "Maximum Reserve (%)": "Max reserve percentage?",
    "Maximum Reserve ($)": "Max reserve dollar cap?",
    "Flat Amount ($)": "Flat reserve amount?",
    "Maximum Backend ($)": "Maximum backend dollars?",
    "Maximum Backend (%)": "Maximum backend percent?",
    "Maximum Backend": "Maximum backend amount?",
    "Maximum Accessories": "Maximum accessories amount?",
    "Maximum Dealer Adds": "Maximum dealer adds amount?",
    "Minimum Ownership (%)": "Minimum ownership % required?",
    "Owners Required to Sign (%)": "Minimum owners required to sign?",
    "Owners Required to Guarantee (%)": "Minimum owners required to guarantee?",
    "Minimum Time in Business": "Minimum time in business required?",
    "Minimum Annual Revenue": "Minimum annual revenue?",
    "Minimum Business Bank Statements": "Minimum business bank statements required?",
    "Minimum Business Tax Returns": "Minimum business tax returns required?",
    "Minimum Business Credit Score": "Minimum business credit score?",
    "Maximum Fleet Size": "Maximum fleet size?",
    "Maximum GVWR": "Maximum GVWR?",
    "Maximum Units": "Maximum units?",
    "Maximum Exposure": "Maximum total exposure?",
    "Maximum Upfit Amount": "Maximum upfit amount?",
    "Maximum Equipment Amount": "Maximum equipment amount?",
    "Driver License Required (Y/N)": "Is driver license required?",
    "ITIN Program Available": "Is ITIN supported?",
    "Maximum Collections": "Maximum collections allowed?",
    "Collection Rules": "What are explicit collection/charge-off rules?",
    "Maximum POI Age (Days)": "Proof of insurance age requirement (days)?",
    "Maximum POR Age (Days)": "Proof of residence age requirement (days)?",
    "Maximum Insurance Binder Age (Days)": "Insurance binder age limit (days)?",
    "Maximum Payoff Age (Days)": "Payoff age limit (days)?",
    "Maximum Approval Age Before Funding (Days)": "Approval age before funding (days)?",
    "Maximum Contract Age Before Funding (Days)": "Contract age before funding (days)?",
    "Maximum Title Submission Time (Days)": "Title submission time (days)?",
    "Average Funding Time (Days)": "Average funding time (days)?",
    "Average Approval Time (Minutes)": "Average approval time (minutes)?",
    "Average Manual Review Time (Hours)": "Average manual review time (hours)?",
    "Maximum Recontract Window (Days)": "Maximum recontract window (days)?",
    "Maximum Residuality": "What is maximum residuality?",
    "Agreement to Furnish Insurance": "Is Agreement to Furnish Insurance required?",
    "Minimum Collision Deductible": "Maximum collision deductible allowed?",
    "Maximum Collision Deductible": "Maximum collision deductible allowed?",
    "Maximum Comprehensive Deductible": "Maximum comprehensive deductible allowed?",
    "Minimum Liability Limits": "Minimum liability limits required?",
    "Funding Delivery Address": "What is the exact funding/title mailing address?",
    "eContract Available": "Is eContract available?",
    "eContract Required": "Is eContract required?",
    "Digital Funding": "Is digital funding required?",
    "Paper Funding": "Is paper funding required?",
    "Wet Signature Required": "Is wet signature required?",
    "Original Required": "Is original documents required?",
    "Copy Accepted": "Are copies accepted?",
    "POR Trigger": "When does POR trigger?",
    "Autopay Document": "What autopay document is required?",
    "Funding Delivery Method": "Funding delivery method?",
    "Maximum Residual": "Maximum residual allowed?",
    "Low Mileage": "What is the low-mileage rule?",
    "Retail Installment Contract": "Is retail installment contract required?",
    "Lease Agreement": "Is lease agreement required?",
    "Credit Application": "Credit application required?",
    "Buyer's Order": "Buyer's order required?",
    "Menu": "What package/menu docs are required?",
    "Privacy Notice": "Privacy notice required?",
    "OFAC": "OFAC required?",
    "Risk-Based Pricing Notice": "Is risk-based pricing notice required?",
    "SSA-89": "Is SSA-89 required?",
    "Odometer Statement": "Odometer statement required?",
    "Power of Attorney": "Power of attorney required?",
    "Title Application": "Is title application required?",
    "Insurance": "Any insurance requirements beyond standard?",
    "Trade Title": "Is trade title required?",
    "Trade Registration": "Trade registration required?",
    "Payoff Authorization": "Payoff authorization required?",
    "Lien Release": "Lien release required?",
    "Business Resolution": "Business resolution required?",
    "Guaranty": "Guaranty required?",
    "EIN Letter": "EIN letter required?",
    "Lowest Credit Score Ever": "What is the absolute lowest score ever accepted?",
    "Maximum LTV Ever": "What is the max LTV hard stop?",
    "Maximum Mileage Ever": "What is the max mileage hard stop?",
    "Maximum Vehicle Age": "What is the max vehicle age hard stop?",
    "Maximum Backend": "What is the max backend hard stop?",
    "Maximum Repo Count": "What is the max repo count hard stop?",
    "Maximum Bankruptcy Count": "What is the max bankruptcy count hard stop?",
    "Maximum Charge-Off Amount": "What is the max charge-off amount hard stop?",
    "Maximum Foreclosure Count": "What is the max foreclosure count hard stop?",
    "Maximum Collections": "What is max collection count hard stop?",
    "Maximum Days from Contract to Funding": "What is the maximum days from contract to funding?",
    "Average Funding Review Time (Hours)": "What is the average funding review time (hours)?",
    "Average Funding Time (Days)": "What is the average funding time (days)?",
    "Funding Department Hours": "What are funding department hours?",
    "Same-day Funding Cutoff Time": "What is same-day funding cutoff time?",
    "Weekend Funding Available": "Is weekend funding available?",
    "Holiday Funding Available": "Is holiday funding available?",
    "Time Zone for Funding Cutoff": "What is the funding cutoff timezone?",
    "Maximum Driver's License Age After Renewal": "Max driver license age after renewal?",
    "Maximum Bank Statement Age": "What is maximum bank statement age?",
    "Maximum Paystub Age": "What is maximum paystub age?",
    "Maximum Tax Return Age": "What is maximum tax return age?",
    "Maximum Appraisal Age": "What is maximum appraisal age?",
    "Maximum Title Age": "What is maximum title age?",
    "Initials Required": "Are initials required?",
    "Every Page Signed": "Is every page required to be signed?",
    "Digital Signatures Accepted": "Are digital signatures accepted?",
    "DocuSign Accepted": "Is DocuSign accepted?",
    "Adobe Sign Accepted": "Is Adobe Sign accepted?",
    "Signature Mismatch Tolerance": "Is there signature mismatch tolerance?",
    "Remote Signing Accepted": "Is remote signing accepted?",
    "Split Signing Accepted": "Is split signing accepted?",
    "Maximum Upload Size": "What is the max upload size?",
    "Accepted Upload Formats": "What upload formats are accepted?",
    "Hybrid Contract Accepted": "Is hybrid contracting accepted?",
    "Electronic Funding": "Is electronic funding accepted?",
    "Paper Document Acceptance": "Is paper document submission accepted?",
    "Retail Installment Contract Required": "Is retail installment contract required?",
    "Lease Agreement Required": "Is lease agreement required?",
    "Credit Application Required": "Is credit application required?",
    "Buyer's Order Required": "Is buyer's order required?",
    "Menu Required": "Is the menu required?",
    "Privacy Notice Required": "Is privacy notice required?",
    "OFAC Required": "Is OFAC required?",
    "Red Flags Required": "Is red flags required?",
    "Risk-Based Pricing Notice Required": "Is risk-based pricing notice required?",
    "SSA-89 Required": "Is SSA-89 required?",
    "Odometer Statement Required": "Is odometer statement required?",
    "Title Application Required": "Is title application required?",
    "Insurance Required": "Is insurance required?",
    "Agreement to Furnish Insurance Required": "Is agreement to furnish insurance required?",
    "Trade Title Required": "Is trade title required?",
    "Trade Registration Required": "Is trade registration required?",
    "Payoff Authorization Required": "Is payoff authorization required?",
    "Lien Release Required": "Is lien release required?",
    "Business Resolution Required": "Is business resolution required?",
    "Guaranty Required": "Is guaranty required?",
    "EIN Letter Required": "Is EIN letter required?",
    "Digital Insurance Accepted": "Is digital insurance accepted?",
    "Insurance Binder Accepted": "Is binder accepted in place of policy?",
    "Temporary Insurance Accepted": "Is temporary insurance accepted?",
    "Agreement to Furnish Insurance Accepted": "Is agreement to furnish insurance accepted?",
    "Required Liability Limits": "What are minimum liability limits?",
    "Commercial Insurance Required": "Is commercial insurance required?",
    "Named Insured Requirements": "What are named insured requirements?",
    "Garaging Address Must Match": "Does garaging address need to match?",
    "Policy Effective Date Requirements": "What are policy effective date requirements?",
    "Policy Expiration Minimum": "What is minimum policy expiration?",
    "ELT Required": "Is the employee lease/transfer title required?",
    "Paper Title Accepted": "Is paper title accepted?",
    "Duplicate Title Accepted": "Are duplicate titles accepted?",
    "Lost Title Affidavit Accepted": "Is lost title affidavit accepted?",
    "Electronic Title Required": "Is electronic title required?",
    "Out-of-State Title Accepted": "Are out-of-state titles accepted?",
    "Canadian Title Accepted": "Are Canadian titles accepted?",
    "Salvage Title Accepted": "Are salvage titles accepted?",
    "Rebuilt Title Accepted": "Are rebuilt titles accepted?",
    "Open Title Accepted": "Are open titles accepted?",
    "Dealer Reassignment Limit": "What is the dealer reassignment limit?",
    "Title Age Limit": "What is title age limit?",
    "Payoff Verification Required": "Is payoff verification required?",
    "Trade Title Required Before Funding": "Is trade title required before funding?",
    "Duplicate Trade Title Accepted": "Are duplicate trade titles accepted?",
    "Missing Title Procedure": "What is missing title procedure?",
    "Electronic Payoff Accepted": "Is electronic payoff accepted?",
    "Lease Payoff Accepted": "Is lease payoff accepted?",
    "Open Recall Restrictions": "Are there open recall restrictions?",
    "Trade Inspection Required": "Is trade inspection required?",
    "No Driver License Accepted": "Is no driver license accepted?",
    "Temporary ID Accepted": "Is temporary ID accepted?",
    "Foreign ID Accepted": "Is foreign ID accepted?",
    "Identity Mismatch Process": "What is identity mismatch process?",
    "Fraud Review Triggers": "What are fraud review triggers?",
    "Paystub Accepted": "Is paystub accepted as POI?",
    "Payroll Portal Accepted": "Is payroll portal accepted as POI?",
    "W-2 Accepted": "Is W-2 accepted as POI?",
    "Bank Statements Accepted": "Are bank statements accepted as POI?",
    "Offer Letter Accepted": "Is offer letter accepted as POI?",
    "CPA Letter Accepted": "Is CPA letter accepted as POI?",
    "Tax Returns Accepted": "Are tax returns accepted as POI?",
    "Employer Letter Accepted": "Is employer letter accepted as POI?",
    "Pension Letter Accepted": "Is pension letter accepted as POI?",
    "Disability Letter Accepted": "Is disability letter accepted as POI?",
    "POI Maximum Age (Days)": "What is max POI age?",
    "POI Number Required": "How many POI documents are required?",
    "Utility Bill Accepted": "Is utility bill accepted as POR?",
    "Lease Accepted": "Is lease accepted as POR?",
    "Mortgage Statement Accepted": "Is mortgage statement accepted as POR?",
    "Bank Statement Accepted (POR)": "Is POR bank statement accepted?",
    "Cell Phone Bill Accepted": "Is cell phone bill accepted as POR?",
    "Internet Bill Accepted": "Is internet bill accepted as POR?",
    "Credit Card Statement Accepted": "Is credit card statement accepted as POR?",
    "Insurance Statement Accepted": "Is insurance statement accepted as POR?",
    "POR Maximum Age (Days)": "What is max POR age?",
    "POR Number Required": "How many POR documents are required?",
    "Who Can Override Funding Requirements": "Who can override funding requirements?",
    "Documents That Can Be Waived": "Which documents can be waived?",
    "Corrections Without New Contract": "Which corrections don't require new contract?",
    "Corrections Requiring Resign": "Which corrections require resign?",
    "Situations Requiring New Approval": "What requires a new approval?",
    "Can Fund Pending One Missing Stip": "Can funding happen pending one missing stip?",
    "Can Title Follow Later": "Can title follow later?",
    "Can Payoff Follow Later": "Can payoff follow later?",
    "Can Insurance Follow Later": "Can insurance follow later?",
    "Incorrect APR Recontract Required": "Does incorrect APR require re-contracting?",
    "Incorrect Payment Recontract Required": "Does incorrect payment require re-contracting?",
    "Incorrect Term Recontract Required": "Does incorrect term require re-contracting?",
    "Incorrect Amount Financed Recontract Required": "Does incorrect amount financed require re-contracting?",
    "Incorrect VIN Recontract Required": "Does incorrect VIN require re-contracting?",
    "Incorrect Mileage Recontract Required": "Does incorrect mileage require re-contracting?",
    "Incorrect Color Recontract Required": "Does incorrect color require re-contracting?",
    "Incorrect Trim Recontract Required": "Does incorrect trim require re-contracting?",
    "Incorrect Buyer Address Recontract Required": "Does incorrect buyer address require re-contracting?",
    "Incorrect Buyer Name Recontract Required": "Does incorrect buyer name require re-contracting?",
    "Missing Middle Initial Recontract Required": "Does missing middle initial require re-contracting?",
    "Wrong Dealer Fee Recontract Required": "Does wrong dealer fee require re-contracting?",
    "Wrong Taxes Recontract Required": "Do wrong taxes require re-contracting?",
    "Wrong Title Fee Recontract Required": "Does wrong title fee require re-contracting?",
    "Wrong Registration Recontract Required": "Does wrong registration require re-contracting?",
    "Missing Signatures Recontract Required": "Do missing signatures require re-contracting?",
    "Wrong Product / Backend Recontract Required": "Does wrong product/backend require re-contracting?",
    "Wrong GAP Recontract Required": "Does wrong GAP require re-contracting?",
    "Wrong Warranty Recontract Required": "Does wrong warranty require re-contracting?",
    "Maximum Selling Price Change Without Reapproval": "What selling price change is allowed without reapproval?",
    "Maximum Payment Change Without Reapproval": "What payment change is allowed without reapproval?",
    "Maximum Down Payment Change Without Reapproval": "What down payment change is allowed without reapproval?",
    "Maximum Trade Value Change Without Reapproval": "What trade value change is allowed without reapproval?",
    "Maximum Payoff Change Without Reapproval": "What payoff change is allowed without reapproval?",
    "Maximum Backend Change Without Reapproval": "What backend change is allowed without reapproval?",
    "Maximum Amount Financed Change Without Reapproval": "What AF change is allowed without reapproval?",
    "Maximum APR Change Without Reapproval": "What APR change is allowed without reapproval?",
    "Maximum Term Change Without Reapproval": "What term change is allowed without reapproval?",
    "Dealer Buyback Triggers": "What triggers a dealer buyback?",
    "Repurchase Demand Triggers": "What triggers a repurchase demand?",
    "Reserve Chargeback Triggers": "What triggers reserve chargebacks?",
    "First-Payment Default Review Triggers": "What triggers FPD review?",
    "Dealer Audit Triggers": "What triggers dealer audit review?",
    "Fastest Funding Practices": "What drives fastest funding at this lender?",
    "Top Reason Deals Sit In Funding": "What is the top reason deals sit in funding?",
    "Most Common New Finance Manager Mistake": "Most common new finance manager mistake?",
    "What Usually Causes Immediate Review Escalation": "What causes immediate review escalation?",
}


def hard_stop_items(answers):
    fields = QUESTION_FIELDS["Hard Stop"]
    out = question_items(answers, fields, 12, include_missing=True, max_missing=5)
    if not out:
        out = question_items(answers, [
            "Minimum FICO Score", "Maximum Total LTV", "Maximum Mileage",
            "Maximum Vehicle Age", "Maximum Term", "Maximum AF",
            "Maximum Backend", "Maximum GAP",
        ], 8, include_missing=True, max_missing=5)
    return out


def title_brand_items(answers, include_missing=True, max_missing=2):
    return question_items(answers, TITLE_BRAND_FIELDS, 6, include_missing=include_missing, max_missing=max_missing)


def business_doc_items(answers, business, stips):
    out = []
    out.extend(business)
    for item in stips:
        if any(x in item.lower() for x in ["business", "corporate", "tax id", "ein", "guarant", "resolution"]):
            out.append(item)
    if not out:
        out = question_items(answers, [
            "Minimum Ownership (%)", "Owners Required to Sign (%)", "Owners Required to Guarantee (%)",
            "Minimum Time in Business", "Minimum Annual Revenue", "Minimum Business Bank Statements",
            "Minimum Business Tax Returns", "Minimum Business Credit Score", "Business Resolution",
            "Guaranty", "EIN Letter",
        ], 7, include_missing=True, max_missing=6)
    return unique(out, 6)


def funding_package_items(answers, stips):
    priority_docs = [
        "Retail Installment Contract", "Lease Agreement", "Credit Application", "Buyer's Order",
        "Odometer Statement", "Title Application", "Insurance", "Agreement to Furnish Insurance",
        "Trade Title", "Payoff Authorization", "Lien Release", "Business Resolution", "Guaranty", "EIN Letter",
    ]
    out = []
    for doc_name in priority_docs:
        value = pick_answer(f"{doc_name} Required", answers.get(f"{doc_name} Required", "")) or pick_answer(doc_name, answers.get(doc_name, ""))
        if value:
            out.append(f"{PACKAGE_DOC_SHORT.get(doc_name, doc_name)}: {squeeze(value, 58)}")
    for item in stips:
        if any(x in item.lower() for x in ["contract", "application", "title", "insurance", "odometer", "payoff", "guarant", "resolution", "ein"]):
            out.append(squeeze(item, 58))
    if len(out) < 5:
        missing_docs = []
        for doc_name in priority_docs:
            if pick_answer(f"{doc_name} Required", answers.get(f"{doc_name} Required", "")) or pick_answer(doc_name, answers.get(doc_name, "")):
                continue
            missing_docs.append(f"{PACKAGE_DOC_SHORT.get(doc_name, doc_name)}?")
            if len(missing_docs) >= 4:
                break
        out.extend(missing_docs)
    return unique(out, 6)


def poi_por_items(answers):
    return question_items(answers, [
        "Paystub Accepted", "Payroll Portal Accepted", "W-2 Accepted", "Bank Statements Accepted",
        "Tax Returns Accepted", "POI Maximum Age (Days)", "POI Number Required",
        "Utility Bill Accepted", "Lease Accepted", "Mortgage Statement Accepted",
        "Bank Statement Accepted (POR)", "Cell Phone Bill Accepted", "Internet Bill Accepted",
        "Credit Card Statement Accepted", "POR Maximum Age (Days)", "POR Number Required",
    ], 6, include_missing=True, max_missing=3)


def correction_items(answers):
    fields = [
        "Can Incorrect APR Be Corrected Without Recontracting",
        "Can Incorrect Payment Be Corrected Without Recontracting",
        "Can Incorrect Term Be Corrected Without Recontracting",
        "Can Incorrect Amount Financed Be Corrected Without Recontracting",
        "Can Incorrect VIN Be Corrected Without Recontracting",
        "Can Incorrect Mileage Be Corrected Without Recontracting",
        "Can Missing Signatures Be Corrected Without Recontracting",
        "Can Wrong Product / Backend Be Corrected Without Recontracting",
    ]
    out = question_items(answers, fields, 5, include_missing=True, max_missing=3)
    extra = question_items(answers, [
        "Corrections Without New Contract",
        "Corrections Requiring Resign",
        "Situations Requiring New Approval",
    ], 3)
    return unique(extra + out, 6)


def process_cues():
    return [
        "Contract and funding checks must be present and match booked approval terms",
    ]


def desking_page(story, profile, st, content, hard, business, backend, red, money, answers, product_contact=None):
    page_w = landscape(letter)[0] - 0.12 * inch
    col3 = [page_w / 3, page_w / 3, page_w / 3]
    col2 = [page_w / 2, page_w / 2]
    hard_cards = unique(hard_stop_items(answers) or hard, 6)
    credit_cards = unique(question_items(answers, [
        "Minimum FICO Score", "Lowest Score Ever Considered", "Minimum Total Tradelines (#)",
        "Maximum Number of Open Auto Loans", "Open BK Allowed (Y/N)",
        "Minimum Months Since Discharge", "Minimum Months Since Dismissal",
        "Open Repo Allowed", "Minimum Months Since Repo", "Multiple Repos Allowed (Y/N)",
        "Maximum Collection Amount ($)", "Maximum Number of Collections",
    ], 6, include_missing=True, max_missing=2) + (content.get("credit") or []), 6)
    retail_cards = unique(question_items(answers, [
        "Minimum AF", "Maximum AF", "Minimum Term", "Maximum Term",
        "Maximum Advance (%)", "Maximum Front-End LTV", "Maximum Total LTV",
        "Maximum Negative Equity ($)", "Maximum Vehicle Age", "Maximum Mileage",
    ], 6, include_missing=True, max_missing=1) + title_brand_items(answers, include_missing=True, max_missing=1) + (content.get("retail") or []) + hard, 6)
    lease_cards = unique(question_items(answers, [
        "Base Money Factor", "Maximum MF Markup", "Acquisition Fee", "Disposition Fee",
        "Security Deposit", "Residual Source", "Maximum Cap Cost", "Maximum CCR",
    ], 6, include_missing=True, max_missing=2) + (content.get("lease") or []), 6)
    business_cards = unique(question_items(answers, [
        "Minimum Ownership (%)", "Owners Required to Sign (%)", "Owners Required to Guarantee (%)",
        "Minimum Time in Business", "Minimum Annual Revenue", "Maximum GVWR",
        "Maximum Fleet Size", "Maximum Exposure",
    ], 5, include_missing=True, max_missing=2) + business, 6)
    backend_cards = unique(question_items(answers, [
        "Maximum GAP ($)", "Maximum VSC ($)", "Maximum Backend ($)", "Maximum Backend (%)",
        "Maximum Accessories", "Maximum Dealer Adds",
    ], 5, include_missing=True, max_missing=2) + backend, 6)
    reserve_cards = unique(question_items(answers, [
        "Maximum APR Markup", "Maximum Reserve (%)", "Flat Amount ($)", "Maximum Dealer Participation",
    ], 4, include_missing=True, max_missing=2) + money, 6)
    stop_cards = unique(red + question_items(answers, [
        "Maximum DTI", "Maximum PTI", "Maximum Repo Count", "Maximum Collections",
        "Maximum Charge-Off Amount", "Maximum Foreclosure Count",
    ], 4, include_missing=True, max_missing=1), 6)
    story.extend(header(profile, st, "PAGE 1 - DESKING / ROUTING FIT", product_contact))
    story.append(band("DESKING: CREDIT + STRUCTURE + LANE FIT", st, page_w, BLUE))
    story.append(Spacer(1, 0.02 * inch))
    story.append(row([
        card("Hard Stops", hard_cards, st, col3[0], 1.58 * inch, colors.HexColor("#7F1D1D"), RED, 6),
        card("Credit / BK / Repo", credit_cards, st, col3[1], 1.58 * inch, colors.HexColor("#3730A3"), PURPLE, 6),
        card("Rate / Reserve", reserve_cards, st, col3[2], 1.58 * inch, colors.HexColor("#276749"), GREEN, 6),
    ], col3))
    story.append(row([
        card("Retail / Structure", retail_cards, st, col2[0], 1.58 * inch, BLUE, GRAY, 6),
        card("Lease", lease_cards, st, col2[1], 1.58 * inch, colors.HexColor("#2B6CB0"), colors.HexColor("#EEF6FF"), 6),
    ], col2))
    story.append(row([
        card("Business / Commercial", business_cards, st, col2[0], 1.48 * inch, colors.HexColor("#4A5568"), colors.HexColor("#F7FAFC"), 6),
        card("Products / Backend", backend_cards, st, col2[1], 1.48 * inch, colors.HexColor("#975A16"), AMBER, 6),
    ], col2))
    story.append(row([
        card("Desk Stop / Watch", stop_cards, st, page_w, 1.52 * inch, colors.HexColor("#9B2C2C"), RED, 6),
    ], [page_w]))
    story.append(PageBreak())


def finance_page(story, profile, st, content, hard, business, backend, stips, title, red, front_products, back_products, contact_items, answers, product_contact=None):
    page_w = landscape(letter)[0] - 0.12 * inch
    col3 = [page_w / 3, page_w / 3, page_w / 3]
    if not contact_items:
        contact_items = [
            callback_item("Funding Contact", "Funding"),
            callback_item("Dealer Contact", "Dealer/Underwriting"),
            callback_item("Title Contact", "Title/Payoff"),
        ]
    funding_send = funding_package_items(answers, stips)
    poi_por_view = poi_por_items(answers)
    funding_detail = unique(question_items(answers, [
        "Maximum Contract Age Before Funding (Days)", "Maximum Approval Age Before Funding (Days)",
        "Maximum POI Age (Days)", "Maximum POR Age (Days)", "Maximum Insurance Binder Age (Days)",
        "Maximum Payoff Age (Days)", "Funding Delivery Address", "eContract Available", "Digital Funding", "Paper Funding",
        "Wet Signature Required", "Original Required", "Copy Accepted", "POR Trigger", "Autopay Document",
    ], 6, include_missing=True, max_missing=3), 6)
    title_view = unique(question_items(answers, [
        "Maximum Collision Deductible", "Maximum Comprehensive Deductible", "Minimum Liability Limits",
        "Digital Insurance Accepted", "Insurance Binder Accepted", "Temporary Insurance Accepted",
        "Agreement to Furnish Insurance Accepted", "ELT Required", "Paper Title Accepted",
        "Duplicate Title Accepted", "Lost Title Affidavit Accepted", "Out-of-State Title Accepted",
        "Rebuilt Title Accepted", "Salvage Title Accepted", "Open Title Accepted",
    ], 6, include_missing=True, max_missing=3) + title_brand_items(answers, include_missing=True, max_missing=2) + title, 6)
    front_view = front_products or question_items(answers, [
        "Maximum Front-End LTV", "Maximum Total LTV", "Maximum Dealer Adds", "Maximum Accessories",
        "Maximum Cap Cost", "Maximum CCR",
    ], 6, include_missing=True, max_missing=2)
    back_view = back_products or question_items(answers, [
        "Maximum GAP ($)", "Maximum VSC ($)", "Maximum Backend ($)", "Maximum Backend (%)", "Flat Amount ($)",
        "Maximum Reserve (%)", "Maximum Reserve ($)", "Maximum Backend",
    ], 6, include_missing=True, max_missing=2)
    story.extend(header(profile, st, "PAGE 2 - FINANCE / FUNDING", product_contact))
    story.append(band("FINANCE: FUNDING PACKAGE + STIPS + CONTRACT MATCH", st, page_w, TEAL))
    story.append(Spacer(1, 0.02 * inch))
    story.append(row([
        card("Required Funding Docs", funding_send, st, col3[0], 1.88 * inch, colors.HexColor("#315E7D"), colors.white, 6),
        card("POI / POR", poi_por_view, st, col3[1], 1.88 * inch, TEAL, GREEN, 6),
        card("Contact Map", contact_items, st, col3[2], 1.88 * inch, colors.HexColor("#334155"), colors.HexColor("#F8FAFC"), 5),
    ], col3))
    story.append(row([
        card("Title / Insurance", title_view, st, col3[0], 1.76 * inch, colors.HexColor("#2D3748"), colors.HexColor("#F7FAFC"), 6),
        card("Front-End Products", unique(front_view, 6), st, col3[1], 1.76 * inch, BLUE, GRAY, 6),
        card("Back-End Products", unique(back_view, 6), st, col3[2], 1.76 * inch, colors.HexColor("#975A16"), AMBER, 6),
    ], col3))
    story.append(row([
        card("Corrections", correction_items(answers), st, col3[0], 1.72 * inch, NAVY, CYAN, 6),
        card("Funding Killers", red + [
            "Wrong APR/rate, VIN, mileage, contract date, product price, or amount financed",
            "Missing signature, title, insurance, or stale docs can fail funding",
        ], st, col3[1], 1.72 * inch, colors.HexColor("#9B2C2C"), RED, 6),
        card("Business / Timing", unique(business_doc_items(answers, business, stips) + funding_detail, 6), st, col3[2], 1.72 * inch, colors.HexColor("#4A5568"), colors.HexColor("#F7FAFC"), 6),
    ], col3))
    story.append(PageBreak())


def question_page(story, profile, st, answers, product_contact=None):
    page_w = landscape(letter)[0] - 0.24 * inch
    col3 = [page_w / 3, page_w / 3, page_w / 3]
    story.extend(header(profile, st, "PAGE 3 - HARD STOPS / FIELD ANSWERS", product_contact))
    story.append(band("HARD STOPS + PUBLISHED QUESTION ANSWERS", st, page_w, NAVY))
    story.append(Spacer(1, 0.04 * inch))
    story.append(row([
        card("Hard Stops", hard_stop_items(answers), st, col3[0], 1.68 * inch, colors.HexColor("#7F1D1D"), RED, 10),
        card("Credit / BK / Repo", question_items(answers, [
            "Minimum FICO Score", "Lowest Score Ever Considered", "Minimum Total Tradelines (#)",
            "Maximum Number of Open Auto Loans", "Open BK Allowed (Y/N)",
            "Minimum Months Since Discharge", "Minimum Months Since Dismissal",
            "Open Repo Allowed", "Minimum Months Since Repo", "Multiple Repos Allowed (Y/N)",
        ], 9), st, col3[1], 1.68 * inch, colors.HexColor("#3730A3"), PURPLE, 9),
        card("Income / Identity", question_items(answers, [
            "Minimum Monthly Income ($)", "Maximum DTI (%)", "Maximum PTI (%)",
            "Minimum Self-Employment Time (Years)", "Driver License Required (Y/N)",
            "Foreign License Accepted", "ITIN Program Available", "SSN Required",
        ], 8), st, col3[2], 1.68 * inch, TEAL, GREEN, 8),
    ], col3))
    story.append(row([
        card("Amount / Term / LTV", question_items(answers, [
            "Minimum AF", "Maximum AF", "Minimum Term", "Maximum Term",
            "Maximum Advance (%)", "Maximum Front-End LTV", "Maximum Total LTV",
            "Maximum Negative Equity ($)",
        ], 8), st, col3[0], 1.54 * inch, BLUE, GRAY, 8),
        card("Vehicle / Lease", question_items(answers, [
            "Maximum Vehicle Age", "Maximum Mileage", "Minimum Vehicle Value",
            "Base Money Factor", "Maximum MF Markup", "Acquisition Fee",
            "Disposition Fee", "Residual Source", "Maximum Cap Cost",
        ], 8), st, col3[1], 1.54 * inch, colors.HexColor("#2B6CB0"), colors.HexColor("#EEF6FF"), 8),
        card("Backend / Reserve", question_items(answers, [
            "Maximum APR Markup", "Maximum Reserve (%)", "Flat Amount ($)",
            "Maximum GAP ($)", "Maximum VSC ($)", "Maximum Backend ($)",
            "Maximum Backend (%)", "Maximum Accessories",
        ], 8), st, col3[2], 1.54 * inch, colors.HexColor("#975A16"), AMBER, 8),
    ], col3))
    story.append(row([
        card("Funding / Docs", question_items(answers, [
            "Maximum Contract Age Before Funding (Days)", "Maximum Approval Age Before Funding (Days)",
            "Maximum POI Age (Days)", "Maximum POR Age (Days)", "Retail Installment Contract",
            "Credit Application", "Odometer Statement", "Agreement to Furnish Insurance",
            "Title Application", "Business Resolution", "Guaranty", "EIN Letter",
        ], 10), st, col3[0], 1.65 * inch, colors.HexColor("#315E7D"), colors.white, 10),
        card("Business / Commercial", question_items(answers, [
            "Minimum Ownership (%)", "Owners Required to Sign (%)", "Owners Required to Guarantee (%)",
            "Minimum Time in Business", "Minimum Annual Revenue", "Maximum GVWR",
            "Maximum Fleet Size", "Maximum Exposure",
        ], 8), st, col3[1], 1.65 * inch, colors.HexColor("#4A5568"), colors.HexColor("#F7FAFC"), 8),
        card("Insurance / Titles", question_items(answers, [
            "Maximum Collision Deductible", "Maximum Comprehensive Deductible",
            "Minimum Liability Limits", "Insurance", "Trade Title", "Payoff Authorization",
            "Lien Release", "Power of Attorney",
        ], 8), st, col3[2], 1.65 * inch, colors.HexColor("#2D3748"), colors.HexColor("#F8FAFC"), 8),
    ], col3))
    story.append(row([
        card("Matrix Note", [
            "Full checklist is in RouteOne Bank Question Matrix.csv / .xlsx",
            "Blank matrix cells are fields the PDFs do not publish as static desk rules",
            "Use this page for fast desk decisions; use matrix to audit every question field",
        ], st, page_w, 0.76 * inch, NAVY, CYAN, 3),
    ], [page_w]))
    story.append(PageBreak())


def flow_box(label, text, st, width, bg):
    table = Table([[para(label, st["label"])], [para(text, st["small"])]], colWidths=[width], rowHeights=[0.25 * inch, 0.58 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), bg),
        ("BACKGROUND", (0, 1), (-1, 1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table


def build_front(story, profiles, st):
    page_w = landscape(letter)[0] - 0.5 * inch
    story.append(Spacer(1, 0.38 * inch))
    story.append(para("ROUTEONE DESK + FUNDING PLAYBOOK", st["cover"]))
    story.append(para("Specific bank cheat sheets with the credit-routing process folded in", st["subtitle"]))
    story.append(Spacer(1, 0.25 * inch))
    story.append(band("HOW THE CREDIT ROUTING PROCESS ACTUALLY WORKS", st, page_w, NAVY))
    story.append(Spacer(1, 0.08 * inch))
    boxes = [
        ("1. App", "Quick app captures the minimum identity/residence/income data needed to pull bureau."),
        ("2. Bureau", "Bureau is normalized into score, debts, public records, trades, and alert messages."),
        ("3. Fit", "Deal is checked against lender-specific fields, credit gates, structure, collateral, and products."),
        ("4. Route", "Dealer sends to one lender, several at once, or a sequence with fallback timing."),
        ("5. Decision", "Lender returns approve, conditional approve, decline/reason, pending/info request, or error."),
        ("6. Book/Fund", "Chosen lender is booked; contract, products, stips, title, and insurance must match approval."),
    ]
    story.append(row([flow_box(a, b, st, 1.63 * inch, CYAN) for a, b in boxes[:3]], [3.38 * inch, 3.38 * inch, 3.38 * inch]))
    story.append(row([flow_box(a, b, st, 1.63 * inch, GREEN) for a, b in boxes[3:]], [3.38 * inch, 3.38 * inch, 3.38 * inch]))
    story.append(Spacer(1, 0.12 * inch))
    story.append(row([
        card("Before You Submit", [
            "Customer gate: score, credit depth, thin file, repo/collection/BK rules, income, ID",
            "Collateral gate: new/used/CPO/demo, age, mileage, valuation source, title path",
            "Structure gate: amount, term, LTV/advance, negative equity, PTI/DTI, first payment",
            "Product gate: GAP, VSC/ESC, maintenance, tire/wheel, accessories, dealer adds",
        ], st, 5.05 * inch, 1.70 * inch, BLUE, GRAY, 5),
        card("After Decision", [
            "Approved: contract exactly to approval",
            "Conditional: collect every stip before delivery/funding",
            "Pending/info request: fix the missing field, document, or mismatch",
            "Decline/bad terms/no response: rehash or route to backup lender",
        ], st, 5.05 * inch, 1.70 * inch, TEAL, GREEN, 5),
    ], [5.08 * inch, 5.08 * inch]))
    story.append(Spacer(1, 0.08 * inch))
    story.append(card("What Changed In This Version", [
        "Two pages per bank: desking first, finance/funding second",
        "Hard-stop answers are folded into those two pages instead of a separate matrix page",
        "Bigger text and fewer long sentences",
        "Credit flags call out repos, collections, thin-file, bankruptcy, tradelines, and FTB when published",
        "Each bank separates front-end collateral adds from back-end finance products",
        "Contacts are labeled as funding, dealer/underwriting support, title/payoff, or named reps",
        "Funding is a checklist-style package, not a vague reminder",
    ], st, page_w, 1.20 * inch, colors.HexColor("#0F172A"), colors.white, 7))
    story.append(PageBreak())


def build_bank_map(story, profiles, st):
    page_w = landscape(letter)[0] - 0.5 * inch
    story.append(para("BANK MAP / 60-SECOND INDEX", st["bank"]))
    story.append(band("Use this to pick a lender page fast, then confirm the exact page rules before contracting", st, page_w, BLUE))
    rows = [["Bank", "Lanes", "States", "Main hard limit extract"]]
    for prof in profiles:
        fields = visual.field_dict(prof)
        hard = " | ".join(x for x in [
            fields.get("Min FICO / score") or fields.get("Credit profile"),
            fields.get("Terms"),
            fields.get("Advance / LTV"),
        ] if x)
        rows.append([
            para(squeeze(prof["bank"], 34), st["small"]),
            para(squeeze(", ".join(visual.lane_chips(prof)), 38), st["small"]),
            para(squeeze(visual.states_short(prof), 28), st["small"]),
            para(squeeze(hard, 120), st["small"]),
        ])
    for start in range(1, len(rows), 13):
        if start > 1:
            story.append(PageBreak())
            story.append(para("BANK MAP / 60-SECOND INDEX", st["bank"]))
        table_rows = [rows[0]] + rows[start:start + 13]
        table = Table(table_rows, colWidths=[2.0 * inch, 2.1 * inch, 1.6 * inch, 4.45 * inch], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8.3),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(Spacer(1, 0.08 * inch))
        story.append(table)
    story.append(PageBreak())


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    profiles = json.loads(DATA.read_text(encoding="utf-8"))
    st = styles()
    raw_records_by_bank = juice.load_records()
    # Keep the generator rate-only: only use rate/program documents for both pages + matrix.
    # Forms/checklists are not allowed to influence this compile.
    rate_records_by_bank = {bank: select_rate_records(rows) for bank, rows in raw_records_by_bank.items()}
    verified_by_bank = load_verified_lines_by_bank()
    funding_overrides = build_rate_funding_overrides(rate_records_by_bank)
    section_overrides = build_rate_section_overrides(rate_records_by_bank)
    product_contact_overrides = build_product_contact_overrides(profiles, rate_records_by_bank)
    credit_exception_overrides = build_credit_exception_overrides(profiles, rate_records_by_bank)
    question_matrix = build_question_matrix(
        profiles,
        funding_overrides,
        section_overrides,
        product_contact_overrides,
        credit_exception_overrides,
        verified_by_bank,
        rate_records_by_bank,
        rate_records_by_bank,
    )
    write_question_matrix_csv(profiles, question_matrix)

    doc = BaseDocTemplate(
        str(OUT),
        pagesize=landscape(letter),
        leftMargin=0.05 * inch,
        rightMargin=0.05 * inch,
        topMargin=0.05 * inch,
        bottomMargin=0.05 * inch,
    )
    w, h = landscape(letter)
    doc.addPageTemplates([
        PageTemplate(
            id="main",
            frames=[Frame(doc.leftMargin, doc.bottomMargin, w - doc.leftMargin - doc.rightMargin, h - doc.topMargin - doc.bottomMargin)],
        )
    ])

    story = []
    # Keep output tight: 2 pages per bank.
    if INCLUDE_PREP_PAGES:
        build_front(story, profiles, st)
        build_bank_map(story, profiles, st)
    for profile in profiles:
        rate_rows = rate_records_by_bank.get(profile["bank"], [])
        content, hard, business, backend, stips, title, red, money, front_products, back_products, contact_items, product_contact = profile_data(
            profile,
            funding_overrides,
            section_overrides,
            product_contact_overrides,
            credit_exception_overrides,
            verified_by_bank,
            rate_rows=rate_rows,
            all_rows=rate_rows,
        )
        answers = question_matrix.get(profile["bank"], {})
        desking_page(story, profile, st, content, hard, business, backend, red, money, answers, product_contact)
        finance_page(story, profile, st, content, hard, business, backend, stips, title, red, front_products, back_products, contact_items, answers, product_contact)

    if story and isinstance(story[-1], PageBreak):
        story.pop()
    doc.build(story)
    if DESKTOP_OUT.resolve() != OUT.resolve():
        DESKTOP_OUT.write_bytes(OUT.read_bytes())
    print(OUT)
    print(DESKTOP_OUT)
    print(MATRIX_CSV)
    print(DESKTOP_MATRIX_CSV)


if __name__ == "__main__":
    main()
