from __future__ import annotations

import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path

from export_liftedtrucks_dashboard import (
    TODAY,
    PREMIUM_PART_BRANDS,
    _clean_label,
    _extract_carfax_signals,
    _latest_intelligence_csv,
    _load_detail_text,
    _parts_summary,
    _to_float,
    _to_int,
)


OUTPUT_HTML = Path(r"D:\liftedtrucks_turnover_dashboard_20260401.html")


def _good_value(value: str | None) -> str:
    cleaned = _clean_label(value)
    if not cleaned or cleaned == "Not clearly disclosed":
        return ""
    return cleaned


def _mod_tags(other_mods: str | None, parts: str) -> list[str]:
    tags: set[str] = set()
    source = f"{other_mods or ''} | {parts or ''}".lower()
    if "winch" in source:
        tags.add("Winch")
    if "light" in source:
        tags.add("Lighting")
    if any(token in source for token in ["step", "slider", "rock rail"]):
        tags.add("Steps / Rails")
    if "bumper" in source:
        tags.add("Bumpers")
    if "skid" in source:
        tags.add("Skid Plates")
    if "tint" in source:
        tags.add("Window Tint")
    if "bedliner" in source:
        tags.add("Bedliner")
    if "tonneau" in source:
        tags.add("Tonneau Cover")
    if "fender" in source:
        tags.add("Fender Flares")
    if any(token in source for token in ["fox", "king", "icon", "bilstein"]):
        tags.add("Performance Shocks")
    return sorted(tags)


def _pct(rank: int | None, population: int) -> float:
    if rank is None or population <= 1:
        return 0.15
    return max(0.0, 1.0 - ((rank - 1) / (population - 1)))


def _engagement_score(click_rank: int | None, velocity_rank: int | None, clicks_7d: int | None, rank_population: int, max_clicks: int) -> float:
    click_pct = _pct(click_rank, rank_population)
    velocity_pct = _pct(velocity_rank, rank_population)
    volume_pct = (clicks_7d or 0) / max(1, max_clicks)
    return round((25 * click_pct) + (25 * velocity_pct) + (10 * min(volume_pct, 1.0)), 1)


def _freshness_score(days: int | None) -> float:
    if days is None:
        return 6.0
    if days <= 14:
        return 15.0
    if days <= 30:
        return 12.0
    if days <= 45:
        return 10.0
    if days <= 60:
        return 8.0
    if days <= 90:
        return 5.0
    if days <= 120:
        return 3.0
    return 1.0


def _carfax_score(carfax: dict) -> float:
    score = 0.0
    if carfax["present"]:
        score += 2.0
    if carfax["one_owner"]:
        score += 2.5
    if carfax["clean_carfax"]:
        score += 3.5
    if carfax["no_accidents"]:
        score += 1.5
    if carfax["good_value"]:
        score += 1.0
    if carfax["fair_value"]:
        score -= 1.0
    return round(max(0.0, min(score, 10.0)), 1)


def _price_edge_score(price: float | None, peer: float | None) -> float:
    if not price or not peer or peer <= 0:
        return 5.0
    ratio = price / peer
    if ratio <= 0.90:
        return 10.0
    if ratio <= 0.95:
        return 8.0
    if ratio <= 1.00:
        return 6.0
    if ratio <= 1.05:
        return 4.0
    return 2.0


def _mod_score(parts: str, aftermarket_price: float | None) -> float:
    text = parts.lower()
    score = 1.0
    if any(brand in text for brand in PREMIUM_PART_BRANDS):
        score += 1.5
    if "37x" in text or '37"' in text:
        score += 1.5
    elif "35x" in text or '35"' in text:
        score += 1.0
    if any(token in text for token in ["winch", "fox", "bumper", "rock rails", "light bar", "bds", "icon"]):
        score += 1.0
    if aftermarket_price and aftermarket_price >= 8000:
        score += 1.0
    return round(min(score, 5.0), 1)


def _hotness(score: float) -> str:
    if score >= 82:
        return "Hot now"
    if score >= 72:
        return "Strong watch"
    if score >= 62:
        return "Review"
    return "Lower priority"


def _peer_key(row: dict) -> tuple[str, str, str]:
    return (str(row.get("year") or ""), str(row.get("make") or ""), str(row.get("model") or ""))


