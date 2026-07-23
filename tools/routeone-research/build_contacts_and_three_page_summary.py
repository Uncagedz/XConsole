import csv
import html
import json
import math
import os
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import BaseDocTemplate, Frame, KeepInFrame, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_desk_funding_playbook_v2 as desk


ROOT = Path(os.environ.get("ROUTEONE_ROOT", Path.cwd() / "data" / "routeone"))
OUTPUT_DIR = Path(os.environ.get("ROUTEONE_OUTPUT_DIR", ROOT / "generated"))
CONTACT_PDF = OUTPUT_DIR / "RouteOne All Bank Contacts - One Page.pdf"
SUMMARY_PDF = OUTPUT_DIR / "RouteOne 3 Page Bank Summary Cheat Sheet.pdf"
MATRIX_CSV = OUTPUT_DIR / "RouteOne Bank Question Matrix.csv"
SUMMARY_COL_WIDTHS = [1.95 * inch, 1.80 * inch, 3.65 * inch, 3.28 * inch]
SUMMARY_ROW_HEIGHT = 0.68 * inch

NAVY = colors.HexColor("#12263A")
BLUE = colors.HexColor("#1F5C8B")
TEAL = colors.HexColor("#0F766E")
GRAY = colors.HexColor("#F5F7FA")
LINE = colors.HexColor("#A7B0BB")
DARK = colors.HexColor("#111827")
AMBER = colors.HexColor("#FFF3C4")
GREEN = colors.HexColor("#E4F4EA")
RED = colors.HexColor("#FAD7D7")


def esc(value):
    return html.escape(str(value or ""), quote=False)


def clean(value):
    return desk.squeeze(str(value or ""), 120)


def compact(value, limit=88):
    value = desk.clean(str(value or ""))
    value = re.sub(r"\bCALL LENDER FOR EXACT RULE \(NO FORMAL LIMIT PUBLISHED\)\b", "?", value)
    value = re.sub(r"\s+", " ", value).strip(" -;:")
    if len(value) <= limit:
        return value
    return desk.squeeze(value, limit)


def p(value, style):
    return Paragraph(esc(value), style)


def p_html(value, style):
    return Paragraph(value, style)


