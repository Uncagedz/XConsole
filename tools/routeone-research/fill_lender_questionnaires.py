import csv
import json
import os
import re
import statistics
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, create_string_object

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_contacts_and_three_page_summary as quick
import build_desk_funding_playbook_v2 as desk


ROOT = Path(os.environ.get("ROUTEONE_ROOT", Path.cwd() / "data" / "routeone"))
OUTPUT_DIR = Path(os.environ.get("ROUTEONE_OUTPUT_DIR", ROOT / "generated"))
TEMPLATE = Path(
    os.environ.get(
        "ROUTEONE_QUESTIONNAIRE_TEMPLATE",
        ROOT / "Auto_Lender_Program_Questionnaire_Fillable.pdf",
    )
)
EXPORTS = Path(os.environ.get("ROUTEONE_EXPORTS_DIR", ROOT / "excel_exports"))
MATRIX_CSV = Path(
    os.environ.get("ROUTEONE_MATRIX_CSV", OUTPUT_DIR / "RouteOne Bank Question Matrix.csv")
)
OUT_DIR = OUTPUT_DIR / "Auto Lender Questionnaires - Filled"
PACKET_PDF = OUTPUT_DIR / "Auto Lender Program Questionnaires - Filled Packet.pdf"
SUMMARY_CSV = OUTPUT_DIR / "Auto Lender Questionnaire Recommendation Summary.csv"


TODAY_TEXT = date.today().isoformat()


NAME_MAP = {
    "Fifth Third Bank N.A.": ("Fifth Third Bank, National Association", "Fifth Third Bank, National Association"),
    "Stellantis Financial Services": ("Stellantis Financial Services, Inc", "Stellantis Financial Services, Inc"),
    "Stellantis Financial Services, Inc.": ("Stellantis Financial Services, Inc", "Stellantis Financial Services, Inc"),
    "Ally Clearlane Pass AutoForward": ("Ally Clearlane Pass AutoForward", "Ally"),
}


BAD_SOURCE_BITS = [
    "inclusion of fico",
    "routeone service desk",
    "all rights reserved",
]


def clean(value):
    value = str(value or "").replace("\xa0", " ").replace("\u00a0", " ")
    value = value.replace("�", "")
    value = re.sub(r"\s+", " ", value.replace("\n", " ")).strip()
    value = value.strip(" -;:")
    if value in {"?", "N/A", "NA", "None"}:
        return ""
    if "CALL LENDER FOR EXACT RULE" in value:
        return ""
    return value


def short(value, limit=180):
    value = clean(value)
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 3)].rstrip(" ,;") + "..."


def safe_filename(name):
    return re.sub(r"[^A-Za-z0-9._ -]+", "", name).strip().replace("  ", " ")


def parse_number(value):
    value = clean(value).replace(",", "")
    if not value:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def parse_int(value):
    number = parse_number(value)
    return int(number) if number is not None else None


def fmt_num(value, decimals=0, suffix=""):
    if value is None:
        return ""
    if decimals == 0:
        return f"{int(round(value))}{suffix}"
    return f"{value:.{decimals}f}{suffix}"


def fmt_money(value):
    if value is None:
        return ""
    return f"${int(round(value)):,}"


def fmt_pct(value):
    if value is None:
        return ""
    return f"{value:.1f}%"


def count_pct(cell):
    text = clean(cell)
    if not text:
        return None, None
    parts = re.findall(r"\d+(?:\.\d+)?", text.replace(",", ""))
    if not parts:
        return None, None
    count = int(float(parts[0]))
    pct = float(parts[1]) if len(parts) > 1 else None
    return count, pct


def normalize_source(source):
    source = clean(source)
    if not source or source.lower() == "all":
        return None
    if any(bit in source.lower() for bit in BAD_SOURCE_BITS):
        return None
    if source in NAME_MAP:
        return NAME_MAP[source]
    return source, source


def read_csv(name):
    path = EXPORTS / name
    with path.open("r", encoding="cp1252", errors="replace", newline="") as fh:
        return list(csv.reader(fh))


def metric_record():
    return {
        "display": "",
        "policy_bank": "",
        "sources": set(),
        "trend_submissions": 0,
        "trend_approved": 0,
        "trend_booked": 0,
        "trend_approved_fico": [],
        "trend_booked_fico": [],
        "trend_avg_terms": [],
        "trend_avg_ltvs": [],
        "tsa_rows": 0,
        "tsa_status": Counter(),
        "tsa_fico": [],
        "tsa_amount": [],
        "tsa_ltv": [],
        "tsa_term": [],
        "tsa_buy_rate": [],
        "tsa_cust_rate": [],
        "tsa_reserve": [],
        "tsa_addon_yes": 0,
        "tsa_new_used": Counter(),
        "declines": 0,
        "decline_fico": [],
        "decline_ltv": [],
        "decline_term": [],
        "decline_amount": [],
    }


def load_excel_metrics():
    metrics = defaultdict(metric_record)
    order = []

    def touch(display, policy, source):
        if display not in metrics:
            order.append(display)
        rec = metrics[display]
        rec["display"] = display
        rec["policy_bank"] = policy
        rec["sources"].add(source)
        return rec

    trend_rows = read_csv("trend.csv")
    for row in trend_rows[15:]:
        if len(row) < 10:
            continue
        source_info = normalize_source(row[0])
        if not source_info:
            continue
        if clean(row[1]).lower() != "date range 1 total":
            continue
        display, policy = source_info
        rec = touch(display, policy, row[0])
        submissions = parse_int(row[3]) or 0
        approved, _approved_pct = count_pct(row[4])
        booked, _booked_pct = count_pct(row[6])
        rec["trend_submissions"] += submissions
        rec["trend_approved"] += approved or 0
        rec["trend_booked"] += booked or 0
        for key, idx in [("trend_approved_fico", 5), ("trend_booked_fico", 7), ("trend_avg_terms", 8), ("trend_avg_ltvs", 9)]:
            value = parse_number(row[idx])
            if value is not None:
                rec[key].append(value)

    tsa_rows = read_csv("tsa.csv")
    for row in tsa_rows[10:]:
        if len(row) < 21:
            continue
        source_info = normalize_source(row[0])
        if not source_info:
            continue
        display, policy = source_info
        rec = touch(display, policy, row[0])
        rec["tsa_rows"] += 1
        rec["tsa_status"][clean(row[8]).upper()] += 1
        rec["tsa_new_used"][clean(row[3]).title()] += 1
        for key, idx in [
            ("tsa_fico", 12),
            ("tsa_amount", 13),
            ("tsa_ltv", 14),
            ("tsa_term", 15),
            ("tsa_cust_rate", 17),
            ("tsa_buy_rate", 18),
            ("tsa_reserve", 19),
        ]:
            value = parse_number(row[idx])
            if value is not None:
                rec[key].append(value)
        if clean(row[20]).upper() == "Y":
            rec["tsa_addon_yes"] += 1

    decision_rows = read_csv("decision_funding.csv")
    for row in decision_rows[17:]:
        if len(row) < 31:
            continue
        source_info = normalize_source(row[0])
        if not source_info:
            continue
        display, policy = source_info
        rec = touch(display, policy, row[0])
        if clean(row[1]).upper() == "DECLINED":
            rec["declines"] += 1
            for key, idx in [("decline_fico", 18), ("decline_ltv", 21), ("decline_term", 19), ("decline_amount", 22)]:
                value = parse_number(row[idx])
                if value is not None:
                    rec[key].append(value)

    return [metrics[name] for name in order]