def _causes(row: dict, peer: float | None, carfax: dict, turn_score: float) -> list[str]:
    causes: list[str] = []
    click_rank = _to_int(row.get("click_rank_7d"))
    velocity_rank = _to_int(row.get("engagement_rank_velocity"))
    clicks_7d = _to_int(row.get("website_clicks_public"))
    velocity = _to_float(row.get("public_views_per_live_day"))
    days = _to_int(row.get("days_in_stock"))
    price = _to_float(row.get("featured_price_usd"))
    year = _to_int(row.get("year"))
    trim = str(row.get("trim") or "")
    engine = str(row.get("engine") or "")
    parts = _parts_summary(row).lower()

    if click_rank is not None and click_rank <= 10:
        causes.append(f"Top 10 click volume ({clicks_7d} in 7 days)")
    elif click_rank is not None and click_rank <= 25:
        causes.append(f"Top 25 click volume ({clicks_7d} in 7 days)")
    if velocity_rank is not None and velocity_rank <= 10 and velocity is not None:
        causes.append(f"Top 10 engagement velocity ({velocity:.2f}/day)")
    elif velocity_rank is not None and velocity_rank <= 25 and velocity is not None:
        causes.append(f"Top 25 engagement velocity ({velocity:.2f}/day)")
    if days is not None and days <= 30:
        causes.append(f"Fresh listing at {days} days in stock")
    elif days is not None and days >= 60 and click_rank is not None and click_rank <= 50:
        causes.append(f"Aged unit still pulling traffic at {days} days")
    if price and peer and price <= (peer * 0.95):
        causes.append("Priced below peer median")
    if year and year >= 2024:
        causes.append("Newer model year")
    if carfax["clean_carfax"]:
        causes.append("Clean Carfax wording")
    elif carfax["one_owner"]:
        causes.append("1-owner Carfax signal")
    if "37x" in parts or '37"' in parts:
        causes.append("37-inch setup draws attention")
    elif "35x" in parts or '35"' in parts:
        causes.append("35-inch setup has wide appeal")
    if any(name in trim.lower() for name in ["rebel", "rubicon", "trx", "mojave", "longhorn", "limited", "laramie", "power wagon"]):
        causes.append(f"{trim} trim has strong search appeal")
    if "diesel" in engine.lower():
        causes.append("Diesel widens buyer pool")
    if not causes:
        causes.append(f"Mixed signals, but turnover score is still {turn_score:.1f}")
    return causes[:4]


def _action_plan(row: dict, turn_score: float, causes: list[str]) -> list[str]:
    days = _to_int(row.get("days_in_stock"))
    click_rank = _to_int(row.get("click_rank_7d"))
    price = _to_float(row.get("featured_price_usd")) or _to_float(row.get("vehicle_price_usd"))
    plans: list[str] = []
    if turn_score >= 78:
        plans.append("Keep this unit front-and-center before changing price.")
    elif turn_score >= 68:
        plans.append("Push this unit harder with stronger copy and placement.")
    else:
        plans.append("Fix price or presentation before sending more traffic.")
    if days is not None and days >= 60 and click_rank is not None and click_rank <= 50:
        plans.append("Older but still wanted. Try sharper CTA or a small price move.")
    elif days is not None and days >= 60:
        plans.append("Aging without enough pull. Review photos, copy, and price now.")
    if price is not None and price >= 80000:
        plans.append("High-ticket unit. Lead with Carfax, ownership, and premium parts.")
    elif any("37-inch" in item.lower() for item in causes):
        plans.append("Call out the 37-inch build directly in the headline.")
    return plans[:3]


