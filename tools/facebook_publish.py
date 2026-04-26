from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def _load_accounts(accounts_path: Path) -> list[dict]:
    if not accounts_path.exists():
        return []
    try:
        payload = json.loads(accounts_path.read_text(encoding="utf-8"))
    except Exception:
        return []
    accounts = payload.get("accounts", []) if isinstance(payload, dict) else []
    return [entry for entry in accounts if isinstance(entry, dict)]


def _find_chromedriver(drivers_dir: Path) -> Path | None:
    if not drivers_dir.exists():
        return None
    direct = drivers_dir / "chromedriver.exe"
    if direct.exists():
        return direct
    for candidate in drivers_dir.glob("chromedriver*"):
        if candidate.is_file():
            return candidate
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish a Facebook Marketplace listing via recovered lister.")
    parser.add_argument("--payload", required=True, help="Path to a JSON payload file.")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    payload_path = Path(args.payload)
    if not payload_path.exists():
        print(json.dumps({"ok": False, "error": f"Missing payload file: {payload_path}"}))
        return 2

    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    account_id = str(payload.get("account_id") or "").strip()
    images = payload.get("images") or []
    if not account_id:
        print(json.dumps({"ok": False, "error": "account_id is required for live publish"}))
        return 2
    if not images:
        print(json.dumps({"ok": False, "error": "images list is required for live publish"}))
        return 2

    lister_dir = root / "automation" / "facebook-marketplace-lister"
    if not lister_dir.exists():
        print(json.dumps({"ok": False, "error": f"Missing lister directory: {lister_dir}"}))
        return 2

    accounts_path = lister_dir / "accounts.json"
    images_dir = lister_dir / "images"
    drivers_dir = lister_dir / "drivers"

    if not accounts_path.exists():
        print(json.dumps({"ok": False, "error": f"Missing accounts.json: {accounts_path}"}))
        return 2
    accounts = _load_accounts(accounts_path)
    account = next((entry for entry in accounts if str(entry.get("id", "")).strip() == account_id), None)
    if not account:
        print(json.dumps({"ok": False, "error": f"account_id '{account_id}' not found in accounts.json"}))
        return 2
    if not account.get("password"):
        print(json.dumps({"ok": False, "error": f"account_id '{account_id}' has no password in accounts.json"}))
        return 2

    if not images_dir.exists():
        print(json.dumps({"ok": False, "error": f"Missing images directory: {images_dir}"}))
        return 2
    missing_images = [name for name in images if not (images_dir / str(name)).exists()]
    if missing_images:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "Missing image files",
                    "missing": missing_images,
                    "images_dir": str(images_dir),
                }
            )
        )
        return 2

    chromedriver_path = _find_chromedriver(drivers_dir)
    if not chromedriver_path:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "ChromeDriver not found",
                    "drivers_dir": str(drivers_dir),
                }
            )
        )
        return 2

    sys.path.insert(0, str(lister_dir))
    try:
        from Lister import Lister  # type: ignore
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"Failed to import Lister: {exc}"}))
        return 2

    # Lister uses relative paths ("drivers", "images", "accounts"), so use its directory as CWD.
    original_cwd = Path.cwd()
    lister = None
    try:
        os.chdir(lister_dir)
        lister = Lister()
        logged_in = lister.login(account_id)
        if not logged_in:
            print(json.dumps({"ok": False, "error": "Facebook login failed"}))
            return 3

        item = {
            "title": payload.get("title", ""),
            "price": str(payload.get("price", "")),
            "images": [{"file": image} for image in images],
            "location": payload.get("location") or "",
            "description": payload.get("description") or "",
            "vin": payload.get("vin") or "",
            "sku": payload.get("vin") or "",
            "mileage": payload.get("mileage"),
            "drivetrain": payload.get("drivetrain") or "",
            "engine": payload.get("engine") or "",
            "transmission": payload.get("transmission") or "",
            "exterior": payload.get("exterior") or "",
            "interior": payload.get("interior") or "",
            "detail_url": payload.get("detail_url") or "",
            "hide_from_friends": bool(payload.get("hide_from_friends", False)),
        }
        posted = lister.list(item)
        print(json.dumps({"ok": bool(posted), "posted": bool(posted)}))
        return 0 if posted else 4
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 5
    finally:
        if lister is not None:
            try:
                lister.close()
            except Exception:
                pass
        os.chdir(original_cwd)


if __name__ == "__main__":
    raise SystemExit(main())