def load_matrix():
    by_bank = defaultdict(list)
    with MATRIX_CSV.open("r", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            row = {key: clean(value) for key, value in row.items()}
            by_bank[row["Bank"]].append(row)
    return by_bank


def answer(matrix, bank, *fields, category=None):
    if not bank or bank not in matrix:
        return ""
    category_l = category.lower() if category else ""
    for field in fields:
        for row in matrix[bank]:
            if row["Field"] != field:
                continue
            if category_l and category_l not in row["Category"].lower():
                continue
            value = clean(row["Answer"])
            if value and value != "?":
                return short(value, 220)
    return ""


def answer_any(matrix, bank, fields):
    for field in fields:
        value = answer(matrix, bank, field)
        if value:
            return value
    return ""


def avg(values):
    return statistics.mean(values) if values else None


def minv(values):
    return min(values) if values else None


def maxv(values):
    return max(values) if values else None


def profile_maps():
    profiles = json.loads(desk.DATA.read_text(encoding="utf-8"))
    profiles_by_bank = {profile["bank"]: profile for profile in profiles}
    contacts_by_bank = dict(quick.build_contact_data(profiles))
    records_by_bank = desk.juice.load_records()
    rate_records_by_bank = {bank: desk.select_rate_records(rows) for bank, rows in records_by_bank.items()}
    products_by_bank = desk.build_product_contact_overrides(profiles, rate_records_by_bank)
    return profiles_by_bank, contacts_by_bank, products_by_bank


def contact_line(parts, *prefixes):
    for prefix in prefixes:
        for part in parts or []:
            if part.startswith(prefix + ":"):
                return clean(part.split(":", 1)[1])
    return ""


def lender_context(rec, matrix, profiles_by_bank, contacts_by_bank, products_by_bank):
    display = rec["display"]
    policy_bank = rec["policy_bank"]
    profile = profiles_by_bank.get(policy_bank)
    parts = contacts_by_bank.get(policy_bank, [])
    products = products_by_bank.get(policy_bank, {})
    states = quick.states_text(profile) if profile else ""
    lanes = quick.lanes_text(profile) if profile else ""
    program_date = profile.get("program_date") if profile else ""
    front = quick.product_summary(products.get("front_products") or [], "", limit=5, front=True) if profile else ""
    back = quick.product_summary(products.get("back_products") or [], "", limit=6, front=False) if profile else ""
    return {
        "display": display,
        "policy_bank": policy_bank,
        "policy_available": bool(profile and policy_bank in matrix),
        "profile": profile,
        "states": states,
        "lanes": lanes,
        "program_date": program_date,
        "contacts": parts,
        "dealer_contact": contact_line(parts, "Names", "Other"),
        "underwriting_contact": contact_line(parts, "Dealer/UW", "Dealer/Underwriting"),
        "funding_contact": contact_line(parts, "Funding"),
        "title_contact": contact_line(parts, "Title/Payoff"),
        "front_products": "" if front == "?" else front,
        "back_products": "" if back == "?" else back,
        "front_products_raw": " ".join(products.get("front_products") or []),
        "back_products_raw": " ".join(products.get("back_products") or []),
    }


def metric_summary(rec):
    approval_ratio = (rec["trend_approved"] / rec["trend_submissions"] * 100) if rec["trend_submissions"] else None
    booked_ratio = (rec["trend_booked"] / rec["trend_submissions"] * 100) if rec["trend_submissions"] else None
    funded_or_booked = rec["tsa_status"]["FUNDED"] + rec["tsa_status"]["BOOKED"]
    bits = []
    if rec["trend_submissions"]:
        bits.append(
            f"Apr-Jun: {rec['trend_submissions']} submits, {rec['trend_approved']} approvals ({fmt_pct(approval_ratio)}), "
            f"{rec['trend_booked']} booked/funded ({fmt_pct(booked_ratio)})"
        )
    if funded_or_booked:
        bits.append(
            f"Jan-Mar actuals: {funded_or_booked} booked/funded, avg FICO {fmt_num(avg(rec['tsa_fico']))}, "
            f"avg AF {fmt_money(avg(rec['tsa_amount']))}, avg LTV {fmt_pct(avg(rec['tsa_ltv']))}, max LTV {fmt_pct(maxv(rec['tsa_ltv']))}, "
            f"max term {fmt_num(maxv(rec['tsa_term']))} mo"
        )
    if rec["declines"]:
        bits.append(
            f"May-Jul declined report: {rec['declines']} declines; avg declined FICO {fmt_num(avg(rec['decline_fico']))}, "
            f"avg declined LTV {fmt_pct(avg(rec['decline_ltv']))}"
        )
    return "; ".join(bit for bit in bits if bit)


def recommendation(rec, ctx, matrix):
    approval_ratio = (rec["trend_approved"] / rec["trend_submissions"] * 100) if rec["trend_submissions"] else None
    booked_ratio = (rec["trend_booked"] / rec["trend_submissions"] * 100) if rec["trend_submissions"] else None
    avg_fico = avg(rec["tsa_fico"]) or (avg(rec["trend_booked_fico"]) if rec["trend_booked_fico"] else None)
    min_fico = minv(rec["tsa_fico"])
    max_ltv = maxv(rec["tsa_ltv"]) or maxv(rec["decline_ltv"])
    max_term = maxv(rec["tsa_term"])
    funded_or_booked = rec["tsa_status"]["FUNDED"] + rec["tsa_status"]["BOOKED"]
    policy_bank = ctx["policy_bank"]

    use_case = "Use selectively; not enough booked performance in these files."
    if approval_ratio is not None and approval_ratio >= 25:
        use_case = "Strong routing candidate from approval ratio."
    if funded_or_booked >= 20:
        use_case = "Proven store workhorse based on booked/funded volume."
    if avg_fico is not None and avg_fico >= 720:
        use_case += " Best for prime/high-score buyers."
    elif min_fico is not None and min_fico < 600:
        use_case += " Has funded lower-score files when structure works."
    if max_ltv is not None and max_ltv >= 120:
        use_case += " Has seen high-LTV funded deals; keep backend and stips clean."
    if approval_ratio is not None and approval_ratio < 8 and rec["trend_submissions"] >= 100:
        use_case = "Low approval ratio in Excel; submit only with strong structure or documented fit."

    hard = []
    for label, fields in [
        ("min score", ["Minimum FICO Score", "Lowest Score Ever Considered"]),
        ("max LTV", ["Maximum Total LTV", "Maximum Advance (%)", "Maximum LTV Ever"]),
        ("max term", ["Maximum Term"]),
        ("max miles", ["Maximum Mileage", "Maximum Mileage Ever"]),
        ("max AF", ["Maximum AF", "Maximum Loan Amount", "Maximum Amount Financed"]),
    ]:
        val = answer_any(matrix, policy_bank, fields)
        if val:
            hard.append(f"{label} {val}")
    if hard:
        use_case += " Written hard stops: " + "; ".join(hard[:4]) + "."
    return short(use_case, 360)


def doc_source_text(rec):
    source_bits = sorted(clean(src) for src in rec["sources"] if clean(src))
    return short(
        "RouteOne lender documents/rate sheets where available; Excel reports supplied: Trend Apr-Jun 2026, TSA Jan-Mar 2026, Decision/Funding declined report May 1-Jul 18 2026. "
        + ("Excel source names: " + ", ".join(source_bits[:4]) if source_bits else ""),
        250,
    )


def y_or_blank(value):
    value = clean(value)
    if not value:
        return ""
    lower = value.lower()
    if re.fullmatch(r"\d+(?:\.\d+)?%?", lower):
        return ""
    if "no fico considered" in lower or "no-score" in lower or "thin-file" in lower:
        return "Y"
    if "case-by-case" in lower or "case by case" in lower or "considered" in lower:
        return "Case"
    if lower.startswith("n") or "not accepted" in lower or "not allowed" in lower:
        return "N"
    if "not required" in lower:
        return "N"
    if lower.startswith("y") or "accepted" in lower or "allowed" in lower or "required" in lower:
        return "Y"
    return ""


def yn_note(value, default=""):
    value = clean(value)
    if not value:
        return default
    return value


def put(values, name, value, limit=220):
    value = short(value, limit)
    lower = value.lower()
    empty_markers = [
        "ask lender",
        "call lender",
        "not published",
        "not found",
        "unpublished",
        "not fully published",
        "not consistently published",
        "not fully extracted",
        "provided source",
        "provided docs",
        "per callback",
        "verify ",
        "verification needed",
        "not available",
        "source docs",
        "if lender publishes",
        "if lender allows",
        "when lender allows",
        "unless lender",
        "unless listed",
        "not always published",
        "no named dealer rep",
        "no minimum found",
        "no published min",
        "not enough booked performance",
        "excel reports run",
        "monthly refresh",
        "use lender portal/contact sheet",
        "where available",
        "where enabled",
        "where program allows",
        "when available",
        "if conditioned",
        "when conditioned",
        "where conditioned",
        "if missing/wrong",
        "when product is sold",
        "per lender callback",
        "lender callback specifies",
        "varies by lender",
        "exact callback",
        "callback fields vary",
        "use callback as controlling",
        "controlling approval",
        "use score plus structure",
        "application authorization",
        "case-by-case if no hard floor",
        "prior auto, comparable loan",
        "improve with cash down",
        "cash down, lower",
        "comparable-auto",
        "can hurt tier",
        "minimum down usually",
        "can cure excess",
        "reducing backend",
        "common delays:",
        "top delays:",
        "likely rejects:",
        "common triggers:",
        "common decline triggers:",
        "helpful notes:",
        "usually request",
        "request repo/derogatory exceptions",
        "include poi/por",
        "rehash negotiable",
        "advance treatment depends",
        "decisioning appears",
        "appears hybrid",
        "names, suffixes",
        "verifications before funding",
        "deficiencies generally",
        "can be triggered by",
        "weak structure, overadvance",
        "rehash with down",
        "do not submit outside",
        "fit score/profile",
        "convert decline by",
        "classify as official docs",
        "source files:",
        "dealer review:",
        "compiled 2026-07-19",
        "track new rate sheets",
        "initial compiled version",
        "monthly / next rate-sheet update",
        "representative verification needed",
        "what this means for you",
        "see approval",
        "initial compiled answer set",
        "backend exception",
    ]
    if lower in {"ask", "ask lender", "verify", "n/a", "na"}:
        return
    if any(marker in lower for marker in empty_markers):
        return
    if re.search(r"\b(?:4dr|2dr|sdn|wgn|sport utility|crew cab|double cab)\b", lower) and len(re.findall(r"\b\d{2,6}\b", lower)) >= 4:
        return
    if value:
        values[name] = value


def summary_of_fields(matrix, bank, pairs, sep="; "):
    bits = []
    for label, fields in pairs:
        value = answer_any(matrix, bank, fields)
        if value:
            bits.append(f"{label}: {value}")
    return sep.join(bits)


def tier_matrix(values, matrix, bank):
    rows = [
        ("Tier 1 Score Range", ["txt_0056", "txt_0057", "txt_0058", "txt_0059", "txt_0060", "txt_0061", "txt_0062", "txt_0063", "txt_0064"]),
        ("Tier 2 Score Range", ["txt_0065", "txt_0066", "txt_0067", "txt_0068", "txt_0069", "txt_0070", "txt_0071", "txt_0072", "txt_0073"]),
        ("Tier 3 Score Range", ["txt_0074", "txt_0075", "txt_0076", "txt_0077", "txt_0078", "txt_0079", "txt_0080", "txt_0081", "txt_0082"]),
        ("Tier 4 Score Range", ["txt_0083", "txt_0084", "txt_0085", "txt_0086", "txt_0087", "txt_0088", "txt_0089", "txt_0090", "txt_0091"]),
    ]
    common = [
        "",
        answer(matrix, bank, "Maximum Term"),
        answer(matrix, bank, "Maximum Front-End LTV"),
        answer(matrix, bank, "Maximum Total LTV", "Maximum Advance (%)"),
        answer(matrix, bank, "Maximum AF", "Maximum Amount Financed", "Maximum Loan Amount"),
        answer(matrix, bank, "Maximum PTI (%)", "Maximum PTI"),
        answer(matrix, bank, "Maximum DTI (%)", "Maximum DTI"),
        answer(matrix, bank, "Maximum Mileage"),
    ]
    for tier_field, field_names in rows:
        score_range = answer(matrix, bank, tier_field)
        if not score_range:
            continue
        row_values = [score_range] + common
        for field_name, row_value in zip(field_names, row_values):
            put(values, field_name, row_value, 34)


def product_table(values, matrix, bank, ctx):
    back = (ctx["back_products"] + " " + ctx.get("back_products_raw", "")).lower()
    product_rows = [
        ("service", ["txt_0430", "txt_0431", "txt_0432", "txt_0433"], "VSC / ESC / service contract / warranty", "Maximum VSC ($)", "Maximum Warranty"),
        ("gap", ["txt_0434", "txt_0435", "txt_0436", "txt_0437"], "GAP", "Maximum GAP ($)", "Maximum GAP"),
        ("maintenance", ["txt_0438", "txt_0439", "txt_0440", "txt_0441"], "Maintenance", "", ""),
        ("tire", ["txt_0442", "txt_0443", "txt_0444", "txt_0445"], "Tire & wheel", "", ""),
        ("key", ["txt_0446", "txt_0447", "txt_0448", "txt_0449"], "Key replacement", "", ""),
        ("appearance", ["txt_0450", "txt_0451", "txt_0452", "txt_0453"], "Paint/fabric/leather / appearance", "", ""),
        ("theft", ["txt_0454", "txt_0455", "txt_0456", "txt_0457"], "Etch / theft / catalytic converter", "", ""),
        ("credit", ["txt_0458", "txt_0459", "txt_0460", "txt_0461"], "Credit life / A&H / disability", "", ""),
    ]
    synonyms = {
        "service": ["vsc", "esc", "service contract", "warranty"],
        "gap": ["gap"],
        "maintenance": ["maint", "maintenance"],
        "tire": ["tire/wheel", "tire", "wheel"],
        "key": ["key"],
        "appearance": ["appearance", "paint/fabric", "leather"],
        "theft": ["etch/theft", "etch", "theft"],
        "credit": ["credit life", "a&h", "debt cancellation", "credit insurance"],
    }
    for token, fields, label, cap_field, alt_field in product_rows:
        cap = answer_any(matrix, bank, [cap_field, alt_field] if cap_field else [])
        allowed = "Y" if (cap or any(item in back for item in synonyms[token])) else ""
        if allowed:
            put(values, fields[0], "Y", 20)
            put(values, fields[1], cap, 28)

    max_backend = summary_of_fields(
        matrix,
        bank,
        [
            ("Backend $", ["Maximum Backend ($)", "Maximum Backend"]),
            ("Backend %", ["Maximum Backend (%)"]),
            ("GAP", ["Maximum GAP ($)", "Maximum GAP"]),
            ("VSC", ["Maximum VSC ($)", "Maximum Warranty"]),
        ],
    )
    put(values, "txt_0466", max_backend or ctx["back_products"], 220)
    if max_backend:
        put(values, "txt_0467", f"Backend cap source: {max_backend}", 180)


def scenario_table(values, matrix, bank, ctx, rec):
    def row(fields, accepted, program, structure, stips):
        put(values, fields[0], accepted, 28)
        put(values, fields[1], program, 32)
        put(values, fields[2], structure, 52)
        put(values, fields[3], stips, 52)

    no_score = answer(matrix, bank, "Lowest Score Ever Considered")
    no_score_accept = y_or_blank(no_score) if no_score else ""
    if no_score_accept:
        row(["txt_0778", "txt_0779", "txt_0780", "txt_0781"], no_score_accept, "No-score/thin", no_score, "POI/POR/ID")

    # First-time buyer specifics are left blank unless a lender source gives a rule.

    repo_open = answer(matrix, bank, "Open Repo Allowed")
    repo_age = answer(matrix, bank, "Minimum Months Since Repo")
    repo_stips = summary_of_fields(matrix, bank, [("deficiency", ["Deficiency Balance Must Be Paid (Y/N)"]), ("multiple", ["Multiple Repos Allowed (Y/N)"])])
    if repo_open or repo_age or repo_stips:
        row(["txt_0786", "txt_0787", "txt_0788", "txt_0789"], y_or_blank(repo_open), "Repo", repo_age, repo_stips)
        row(["txt_0790", "txt_0791", "txt_0792", "txt_0793"], y_or_blank(repo_open), "Repo", repo_age, repo_stips)

    bk7 = summary_of_fields(matrix, bank, [("Disch", ["Minimum Months Since Discharge"]), ("Dismiss", ["Minimum Months Since Dismissal"])])
    bk7_open = answer(matrix, bank, "Open BK Allowed (Y/N)", category="Chapter 7")
    bk_stips = summary_of_fields(matrix, bank, [("trustee", ["Trustee Approval Required"]), ("payments", ["Minimum Payments Made"])])
    if bk7_open or bk7:
        row(["txt_0794", "txt_0795", "txt_0796", "txt_0797"], y_or_blank(bk7_open), "Ch7", bk7, "")

    bk13 = summary_of_fields(matrix, bank, [("Open", ["Open BK Allowed"]), ("Trustee", ["Trustee Approval Required"]), ("Pmts", ["Minimum Payments Made"])])
    bk13_open = answer(matrix, bank, "Open BK Allowed", category="Chapter 13")
    if bk13_open or bk13 or bk_stips:
        row(["txt_0798", "txt_0799", "txt_0800", "txt_0801"], y_or_blank(bk13_open), "Ch13", bk13, bk_stips)

    high_ltv = summary_of_fields(matrix, bank, [("Max LTV", ["Maximum Total LTV", "Maximum Advance (%)"]), ("Neg", ["Maximum Negative Equity ($)", "Maximum Negative Equity (%)"])])
    if high_ltv:
        row(["txt_0802", "txt_0803", "txt_0804", "txt_0805"], "Case", "High LTV", high_ltv, "")

    miles = answer(matrix, bank, "Maximum Mileage")
    if miles:
        row(["txt_0806", "txt_0807", "txt_0808", "txt_0809"], "Case", "Mileage", miles, "")

    self_emp = summary_of_fields(matrix, bank, [("SE time", ["Minimum Self-Employment Time (Years)"]), ("Bank stmt", ["Minimum Bank Statements (Months)"]), ("Tax", ["Minimum Tax Returns (Years)"])])
    if self_emp:
        row(["txt_0810", "txt_0811", "txt_0812", "txt_0813"], "Case", "Self-employed", self_emp, "bank statements/tax returns")

    if ctx["states"]:
        row(["txt_0814", "txt_0815", "txt_0816", "txt_0817"], "Case", "Out-of-state", ctx["states"], "")


def contact_directory(values, ctx):
    if ctx["dealer_contact"] or ctx["underwriting_contact"] or ctx["funding_contact"]:
        put(values, "txt_0757", ctx["dealer_contact"] or ctx["underwriting_contact"] or ctx["funding_contact"], 60)
        put(values, "txt_0758", "Dealer Support", 70)

    if ctx["underwriting_contact"]:
        put(values, "txt_0761", ctx["underwriting_contact"], 60)
        put(values, "txt_0762", "Underwriting", 70)

    if ctx["funding_contact"]:
        put(values, "txt_0769", ctx["funding_contact"], 60)
        put(values, "txt_0770", "Funding", 70)

    if ctx["title_contact"]:
        put(values, "txt_0773", ctx["title_contact"], 60)
        put(values, "txt_0774", "Title/Payoff", 70)


def fill_values(rec, ctx, matrix):
    bank = ctx["policy_bank"]
    display = ctx["display"]
    legal = bank if ctx["policy_available"] else display
    program_name = display if display != bank else ctx["lanes"]
    values = {}

    contact_short = ctx["funding_contact"] or ctx["underwriting_contact"] or ctx["dealer_contact"]
    effective = ctx["program_date"]
    review = ""
    states_lanes = "; ".join(bit for bit in [("States: " + ctx["states"]) if ctx["states"] else "", ("Programs: " + ctx["lanes"]) if ctx["lanes"] else ""] if bit)

    for field in ["txt_0001", "txt_0013"]:
        put(values, field, legal, 120)
    for field in ["txt_0002", "txt_0014"]:
        put(values, field, program_name, 120)
    put(values, "txt_0003", "Compiled from RouteOne docs and dealer Excel reports", 120)
    put(values, "txt_0004", contact_short, 120)
    put(values, "txt_0005", effective, 80)
    put(values, "txt_0006", review, 110)
    put(values, "txt_0015", ctx["dealer_contact"] or ctx["underwriting_contact"] or "No named dealer rep in provided source; use lender portal/contact sheet.", 180)
    put(values, "txt_0016", ctx["underwriting_contact"] or "Underwriting/credit contact not published in source; ask lender.", 180)
    put(values, "txt_0017", ctx["funding_contact"] or "Funding contact not published in source; ask lender.", 180)
    put(values, "txt_0018", states_lanes or "State/dealer-type coverage not published in provided docs.", 180)
    put(values, "txt_0019", f"Effective/program date: {effective}; next review: monthly refresh or lender callback.", 160)
    put(values, "txt_0026", doc_source_text(rec), 230)
    put(values, "txt_0027", recommendation(rec, ctx, matrix), 330)

    # Credit pull / score model
    put(values, "txt_0032", "FICO appears in dealer RouteOne reports when available; primary bureau not published in source docs.", 150)
    put(values, "txt_0033", "Alternate/second bureau trigger not published; ask lender for thin-file, frozen-file, fraud, or mismatch rules.", 170)
    put(values, "txt_0034", "Exact score model/version not published; Excel reports use dealer RouteOne FICO fields.", 140)
    put(values, "txt_0039", "Dealer Excel reports show FICO where available; callback tier visibility varies by lender/source.", 150)
    put(values, "txt_0041", "Credit-report reuse after vehicle/AF/term/co-app changes not published; treat major structure changes as rehash/reapproval.", 190)
    put(values, "txt_0046", "Soft-pull prequalification rule not found in supplied lender docs; verify with lender.", 130)
    put(values, "txt_0053", "Resubmission/new-inquiry trigger not published; ask before repeated bureau pulls.", 120)
    put(values, "txt_0054", summary_of_fields(matrix, bank, [("DL", ["Driver License Required (Y/N)"]), ("ID mismatch", ["Identity Mismatch Process"]), ("Fraud", ["Fraud Review Triggers"])]) or "Application authorization, permissible purpose, ID/OFAC/fraud checks required per lender/dealer process.", 220)

    tier_matrix(values, matrix, bank)
    tier_summary = summary_of_fields(matrix, bank, [
        ("T1", ["Tier 1 Score Range"]),
        ("T2", ["Tier 2 Score Range"]),
        ("T3", ["Tier 3 Score Range"]),
        ("T4", ["Tier 4 Score Range"]),
        ("max term", ["Maximum Term"]),
        ("max total LTV", ["Maximum Total LTV", "Maximum Advance (%)"]),
    ])
    put(values, "txt_0055", tier_summary or metric_summary(rec), 230)

    # Credit depth, prior auto, derogatory credit
    put(values, "txt_0123", "No - use score plus structure/profile unless lender publishes score-only tiering.", 130)
    put(values, "txt_0124", "Prior auto, comparable loan, LTV, PTI/DTI, down, job/residence stability, derogatory credit, thin file, vehicle age/mileage, open autos.", 230)
    put(values, "txt_0125", "Improve with cash down, lower AF/LTV, shorter term, less backend, stronger vehicle/book, co-app, clean POI/POR, proof of paid/settled derogatories.", 240)
    put(values, "txt_0126", "Yes when lender allows rehash: reduce LTV/backend/payment shock, shorten term, add down/co-app, switch vehicle, clear stips.", 220)
    put(values, "txt_0131", "Not consistently published; use callback/program code as controlling approval.", 130)
    put(values, "txt_0132", states_lanes or "Rules may vary by new/used, CPO, term, amount, vehicle age/mileage, state, or dealer type; verify by callback.", 220)
    put(values, "txt_0137", "Some RouteOne reports show tier/program on booked deals; exact callback fields vary.", 140)
    min_score_text = answer_any(matrix, bank, ["Minimum FICO Score", "Lowest Score Ever Considered"]) or (f"Excel booked min FICO {fmt_num(minv(rec['tsa_fico']))}" if rec["tsa_fico"] else "")
    put(values, "txt_0138", min_score_text or "No minimum found in supplied source; ask lender.", 120)
    put(values, "txt_0143", "Case-by-case if no hard floor; use down/LTV/backend/co-app/prior auto as compensating factors.", 170)
    put(values, "txt_0144", "Cash down, lower LTV, clean POI/POR, prior auto/comparable payment, shorter term, less backend, stable job/residence.", 190)
    put(values, "txt_0145", answer_any(matrix, bank, ["Lowest Score Ever Considered"]) or "No-score/thin-file rule not published; verify program and required stips.", 160)

    put(values, "txt_0146", summary_of_fields(matrix, bank, [("total", ["Minimum Total Tradelines (#)"]), ("installment", ["Minimum Installment Tradelines (#)"]), ("revolving", ["Minimum Revolving Tradelines (#)"])]) or "Minimum tradeline depth not published.", 170)
    put(values, "txt_0147", summary_of_fields(matrix, bank, [("oldest", ["Minimum Oldest Tradeline (Months)"]), ("avg age", ["Minimum Average Age of Credit (Months)"])]) or "Oldest-tradeline rule not published.", 140)
    put(values, "txt_0149", summary_of_fields(matrix, bank, [("30d", ["Maximum Credit Inquiries (Last 30 Days)"]), ("90d", ["Maximum Credit Inquiries (Last 90 Days)"])]) or "Inquiry limit not published.", 130)
    put(values, "txt_0150", "High utilization can hurt tier/approval; exact impact not published unless shown below.", 140)
    put(values, "txt_0151", answer(matrix, bank, "Maximum Credit Utilization (%)") or "Not published.", 90)
    put(values, "txt_0152", "Recent delinquency clean-period rule not published in extracted source; verify before rehash.", 150)
    put(values, "txt_0158", "Prior auto helpful/required if lender publishes a comparable-auto requirement.", 140)
    put(values, "txt_0159", summary_of_fields(matrix, bank, [("months", ["Minimum Previous Auto History (Months)"]), ("amount", ["Minimum Previous Auto Loan Amount ($)"]), ("payment", ["Minimum Previous Auto Payment ($)"])]) or "Prior-auto minimum not published.", 170)
    put(values, "txt_0163", summary_of_fields(matrix, bank, [("%", ["Maximum Payment Shock (%)"]), ("$", ["Maximum Payment Shock ($)"])]) or "Payment-shock limit not published.", 130)
    put(values, "txt_0164", "Comparable-auto overadvance rule not published; use callback and prior-payment proof.", 150)
    put(values, "txt_0165", answer(matrix, bank, "Maximum Number of Open Auto Loans") or "Open-auto exposure limit not published.", 120)
    put(values, "txt_0168", "Multiple-vehicle/exposure rule not published; verify total auto exposure before contracting.", 150)
    put(values, "txt_0169", answer(matrix, bank, "Open Repo Allowed") or "Repo acceptance not published; ask lender.", 140)
    put(values, "txt_0170", summary_of_fields(matrix, bank, [("repo", ["Minimum Months Since Repo"]), ("vol surrender", ["Minimum Months Since Voluntary Surrender"])]) or "Repo seasoning not published.", 150)
    put(values, "txt_0172", answer(matrix, bank, "Deficiency Balance Must Be Paid (Y/N)") or "Deficiency pay/settle rule not published.", 130)
    put(values, "txt_0174", "Repo may cap tier/term/LTV/down if lender conditions callback; exact cap not always published.", 150)
    put(values, "txt_0176", answer(matrix, bank, "Maximum Number of Repos") or answer(matrix, bank, "Maximum Repo Count") or "Repo count cap not published.", 120)
    put(values, "txt_0177", "Special repo/hardship review not published. Vehicle title total-loss rule: " + (answer(matrix, bank, "Total Loss Vehicle Allowed") or "ask lender"), 180)
    put(values, "txt_0178", "Request repo/derogatory exceptions through underwriting/dealer rep with proof of stability and paid/settled status.", 170)

    put(values, "txt_0179", summary_of_fields(matrix, bank, [("Ch7 open", ["Open BK Allowed (Y/N)"]), ("Ch13 open", ["Open BK Allowed"])]) or "Bankruptcy status acceptance not published.", 160)
    put(values, "txt_0180", summary_of_fields(matrix, bank, [("file", ["Minimum Months Since Filing"]), ("disch", ["Minimum Months Since Discharge"]), ("dismiss", ["Minimum Months Since Dismissal"])]) or "Bankruptcy seasoning not published.", 170)
    put(values, "txt_0185", summary_of_fields(matrix, bank, [("Open Ch13", ["Open BK Allowed"]), ("Trustee", ["Trustee Approval Required"]), ("payments", ["Minimum Payments Made"])]) or "Open Ch13/trustee rule not published.", 170)
    put(values, "txt_0186", answer(matrix, bank, "Maximum Bankruptcy Count") or "Multiple-bankruptcy rule not published.", 120)
    put(values, "txt_0187", summary_of_fields(matrix, bank, [("tradelines", ["Minimum Total Tradelines (#)"]), ("prior auto", ["Minimum Previous Auto History (Months)"])]) or "Re-established credit requirement not published.", 170)
    put(values, "txt_0188", answer(matrix, bank, "Auto Loan Included Allowed (Y/N)") or "Vehicle included-in-BK handling not published.", 130)
    put(values, "txt_0189", "BK paperwork/trustee/discharge docs when conditioned; exact documents not published unless callback stipulates.", 170)
    put(values, "txt_0190", summary_of_fields(matrix, bank, [("LTV", ["Maximum LTV After BK (%)", "Maximum LTV"]), ("down", ["Minimum Down Payment After BK (%)", "Minimum Down Payment"]), ("term", ["Maximum Term After BK"])]) or "BK-specific LTV/down/term not published.", 180)
    put(values, "txt_0191", summary_of_fields(matrix, bank, [("collections", ["Maximum Collection Amount ($)", "Maximum Number of Collections"]), ("judgment", ["Maximum Judgment Amount"]), ("tax lien", ["Maximum Tax Lien Amount"]), ("child support", ["Child Support Balance Allowed ($)"])]) or "Collections/judgment/lien limits not published.", 220)
    put(values, "txt_0252", summary_of_fields(matrix, bank, [("collection $", ["Maximum Collection Amount ($)"]), ("collection #", ["Maximum Number of Collections"])]) or "Not published.", 120)
    put(values, "txt_0257", "Paid/unpaid collection difference not published; verify if derogatory balance affects approval.", 150)
    put(values, "txt_0258", answer(matrix, bank, "Medical Collections Excluded (Y/N)") or "Medical/disputed/ID-theft treatment not published.", 150)

    # Income, employment, residence, identity
    put(values, "txt_0259", summary_of_fields(matrix, bank, [("monthly", ["Minimum Monthly Income ($)"]), ("annual", ["Minimum Annual Income ($)"])]) or "Minimum income not published.", 150)
    put(values, "txt_0260", "Use applicant/co-app income per lender callback; household-wide treatment not published.", 150)
    put(values, "txt_0261", summary_of_fields(matrix, bank, [("OT", ["Overtime Averaging (Months)"]), ("bonus", ["Bonus Averaging (Months)"]), ("comm", ["Commission Averaging (Months)"])]) or "Income averaging rules not published.", 180)
    put(values, "txt_0330", summary_of_fields(matrix, bank, [("paystub age", ["Maximum Paystub Age", "POI Maximum Age (Days)", "Maximum POI Age (Days)"]), ("POI #", ["POI Number Required"]), ("bank stmt", ["Minimum Bank Statements (Months)"]), ("tax returns", ["Minimum Tax Returns (Years)"])]) or "POI quantity/age not published.", 210)
    put(values, "txt_0332", summary_of_fields(matrix, bank, [("bank stmts", ["Minimum Business Bank Statements", "Minimum Bank Statements (Months)"]), ("tax", ["Minimum Business Tax Returns", "Minimum Tax Returns (Years)"])]) or "Business/self-employed bank-statement rule not published.", 180)
    put(values, "txt_0333", summary_of_fields(matrix, bank, [("payroll portal", ["Payroll Portal Accepted"]), ("offer letter", ["Offer Letter Accepted"]), ("employer letter", ["Employer Letter Accepted"]), ("CPA", ["CPA Letter Accepted"])]) or "Alternative POI forms not published.", 200)
    put(values, "txt_0340", summary_of_fields(matrix, bank, [("job", ["Minimum Time on Job (Months)"]), ("occupation", ["Minimum Time in Occupation (Months)"])]) or "Minimum job time not published.", 160)
    put(values, "txt_0341", answer(matrix, bank, "Maximum Employment Gap (Months)") or "Employment-gap rule not published.", 120)
    put(values, "txt_0345", answer(matrix, bank, "Minimum Self-Employment Time (Years)") or "Self-employment time not published.", 120)
    put(values, "txt_0351", "Use gross income unless lender callback specifies net; exact formula not published.", 140)
    put(values, "txt_0352", answer(matrix, bank, "Maximum PTI (%)", "Maximum PTI") or "PTI cap not published.", 120)
    put(values, "txt_0354", answer(matrix, bank, "Maximum DTI (%)", "Maximum DTI") or "DTI cap not published.", 120)
    put(values, "txt_0359", summary_of_fields(matrix, bank, [("%", ["Maximum Payment Shock (%)"]), ("$", ["Maximum Payment Shock ($)"])]) or "Payment shock formula not published.", 140)
    put(values, "txt_0360", "Down, lower LTV, cheaper vehicle, less backend, shorter term, or co-app can help if lender allows rehash.", 170)
    put(values, "txt_0361", answer(matrix, bank, "Minimum Time at Residence") or "Residence-history minimum not published.", 130)
    put(values, "txt_0368", summary_of_fields(matrix, bank, [("POR trigger", ["POR Trigger"]), ("utility", ["Utility Bill Accepted"]), ("lease", ["Lease Accepted"]), ("mortgage", ["Mortgage Statement Accepted"]), ("bank", ["Bank Statement Accepted (POR)"])]) or "POR docs not published.", 220)
    put(values, "txt_0369", answer(matrix, bank, "POR Maximum Age (Days)", "Maximum POR Age (Days)") or "POR age not published.", 120)
    put(values, "txt_0370", answer(matrix, bank, "Identity Mismatch Process") or "Address/ID mismatch process not published; expect proof/correction/fraud review.", 170)
    put(values, "txt_0372", summary_of_fields(matrix, bank, [("DL", ["Driver License Required (Y/N)"]), ("passport", ["Passport Accepted"]), ("state ID", ["State ID Accepted"]), ("military", ["Military ID Accepted"]), ("consular", ["Consular ID Accepted"])]) or "Accepted ID list not published.", 220)
    put(values, "txt_0373", summary_of_fields(matrix, bank, [("no DL", ["No Driver License Accepted"]), ("temporary", ["Temporary License Accepted"]), ("foreign", ["Foreign License Accepted"])]) or "No-license/suspended-license rule not published.", 170)
    put(values, "txt_0374", answer(matrix, bank, "ITIN Program Available") or "ITIN program not published.", 120)
    put(values, "txt_0375", summary_of_fields(matrix, bank, [("visa", ["Minimum Visa Remaining (Months)"]), ("EAD", ["Minimum EAD Remaining (Months)"]), ("OPT", ["Minimum OPT Remaining (Months)"]), ("H1B", ["Minimum H-1B Remaining (Months)"])]) or "Non-permanent resident rules not published.", 190)
    put(values, "txt_0376", summary_of_fields(matrix, bank, [("visa", ["Minimum Visa Remaining (Months)", "Minimum Visa Validity Remaining (Months)"]), ("EAD", ["Minimum EAD Remaining (Months)"])]) or "Term-vs-visa expiration rule not published.", 170)
    put(values, "txt_0377", summary_of_fields(matrix, bank, [("SSN", ["SSN Required"]), ("SSA-89", ["SSA-89 Required"])]) or "SSN/SSA-89 rule not published.", 150)
    put(values, "txt_0378", summary_of_fields(matrix, bank, [("fraud", ["Fraud Review Triggers"]), ("ID mismatch", ["Identity Mismatch Process"])]) or "Fraud/OFAC/freeze handling not published.", 170)

    # Vehicle, book, amount, term, down
    put(values, "txt_0396", ctx["lanes"] or "Programs not published in policy docs; see Excel source name.", 160)
    put(values, "txt_0397", summary_of_fields(matrix, bank, [("age", ["Maximum Vehicle Age"]), ("miles", ["Maximum Mileage"]), ("maturity miles", ["Maximum Mileage Ever"])]) or "Vehicle age/mileage limit not published.", 180)
    put(values, "txt_0398", summary_of_fields(matrix, bank, [("by age", ["Maximum Term by Vehicle Age"]), ("by miles", ["Maximum Term by Mileage"]), ("max", ["Maximum Term"])]) or "Term-by-age/mileage rule not published.", 180)
    put(values, "txt_0400", summary_of_fields(matrix, bank, [("salvage", ["Salvage Title Accepted"]), ("rebuilt", ["Rebuilt Title Accepted"]), ("branded", ["Branded Title Allowed"]), ("total loss", ["Total Loss Vehicle Allowed"]), ("lemon", ["Lemon/Buyback Allowed"]), ("flood/frame", ["Flood/Frame Damage Allowed"])]) or "Title-history restrictions not published.", 230)
    put(values, "txt_0407", summary_of_fields(matrix, bank, [("book", ["Maximum Book Value"]), ("MSRP", ["Maximum MSRP"]), ("invoice", ["Maximum Invoice"])]) or "Book source/value basis not published.", 170)
    put(values, "txt_0410", summary_of_fields(matrix, bank, [("front", ["Maximum Front-End LTV"]), ("total", ["Maximum Total LTV"]), ("backend", ["Maximum Backend LTV"])]) or "LTV formula not published.", 180)
    put(values, "txt_0411", summary_of_fields(matrix, bank, [("advance", ["Maximum Advance (%)"]), ("front", ["Maximum Front-End LTV"]), ("total", ["Maximum Total LTV"])]) or "Tier/program LTV not published.", 180)
    put(values, "txt_0412", "Advance treatment depends on total LTV/all-in callback. Products are backend; factory/MSRP/DIO/upfit are front when allowed.", 190)
    put(values, "txt_0413", summary_of_fields(matrix, bank, [("$", ["Maximum Negative Equity ($)"]), ("%", ["Maximum Negative Equity (%)"]), ("hard stop", ["Maximum Negative Equity"])]) or "Negative-equity cap not published.", 170)
    put(values, "txt_0414", "Cash down, lower book gap, less backend, or cheaper vehicle can cure excess advance if lender permits.", 170)
    put(values, "txt_0415", summary_of_fields(matrix, bank, [("min", ["Minimum AF", "Minimum Loan Amount"]), ("max", ["Maximum AF", "Maximum Loan Amount", "Maximum Amount Financed"])]) or "Amount-financed limits not published.", 180)
    put(values, "txt_0416", summary_of_fields(matrix, bank, [("over 50k", ["Maximum Term Over $50k"]), ("over 75k", ["Maximum Term Over $75k"]), ("over 100k", ["Maximum Term Over $100k"])]) or "AF/tier prior-auto restriction not published.", 180)
    put(values, "txt_0417", summary_of_fields(matrix, bank, [("min term", ["Minimum Term"]), ("max term", ["Maximum Term"]), ("by age", ["Maximum Term by Vehicle Age"]), ("by miles", ["Maximum Term by Mileage"])]) or "Term limits not published.", 210)
    put(values, "txt_0418", "Rate/reserve/advance may change by callback, term, vehicle, score, and program; exact official grid not fully extracted.", 180)
    put(values, "txt_0421", summary_of_fields(matrix, bank, [("min $", ["Minimum Down Payment ($)"]), ("min %", ["Minimum Down Payment (%)"]), ("max %", ["Maximum Down Payment (%)"])]) or "Cash-down limits not published.", 180)
    put(values, "txt_0422", "Minimum down usually driven by callback risk, price/book gap, score, LTV, and stips unless published otherwise.", 170)
    put(values, "txt_0424", summary_of_fields(matrix, bank, [("credit card", ["Maximum Credit Card Down ($)"]), ("third party", ["Maximum Third Party Down ($)"]), ("gift", ["Maximum Gift Funds ($)"])]) or "Special down-payment source limits not published.", 190)
    put(values, "txt_0425", "Yes if lender allows structure rehash: more down can reduce LTV/payment shock/backend and improve approval.", 170)
    put(values, "txt_0426", summary_of_fields(matrix, bank, [("payoff age", ["Maximum Payoff Age", "Maximum Payoff Age (Days)"]), ("trade title", ["Trade Title Required Before Funding"]), ("payoff verify", ["Payoff Verification Required"])]) or "Trade/payoff rule not published.", 200)
    put(values, "txt_0427", answer_any(matrix, bank, ["Maximum Negative Equity ($)", "Maximum Negative Equity (%)", "Maximum Negative Equity"]) or "Negative-equity rule not published.", 150)
    product_table(values, matrix, bank, ctx)
    put(values, "txt_0472", "Product certificates/contracts required when product is sold; funding may hold if missing/wrong.", 160)
    put(values, "txt_0477", "Yes - reducing backend is one of the fastest ways to cure overadvance/tight approvals.", 150)
    put(values, "txt_0478", metric_summary(rec) or "Buy rate set by lender callback/rate sheet.", 230)
    put(values, "txt_0479", answer(matrix, bank, "Maximum APR Markup", "Maximum Dealer Participation") or "Markup not published in source docs.", 150)
    put(values, "txt_0480", summary_of_fields(matrix, bank, [("%", ["Maximum Reserve (%)"]), ("$", ["Maximum Reserve ($)"]), ("flat", ["Flat Amount ($)"])]) or "Reserve method not published.", 170)
    put(values, "txt_0481", answer(matrix, bank, "Reserve Chargeback Triggers") or "Chargeback period/formula not published.", 150)
    put(values, "txt_0482", answer(matrix, bank, "Reserve Chargeback Triggers") or "Common triggers: payoff/refi/FPD/repo/product cancellation; verify exact lender rule.", 170)

    # Special program rows and commercial
    put(values, "txt_0483", "Programs identified: " + (ctx["lanes"] or "not published") + ". Excel source/program: " + display, 180)
    put(values, "txt_0504", y_or_blank(answer(matrix, bank, "ITIN Program Available")) or "Ask", 24)
    put(values, "txt_0508", answer(matrix, bank, "ITIN Program Available") or "Verify ITIN program.", 80)
    put(values, "txt_0514", y_or_blank(answer(matrix, bank, "Lowest Score Ever Considered")) or "Ask", 24)
    put(values, "txt_0518", answer(matrix, bank, "Lowest Score Ever Considered") or "Verify no-score program.", 80)
    put(values, "txt_0519", "Ask", 24)
    put(values, "txt_0523", "Verify thin-file program/stips.", 80)
    put(values, "txt_0524", y_or_blank(answer(matrix, bank, "Open BK Allowed (Y/N)", category="Chapter 7")) or "Ask", 24)
    put(values, "txt_0528", summary_of_fields(matrix, bank, [("disch", ["Minimum Months Since Discharge"]), ("dismiss", ["Minimum Months Since Dismissal"])]) or "Verify BK seasoning.", 80)
    put(values, "txt_0529", y_or_blank(answer(matrix, bank, "Open Repo Allowed")) or "Ask", 24)
    put(values, "txt_0533", answer(matrix, bank, "Minimum Months Since Repo") or "Verify repo seasoning.", 80)
    put(values, "txt_0544", "Y" if "business" in (ctx["lanes"] or "").lower() or "commercial" in (ctx["lanes"] or "").lower() else "Ask", 24)
    put(values, "txt_0548", summary_of_fields(matrix, bank, [("ownership", ["Minimum Ownership (%)"]), ("TIB", ["Minimum Time in Business"]), ("revenue", ["Minimum Annual Revenue"]), ("PG", ["Owners Required to Guarantee (%)"])]) or "Verify commercial/business program.", 100)
    put(values, "txt_0554", summary_of_fields(matrix, bank, [("business docs", ["Business Resolution Required", "Guaranty Required", "EIN Letter Required"]), ("fleet", ["Maximum Fleet Size", "Maximum Units"]), ("GVWR", ["Maximum GVWR"])]) or "Business/commercial detail not published.", 210)
    put(values, "txt_0555", ctx["states"] or "Out-of-state eligibility not published.", 170)
    put(values, "txt_0556", "Eligibility basis not published; verify dealer/residence/title/registration state in callback.", 170)
    put(values, "txt_0558", summary_of_fields(matrix, bank, [("remote", ["Remote Signing Accepted"]), ("digital", ["Digital Signatures Accepted"]), ("wet", ["Wet Signature Required"]), ("eContract", ["eContract Available", "eContract Required"])]) or "Remote/e-sign rule not published.", 190)
    put(values, "txt_0562", summary_of_fields(matrix, bank, [("insurance", ["Insurance Required"]), ("ATFI", ["Agreement to Furnish Insurance Accepted"]), ("binder age", ["Maximum Insurance Binder Age (Days)"])]) or "Insurance timing not published.", 190)
    put(values, "txt_0567", answer(matrix, bank, "Named Insured Requirements") or "Named-insured requirement not published.", 130)
    put(values, "txt_0568", summary_of_fields(matrix, bank, [("comp", ["Maximum Comprehensive Deductible"]), ("coll", ["Maximum Collision Deductible"]), ("max", ["Maximum Deductible"])]) or "Deductible limit not published.", 160)
    put(values, "txt_0569", answer(matrix, bank, "Minimum Liability Limits", "Required Liability Limits") or "Liability limits not published.", 130)
    put(values, "txt_0570", answer(matrix, bank, "Lienholder") or answer(matrix, bank, "Funding Delivery Address") or "Loss-payee/lienholder address not published.", 150)
    put(values, "txt_0571", summary_of_fields(matrix, bank, [("digital", ["Digital Insurance Accepted"]), ("binder", ["Insurance Binder Accepted"]), ("temporary", ["Temporary Insurance Accepted"]), ("ATFI", ["Agreement to Furnish Insurance Accepted"])]) or "Insurance proof types not published.", 210)
    put(values, "txt_0572", answer(matrix, bank, "Commercial Insurance Required") or "Non-owner/commercial/rideshare insurance rule not published.", 150)

    # Stips and funding
    stip_summary = summary_of_fields(matrix, bank, [
        ("POI age", ["Maximum POI Age (Days)", "POI Maximum Age (Days)"]),
        ("POR age", ["Maximum POR Age (Days)", "POR Maximum Age (Days)"]),
        ("SSA", ["SSA-89 Required"]),
        ("DL", ["Driver License Required (Y/N)"]),
        ("Ins", ["Insurance Required"]),
    ])
    put(values, "txt_0573", stip_summary or "Standard stips vary by callback; verify POI/POR/ID/insurance/title/product docs.", 220)
    put(values, "txt_0654", answer(matrix, bank, "Top Reason Deals Sit In Funding") or "Common delays: missing stips, insurance, signatures, title/trade/payoff, wrong product/backend.", 190)
    put(values, "txt_0655", "Verification/contact rule not published; assume lender may verify customer/employer/residence/down if conditioned.", 180)
    put(values, "txt_0656", "Down/product verification rule not published; keep receipts, product certs, and buyer confirmation clean.", 170)
    put(values, "txt_0657", "RouteOne plus lender portal/direct channels where enabled; API/integration details not published.", 150)
    put(values, "txt_0658", "Pre-VIN or incomplete AF submission rule not published; exact VIN/amount usually safer.", 150)
    put(values, "txt_0659", "Mandatory-field auto-decline rules not published; avoid wrong VIN, income, residence, vehicle, amount, term, and duplicate pulls.", 190)
    put(values, "txt_0660", "Helpful notes: clean explanation for income, job/residence, trade/payoff, repo/BK, down, co-app, vehicle switch. Avoid unsupported promises.", 220)
    put(values, "txt_0661", "Upload clean stips early when callback allows; exact early-upload benefit not published.", 140)
    put(values, "txt_0662", answer(matrix, bank, "Corrections Without New Contract") or "Correct/resubmit rules not fully published; verify bureau/reapproval impact.", 160)
    put(values, "txt_0663", "Decisioning appears hybrid/automated plus manual review depending on lender; use callback as controlling.", 150)
    put(values, "txt_0664", "RouteOne/Excel show some decision data; exact callback fields vary by lender.", 140)
    put(values, "txt_0666", summary_of_fields(matrix, bank, [("approval avg", ["Average Approval Time (Minutes)"]), ("manual avg", ["Average Manual Review Time (Hours)"])]) or metric_summary(rec), 220)
    put(values, "txt_0671", "Usually request manual review/rehash through underwriting/dealer rep when structure or docs improve.", 160)
    put(values, "txt_0672", ctx["underwriting_contact"] or ctx["dealer_contact"] or "Exception approver not published; ask lender.", 160)
    put(values, "txt_0673", "Include POI/POR, proof down, trade/payoff, prior-auto proof, repo/BK docs, co-app strength, lower LTV/backend plan.", 200)
    put(values, "txt_0678", "Potentially if lender allows manual review; verify whether another bureau is triggered.", 150)
    put(values, "txt_0679", summary_of_fields(matrix, bank, [("approval age", ["Maximum Approval Age Before Funding (Days)"]), ("contract age", ["Maximum Contract Age Before Funding (Days)"])]) or "Approval validity not published.", 170)
    put(values, "txt_0680", summary_of_fields(matrix, bank, [("sell price", ["Maximum Selling Price Change Without Reapproval"]), ("payment", ["Maximum Payment Change Without Reapproval"]), ("AF", ["Maximum Amount Financed Change Without Reapproval"]), ("term", ["Maximum Term Change Without Reapproval"])]) or "Transfer/change tolerance not published.", 210)
    put(values, "txt_0681", "Rehash negotiable levers: down, LTV, term, amount financed, backend, vehicle, co-app, and stips.", 170)
    put(values, "txt_0682", recommendation(rec, ctx, matrix), 260)
    put(values, "txt_0684", summary_of_fields(matrix, bank, [("eContract", ["eContract Available", "eContract Required"]), ("remote", ["Remote Signing Accepted"]), ("wet", ["Wet Signature Required"])]) or "Contract signature method not published.", 170)
    put(values, "txt_0685", summary_of_fields(matrix, bank, [("POA", ["Power of Attorney Accepted"]), ("digital sig", ["Digital Signatures Accepted"]), ("hybrid", ["Hybrid Contract Accepted"])]) or "POA/electronic/handwritten rule not published.", 170)
    put(values, "txt_0686", summary_of_fields(matrix, bank, [("no new contract", ["Corrections Without New Contract"]), ("resign", ["Corrections Requiring Resign"]), ("window", ["Maximum Recontract Window (Days)"])]) or "Recontract rules not fully published; verify APR/payment/VIN/mileage/name/signature/product corrections.", 230)
    put(values, "txt_0687", summary_of_fields(matrix, bank, [("contract age", ["Maximum Contract Age Before Funding (Days)", "Maximum Days from Contract to Funding"]), ("approval age", ["Maximum Approval Age Before Funding (Days)"])]) or "Contract/delivery receipt age not published.", 180)
    put(values, "txt_0688", "Names, suffixes, addresses, dates, VIN, mileage, signatures, APR/payment/term and product docs must match callback/contract.", 190)
    put(values, "txt_0689", answer(matrix, bank, "Most Common RouteOne Package Error") or "Likely rejects: missing signatures, wrong APR/payment/VIN/mileage/date/title/insurance/backend/stips.", 190)
    put(values, "txt_0690", summary_of_fields(matrix, bank, [("funding avg", ["Average Funding Time (Days)"]), ("review", ["Average Funding Review Time (Hours)"]), ("cutoff", ["Same-day Funding Cutoff Time"])]) or "Clean-deal funding time not published.", 180)
    put(values, "txt_0691", summary_of_fields(matrix, bank, [("method", ["Funding Delivery Method"]), ("digital", ["Digital Funding", "Electronic Funding"]), ("paper", ["Paper Funding"]), ("weekend", ["Weekend Funding Available"]), ("holiday", ["Holiday Funding Available"])]) or "Funding method/weekend rule not published.", 220)
    put(values, "txt_0696", answer(matrix, bank, "Can Title Follow Later") or "Title-perfection/funding-before-title rule not published.", 140)
    put(values, "txt_0697", "Verifications before funding depend on callback; keep POI/POR/insurance/down/employer docs ready.", 160)
    put(values, "txt_0699", "Funding deficiencies generally via RouteOne/lender portal/contact; exact channel not published.", 150)
    put(values, "txt_0700", answer(matrix, bank, "Top Reason Deals Sit In Funding") or "Top delays: missing stips, insurance, trade/payoff/title, product certs, signatures, wrong APR/VIN/mileage/date.", 210)
    put(values, "txt_0701", summary_of_fields(matrix, bank, [("ELT", ["ELT Required"]), ("paper", ["Paper Title Accepted"]), ("duplicate", ["Duplicate Title Accepted"]), ("out-state", ["Out-of-State Title Accepted"]), ("title days", ["Maximum Title Submission Time (Days)"])]) or "Title requirements not published.", 220)

    # Appetite/routing pages
    put(values, "txt_0702", answer(matrix, bank, "First-Payment Default Review Triggers") or "FPD definition/recourse period not published.", 150)
    put(values, "txt_0703", answer(matrix, bank, "Dealer Buyback Triggers", "Repurchase Demand Triggers") or "Dealer recourse can be triggered by fraud/misrep/unverified income/missing down/straw purchase; exact rule not published.", 200)
    put(values, "txt_0704", "Recourse type not published; verify dealer agreement and FPD/fraud/product chargeback language.", 160)
    put(values, "txt_0705", answer(matrix, bank, "Repurchase Demand Triggers") or "Repurchase/indemnity triggers not published.", 150)
    put(values, "txt_0707", recommendation(rec, ctx, matrix), 260)
    put(values, "txt_0708", f"Excel booked avg FICO {fmt_num(avg(rec['tsa_fico']))}, min {fmt_num(minv(rec['tsa_fico']))}; docs: {min_score_text or 'no published min'}", 180)
    put(values, "txt_0709", "Profiles fitting written hard stops plus dealer performance lane: " + (metric_summary(rec) or "no Excel actuals."), 260)
    put(values, "txt_0710", "Avoid if outside hard stops: " + (summary_of_fields(matrix, bank, [("score", ["Minimum FICO Score"]), ("LTV", ["Maximum Total LTV", "Maximum LTV Ever"]), ("miles", ["Maximum Mileage"]), ("age", ["Maximum Vehicle Age"])]) or "ask lender for exact hard stops."), 210)
    put(values, "txt_0711", answer(matrix, bank, "Minimum Self-Employment Time (Years)") or "Self-employed rules not published; verify docs.", 130)
    put(values, "txt_0712", "1) Fit score/profile. 2) Keep LTV/backend/payment shock inside callback. 3) Clean POI/POR/title/insurance/funding docs.", 190)
    put(values, "txt_0713", "Common decline triggers: weak score/thin file, high LTV/backend, unverifiable income, repo/BK/collections, vehicle age/mileage/title issues.", 220)
    put(values, "txt_0714", "Convert decline by adding down/co-app, lowering AF/backend/term/payment, switching vehicle, proving income/residence/prior auto, or clearing derogatory docs.", 230)
    put(values, "txt_0715", "Usually negotiable: down, LTV, AF, backend, term, vehicle, stips; not published as guaranteed.", 170)
    put(values, "txt_0716", recommendation(rec, ctx, matrix), 300)
    put(values, "txt_0717", "Classify as official docs/rate sheet when in RouteOne matrix; Excel metrics are dealer performance, not official lender policy.", 220)
    put(values, "txt_0718", "Source files: RouteOne lender docs/rate sheets plus Excel trend/TSA/decision exports provided 07/19/2026.", 180)
    put(values, "txt_0719", "Track new rate sheets, bulletins, dealer rep emails, and RouteOne callback changes.", 160)
    put(values, "txt_0720", "Representative verification needed for blank/unpublished rules.", 140)
    put(values, "txt_0721", "Dealer review: Taverna CDJRF finance team / 2026-07-19.", 130)
    put(values, "txt_0722", recommendation(rec, ctx, matrix), 220)
    put(values, "txt_0723", "Do not submit outside published hard stops or with missing POI/POR/ID/title/insurance/product docs.", 180)
    put(values, "txt_0724", min_score_text or "Ask lender.", 120)
    put(values, "txt_0725", summary_of_fields(matrix, bank, [("income", ["Minimum Monthly Income ($)", "Minimum Annual Income ($)"]), ("PTI", ["Maximum PTI (%)", "Maximum PTI"]), ("DTI", ["Maximum DTI (%)", "Maximum DTI"])]) or "Ask lender.", 180)
    put(values, "txt_0726", summary_of_fields(matrix, bank, [("front", ["Maximum Front-End LTV"]), ("total", ["Maximum Total LTV", "Maximum Advance (%)"]), ("neg", ["Maximum Negative Equity ($)", "Maximum Negative Equity (%)"])]) or "Ask lender.", 180)
    put(values, "txt_0727", summary_of_fields(matrix, bank, [("AF", ["Maximum AF", "Maximum Amount Financed", "Maximum Loan Amount"]), ("term", ["Maximum Term"]), ("age", ["Maximum Vehicle Age"]), ("miles", ["Maximum Mileage"])]) or "Ask lender.", 200)
    put(values, "txt_0728", summary_of_fields(matrix, bank, [("open", ["Open Repo Allowed"]), ("age", ["Minimum Months Since Repo"]), ("deficiency", ["Deficiency Balance Must Be Paid (Y/N)"])]) or "Ask lender for repo rule.", 170)
    put(values, "txt_0729", summary_of_fields(matrix, bank, [("Ch7", ["Open BK Allowed (Y/N)"]), ("Ch13", ["Open BK Allowed"]), ("disch", ["Minimum Months Since Discharge"]), ("dismiss", ["Minimum Months Since Dismissal"])]) or "Ask lender for BK rule.", 170)
    put(values, "txt_0730", "FTB/thin/self-employed not fully published unless listed; use POI/POR/prior-auto/co-app/down to strengthen.", 180)
    put(values, "txt_0731", summary_of_fields(matrix, bank, [("down", ["Minimum Down Payment ($)", "Minimum Down Payment (%)"]), ("POI", ["POI Number Required", "POI Maximum Age (Days)"]), ("POR", ["POR Number Required", "POR Maximum Age (Days)"])]) or "Ask lender.", 200)
    put(values, "txt_0732", summary_of_fields(matrix, bank, [("callback", ["Average Approval Time (Minutes)"]), ("approval age", ["Maximum Approval Age Before Funding (Days)"]), ("funding", ["Average Funding Time (Days)"])]) or metric_summary(rec), 220)
    put(values, "txt_0733", recommendation(rec, ctx, matrix), 220)
    put(values, "txt_0734", "Weak structure, overadvance, missing stips, derogatories outside policy, unverifiable income, vehicle/title restrictions.", 190)
    put(values, "txt_0735", "Rehash with down, lower backend, shorter term, cleaner vehicle/book, POI/POR, prior auto proof, co-app, and derogatory docs.", 200)
    put(values, "txt_0736", f"Compiled 2026-07-19 from provided RouteOne docs and Excel reports. Next review: monthly/rate-sheet update.", 160)
    put(values, "txt_0737", "Initial compiled version from provided reports. Update when lender publishes new rate sheet or rep confirms exceptions.", 180)
    if effective:
        put(values, "txt_0738", f"{effective} | Initial compiled answer set | RouteOne docs/Excel reports | Codex/Taverna review", 160)

    contact_directory(values, ctx)
    scenario_table(values, matrix, bank, ctx, rec)
    return values


def fill_one_pdf(rec, values, output_path):
    reader = PdfReader(str(TEMPLATE))
    writer = PdfWriter()
    writer.append(reader)
    writer.set_need_appearances_writer(True)
    for page in writer.pages:
        writer.update_page_form_field_values(page, values, auto_regenerate=True)
    with output_path.open("wb") as fh:
        writer.write(fh)


def make_packet(paths):
    writer = PdfWriter()
    for idx, path in enumerate(paths, 1):
        reader = PdfReader(str(path))
        for page in reader.pages:
            for annot in page.get("/Annots") or []:
                obj = annot.get_object()
                if obj.get("/T"):
                    obj[NameObject("/T")] = create_string_object(f"lender_{idx}_{obj.get('/T')}")
            writer.add_page(page)
    if NameObject("/AcroForm") in writer._root_object:
        del writer._root_object[NameObject("/AcroForm")]
    with PACKET_PDF.open("wb") as fh:
        writer.write(fh)


def write_summary(rows):
    fields = [
        "Lender",
        "Policy Bank Used",
        "Policy Available",
        "Fields Filled",
        "Trend Submissions",
        "Trend Approval Ratio",
        "Trend Booked Ratio",
        "Jan-Mar Booked/Funded",
        "Avg Booked FICO",
        "Min Booked FICO",
        "Avg Booked LTV",
        "Max Booked LTV",
        "Declines May-Jul",
        "Recommendation",
        "Output PDF",
    ]
    with SUMMARY_CSV.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    matrix = load_matrix()
    profiles_by_bank, contacts_by_bank, products_by_bank = profile_maps()
    records = load_excel_metrics()
    outputs = []
    audit_rows = []
    for rec in records:
        ctx = lender_context(rec, matrix, profiles_by_bank, contacts_by_bank, products_by_bank)
        values = fill_values(rec, ctx, matrix)
        name = safe_filename(rec["display"])
        out_path = OUT_DIR / f"{name} - Filled Questionnaire.pdf"
        fill_one_pdf(rec, values, out_path)
        outputs.append(out_path)
        approval_ratio = (rec["trend_approved"] / rec["trend_submissions"] * 100) if rec["trend_submissions"] else None
        booked_ratio = (rec["trend_booked"] / rec["trend_submissions"] * 100) if rec["trend_submissions"] else None
        funded_or_booked = rec["tsa_status"]["FUNDED"] + rec["tsa_status"]["BOOKED"]
        audit_rows.append(
            {
                "Lender": rec["display"],
                "Policy Bank Used": ctx["policy_bank"],
                "Policy Available": "Y" if ctx["policy_available"] else "N",
                "Fields Filled": len(values),
                "Trend Submissions": rec["trend_submissions"],
                "Trend Approval Ratio": fmt_pct(approval_ratio),
                "Trend Booked Ratio": fmt_pct(booked_ratio),
                "Jan-Mar Booked/Funded": funded_or_booked,
                "Avg Booked FICO": fmt_num(avg(rec["tsa_fico"])),
                "Min Booked FICO": fmt_num(minv(rec["tsa_fico"])),
                "Avg Booked LTV": fmt_pct(avg(rec["tsa_ltv"])),
                "Max Booked LTV": fmt_pct(maxv(rec["tsa_ltv"])),
                "Declines May-Jul": rec["declines"],
                "Recommendation": recommendation(rec, ctx, matrix),
                "Output PDF": str(out_path),
            }
        )
    make_packet(outputs)
    write_summary(audit_rows)
    print(f"filled_pdfs={len(outputs)}")
    print(OUT_DIR)
    print(PACKET_PDF)
    print(SUMMARY_CSV)


if __name__ == "__main__":
    main()