def build_data() -> list[dict]:
    source_csv = _latest_intelligence_csv()
    with source_csv.open("r", newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    click_population = sum(1 for row in rows if _to_int(row.get("click_rank_7d")) is not None)
    velocity_population = sum(1 for row in rows if _to_int(row.get("engagement_rank_velocity")) is not None)
    rank_population = max(click_population, velocity_population, 2)
    max_clicks = max((_to_int(row.get("website_clicks_public")) or 0 for row in rows), default=1)

    peer_prices: dict[tuple[str, str, str], list[float]] = {}
    for row in rows:
        price = _to_float(row.get("featured_price_usd")) or _to_float(row.get("vehicle_price_usd"))
        if price is not None:
            peer_prices.setdefault(_peer_key(row), []).append(price)
    peer_medians = {key: statistics.median(values) for key, values in peer_prices.items()}

    data: list[dict] = []
    for row in rows:
        detail_text = _load_detail_text(str(row.get("listing_url") or ""))
        carfax = _extract_carfax_signals(detail_text, str(row.get("dealer_notes_detailed_paraphrase") or ""))
        parts = _parts_summary(row)
        wheel_style = _good_value(row.get("wheel_style"))
        tire_model = _good_value(row.get("tire_brand_model"))
        lift_brand = _good_value(row.get("lift_brand_model"))
        exterior_color = _good_value(row.get("exterior_color"))
        mod_tags = _mod_tags(row.get("other_mods"), parts)
        asking_total = _to_float(row.get("featured_price_usd")) or _to_float(row.get("vehicle_price_usd"))
        vehicle_price = _to_float(row.get("vehicle_price_usd")) or _to_float(row.get("featured_price_usd"))
        aftermarket_price = _to_float(row.get("aftermarket_accessories_usd"))
        mileage = _to_int(row.get("mileage"))
        days = _to_int(row.get("days_in_stock"))
        click_rank = _to_int(row.get("click_rank_7d"))
        velocity_rank = _to_int(row.get("engagement_rank_velocity"))
        clicks_7d = _to_int(row.get("website_clicks_public"))
        velocity = _to_float(row.get("public_views_per_live_day"))
        peer = peer_medians.get(_peer_key(row))

        score_engagement = _engagement_score(click_rank, velocity_rank, clicks_7d, rank_population, max_clicks)
        score_freshness = _freshness_score(days)
        score_carfax = _carfax_score(carfax)
        score_price = _price_edge_score(asking_total, peer)
        score_mods = _mod_score(parts, aftermarket_price)
        turn_score = round(score_engagement + score_freshness + score_carfax + score_price + score_mods, 1)
        engagement_signal = round((clicks_7d or 0) * 2.0 + (velocity or 0.0) * 10.0, 1)

        causes = _causes(row, peer, carfax, turn_score)
        data.append(
            {
                "vin": row.get("vin"),
                "title": f"{row.get('year')} {row.get('make')} {row.get('model')} {row.get('trim')}".strip(),
                "year": _to_int(row.get("year")),
                "make": row.get("make"),
                "model": row.get("model"),
                "trim": row.get("trim"),
                "mileage": mileage,
                "vehicle_price": vehicle_price,
                "asking_total": asking_total,
                "aftermarket_price": aftermarket_price,
                "days_in_stock": days,
                "website_clicks_7d": clicks_7d,
                "engagement_per_day": round(velocity or 0.0, 2) if velocity is not None else None,
                "click_rank": click_rank,
                "engagement_rank": velocity_rank,
                "turn_score": turn_score,
                "engagement_signal": engagement_signal,
                "hotness": _hotness(turn_score),
                "carfax_summary": carfax["summary"],
                "carfax_badge": carfax["badge_text"],
                "aftermarket_parts": parts,
                "wheel_style": wheel_style,
                "tire_model": tire_model,
                "lift_brand": lift_brand,
                "exterior_color": exterior_color,
                "mod_tags": mod_tags,
                "possible_causes": causes,
                "action_plan": _action_plan(row, turn_score, causes),
                "score_breakdown": {
                    "engagement": score_engagement,
                    "freshness": score_freshness,
                    "carfax": score_carfax,
                    "price_edge": score_price,
                    "build": score_mods,
                },
                "peer_median_price": round(peer, 0) if peer is not None else None,
                "engine": _clean_label(row.get("engine")),
                "transmission": _clean_label(row.get("transmission")),
                "drivetrain": _clean_label(row.get("drivetrain")),
            }
        )

    data.sort(key=lambda item: (item["turn_score"], item["website_clicks_7d"] or -1, -(item["days_in_stock"] or 999)), reverse=True)
    for index, item in enumerate(data, start=1):
        item["rank"] = index
    return data


def build_summary(data: list[dict]) -> dict:
    clicks = [item["website_clicks_7d"] for item in data if item["website_clicks_7d"] is not None]
    velocity = [item["engagement_per_day"] for item in data if item["engagement_per_day"] is not None]
    aged_engaged = [item for item in data if (item["days_in_stock"] or 0) >= 60 and (item["click_rank"] or 999) <= 50]
    return {
        "units": len(data),
        "avg_turn": round(statistics.mean(item["turn_score"] for item in data), 1),
        "avg_clicks": round(statistics.mean(clicks), 1) if clicks else 0,
        "avg_velocity": round(statistics.mean(velocity), 2) if velocity else 0,
        "hot_units": sum(1 for item in data if item["turn_score"] >= 72),
        "aged_engaged": len(aged_engaged),
    }


def build_insights(data: list[dict]) -> dict:
    def aggregate_single(items: list[dict], key_name: str, *, min_count: int = 2) -> list[dict]:
        buckets: dict[str, list[dict]] = defaultdict(list)
        for item in items:
            label = str(item.get(key_name) or "").strip()
            if not label:
                continue
            buckets[label].append(item)
        ranked: list[dict] = []
        for label, members in buckets.items():
            if len(members) < min_count:
                continue
            avg_clicks = statistics.mean((member["website_clicks_7d"] or 0) for member in members)
            avg_velocity = statistics.mean((member["engagement_per_day"] or 0.0) for member in members)
            avg_turn = statistics.mean(member["turn_score"] for member in members)
            avg_signal = statistics.mean(member["engagement_signal"] for member in members)
            rank_score = round(avg_signal + min(len(members), 8) + (avg_turn / 12.0), 1)
            ranked.append(
                {
                    "label": label,
                    "count": len(members),
                    "avg_clicks": round(avg_clicks, 1),
                    "avg_velocity": round(avg_velocity, 2),
                    "avg_turn": round(avg_turn, 1),
                    "score": rank_score,
                }
            )
        ranked.sort(key=lambda item: (item["score"], item["avg_clicks"], item["count"]), reverse=True)
        if ranked or min_count == 1:
            return ranked[:6]
        return aggregate_single(items, key_name, min_count=1)[:6]

    def aggregate_multi(items: list[dict], key_name: str, *, min_count: int = 2) -> list[dict]:
        buckets: dict[str, list[dict]] = defaultdict(list)
        for item in items:
            for label in item.get(key_name) or []:
                clean = str(label or "").strip()
                if clean:
                    buckets[clean].append(item)
        ranked: list[dict] = []
        for label, members in buckets.items():
            if len(members) < min_count:
                continue
            avg_clicks = statistics.mean((member["website_clicks_7d"] or 0) for member in members)
            avg_velocity = statistics.mean((member["engagement_per_day"] or 0.0) for member in members)
            avg_turn = statistics.mean(member["turn_score"] for member in members)
            avg_signal = statistics.mean(member["engagement_signal"] for member in members)
            rank_score = round(avg_signal + min(len(members), 8) + (avg_turn / 12.0), 1)
            ranked.append(
                {
                    "label": label,
                    "count": len(members),
                    "avg_clicks": round(avg_clicks, 1),
                    "avg_velocity": round(avg_velocity, 2),
                    "avg_turn": round(avg_turn, 1),
                    "score": rank_score,
                }
            )
        ranked.sort(key=lambda item: (item["score"], item["avg_clicks"], item["count"]), reverse=True)
        if ranked or min_count == 1:
            return ranked[:6]
        return aggregate_multi(items, key_name, min_count=1)[:6]

    model_items = []
    for item in data:
        enriched = dict(item)
        enriched["model_group"] = " ".join(part for part in [str(item.get("make") or "").strip(), str(item.get("model") or "").strip()] if part).strip()
        model_items.append(enriched)

    return {
        "years": aggregate_single(data, "year"),
        "models": aggregate_single(model_items, "model_group"),
        "wheels": aggregate_single(data, "wheel_style"),
        "tires": aggregate_single(data, "tire_model"),
        "lifts": aggregate_single(data, "lift_brand"),
        "colors": aggregate_single(data, "exterior_color"),
        "parts": aggregate_multi(data, "mod_tags"),
    }


def build_html(data: list[dict]) -> str:
    summary = build_summary(data)
    insights = build_insights(data)
    makes = sorted({item["make"] for item in data if item["make"]})
    years = sorted({item["year"] for item in data if item["year"] is not None}, reverse=True)
    max_price = int(max((item["vehicle_price"] or item["asking_total"] or 0) for item in data))
    max_miles = int(max((item["mileage"] or 0) for item in data))
    max_clicks = int(max((item["website_clicks_7d"] or 0) for item in data))
    css = """
:root{--bg:#efede6;--panel:rgba(255,255,255,.78);--panel2:#fbfaf6;--stroke:rgba(17,24,39,.08);--text:#18181b;--muted:#6b7280;--soft:#f4f1e8;--accent:#0f766e;--gold:#b78933;--r:22px;--shadow:0 22px 44px rgba(15,23,42,.08);--ui:"SF Pro Display","Aptos","Segoe UI Variable","Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;font-family:var(--ui);color:var(--text);background:radial-gradient(circle at top left,rgba(255,255,255,.72),transparent 34%),linear-gradient(180deg,#f5f2ea 0%,#ebe8df 100%);min-height:100vh}.app{max-width:1680px;margin:0 auto;padding:28px}.hero{display:grid;grid-template-columns:1.7fr 1fr;gap:18px;margin-bottom:18px}.card,.filters,.inventory,.detail{background:var(--panel);backdrop-filter:blur(22px);border:1px solid var(--stroke);border-radius:var(--r);box-shadow:var(--shadow)}.hero-main{padding:28px;background:linear-gradient(145deg,rgba(255,255,255,.92),rgba(249,247,241,.76))}.hero-main h1{margin:0 0 8px;font-size:clamp(34px,4vw,56px);letter-spacing:-.05em;line-height:.95}.hero-main p{margin:0;color:var(--muted);font-size:15px;max-width:60ch}.hero-meta{margin-top:18px;display:flex;flex-wrap:wrap;gap:10px}.pill{padding:9px 14px;border-radius:999px;background:var(--soft);font-size:12px;border:1px solid rgba(17,24,39,.05)}.hero-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.stat{padding:18px 20px}.label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px}.value{font-size:34px;line-height:1;letter-spacing:-.05em;margin-bottom:10px}.sub{color:var(--muted);font-size:13px}
.filters{position:sticky;top:12px;z-index:10;padding:16px;margin-bottom:18px}.fg{display:grid;grid-template-columns:1.2fr repeat(6,minmax(130px,1fr)) auto auto auto;gap:12px;align-items:end}.field{display:flex;flex-direction:column;gap:6px}.field label{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}.field input,.field select,.field textarea{width:100%;border:1px solid rgba(17,24,39,.08);background:rgba(255,255,255,.9);color:var(--text);padding:12px 14px;border-radius:14px;font:inherit;outline:none}.btn{border:0;border-radius:14px;padding:12px 14px;background:#111827;color:#fff;font:inherit;cursor:pointer;min-height:46px}.btn.alt{background:rgba(17,24,39,.06);color:var(--text)}
.layout{display:grid;grid-template-columns:1.25fr .95fr;gap:18px;min-height:68vh}.inventory{overflow:hidden;display:flex;flex-direction:column}.inventory-h{padding:18px 20px 14px;border-bottom:1px solid var(--stroke);display:flex;justify-content:space-between;align-items:center;gap:14px}.inventory-h h2{font-size:22px;letter-spacing:-.04em;margin:0}.inventory-h .sub{margin-top:6px}.cols,.row{display:grid;grid-template-columns:1.9fr 94px 90px 90px 94px 120px 126px;gap:12px;align-items:center}.cols{padding:0 20px 12px;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}.rows{overflow:auto;padding:0 10px 10px 20px}.row{margin-right:10px;padding:14px 12px;border-radius:18px;cursor:pointer;border:1px solid transparent;transition:transform .16s ease,background .16s ease,border-color .16s ease}.row:hover{transform:translateY(-1px);background:rgba(255,255,255,.55);border-color:rgba(17,24,39,.06)}.row.active{background:rgba(15,118,110,.10);border-color:rgba(15,118,110,.18)}.vtitle{font-size:17px;letter-spacing:-.03em;font-weight:600;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vmeta{display:flex;flex-wrap:wrap;gap:8px 10px;color:var(--muted);font-size:12px}.mini{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:rgba(17,24,39,.05)}.score{display:inline-flex;justify-content:center;align-items:center;min-width:68px;padding:8px 12px;border-radius:999px;font-weight:700;background:rgba(15,118,110,.12);color:var(--accent)}.chip{display:inline-flex;justify-content:center;align-items:center;min-width:110px;padding:8px 12px;border-radius:999px;font-size:12px;font-weight:600;background:rgba(183,137,51,.12);color:var(--gold)}.num{font-variant-numeric:tabular-nums}
.detail{padding:22px;display:flex;flex-direction:column;gap:18px;overflow:auto}.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.detail h2{margin:0;font-size:31px;letter-spacing:-.05em;line-height:1}.small{color:var(--muted);font-size:13px;margin-top:8px}.rcol{text-align:right}.rank{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}.rankv{font-size:42px;line-height:1;letter-spacing:-.06em}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric,.section{padding:16px;background:var(--panel2);border:1px solid var(--stroke);border-radius:18px}.section{padding:18px;border-radius:20px}.section h3{margin:0 0 14px;font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.causes{display:flex;flex-wrap:wrap;gap:10px}.cause{padding:10px 12px;border-radius:14px;background:rgba(17,24,39,.05);font-size:13px;line-height:1.35}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.metalist{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.meta{padding:12px;border-radius:16px;background:rgba(17,24,39,.04)}.meta label{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}.meta strong{display:block;font-size:15px;line-height:1.35}.bars{display:grid;gap:12px}.bar{display:grid;grid-template-columns:130px 1fr 52px;gap:10px;align-items:center}.track{height:10px;border-radius:999px;background:rgba(17,24,39,.08);overflow:hidden}.fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#0f766e,#16a34a)}.footer{color:var(--muted);font-size:12px;line-height:1.5}.empty{padding:40px 20px 50px;text-align:center;color:var(--muted)}
@media(max-width:1380px){.fg{grid-template-columns:repeat(4,minmax(160px,1fr))}.layout{grid-template-columns:1fr}}@media(max-width:960px){.hero{grid-template-columns:1fr}.hero-stats{grid-template-columns:repeat(2,1fr)}.metrics{grid-template-columns:repeat(2,1fr)}.grid2,.metalist{grid-template-columns:1fr}.cols,.row{grid-template-columns:1.5fr 80px 72px 72px 80px 96px 108px}}@media(max-width:700px){.app{padding:16px}.hero-stats{grid-template-columns:1fr}.fg{grid-template-columns:1fr}.cols{display:none}.row{grid-template-columns:1fr}.metrics{grid-template-columns:1fr 1fr}}
"""
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lifted Trucks Turnover Dashboard</title><style>{css}</style></head><body><div class="app">
<section class="hero"><div class="card hero-main"><h1>Turnover Dashboard</h1><p>Built for one job: show which lifted units are pulling real shopper attention right now, why they are pulling it, and what to do next to move them faster.</p><div class="hero-meta"><span class="pill">Updated {TODAY.isoformat()}</span><span class="pill">Engagement-weighted ranking</span><span class="pill">One-file offline dashboard</span><span class="pill">Days of supply uses site-age proxy</span></div></div><div class="hero-stats"><div class="card stat"><div class="label">Units</div><div class="value num">{summary['units']}</div><div class="sub">all live rows in dashboard</div></div><div class="card stat"><div class="label">Average Clicks / 7d</div><div class="value num">{summary['avg_clicks']}</div><div class="sub">public website signal</div></div><div class="card stat"><div class="label">Hot Units</div><div class="value num">{summary['hot_units']}</div><div class="sub">turn score 72+</div></div><div class="card stat"><div class="label">Aged + Still Engaged</div><div class="value num">{summary['aged_engaged']}</div><div class="sub">older units still pulling traffic</div></div></div></section>
<section class="filters"><div class="fg"><div class="field"><label>Search</label><input id="search" type="text" placeholder="VIN, trim, model, parts"></div><div class="field"><label>Make</label><select id="make"><option value="">All makes</option>{''.join(f'<option value="{make}">{make}</option>' for make in makes)}</select></div><div class="field"><label>Year</label><select id="year"><option value="">All years</option>{''.join(f'<option value="{year}">{year}</option>' for year in years)}</select></div><div class="field"><label>Max Price</label><input id="price" type="range" min="25000" max="{max_price}" step="1000" value="{max_price}"></div><div class="field"><label>Max Mileage</label><input id="miles" type="range" min="0" max="{max_miles}" step="1000" value="{max_miles}"></div><div class="field"><label>Min Clicks / 7d</label><input id="clicks" type="range" min="0" max="{max_clicks}" step="1" value="0"></div><div class="field"><label>Sort</label><select id="sort"><option value="turn">Turn score</option><option value="clicks">Clicks / 7d</option><option value="velocity">Engagement / day</option><option value="daysAsc">Days in stock, low first</option><option value="daysDesc">Days in stock, high first</option><option value="priceAsc">Price, low first</option><option value="priceDesc">Price, high first</option><option value="milesAsc">Mileage, low first</option></select></div><button class="btn alt" id="reset">Reset</button><button class="btn alt" id="export">Export View</button><button class="btn" id="copy">Copy VINs</button></div></section>
<section class="layout"><div class="inventory"><div class="inventory-h"><div><h2>Inventory Flow</h2><div class="sub" id="summaryLine"></div></div><div class="pill" id="filterLine"></div></div><div class="cols"><div>Vehicle</div><div>Turn</div><div>Clicks</div><div>/ Day</div><div>Days</div><div>Price</div><div>Suggested</div></div><div class="rows" id="rows"></div></div><aside class="detail" id="detail"></aside></section></div>"""
    js = f"""
<script>
const DATA = {json.dumps(data)};
const DEFAULT_MAX_PRICE = {max_price};
const DEFAULT_MAX_MILES = {max_miles};
const state = {{search:'',make:'',year:'',maxPrice:DEFAULT_MAX_PRICE,maxMiles:DEFAULT_MAX_MILES,minClicks:0,sort:'turn',selected:DATA[0]?DATA[0].vin:null,notes:JSON.parse(localStorage.getItem('lifted_notes')||'{{}}'),actions:JSON.parse(localStorage.getItem('lifted_actions')||'{{}}')}};
const $ = id => document.getElementById(id);
const fmtC = v => v == null ? '—' : new Intl.NumberFormat('en-US', {{style:'currency',currency:'USD',maximumFractionDigits:0}}).format(v);
const fmtN = v => v == null ? '—' : new Intl.NumberFormat('en-US').format(v);
const fmt1 = v => v == null ? '—' : Number(v).toFixed(1);
function readout(){{return [state.make||'All makes',state.year||'All years',`<= ${{fmtC(state.maxPrice)}}`,`<= ${{fmtN(state.maxMiles)}} mi`,`>= ${{state.minClicks}} clicks`].join(' · ')}}
function filtered(){{let rows = DATA.filter(x => {{const hay=[x.title,x.vin,x.make,x.model,x.trim,x.aftermarket_parts,x.carfax_summary,...(x.possible_causes||[])].join(' ').toLowerCase(); return (!state.search||hay.includes(state.search.toLowerCase())) && (!state.make||x.make===state.make) && (!state.year||String(x.year)===String(state.year)) && ((x.vehicle_price??x.asking_total??0) <= state.maxPrice) && ((x.mileage??0) <= state.maxMiles) && ((x.website_clicks_7d??0) >= state.minClicks); }}); const s={{turn:(a,b)=>(b.turn_score-a.turn_score)||((b.website_clicks_7d||0)-(a.website_clicks_7d||0)),clicks:(a,b)=>((b.website_clicks_7d||0)-(a.website_clicks_7d||0))||(b.turn_score-a.turn_score),velocity:(a,b)=>((b.engagement_per_day||0)-(a.engagement_per_day||0))||(b.turn_score-a.turn_score),daysAsc:(a,b)=>((a.days_in_stock||9999)-(b.days_in_stock||9999))||(b.turn_score-a.turn_score),daysDesc:(a,b)=>((b.days_in_stock||0)-(a.days_in_stock||0))||(b.turn_score-a.turn_score),priceAsc:(a,b)=>((a.vehicle_price||a.asking_total||999999)-(b.vehicle_price||b.asking_total||999999)),priceDesc:(a,b)=>((b.vehicle_price||b.asking_total||0)-(a.vehicle_price||a.asking_total||0)),milesAsc:(a,b)=>((a.mileage||999999)-(b.mileage||999999))||(b.turn_score-a.turn_score)}}; rows.sort(s[state.sort]||s.turn); return rows;}}
function renderRows(rows){{if(!rows.length){{$('rows').innerHTML='<div class="empty">No units match these filters.</div>'; return;}} $('rows').innerHTML = rows.map(x => {{const meta=[`<span class="mini">${{x.vin}}</span>`,`<span class="mini">${{fmtN(x.mileage)}} mi</span>`,x.aftermarket_price!=null?`<span class="mini">${{fmtC(x.aftermarket_price)}} aftermarket</span>`:''].filter(Boolean).join(''); return `<div class="row ${{x.vin===state.selected?'active':''}}" data-vin="${{x.vin}}"><div><div class="vtitle">${{x.title}}</div><div class="vmeta">${{meta}}</div></div><div><span class="score num">${{fmt1(x.turn_score)}}</span></div><div class="num">${{fmtN(x.website_clicks_7d)}}</div><div class="num">${{fmt1(x.engagement_per_day)}}</div><div class="num">${{fmtN(x.days_in_stock)}}</div><div class="num">${{fmtC(x.vehicle_price||x.asking_total)}}</div><div><span class="chip">${{x.hotness}}</span></div></div>`; }}).join(''); document.querySelectorAll('.row').forEach(n => n.addEventListener('click', () => {{state.selected=n.dataset.vin; render();}}));}}
function selected(rows){{if(!rows.length) return null; const hit=rows.find(x => x.vin===state.selected); if(hit) return hit; state.selected=rows[0].vin; return rows[0];}}
function renderDetail(x){{if(!x){{$('detail').innerHTML='<div class="empty">Select a vehicle to see detail.</div>'; return;}} const note=state.notes[x.vin]||''; const action=state.actions[x.vin]||''; const bars=[['Engagement',x.score_breakdown.engagement,60],['Freshness',x.score_breakdown.freshness,15],['Carfax',x.score_breakdown.carfax,10],['Price Edge',x.score_breakdown.price_edge,10],['Build',x.score_breakdown.build,5]]; $('detail').innerHTML=`<div class="top"><div><h2>${{x.title}}</h2><div class="small">${{x.vin}} · ${{fmtN(x.mileage)}} miles · ${{x.make}} · ${{x.drivetrain||'—'}}</div></div><div class="rcol"><div class="rank">Turn Score</div><div class="rankv num">${{fmt1(x.turn_score)}}</div></div></div><div class="metrics"><div class="metric"><div class="label">Clicks / 7d</div><div class="value num">${{fmtN(x.website_clicks_7d)}}</div><div class="sub">${{x.click_rank?`Rank #${{x.click_rank}}`:'No public rank'}}</div></div><div class="metric"><div class="label">Engagement / Day</div><div class="value num">${{fmt1(x.engagement_per_day)}}</div><div class="sub">${{x.engagement_rank?`Rank #${{x.engagement_rank}}`:'No public rank'}}</div></div><div class="metric"><div class="label">Days In Stock</div><div class="value num">${{fmtN(x.days_in_stock)}}</div><div class="sub">site-age proxy</div></div><div class="metric"><div class="label">Price</div><div class="value num">${{fmtC(x.vehicle_price||x.asking_total)}}</div><div class="sub">${{x.aftermarket_price!=null?`${{fmtC(x.aftermarket_price)}} aftermarket`:'aftermarket price not disclosed'}}</div></div></div><div class="section"><h3>Why It Gets Attention</h3><div class="causes">${{x.possible_causes.map(c => `<div class="cause">${{c}}</div>`).join('')}}</div></div><div class="grid2"><div class="section"><h3>Vehicle Snapshot</h3><div class="metalist"><div class="meta"><label>Vehicle Price</label><strong>${{fmtC(x.vehicle_price)}}</strong></div><div class="meta"><label>Aftermarket Price</label><strong>${{fmtC(x.aftermarket_price)}}</strong></div><div class="meta"><label>Peer Median</label><strong>${{fmtC(x.peer_median_price)}}</strong></div><div class="meta"><label>Hotness</label><strong>${{x.hotness}}</strong></div><div class="meta"><label>Engine</label><strong>${{x.engine||'—'}}</strong></div><div class="meta"><label>Transmission</label><strong>${{x.transmission||'—'}}</strong></div><div class="meta"><label>Drivetrain</label><strong>${{x.drivetrain||'—'}}</strong></div><div class="meta"><label>Aftermarket Parts</label><strong>${{x.aftermarket_parts}}</strong></div></div></div><div class="section"><h3>Carfax + Plan</h3><div class="metalist"><div class="meta"><label>Carfax Summary</label><strong>${{x.carfax_summary}}</strong></div><div class="meta"><label>Carfax Badge</label><strong>${{x.carfax_badge||'Not exposed'}}</strong></div><div class="meta" style="grid-column:1 / -1"><label>Move This Unit</label><strong>${{x.action_plan.join(' ')}}</strong></div></div></div></div><div class="section"><h3>Score Breakdown</h3><div class="bars">${{bars.map(([label,val,max]) => `<div class="bar"><div class="label">${{label}}</div><div class="track"><div class="fill" style="width:${{Math.max(6,(val/max)*100)}}%"></div></div><div class="num">${{fmt1(val)}}</div></div>`).join('')}}</div></div><div class="section"><h3>My Action</h3><div class="grid2"><div class="field"><label>Priority</label><select id="actionSel"><option value="">No tag</option><option value="Push Hard" ${{action==='Push Hard'?'selected':''}}>Push Hard</option><option value="Feature Now" ${{action==='Feature Now'?'selected':''}}>Feature Now</option><option value="Price Review" ${{action==='Price Review'?'selected':''}}>Price Review</option><option value="Merch Refresh" ${{action==='Merch Refresh'?'selected':''}}>Merch Refresh</option><option value="Watch" ${{action==='Watch'?'selected':''}}>Watch</option></select></div><div class="field"><label>Saved Note</label><textarea id="noteBox" rows="4" placeholder="What do you want to remember about this unit?">${{note}}</textarea></div></div></div><div class="footer">This dashboard weights engagement the hardest because the goal is fast turnover. Carfax is summarized from dealer-page signals, not direct full-report scraping. Days in stock is a site-age proxy, not true market supply.</div>`; $('actionSel').addEventListener('change', e => {{state.actions[x.vin]=e.target.value; localStorage.setItem('lifted_actions', JSON.stringify(state.actions));}}); $('noteBox').addEventListener('input', e => {{state.notes[x.vin]=e.target.value; localStorage.setItem('lifted_notes', JSON.stringify(state.notes));}});}}
function exportCsv(rows){{const headers=['rank','turn_score','hotness','year','make','model','trim','vin','mileage','vehicle_price','aftermarket_price','days_in_stock','website_clicks_7d','engagement_per_day','carfax_summary','aftermarket_parts','possible_causes']; const csv=[headers.join(','),...rows.map(x => headers.map(k => {{let v=x[k]; if(Array.isArray(v)) v=v.join(' | '); v=v??''; return `"${{String(v).replace(/"/g,'""')}}"`;}}).join(','))].join('\\n'); const blob=new Blob([csv],{{type:'text/csv;charset=utf-8;'}}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='liftedtrucks_turnover_filtered_view.csv'; a.click(); URL.revokeObjectURL(url);}}
function render(){{const rows=filtered(); renderRows(rows); renderDetail(selected(rows)); const avgClicks=rows.length?(rows.reduce((s,x)=>s+(x.website_clicks_7d||0),0)/rows.length).toFixed(1):'0.0'; const avgTurn=rows.length?(rows.reduce((s,x)=>s+x.turn_score,0)/rows.length).toFixed(1):'0.0'; $('summaryLine').textContent=`${{rows.length}} of ${{DATA.length}} units · avg clicks ${{avgClicks}} · avg turn score ${{avgTurn}}`; $('filterLine').textContent=readout();}}
$('search').addEventListener('input',e=>{{state.search=e.target.value;render();}}); $('make').addEventListener('change',e=>{{state.make=e.target.value;render();}}); $('year').addEventListener('change',e=>{{state.year=e.target.value;render();}}); $('price').addEventListener('input',e=>{{state.maxPrice=Number(e.target.value);render();}}); $('miles').addEventListener('input',e=>{{state.maxMiles=Number(e.target.value);render();}}); $('clicks').addEventListener('input',e=>{{state.minClicks=Number(e.target.value);render();}}); $('sort').addEventListener('change',e=>{{state.sort=e.target.value;render();}}); $('reset').addEventListener('click',()=>{{state.search='';state.make='';state.year='';state.maxPrice=DEFAULT_MAX_PRICE;state.maxMiles=DEFAULT_MAX_MILES;state.minClicks=0;state.sort='turn'; $('search').value='';$('make').value='';$('year').value='';$('price').value=DEFAULT_MAX_PRICE;$('miles').value=DEFAULT_MAX_MILES;$('clicks').value=0;$('sort').value='turn';render();}}); $('export').addEventListener('click',()=>exportCsv(filtered())); $('copy').addEventListener('click',async()=>{{await navigator.clipboard.writeText(filtered().map(x=>x.vin).join('\\n')); $('copy').textContent='VINs Copied'; setTimeout(()=> $('copy').textContent='Copy VINs',1400);}}); render();
</script>"""
    return html + js + "</body></html>"


def main() -> int:
    data = build_data()
    OUTPUT_HTML.write_text(build_html(data), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "html": str(OUTPUT_HTML),
        "row_count": len(data),
        "top_vin": data[0]["vin"] if data else None,
        "top_turn_score": data[0]["turn_score"] if data else None,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
