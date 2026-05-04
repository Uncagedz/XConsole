from __future__ import annotations

import json
import os
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.api import (  # noqa: E402
    FACEBOOK_POST_STATUS_PATH,
    FacebookOneClickPostRequest,
    _friendly_facebook_publish_detail,
    _run_one_click_post_from_inventory,
    _safe_write_json,
    _set_facebook_vehicle_status,
    _write_facebook_live_status,
)


JOBS_DIR = ROOT_DIR / "runtime" / "facebook_live_jobs"
LOCK_PATH = JOBS_DIR / ".runner.lock"
STATUS_FILE = ROOT_DIR / "runtime" / "facebook_live_status.json"


def _acquire_lock() -> bool:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(str(LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        return False
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(json.dumps({"pid": os.getpid()}))
    return True


def _release_lock() -> None:
    try:
        LOCK_PATH.unlink()
    except FileNotFoundError:
        return


def _job_files() -> list[Path]:
    if not JOBS_DIR.exists():
        return []
    return sorted(path for path in JOBS_DIR.glob("*.json") if path.is_file())


def _process_job(payload_path: Path) -> int:
    raw = json.loads(payload_path.read_text(encoding="utf-8"))
    request = FacebookOneClickPostRequest(**raw)
    try:
        _write_facebook_live_status(
            STATUS_FILE,
            {
                "ok": True,
                "vin": request.vin,
                "title": str(request.vin),
                "stage": f"Preparing Facebook live for VIN {request.vin}. Importing photos and opening Marketplace automation...",
                "type": "main",
            },
        )
        response = _run_one_click_post_from_inventory(request, queue_live=False)
        result = response.get("post_result") if isinstance(response, dict) else None
        if not isinstance(result, dict):
            raise RuntimeError("Facebook worker did not receive a valid post_result.")
        marketplace_status = str(
            result.get("marketplace_status") or ("live" if result.get("live_success") else "needs_review")
        ).strip().lower()
        _set_facebook_vehicle_status(
            vin=request.vin,
            mode="live",
            marketplace_status=marketplace_status,
            detail=str(result.get("live_detail") or ""),
            listing_url=str(result.get("listing_url") or ""),
            confirmation=result.get("marketplace_confirmation") if isinstance(result.get("marketplace_confirmation"), dict) else None,
        )
        _safe_write_json(
            FACEBOOK_POST_STATUS_PATH.parent / "facebook_last_background_result.json",
            {"vin": request.vin, "response": response, "result": result},
        )
        final_stage = str(result.get("live_detail") or ("Marketplace listing confirmed." if result.get("live_success") else "Facebook live posting finished.")).strip()
        _write_facebook_live_status(
            STATUS_FILE,
            {
                "ok": bool(result.get("live_success")),
                "vin": request.vin,
                "title": str((response or {}).get("prepared_post_request", {}).get("title") or request.vin),
                "stage": final_stage,
                "type": "success" if result.get("live_success") else marketplace_status,
            },
        )
        return 0
    except Exception as exc:
        detail = _friendly_facebook_publish_detail(fallback=str(exc) or "Facebook background posting failed.")
        _write_facebook_live_status(
            STATUS_FILE,
            {"ok": False, "vin": request.vin, "title": request.title, "stage": detail, "type": "failure"},
        )
        _set_facebook_vehicle_status(
            vin=request.vin,
            mode="live",
            marketplace_status="failed",
            detail=detail,
        )
        return 1
    finally:
        try:
            payload_path.unlink()
        except FileNotFoundError:
            pass


def main() -> int:
    if not _acquire_lock():
        return 0
    exit_code = 0
    try:
        while True:
            jobs = _job_files()
            if not jobs:
                break
            result = _process_job(jobs[0])
            if result != 0:
                exit_code = result
    finally:
        _release_lock()
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