def html_lines(items):
    return "<br/>".join(esc(item) for item in items if item)


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("Title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=20, leading=22, alignment=TA_CENTER, textColor=NAVY),
        "sub": ParagraphStyle("Sub", parent=base["Normal"], fontName="Helvetica", fontSize=10.5, leading=12, alignment=TA_CENTER, textColor=colors.HexColor("#334155")),
        "head": ParagraphStyle("Head", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=10.1, leading=11.0, alignment=TA_CENTER, textColor=colors.white),
        "bank": ParagraphStyle("Bank", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.8, leading=9.7, alignment=TA_LEFT, textColor=NAVY),
        "contact": ParagraphStyle("Contact", parent=base["Normal"], fontName="Helvetica", fontSize=10.2, leading=11.0, alignment=TA_LEFT, textColor=DARK),
        "tiny": ParagraphStyle("Tiny", parent=base["Normal"], fontName="Helvetica", fontSize=7.5, leading=8.3, alignment=TA_LEFT, textColor=DARK),
        "small": ParagraphStyle("Small", parent=base["Normal"], fontName="Helvetica", fontSize=9.5, leading=10.0, alignment=TA_LEFT, textColor=DARK),
        "small_bold": ParagraphStyle("SmallBold", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=9.5, leading=10.0, alignment=TA_LEFT, textColor=NAVY),
        "summary_title": ParagraphStyle("SummaryTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=15.5, leading=17, alignment=TA_CENTER, textColor=NAVY),
        "summary_sub": ParagraphStyle("SummarySub", parent=base["Normal"], fontName="Helvetica", fontSize=9.0, leading=9.5, alignment=TA_CENTER, textColor=colors.HexColor("#334155")),
    }


def make_doc(path):
    doc = BaseDocTemplate(
        str(path),
        pagesize=landscape(letter),
        leftMargin=0.12 * inch,
        rightMargin=0.12 * inch,
        topMargin=0.10 * inch,
        bottomMargin=0.10 * inch,
    )
    w, h = landscape(letter)
    doc.addPageTemplates([
        PageTemplate(
            id="main",
            frames=[Frame(
                doc.leftMargin,
                doc.bottomMargin,
                w - doc.leftMargin - doc.rightMargin,
                h - doc.topMargin - doc.bottomMargin,
                leftPadding=0,
                rightPadding=0,
                topPadding=0,
                bottomPadding=0,
            )],
        )
    ])
    return doc


def load_matrix():
    out = {}
    with MATRIX_CSV.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            bank = row["Bank"]
            field = row["Field"]
            answer = row["Answer"].strip()
            out.setdefault(bank, {})[field] = "" if answer == "?" else answer
    return out


def answer(matrix, bank, *fields):
    answers = matrix.get(bank, {})
    for field in fields:
        value = answers.get(field, "")
        value = desk.pick_answer(field, value)
        if value:
            return value
    return ""


def yes_no_short(value):
    value = compact(value, 72)
    value = value.replace("Y - ", "").replace("N - ", "No - ")
    return value


def contact_parts(items):
    roles = []
    for wanted, label in [
        ("Funding:", "Funding"),
        ("Dealer/Underwriting:", "Dealer/UW"),
        ("Title/Payoff:", "Title/Payoff"),
        ("Collections/Servicing:", "Servicing"),
        ("Named Reps:", "Names"),
        ("General:", "Other"),
    ]:
        for item in items or []:
            if item.startswith(wanted):
                value = item.split(":", 1)[1].strip()
                value = desk.compact_contact_text(value, max_parts=3)
                if value:
                    roles.append(f"{label}: {compact(value, 92)}")
                break
    return roles


def build_contact_data(profiles):
    records_by_bank = desk.juice.load_records()
    rate_records = {bank: desk.select_rate_records(rows) for bank, rows in records_by_bank.items()}
    product_contacts = desk.build_product_contact_overrides(profiles, rate_records)
    out = []
    for profile in profiles:
        bank = profile["bank"]
        items = product_contacts.get(bank, {}).get("contacts") or []
        parts = contact_parts(items)
        if not parts and profile.get("contacts"):
            parts = [f"General: {compact(profile['contacts'], 120)}"]
        if not parts:
            parts = ["Funding: ?", "Dealer/UW: ?", "Title/Payoff: ?"]
        out.append((bank, parts))
    return out


def contact_cell(bank, parts, st):
    if parts and all(x.endswith(": ?") or x.endswith("?") for x in parts):
        parts = ["Funding?  Underwriting?  Title?"]
    label_map = {
        "Funding": "Funding",
        "Dealer/UW": "Underwriting",
        "Dealer/Underwriting": "Underwriting",
        "Title/Payoff": "Title",
        "Servicing": "Svc",
        "Names": "Name",
        "Other": "Other",
        "General": "Other",
    }
    short_parts = []
    for part in parts[:4]:
        if ":" in part:
            label, value = part.split(":", 1)
            label = label_map.get(label.strip(), label.strip())
            value = compact(value, 38)
            short_parts.append(f"{label}: {value}")
        else:
            short_parts.append(compact(part, 42))
    ordered = []
    for prefix in ["Funding:", "Underwriting:", "Title:", "Name:", "Svc:", "Other:"]:
        ordered.extend(x for x in short_parts if x.startswith(prefix))
    if not ordered:
        ordered = short_parts
    body = f"<b>{esc(bank)}</b><br/>" + "<br/>".join(esc(x) for x in ordered[:4])
    block = KeepInFrame(2.36 * inch, 0.80 * inch, [p_html(body, st["contact"])], mode="shrink", vAlign="TOP")
    return block


def build_contact_pdf(profiles, st):
    contacts = build_contact_data(profiles)
    story = [
        p("ROUTEONE BANK CONTACT DIRECTORY", st["title"]),
        p("One-page print version. Funding and Underwriting are written out; Name appears when a named rep is published.", st["sub"]),
        Spacer(1, 0.05 * inch),
    ]
    cols = 4
    rows_per_col = math.ceil(len(contacts) / cols)
    columns = [contacts[i * rows_per_col:(i + 1) * rows_per_col] for i in range(cols)]
    rows = []
    for row_idx in range(rows_per_col):
        row_cells = []
        for col_idx in range(cols):
            row_cells.append(
                contact_cell(columns[col_idx][row_idx][0], columns[col_idx][row_idx][1], st)
                if row_idx < len(columns[col_idx])
                else ""
            )
        rows.append(row_cells)
    table = Table(rows, colWidths=[2.53 * inch, 2.53 * inch, 2.53 * inch, 2.53 * inch], rowHeights=[0.90 * inch] * rows_per_col)
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(table)
    make_doc(CONTACT_PDF).build(story)


def lane_text(profile):
    lanes = " / ".join(desk.visual.lane_chips(profile))
    states = desk.visual.states_short(profile)
    date = profile.get("program_date") or ""
    bits = [x for x in [lanes, states, date] if x]
    return " | ".join(bits)


def states_text(profile):
    states = profile.get("states") or desk.visual.states_short(profile) or "?"
    states = states.replace("Multi-state / national", "National/multi")
    states = states.replace("Multi-state", "Multi-state")
    if re.fullmatch(r"(?:[A-Z]{2},?\s*){4,}", states):
        states = states.replace(", ", " ")
    return compact(states, 62)


def lanes_text(profile):
    lanes = ", ".join(desk.visual.lane_chips(profile)) or "?"
    lanes = lanes.replace("Business/Commercial", "Business/Comm")
    lanes = lanes.replace("Powersport/RV/Marine", "Powersport/RV")
    lanes = lanes.replace("Retail/Funding", "Retail")
    return compact(lanes, 60)


def important_vehicle_flags(matrix, bank):
    flags = []
    for field, label in [
        ("Salvage Title Accepted", "salvage"),
        ("Rebuilt Title Accepted", "rebuilt"),
        ("Total Loss Vehicle Allowed", "total loss"),
        ("Branded Title Allowed", "branded"),
    ]:
        value = answer(matrix, bank, field)
        if value:
            low = value.lower().strip()
            if low.startswith("n") or low.startswith("no"):
                yn = "N"
            elif low.startswith("y") or low.startswith("yes"):
                yn = "Y"
            else:
                continue
            flags.append(f"{label} {yn}")
    return flags[:2]


def ask_list(matrix, bank, fields):
    missing = []
    for field, label in fields:
        if not answer(matrix, bank, field):
            missing.append(label)
        if len(missing) >= 3:
            break
    return ", ".join(missing)


def short_product_name(value):
    value = clean(value)
    replacements = [
        ("Dealer-installed options / DIOs", "DIO"),
        ("Upfit / conversion / mobility equipment", "upfit"),
        ("Accessories / dealer adds", "adds"),
        ("Hard-add aftermarket value", "hard-adds"),
        ("Factory options / MSRP / Monroney", "factory/MSRP"),
        ("VSC / ESC / service contract / warranty", "VSC/warranty"),
        ("Tire & wheel", "tire/wheel"),
        ("Paint/fabric/leather / appearance", "appearance"),
        ("Etch / theft / catalytic converter", "etch/theft"),
        ("Paintless dent repair", "PDR"),
        ("Product contract/certificate required when sold", "product docs req"),
        ("Aftermarket products: list outside vehicle section, product docs required", "backend docs req"),
    ]
    for old, new in replacements:
        value = value.replace(old, new)
    value = re.sub(r":\s*\?", "", value)
    return compact(value, 26)


def cap_text(value):
    caps = []
    for hit in re.findall(r"\$\s*\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?\s*%", value):
        hit = re.sub(r"\s+", "", hit)
        hit = hit.strip(".,;:")
        if hit not in caps:
            caps.append(hit)
        if len(caps) >= 2:
            break
    return "/".join(caps)


def product_tokens(item, front=False):
    raw = clean(item)
    low = raw.lower()
    if not raw or "?" in raw and len(raw) < 28:
        return []
    if any(noise in low for noise in [
        "saturday 9:00",
        "funding delays",
        "product refunds",
        "max deductibles",
        "lender copy of all ancillary",
        "backend may be cut",
        "not included in the total backend allowance",
    ]):
        return []
    cap = cap_text(raw)
    suffix = f" {cap}" if cap else ""
    tokens = []
    if front:
        if any(x in low for x in ["dealer-installed", "dealer installed", "dio", "dealer adds", "accessories"]):
            tokens.append("DIO/adds" + suffix)
        if any(x in low for x in ["upfit", "conversion", "mobility"]):
            tokens.append("upfit" + suffix)
        if any(x in low for x in ["factory", "msrp", "monroney"]):
            tokens.append("factory/MSRP" + suffix)
        if "hard-add" in low or "hard add" in low:
            tokens.append("hard-adds" + suffix)
        return tokens
    if "backend cap" in low or "back-end products cannot exceed" in low or "backend products" in low and cap:
        tokens.append("backend cap" + suffix)
    if "gap" in low:
        tokens.append("GAP" + suffix)
    if any(x in low for x in ["vsc", "esc", "service contract", "warranty"]):
        tokens.append("VSC" + suffix)
    if "maintenance" in low:
        tokens.append("maint" + suffix)
    if "tire" in low and "wheel" in low:
        tokens.append("tire/wheel" + suffix)
    if any(x in low for x in ["paint/fabric", "paint fabric", "leather", "appearance"]):
        tokens.append("appearance" + suffix)
    if any(x in low for x in ["etch", "theft", "catalytic converter"]):
        tokens.append("etch/theft" + suffix)
    if "key replacement" in low:
        tokens.append("key" + suffix)
    if any(x in low for x in ["credit life", "a&h", "disability"]):
        tokens.append("credit life/A&H" + suffix)
    return tokens


def product_token(item, front=False):
    tokens = product_tokens(item, front=front)
    return tokens[0] if tokens else ""


def product_summary(items, fallback="", limit=4, front=False):
    by_base = {}
    ordered_bases = []
    source = list(items or [])
    if fallback:
        source.append(fallback)
    for item in source:
        item = str(item or "")
        low = item.lower()
        if "?" in item and len(item) < 28:
            continue
        for product in product_tokens(item, front=front):
            if not product or product == "?":
                continue
            base = re.sub(r"\s+\$.*$", "", product)
            base = re.sub(r"\s+\d+(?:\.\d+)?%.*$", "", base)
            if base not in by_base:
                ordered_bases.append(base)
                by_base[base] = product
            elif ("$" in product or "%" in product) and ("$" not in by_base[base] and "%" not in by_base[base]):
                by_base[base] = product
            if len(ordered_bases) >= limit:
                break
        if len(ordered_bases) >= limit:
            break
    cleaned = [by_base[base] for base in ordered_bases[:limit]]
    return ", ".join(cleaned) if cleaned else "?"


def summary_cell(lines, st, width, height):
    html_body = "<br/>".join(line for line in lines if line)
    return KeepInFrame(width, height, [p_html(html_body, st["small"])], mode="shrink", vAlign="TOP")


def kv(label, value, limit=72):
    return f"<b>{esc(label)}:</b> {esc(compact(value, limit))}"


def recontract_summary(matrix, bank):
    fields = [
        ("Can Incorrect APR Be Corrected Without Recontracting", "APR"),
        ("Can Incorrect Payment Be Corrected Without Recontracting", "payment"),
        ("Can Incorrect Term Be Corrected Without Recontracting", "term"),
        ("Can Incorrect Amount Financed Be Corrected Without Recontracting", "AF"),
        ("Can Incorrect VIN Be Corrected Without Recontracting", "VIN"),
        ("Can Incorrect Mileage Be Corrected Without Recontracting", "mileage"),
        ("Can Missing Signatures Be Corrected Without Recontracting", "signature"),
        ("Can Wrong Product / Backend Be Corrected Without Recontracting", "backend"),
        ("Can Wrong GAP Be Corrected Without Recontracting", "GAP"),
        ("Can Wrong Warranty Be Corrected Without Recontracting", "warranty"),
    ]
    must_recontract = []
    can_correct = []
    for field, label in fields:
        value = answer(matrix, bank, field)
        low = value.lower().strip()
        if low.startswith("n"):
            must_recontract.append(label)
        elif low.startswith("y"):
            can_correct.append(label)
    explicit = answer(matrix, bank, "Corrections Requiring Resign")
    if explicit:
        explicit_clean = compact(explicit, 58)
        bad = explicit_clean.lower()
        if not any(x in bad for x in ["that the 8th is a sunday", "odometer statement buyers order"]):
            return compact("Recontract: " + explicit_clean, 58)
    if must_recontract:
        return "Recontract: " + "/".join(must_recontract[:5])
    if can_correct:
        return "Can fix: " + "/".join(can_correct[:4])
    return "Recontract: ask APR/payment/VIN/signature"


def summary_row(profile, matrix, contacts, product_overrides, st):
    bank = profile["bank"]
    cparts = contact_parts(contacts.get(bank, []))
    funding_contact = next((x for x in cparts if x.startswith("Funding:")), "")
    dealer_contact = next((x for x in cparts if x.startswith("Dealer/UW:")), "")
    products = product_overrides.get(bank, {})

    score = answer(matrix, bank, "Minimum FICO Score", "Lowest Score Ever Considered")
    ltv = answer(matrix, bank, "Maximum Total LTV", "Maximum Advance (%)", "Maximum LTV Ever")
    term = answer(matrix, bank, "Maximum Term")
    miles = answer(matrix, bank, "Maximum Mileage", "Maximum Mileage Ever")
    age = answer(matrix, bank, "Maximum Vehicle Age")
    markup = answer(matrix, bank, "Maximum APR Markup", "Maximum Dealer Participation")
    reserve = answer(matrix, bank, "Maximum Reserve (%)")
    flat = answer(matrix, bank, "Flat Amount ($)", "Maximum Reserve ($)")
    gap = answer(matrix, bank, "Maximum GAP ($)", "Maximum GAP")
    vsc = answer(matrix, bank, "Maximum VSC ($)", "Maximum Warranty")
    contract_age = answer(matrix, bank, "Maximum Contract Age Before Funding (Days)")
    approval_age = answer(matrix, bank, "Maximum Approval Age Before Funding (Days)")
    funding_address = answer(matrix, bank, "Funding Delivery Address")
    docs = []
    for field, label in [
        ("Retail Installment Contract Required", "RIC"),
        ("Credit Application Required", "App"),
        ("Title Application Required", "Title"),
        ("Insurance Required", "Ins"),
        ("Agreement to Furnish Insurance Required", "ATFI"),
    ]:
        if answer(matrix, bank, field):
            docs.append(label)

    desk_bits = []
    for label, value in [("Score", score), ("LTV", ltv), ("Term", term), ("Miles", miles), ("Age", age)]:
        if value:
            desk_bits.append(f"{label} {compact(value, 30)}")
    desk_bits.extend(important_vehicle_flags(matrix, bank))
    if not desk_bits:
        ask = ask_list(matrix, bank, [("Minimum FICO Score", "score"), ("Maximum Total LTV", "LTV"), ("Maximum Term", "term")])
        desk_bits.append("Ask: " + ask if ask else "Desk rules: ?")
    desk_lines = [kv(label, value, 34) for label, value in [
        ("Score", score or "?"),
        ("LTV", ltv or "?"),
        ("Term", term or "?"),
    ]]
    extra_limits = []
    if miles:
        extra_limits.append("Mi " + compact(miles, 18))
    if age:
        extra_limits.append("Age " + compact(age, 18))
    extra_limits.extend(important_vehicle_flags(matrix, bank))
    if extra_limits:
        desk_lines.append(kv("Veh", " / ".join(extra_limits), 54))

    money_bits = []
    for label, value in [("Markup", markup), ("Reserve", reserve), ("Flat", flat)]:
        if value:
            money_bits.append(f"{label}: {compact(value, 28)}")
    if not money_bits:
        money_bits.append("Markup/reserve: ?")
    front = product_summary(products.get("front_products") or [], "", limit=4, front=True)
    back_seed = []
    if gap:
        back_seed.append("GAP " + compact(gap, 18))
    if vsc:
        back_seed.append("VSC " + compact(vsc, 18))
    back_items = list(products.get("back_products") or []) + back_seed
    back = product_summary(back_items, "", limit=5, front=False)
    product_lines = [
        kv("Markup", compact(markup, 38) if markup else "?"),
        kv("Reserve", compact(reserve or flat, 38) if (reserve or flat) else "?"),
        kv("Front-end", front, 94),
        kv("Back-end", back, 104),
    ]

    funding_bits = []
    ages = []
    if contract_age:
        ages.append("C " + compact(contract_age, 18))
    if approval_age:
        ages.append("Appr " + compact(approval_age, 18))
    if ages:
        funding_bits.append("Age: " + " / ".join(ages))
    if docs:
        funding_bits.append("Docs: " + "/".join(docs[:5]))
    if funding_contact:
        funding_bits.append(compact(funding_contact, 58))
    elif dealer_contact:
        funding_bits.append(compact(dealer_contact, 58))
    funding_bits.append(recontract_summary(matrix, bank))
    funding_lines = []
    if ages:
        funding_lines.append(kv("Age", " / ".join(ages), 54))
    if docs:
        funding_lines.append(kv("Docs", "/".join(docs[:5]), 54))
    if funding_contact:
        funding_lines.append(kv("Funding", funding_contact.replace("Funding:", "").strip(), 76))
    elif dealer_contact:
        funding_lines.append(kv("Underwriting", dealer_contact.replace("Dealer/UW:", "").strip(), 76))
    funding_lines.append(kv("Recontract", recontract_summary(matrix, bank).replace("Recontract:", "").replace("Can fix:", "can fix").strip(), 86))

    cells = [
        summary_cell([
            f"<b>{esc(bank)}</b>",
            kv("States", states_text(profile), 70),
            kv("Lanes", lanes_text(profile), 70),
        ], st, SUMMARY_COL_WIDTHS[0] - 0.10 * inch, SUMMARY_ROW_HEIGHT - 0.06 * inch),
        summary_cell(desk_lines[:4], st, SUMMARY_COL_WIDTHS[1] - 0.10 * inch, SUMMARY_ROW_HEIGHT - 0.06 * inch),
        summary_cell(product_lines, st, SUMMARY_COL_WIDTHS[2] - 0.10 * inch, SUMMARY_ROW_HEIGHT - 0.06 * inch),
        summary_cell(funding_lines[:4], st, SUMMARY_COL_WIDTHS[3] - 0.10 * inch, SUMMARY_ROW_HEIGHT - 0.06 * inch),
    ]
    return cells


def page_header(story, title, subtitle, st):
    story.append(p(title, st["summary_title"]))
    story.append(p(subtitle, st["summary_sub"]))
    story.append(Spacer(1, 0.03 * inch))


def build_summary_pdf(profiles, st):
    matrix = load_matrix()
    contact_data = build_contact_data(profiles)
    contacts_by_bank = {bank: parts for bank, parts in contact_data}
    records_by_bank = desk.juice.load_records()
    rate_records_by_bank = {bank: desk.select_rate_records(rows) for bank, rows in records_by_bank.items()}
    product_overrides = desk.build_product_contact_overrides(profiles, rate_records_by_bank)
    pages = [profiles[:11], profiles[11:22], profiles[22:]]
    story = []
    for page_idx, group in enumerate(pages, 1):
        if page_idx > 1:
            story.append(PageBreak())
        page_header(story, f"ROUTEONE 3-PAGE BANK SUMMARY - PAGE {page_idx}", "States, desk limits, product classification, markup/reserve, funding, and correction triggers.", st)
        rows = [[p("Bank / States", st["head"]), p("Deal Limits", st["head"]), p("Markup + Products", st["head"]), p("Funding + Recontract", st["head"])]]
        for profile in group:
            rows.append(summary_row(profile, matrix, contacts_by_bank, product_overrides, st))
        table = Table(rows, colWidths=SUMMARY_COL_WIDTHS, rowHeights=[0.25 * inch] + [SUMMARY_ROW_HEIGHT] * len(group), repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, LINE),
            ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        story.append(table)
    make_doc(SUMMARY_PDF).build(story)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    profiles = json.loads(desk.DATA.read_text(encoding="utf-8"))
    st = styles()
    build_contact_pdf(profiles, st)
    build_summary_pdf(profiles, st)
    print(CONTACT_PDF)
    print(SUMMARY_PDF)


if __name__ == "__main__":
    main()
